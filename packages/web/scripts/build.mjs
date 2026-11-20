// Builds the static site into packages/web/dist/: the page, its two bundles (page and worker), the
// project's reference.docx, and the pinned Pandoc release (scripts/fetch-pandoc.mjs). Needs
// packages/core built first (npm run build -w packages/core).
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { fetchPandoc } from './fetch-pandoc.mjs';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const dist = here('../dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = { bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, sourcemap: true, legalComments: 'none', logLevel: 'warning' };
await build({ ...common, entryPoints: [here('../src/main.mjs')], outfile: `${dist}/app.js` });
await build({ ...common, entryPoints: [here('../src/worker.mjs')], outfile: `${dist}/worker.js` });

copyFileSync(here('../src/index.html'), `${dist}/index.html`);
copyFileSync(here('../src/styles.css'), `${dist}/styles.css`);
copyFileSync(here('../../vscode-extension/icon.svg'), `${dist}/icon.svg`);
copyFileSync(here('../../cli/assets/reference.docx'), `${dist}/reference.docx`);
// GitHub Pages runs Jekyll on the site unless told not to; nothing here needs it.
writeFileSync(`${dist}/.nojekyll`, '');

const pandoc = await fetchPandoc(`${dist}/pandoc`);
console.log(`web: built dist/ with Pandoc ${pandoc.version}`);
