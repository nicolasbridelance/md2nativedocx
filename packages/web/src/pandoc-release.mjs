/**
 * The Pandoc release the browser converter serves: the official `pandoc.wasm` from Pandoc's own release
 * assets (GPL-2.0-or-later), pinned by SHA-256. `scripts/fetch-pandoc.mjs` downloads and checks it at
 * build time; the page checks the hash again before running it. To move to a new Pandoc release, change
 * all four values together and run the smoke test (`npm run smoke -w packages/web`).
 */
export const PANDOC_RELEASE = {
  version: '3.14',
  /** The release asset that holds `pandoc.wasm`, `COPYING.md` and `COPYRIGHT`. */
  assetUrl: 'https://github.com/jgm/pandoc/releases/download/3.14/pandoc-3.14-wasm.zip',
  assetSha256: '84e1023db1892cfdeb9ee518b8d95e6f6c667bbde7c99f24ec889a2099367ee5',
  wasmSha256: 'ecd6fe2ec6a0f6a7ed6240f4df1d8aa4c6b42872cba0bf8d8b0c02f121dcd9ec',
  /** Uncompressed size: the page shows download progress against it. */
  wasmBytes: 62515002,
  /** Pandoc's source for this release, served next to the binary (GPL-2.0 section 3). */
  sourceUrl: 'https://github.com/jgm/pandoc/archive/refs/tags/3.14.tar.gz',
};
