// Full pipeline, no subprocess: pandoc.wasm (md -> json), core in-process (diagrams -> raw openxml),
// pandoc.wasm (json -> docx, project reference.docx), then the CLI's existing post-processing.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { loadPandoc } from './pandoc-wasi.mjs';

// Run from the repository (core built): node --experimental-wasm-exnref node-pipeline.mjs <pandoc.wasm> <in.md> <out.docx>
import { fileURLToPath } from 'node:url';
const REPO_URL = new URL('../../../../', import.meta.url);
const core = await import(new URL('packages/core/dist/index.js', REPO_URL));
const pp = await import(new URL('packages/cli/src/postprocess.mjs', REPO_URL));
const charts = await import(new URL('packages/cli/src/chartParts.mjs', REPO_URL));
const REPO = fileURLToPath(REPO_URL);

const [, , WASM, MD, OUT] = process.argv;
const pd = await loadPandoc(WASM);
console.log('init ms', Math.round(pd.initMs));
const md = readFileSync(MD, 'utf8');

const p1 = pd.convert({ from: 'markdown', to: 'json' }, md);
console.log('pass 1 (md->json) ms', Math.round(p1.ms), p1.stderr);
const ast = JSON.parse(p1.stdout);

const work = mkdtempSync(join(tmpdir(), 'spike-'));
const smartArtDir = join(work, 'smartart'); const chartDir = join(work, 'chart');
mkdirSync(smartArtDir); mkdirSync(chartDir);
const options = { smartArt: true, nativeCharts: true, newPartId: randomUUID };
let count = 0; const warnings = [];
const tRender = performance.now();

// Same block selection and PlantUML header rule as md2nativedocx.lua's CodeBlock handler.
function renderBlock(block) {
  const [[, classes], text] = block.c;
  const lang = classes[0];
  if (lang !== 'mermaid' && lang !== 'plantuml' && lang !== 'puml') return block;
  const source = lang !== 'mermaid' && !/^\s*@start/.test(text) ? `@startuml\n${text}\n@enduml` : text;
  let fragment;
  try {
    const r = core.renderDiagram(source, options);
    warnings.push(...r.metadata.warnings);
    for (const part of r.parts) {
      const d = join(part.kind === 'smartart' ? smartArtDir : chartDir, part.id); mkdirSync(d);
      if (part.kind === 'smartart') {
        if (part.drawingXml !== undefined) writeFileSync(join(d, 'drawing.xml'), part.drawingXml);
        for (const [f, k] of [['data.xml', 'dataXml'], ['layout.xml', 'layoutXml'], ['colors.xml', 'colorsXml'], ['quickStyle.xml', 'styleXml']]) writeFileSync(join(d, f), part[k]);
      } else {
        writeFileSync(join(d, 'chart.xml'), part.chartXml);
        writeFileSync(join(d, 'data.json'), JSON.stringify(part.workbook));
        writeFileSync(join(d, 'meta.json'), JSON.stringify({ hasWorkbook: part.hasWorkbook }));
      }
    }
    fragment = r.fragment;
  } catch (err) {
    if (!(err instanceof core.DiagramTooLargeError)) throw err;
    fragment = core.buildDiagramTooLargeNoteXml(err);
  }
  count++;
  return { t: 'RawBlock', c: ['openxml', fragment] };
}
function walk(node) {
  if (Array.isArray(node)) return node.map(walk);
  if (node && typeof node === 'object') {
    if (node.t === 'CodeBlock') return renderBlock(node);
    for (const k of Object.keys(node)) node[k] = walk(node[k]);
  }
  return node;
}
ast.blocks = walk(ast.blocks);
console.log('render', count, 'diagrams ms', Math.round(performance.now() - tRender), 'warnings', warnings.length);

const refDoc = readFileSync(join(REPO, "packages/cli/assets/reference.docx"));
const p2 = pd.convert({ from: 'json', to: 'docx', 'output-file': 'out.docx', 'reference-doc': 'reference.docx' }, JSON.stringify(ast), { 'reference.docx': refDoc });
console.log('pass 2 (json->docx) ms', Math.round(p2.ms), 'stderr:', p2.stderr, 'warnings:', p2.warnings);
const p2b = pd.convert({ from: 'json', to: 'docx', 'output-file': 'out.docx', 'reference-doc': 'reference.docx' }, JSON.stringify(ast), { 'reference.docx': refDoc });
console.log('pass 2 again ms', Math.round(p2b.ms));

writeFileSync(OUT, p2.files['out.docx']);
const t = performance.now();
pp.postProcessDocx(OUT, { toc: false, emojiFont: true });
pp.injectSmartArtParts(OUT, smartArtDir);
charts.injectChartParts(OUT, chartDir);
console.log('postprocess ms', Math.round(performance.now() - t), 'size', readFileSync(OUT).length);
