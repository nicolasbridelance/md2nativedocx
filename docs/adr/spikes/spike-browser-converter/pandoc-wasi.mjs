// Spike harness: run the official pandoc.wasm (reactor module) under Node's built-in WASI.
// The module exports hs_init_with_rtsopts(argc*, argv**) and convert(optsPtr, optsLen); it reads and
// writes files named stdin / stdout / stderr / warnings at the root of the preopened directory.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WASI } from 'node:wasi';

export async function loadPandoc(wasmPath) {
  const dir = mkdtempSync(join(tmpdir(), 'pandoc-wasi-'));
  const args = ['pandoc.wasm', '+RTS', '-H64m', '-RTS'];
  const wasi = new WASI({ version: 'preview1', args, env: {}, preopens: { '/': dir }, returnOnExit: true });
  const t0 = performance.now();
  const module = await WebAssembly.compile(readFileSync(wasmPath));
  const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport });
  wasi.initialize({ exports: { memory: instance.exports.memory } }); // the module also exports _start, which node:wasi refuses for a reactor
  const ex = instance.exports;
  ex.__wasm_call_ctors?.();
  const enc = new TextEncoder();
  const view = () => new DataView(ex.memory.buffer);
  const cstr = (s) => { const b = enc.encode(s); const p = ex.malloc(b.length + 1); new Uint8Array(ex.memory.buffer, p, b.length).set(b); view().setUint8(p + b.length, 0); return p; };
  const argcPtr = ex.malloc(4); view().setUint32(argcPtr, args.length, true);
  const argv = ex.malloc(4 * (args.length + 1));
  args.forEach((a, i) => view().setUint32(argv + 4 * i, cstr(a), true));
  view().setUint32(argv + 4 * args.length, 0, true);
  const argvPtr = ex.malloc(4); view().setUint32(argvPtr, argv, true);
  ex.hs_init_with_rtsopts(argcPtr, argvPtr);
  const initMs = performance.now() - t0;

  /** files: { name: Uint8Array|string }; returns { stdout, stderr, warnings, files: {name: Buffer} } */
  function convert(options, stdin, files = {}) {
    for (const f of readdirSync(dir)) rmSync(join(dir, f), { recursive: true, force: true });
    for (const n of ['stdout', 'stderr', 'warnings']) writeFileSync(join(dir, n), '');
    writeFileSync(join(dir, 'stdin'), stdin ?? '');
    for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), data);
    const b = enc.encode(JSON.stringify(options));
    const p = ex.malloc(b.length);
    new Uint8Array(ex.memory.buffer, p, b.length).set(b);
    const t = performance.now();
    ex.convert(p, b.length);
    const ms = performance.now() - t;
    const read = (n) => readFileSync(join(dir, n), 'utf8');
    const out = { stdout: read('stdout'), stderr: read('stderr'), warnings: read('warnings'), ms, files: {} };
    if (options['output-file']) { try { out.files[options['output-file']] = readFileSync(join(dir, options['output-file'])); } catch { /* no output written */ } }
    return out;
  }
  return { convert, initMs };
}
