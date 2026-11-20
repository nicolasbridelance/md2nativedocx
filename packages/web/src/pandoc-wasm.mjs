/**
 * Runs the official `pandoc.wasm` (published with each Pandoc release since 3.9) on top of `MemoryWasi`.
 *
 * The module is a "reactor": after the Haskell runtime is started once (`hs_init_with_rtsopts`), each
 * call to its `convert(optionsPtr, optionsLen)` export reads a JSON object of options (the format of
 * Pandoc's *defaults* files: `from`, `to`, `output-file`, `reference-doc`…) and works on files at the
 * root of the file system: the input in `stdin`, results in `stdout`, `stderr` and `warnings` (a JSON
 * array), the output document in the file named by `output-file`. Pandoc's own sandbox applies: no
 * system command, no network.
 */

import { MemoryWasi } from './wasi.mjs';

/** Runtime options of the Haskell RTS: a 64 MB initial heap, as Pandoc's own web page uses. */
const ARGS = ['pandoc.wasm', '+RTS', '-H64m', '-RTS'];
const RESERVED = new Set(['stdin', 'stdout', 'stderr', 'warnings']);

/**
 * @typedef {object} PandocResult
 * @property {string} stdout
 * @property {string} stderr
 * @property {Array<{ type?: string, verbosity?: string, pretty?: string }>} warnings Pandoc's log messages.
 * @property {Uint8Array | undefined} output The `output-file`, when one was asked for.
 */

/**
 * Instantiates `pandoc.wasm` and starts its runtime.
 * @param {WebAssembly.Module} module The compiled `pandoc.wasm`.
 */
export async function startPandoc(module) {
  const wasi = new MemoryWasi({ args: ARGS });
  const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.imports });
  wasi.bind(instance);
  const ex = /** @type {Record<string, any>} */ (instance.exports); // the module's exports are untyped
  ex.__wasm_call_ctors();

  const enc = new TextEncoder();
  const view = () => new DataView(ex.memory.buffer);
  const copyIn = (bytes, terminate) => {
    const ptr = ex.malloc(bytes.length + (terminate ? 1 : 0));
    new Uint8Array(ex.memory.buffer, ptr, bytes.length).set(bytes);
    if (terminate) view().setUint8(ptr + bytes.length, 0);
    return ptr;
  };

  // argc and argv for the runtime, in the module's own memory.
  const argcPtr = ex.malloc(4);
  view().setUint32(argcPtr, ARGS.length, true);
  const argv = ex.malloc(4 * (ARGS.length + 1));
  ARGS.forEach((arg, i) => view().setUint32(argv + 4 * i, copyIn(enc.encode(arg), true), true));
  view().setUint32(argv + 4 * ARGS.length, 0, true);
  const argvPtr = ex.malloc(4);
  view().setUint32(argvPtr, argv, true);
  ex.hs_init_with_rtsopts(argcPtr, argvPtr);

  /**
   * One Pandoc run. Calls must not overlap (they share the file system); the module is synchronous.
   * @param {Record<string, unknown>} options Pandoc defaults-file options.
   * @param {string} stdin The input text.
   * @param {Record<string, Uint8Array | string>} [files] Extra files at the root (reference document…).
   * @returns {PandocResult}
   */
  function convert(options, stdin, files = {}) {
    wasi.clear();
    for (const name of RESERVED) wasi.writeFile(name, '');
    wasi.writeFile('stdin', stdin);
    for (const [name, content] of Object.entries(files)) {
      if (RESERVED.has(name)) throw new Error(`file name reserved by pandoc.wasm: ${name}`);
      wasi.writeFile(name, content);
    }
    const optionBytes = enc.encode(JSON.stringify(options));
    ex.convert(copyIn(optionBytes, false), optionBytes.length);

    const text = (name) => new TextDecoder().decode(wasi.readFile(name) ?? new Uint8Array(0));
    const warningsText = text('warnings');
    const outputFile = typeof options['output-file'] === 'string' ? options['output-file'] : undefined;
    return {
      stdout: text('stdout'),
      stderr: text('stderr'),
      warnings: warningsText ? JSON.parse(warningsText) : [],
      output: outputFile ? wasi.readFile(outputFile) : undefined,
    };
  }

  return { convert };
}
