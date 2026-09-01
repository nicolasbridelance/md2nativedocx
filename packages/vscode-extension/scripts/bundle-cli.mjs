#!/usr/bin/env node
/**
 * Vendors a self-contained copy of the CLI into dist/vendor/, for packaging
 * into the .vsix. Installed from the Marketplace, the extension lives in its
 * own isolated folder with no npm workspace around it, so `resolveCliBin()`
 * (src/exportService.ts) cannot rely on `require.resolve('@md2nativedocx/cli/...')`
 * the way it does in the monorepo dev setup.
 *
 * Two esbuild bundles, matching the two Node entry points the pipeline
 * actually spawns as subprocesses (extension -> CLI -> pandoc -> Lua filter
 * -> core bridge). Bundling can't reach across those subprocess boundaries,
 * so this vendors each entry's own require/import graph and reproduces the
 * relative layout the existing (unmodified) path-resolution code already
 * expects:
 *   - bin/md2nativedocx.mjs's FILTER_CANDIDATES looks for
 *     ../node_modules/@md2nativedocx/pandoc-filter/md2nativedocx.lua next to
 *     itself.
 *   - md2nativedocx.lua's own default looks for bin/md2nativedocx-core.mjs
 *     next to itself.
 * Reproducing those exact relative paths under dist/vendor/ means zero
 * changes to packages/cli or packages/pandoc-filter.
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync, copyFileSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const extensionRoot = dirname(here);
const repoRoot = join(extensionRoot, '..', '..');
const vendorDir = join(extensionRoot, 'dist', 'vendor');

const cliEntry = join(repoRoot, 'packages', 'cli', 'bin', 'md2nativedocx.mjs');
const coreBridgeEntry = join(repoRoot, 'packages', 'pandoc-filter', 'bin', 'md2nativedocx-core.mjs');
const luaFilter = join(repoRoot, 'packages', 'pandoc-filter', 'md2nativedocx.lua');
const coreDist = join(repoRoot, 'packages', 'core', 'dist', 'index.js');

if (!existsSync(coreDist)) {
  console.error(`packages/core is not built (missing ${coreDist}) — run \`npm run build\` at the repo root first.`);
  process.exit(1);
}

rmSync(vendorDir, { recursive: true, force: true });

const cliOut = join(vendorDir, 'bin', 'md2nativedocx.mjs');
const pandocFilterDir = join(vendorDir, 'node_modules', '@md2nativedocx', 'pandoc-filter');
const coreBridgeOut = join(pandocFilterDir, 'bin', 'md2nativedocx-core.mjs');
const luaOut = join(pandocFilterDir, 'md2nativedocx.lua');

await build({
  entryPoints: [cliEntry],
  outfile: cliOut,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
});

await build({
  entryPoints: [coreBridgeEntry],
  outfile: coreBridgeOut,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
});

mkdirSync(pandocFilterDir, { recursive: true });
copyFileSync(luaFilter, luaOut);

// Self-check: a broken bundle (a missed import, a wrong relative path) must
// fail this script, not surface later as a silent MODULE_NOT_FOUND inside a
// packaged extension nobody rebuilds. `--help` alone doesn't exercise the
// Lua filter -> core bridge hop, so also run one real diagram through it.
execFileSync('node', [cliOut, '--help'], { encoding: 'utf8' });

const smokeDir = mkdtempSync(join(tmpdir(), 'md2nativedocx-bundle-smoke-'));
try {
  const input = join(smokeDir, 'smoke.md');
  const output = join(smokeDir, 'smoke.docx');
  writeFileSync(input, '```mermaid\nflowchart LR\n  A --> B\n```\n');
  execFileSync('node', [cliOut, input, '-o', output], { encoding: 'utf8' });
  if (!existsSync(output)) {
    throw new Error('vendored CLI ran without error but produced no .docx');
  }
} finally {
  rmSync(smokeDir, { recursive: true, force: true });
}

console.log(`Vendored CLI bundle ready: ${vendorDir}`);
