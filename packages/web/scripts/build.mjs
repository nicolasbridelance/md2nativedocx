// Builds the static site into packages/web/dist/: the page, its two bundles (page and worker), the
// project's reference.docx, the link-preview image, a sitemap, the IndexNow key file, and the pinned
// Pandoc release (scripts/fetch-pandoc.mjs). Needs packages/core built first (npm run build -w packages/core).
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { fetchPandoc } from './fetch-pandoc.mjs';
import { npmPackagesInBundle, renderNotices } from '../../../scripts/third-party-licenses.mjs';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const dist = here('../dist');
/** Where GitHub Pages serves the site; also the page's canonical and og:url. */
const SITE_URL = 'https://nicolasbridelance.github.io/md2nativedocx/';
/** IndexNow key; .github/workflows/pages.yml sends the same value. */
const INDEXNOW_KEY = 'e8b16ea04357be7051163c9957036b89'; // gitleaks:allow (public by design, served by the site)

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// legalComments 'none': the license notices of the bundled packages go, whole, into THIRD_PARTY_NOTICES.txt
// below rather than as scattered comments some packages carry and others do not.
const common = { bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, sourcemap: true, legalComments: 'none', logLevel: 'warning', metafile: true };
const bundles = [
  await build({ ...common, entryPoints: [here('../src/main.mjs')], outfile: `${dist}/app.js` }),
  await build({ ...common, entryPoints: [here('../src/worker.mjs')], outfile: `${dist}/worker.js` }),
];
const bundled = new Map();
for (const { metafile } of bundles) for (const p of npmPackagesInBundle(metafile, process.cwd())) bundled.set(`${p.name}@${p.version}`, p);
writeFileSync(
  `${dist}/THIRD_PARTY_NOTICES.txt`,
  renderNotices(
    "Third-party code inside this page's scripts (app.js, worker.js). The page's own code is public domain (CC0 1.0).\n"
      + 'Pandoc, which this page runs, has its own license and source next to it: pandoc/COPYING.md, pandoc/COPYRIGHT.',
    [...bundled.values()].sort((a, b) => a.name.localeCompare(b.name)),
  ),
);

copyFileSync(here('../src/index.html'), `${dist}/index.html`);
copyFileSync(here('../src/styles.css'), `${dist}/styles.css`);
copyFileSync(here('../../vscode-extension/icon.svg'), `${dist}/icon.svg`);
copyFileSync(here('../../cli/assets/reference.docx'), `${dist}/reference.docx`);
// The link-preview image named by the page's og:image (assets/README.md says how it is made).
copyFileSync(here('../assets/og-image.png'), `${dist}/og-image.png`);
// For Google Search Console. No robots.txt: one only counts at the root of the host
// (nicolasbridelance.github.io), which this site is not.
writeFileSync(
  `${dist}/sitemap.xml`,
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${SITE_URL}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>`,
    '</urlset>',
    '',
  ].join('\n'),
);
// IndexNow (Bing, Yandex, Seznam, Naver…): the site proves it owns its URLs by serving this key, and the
// Pages workflow announces each deployment with it. Not a secret: anyone can read it from the site.
// Served under the site's path, so it only vouches for URLs below SITE_URL (keyLocation in pages.yml).
writeFileSync(`${dist}/${INDEXNOW_KEY}.txt`, INDEXNOW_KEY);
// GitHub Pages runs Jekyll on the site unless told not to; nothing here needs it.
writeFileSync(`${dist}/.nojekyll`, '');

const pandoc = await fetchPandoc(`${dist}/pandoc`);
console.log(`web: built dist/ with Pandoc ${pandoc.version}`);
