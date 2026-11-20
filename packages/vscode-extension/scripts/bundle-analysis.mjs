#!/usr/bin/env node
/**
 * Bundles the core engine's `planRendering` (what a diagram will become in Word, packages/core/src/
 * rendering-plan.ts) into dist/analysis.cjs, a CommonJS module the extension can `require()` synchronously
 * for its CodeLens, hover and status bar (docs/specs/UX_REVIEW_2026-10.md, lot B). The core is an ES module
 * and the extension is CommonJS, hence this small esbuild step rather than a plain import. Parsing and
 * classification only at run time: no layout, no XML, no subprocess. The bundle still carries the
 * translators (~780 KB, ~40 ms to load once, on first use): `planRendering` reads the same per-type table
 * as `renderDiagram`, so that the CodeLens cannot announce something the export does not do.
 */

import { build } from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { npmPackagesInBundle, renderNotices } from '../../../scripts/third-party-licenses.mjs';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(extensionRoot, '..', 'core', 'dist', 'rendering-plan.js');
const outfile = join(extensionRoot, 'dist', 'analysis.cjs');

if (!existsSync(entry)) {
  console.error(`packages/core is not built (missing ${entry}) — run \`npm run build\` at the repo root first.`);
  process.exit(1);
}

const { metafile } = await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'cjs', target: 'node18', metafile: true });

// The license notices of the npm packages inside the bundle (dagre and its dependencies), shipped next to it.
const licensesDir = join(extensionRoot, 'dist', 'licenses');
mkdirSync(licensesDir, { recursive: true });
writeFileSync(
  join(licensesDir, 'analysis.txt'),
  renderNotices("Third-party code inside dist/analysis.cjs (the diagram analysis behind the CodeLens). This project's own code is CC0 1.0.", npmPackagesInBundle(metafile, process.cwd())),
);

// Self-check: a broken bundle must fail here, not as a silent missing CodeLens in a packaged extension.
const { planRendering } = createRequire(import.meta.url)(outfile);
const plan = planRendering('graph TD\n  A --> B\n  A --> C', { smartArt: true, nativeCharts: false });
if (plan.rendering !== 'smartart') throw new Error(`analysis bundle self-check failed: ${JSON.stringify(plan)}`);
