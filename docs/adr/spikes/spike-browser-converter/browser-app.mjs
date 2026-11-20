// Spike page logic: Markdown -> .docx entirely in the browser, nothing sent anywhere.
import { convert as pandoc } from './pandoc.js';
import { renderDiagram, DiagramTooLargeError, buildDiagramTooLargeNoteXml } from './core.bundle.js';
import { injectNamespaces, renumberDrawingIds, forceEmojiColorFont } from './postprocess.bundle.js';
import { readZip } from './zip.mjs';

const log = (s) => { document.getElementById('log').textContent += s + '\n'; };
const t0 = performance.now(); // module evaluation includes pandoc.wasm download + compile + init
log(`pandoc.wasm ready: ${Math.round(performance.now() - window.__start)} ms after page start`);

async function toDocx(md) {
  const t = { start: performance.now() };
  const p1 = await pandoc({ from: 'markdown', to: 'json' }, md, {});
  t.pass1 = performance.now();
  const ast = JSON.parse(p1.stdout);
  let n = 0; const warnings = [];
  const renderBlock = (block) => {
    const [[, classes], text] = block.c; const lang = classes[0];
    if (lang !== 'mermaid' && lang !== 'plantuml' && lang !== 'puml') return block;
    const source = lang !== 'mermaid' && !/^\s*@start/.test(text) ? `@startuml\n${text}\n@enduml` : text;
    let fragment;
    try { const r = renderDiagram(source, { smartArt: false, nativeCharts: false }); warnings.push(...r.metadata.warnings); fragment = r.fragment; }
    catch (err) { if (!(err instanceof DiagramTooLargeError)) throw err; fragment = buildDiagramTooLargeNoteXml(err); }
    n++; return { t: 'RawBlock', c: ['openxml', fragment] };
  };
  const walk = (x) => { if (Array.isArray(x)) return x.map(walk); if (x && typeof x === 'object') { if (x.t === 'CodeBlock') return renderBlock(x); for (const k of Object.keys(x)) x[k] = walk(x[k]); } return x; };
  ast.blocks = walk(ast.blocks);
  t.render = performance.now();
  const files = { 'reference.docx': await (await fetch('./reference.docx')).blob() };
  const p2 = await pandoc({ from: 'json', to: 'docx', 'output-file': 'out.docx', 'reference-doc': 'reference.docx' }, JSON.stringify(ast), files);
  if (p2.stderr) log('pandoc stderr: ' + p2.stderr);
  t.pass2 = performance.now();
  const zip = await readZip(await files['out.docx'].arrayBuffer());
  await zip.set('word/document.xml', forceEmojiColorFont(renumberDrawingIds(injectNamespaces(await zip.readText('word/document.xml')))));
  const blob = zip.write();
  t.post = performance.now();
  log(`diagrams: ${n}, warnings: ${warnings.length}`);
  log(`md->json ${Math.round(t.pass1 - t.start)} ms | render ${Math.round(t.render - t.pass1)} ms | json->docx ${Math.round(t.pass2 - t.render)} ms | post ${Math.round(t.post - t.pass2)} ms | total ${Math.round(t.post - t.start)} ms`);
  return blob;
}

document.getElementById('go').onclick = async () => {
  try {
    const blob = await toDocx(document.getElementById('md').value);
    const a = document.getElementById('dl'); a.href = URL.createObjectURL(blob); a.download = 'spike.docx'; a.textContent = `Download spike.docx (${blob.size} bytes)`;
    window.__lastDocx = blob;
    log('DONE');
  } catch (e) { log('ERROR ' + (e && e.stack || e)); }
};
document.getElementById('go').disabled = false;
