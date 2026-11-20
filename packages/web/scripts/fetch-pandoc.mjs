// Puts the pinned Pandoc release into dist/pandoc/: pandoc.wasm, its license files, and the source of
// that release (served next to the binary, GPL-2.0 section 3). The release asset is checked against its
// SHA-256 before anything is extracted, and pandoc.wasm against its own. Downloads are kept in
// packages/web/.cache/ so a rebuild does not fetch them again.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PANDOC_RELEASE } from '../src/pandoc-release.mjs';
import { openZip } from '../src/zip.mjs';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

class FetchPandocError extends Error {}

/** `url`'s bytes, from the cache directory when already downloaded. */
async function cached(url, file) {
  const path = here(`../.cache/${file}`);
  if (existsSync(path)) return readFileSync(path);
  const response = await fetch(url);
  if (!response.ok) throw new FetchPandocError(`${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(here('../.cache'), { recursive: true });
  writeFileSync(path, bytes);
  return bytes;
}

export async function fetchPandoc(outDir) {
  const { version } = PANDOC_RELEASE;
  const asset = await cached(PANDOC_RELEASE.assetUrl, `pandoc-${version}-wasm.zip`);
  if (sha256(asset) !== PANDOC_RELEASE.assetSha256) {
    throw new FetchPandocError(`pandoc-${version}-wasm.zip does not match its pinned SHA-256: delete packages/web/.cache and check the release`);
  }
  // The asset is a known archive (its hash is pinned above), not arbitrary input.
  const archive = await openZip(new Uint8Array(asset));
  const entry = (name) => {
    const found = archive.pkg.names().find((n) => n === `pandoc-${version}-wasm/${name}`);
    const bytes = found ? archive.bytes(found) : undefined;
    if (!bytes) throw new FetchPandocError(`${name} is missing from the Pandoc release asset`);
    return bytes;
  };
  const wasm = entry('pandoc.wasm');
  if (sha256(wasm) !== PANDOC_RELEASE.wasmSha256 || wasm.length !== PANDOC_RELEASE.wasmBytes) {
    throw new FetchPandocError('pandoc.wasm does not match its pinned SHA-256 and size');
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/pandoc.wasm`, wasm);
  writeFileSync(`${outDir}/COPYING.md`, entry('COPYING.md'));
  writeFileSync(`${outDir}/COPYRIGHT`, entry('COPYRIGHT'));
  const source = await cached(PANDOC_RELEASE.sourceUrl, `pandoc-${version}-source.tar.gz`);
  writeFileSync(`${outDir}/pandoc-${version}-source.tar.gz`, source);
  return { version, wasmBytes: wasm.length, sourceBytes: source.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const info = await fetchPandoc(here('../dist/pandoc'));
  console.log(`pandoc ${info.version}: pandoc.wasm ${info.wasmBytes} bytes, source ${info.sourceBytes} bytes`);
}
