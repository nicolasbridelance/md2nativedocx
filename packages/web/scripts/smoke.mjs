// Smoke test of the browser converter's engine under Node, with the real pandoc.wasm: converts
// test/fixtures/smoke.md and checks what Word needs (every diagram drawn, SmartArt and chart parts wired,
// the archive readable). Needs Node 24+ with --experimental-wasm-exnref (pandoc.wasm uses WebAssembly
// exception handling). Usage: node --experimental-wasm-exnref scripts/smoke.mjs [out.docx]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startPandoc } from '../src/pandoc-wasm.mjs';
import { createConverter } from '../src/engine.mjs';
import { openZip } from '../src/zip.mjs';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const fail = (message) => {
  console.error(`smoke: FAIL ${message}`);
  process.exit(1);
};

const t0 = performance.now();
const module = await WebAssembly.compile(readFileSync(here('../dist/pandoc/pandoc.wasm')));
const pandoc = await startPandoc(module);
console.log(`smoke: pandoc.wasm ready in ${Math.round(performance.now() - t0)} ms`);

const convert = createConverter(pandoc, readFileSync(here('../../cli/assets/reference.docx')));
const markdown = readFileSync(here('../test/fixtures/smoke.md'), 'utf8');
const steps = [];
const t1 = performance.now();
const result = await convert(markdown, { toc: true }, (step) => steps.push(step));
console.log(`smoke: converted in ${Math.round(performance.now() - t1)} ms, ${result.diagrams} diagrams, ${result.docx.length} bytes`);
for (const warning of result.warnings) console.log(`smoke: warning: ${warning}`);

if (result.diagrams !== 5) fail(`expected 5 diagram blocks, got ${result.diagrams}`);
for (const step of ['read', 'diagrams', 'write', 'finish']) if (!steps.includes(step)) fail(`no "${step}" progress step`);
const archive = await openZip(result.docx);
const { pkg } = archive;
const names = pkg.names();
const documentXml = pkg.readText('word/document.xml');
if (/SMARTART_PLACEHOLDER|CHART_PLACEHOLDER/.test(documentXml)) fail('a placeholder was left in document.xml');
if (/```|mermaid/i.test(documentXml.replace(/<[^>]+>/g, ''))) fail('a diagram was left as code');
if (!names.some((n) => /^word\/diagrams\/data\d+\.xml$/.test(n))) fail('no SmartArt part');
if (!names.some((n) => /^word\/charts\/chart\d+\.xml$/.test(n))) fail('no chart part');
if (!names.some((n) => /^word\/embeddings\/.+\.xlsx$/.test(n))) fail('no embedded workbook');
if (!/<w:updateFields/.test(pkg.readText('word/settings.xml'))) fail('table of contents not wired');
if (/TargetMode="External"/.test(pkg.readText('word/_rels/document.xml.rels'))) fail('external relationship');
const workbookBytes = archive.bytes(/** @type {string} */ (names.find((n) => n.endsWith('.xlsx'))));
if (!workbookBytes) fail('embedded workbook unreadable');
const workbook = await openZip(/** @type {Uint8Array} */ (workbookBytes));
if (!/<sheetData>.*<row r="2">/.test(workbook.pkg.readText('xl/worksheets/sheet1.xml'))) fail('embedded workbook has no data');

if (process.argv[2]) writeFileSync(process.argv[2], result.docx);
console.log('smoke: OK');
