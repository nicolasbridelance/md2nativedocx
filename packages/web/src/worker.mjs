/**
 * The converter's worker: everything slow happens here, so the page stays responsive. It downloads
 * `pandoc.wasm` (or takes it from the browser's cache), checks its SHA-256, compiles it, then converts
 * on request. Messages, page to worker: `{ type: 'start' }`, `{ type: 'convert', id, markdown, options }`.
 * Worker to page: `engine` (phase updates), `engine-failed`, `progress`, `done`, `failed`.
 */

import { startPandoc } from './pandoc-wasm.mjs';
import { createConverter } from './engine.mjs';
import { PANDOC_RELEASE } from './pandoc-release.mjs';

const WASM_URL = `pandoc/pandoc.wasm?v=${PANDOC_RELEASE.version}`;
const CACHE_NAME = 'md2nativedocx-pandoc';

/** A minimal module using `try_table` (WebAssembly exception handling), which `pandoc.wasm` needs. */
const EXCEPTION_HANDLING_PROBE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic, version
  0x01, 0x04, 0x01, 0x60, 0x00, 0x00, // type section: one () -> () function type
  0x03, 0x02, 0x01, 0x00, // function section: one function of that type
  0x0a, 0x08, 0x01, 0x06, 0x00, 0x1f, 0x40, 0x00, 0x0b, 0x0b, // code: try_table (no catch) end end
]);

/** @param {object} message */
const post = (message, transfer = []) => self.postMessage(message, transfer);

class EngineError extends Error {
  /** @param {'unsupported' | 'network' | 'integrity' | 'internal'} reason @param {string} message */
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The browser cache, or `null` where it is unavailable (some private windows): the engine still loads. */
async function openCache() {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null; // no Cache Storage here: download every time, which is slower but correct
  }
}

/** Reads a response body into one buffer, reporting progress against the known uncompressed size. */
async function readWithProgress(response, phase) {
  const total = PANDOC_RELEASE.wasmBytes;
  const bytes = new Uint8Array(total);
  let loaded = 0;
  const reader = /** @type {ReadableStream<Uint8Array>} */ (response.body).getReader();
  let lastPost = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.length > total) throw new EngineError('integrity', 'the engine file is larger than expected');
    bytes.set(value, loaded);
    loaded += value.length;
    const now = performance.now();
    if (now - lastPost > 100) {
      lastPost = now;
      post({ type: 'engine', phase, loaded, total });
    }
  }
  post({ type: 'engine', phase, loaded, total });
  if (loaded !== total) throw new EngineError('integrity', 'the engine file is incomplete');
  return bytes;
}

/** `pandoc.wasm`, from the cache when it holds the right one, otherwise downloaded and then cached. */
async function loadWasm() {
  const cache = await openCache();
  const cached = cache ? await cache.match(WASM_URL) : undefined;
  if (cached) {
    const bytes = await readWithProgress(cached, 'cache');
    post({ type: 'engine', phase: 'verify' });
    if ((await sha256Hex(bytes)) === PANDOC_RELEASE.wasmSha256) return bytes;
    await cache?.delete(WASM_URL); // a damaged copy: drop it and download again
  }

  let response;
  try {
    response = await fetch(WASM_URL, { cache: 'no-cache' });
  } catch (err) {
    throw new EngineError('network', err instanceof Error ? err.message : String(err));
  }
  if (!response.ok || !response.body) throw new EngineError('network', `HTTP ${response.status}`);
  const bytes = await readWithProgress(response, 'download');
  post({ type: 'engine', phase: 'verify' });
  if ((await sha256Hex(bytes)) !== PANDOC_RELEASE.wasmSha256) throw new EngineError('integrity', 'the engine file does not match its published fingerprint');
  if (cache) {
    try {
      for (const request of await cache.keys()) await cache.delete(request); // older Pandoc versions
      await cache.put(WASM_URL, new Response(bytes, { headers: { 'content-type': 'application/wasm' } }));
    } catch {
      // Storage full or refused: the engine works this time and is downloaded again next time.
    }
  }
  return bytes;
}

/** @type {Promise<ReturnType<typeof createConverter>> | null} */
let converter = null;

async function startEngine() {
  const t0 = performance.now();
  if (!WebAssembly.validate(EXCEPTION_HANDLING_PROBE)) {
    throw new EngineError('unsupported', 'this browser does not support WebAssembly exception handling');
  }
  const [bytes, referenceDocx] = await Promise.all([
    loadWasm(),
    fetch('reference.docx').then(async (r) => {
      if (!r.ok) throw new EngineError('network', `reference.docx: HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    }),
  ]);
  post({ type: 'engine', phase: 'compile' });
  let module;
  try {
    module = await WebAssembly.compile(bytes);
  } catch (err) {
    throw new EngineError('unsupported', err instanceof Error ? err.message : String(err));
  }
  const pandoc = await startPandoc(module);
  post({ type: 'engine', phase: 'ready', ms: Math.round(performance.now() - t0), pandocVersion: PANDOC_RELEASE.version });
  return createConverter(pandoc, referenceDocx);
}

function ensureEngine() {
  if (!converter) {
    converter = startEngine();
    converter.catch((err) => {
      post({ type: 'engine-failed', reason: err instanceof EngineError ? err.reason : 'internal', message: err instanceof Error ? err.message : String(err) });
      converter = null; // a later "start" retries
    });
  }
  return converter;
}

/** Conversions run one after the other: they share Pandoc's file system. */
let queue = Promise.resolve();

self.onmessage = (event) => {
  const message = event.data;
  if (message?.type === 'start') {
    ensureEngine();
  } else if (message?.type === 'convert') {
    const { id, markdown, options } = message;
    queue = queue.then(async () => {
      try {
        const convert = await ensureEngine();
        const t0 = performance.now();
        const result = await convert(String(markdown), options ?? {}, (step, detail) => post({ type: 'progress', id, step, ...detail }));
        post({ type: 'done', id, docx: result.docx, warnings: result.warnings, diagrams: result.diagrams, ms: Math.round(performance.now() - t0) }, [result.docx.buffer]);
      } catch (err) {
        post({ type: 'failed', id, message: err instanceof Error ? err.message : String(err) });
      }
    });
  }
};
