#!/usr/bin/env node
/**
 * Round 7 (2026-09-05) -- rounds 4 and 6 each fixed a real gap (missing
 * presOf/constrLst/ruleLst on dgm:layoutNode; missing adjLst/r:blip on
 * dgm:shape) but neither, alone or combined, was sufficient. Dumping the
 * REAL data1.xml in full (not just the doc-point prSet checked earlier)
 * found a third, more structural difference:
 *
 * Every real parent->child connection in `dgm:cxnLst` carries `parTransId`/
 * `sibTransId` attributes pointing at dedicated content points of
 * `type="parTrans"`/`type="sibTrans"` in `dgm:ptLst` -- e.g.
 *   <dgm:cxn srcId="{doc}" destId="{B}" ... parTransId="{X}" sibTransId="{Y}"/>
 * with `{X}`/`{Y}` each their own `<dgm:pt type="parTrans" cxnId="...">`/
 * `<dgm:pt type="sibTrans" cxnId="...">` entries elsewhere in `ptLst`. Our
 * own generated data.xml has NEITHER these points NOR these attributes at
 * all -- every parent-child `dgm:cxn` is a bare
 * `srcId`/`destId`/`srcOrd`/`destOrd` tuple.
 *
 * This round adds parTrans/sibTrans content points (and the matching
 * parTransId/sibTransId attributes) to our OWN generated data.xml, on top
 * of round 4 + round 6's layout.xml fixes (kept) -- WITHOUT adding new
 * presentation points for them, since our own layoutDef has no forEach
 * over ptType="sibTrans" (no connector rendering, a known, separate,
 * documented limitation) and so has nothing that would present them. This
 * isolates whether the content model itself requires these points to
 * exist (regardless of whether anything presents them) from whether they
 * need to be visually presented too.
 *
 * Usage: node build-round7.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..', '..');
const realSample = join(repoRoot, 'handmade_samples', 'cycle-simple.docx');

const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// --- Round 4 + 6 layout fixes, unchanged from their own scripts ---
function patchLayoutXml(xml) {
  let out = xml;
  out = out.replace(
    '<dgm:alg type="cycle"/><dgm:shape/><dgm:constrLst>',
    '<dgm:alg type="cycle"/><dgm:shape/><dgm:presOf/><dgm:constrLst>',
  );
  out = out.replace(
    '</dgm:constrLst><dgm:forEach name="nodesForEach"',
    '</dgm:constrLst><dgm:ruleLst/><dgm:forEach name="nodesForEach"',
  );
  out = out.replace(
    '<dgm:alg type="composite"/><dgm:shape/><dgm:layoutNode name="Main"',
    '<dgm:alg type="composite"/><dgm:shape/><dgm:presOf/><dgm:constrLst/><dgm:ruleLst/><dgm:layoutNode name="Main"',
  );
  out = out.replace(/<dgm:shape(\s+type="[^"]*")?\s*\/>/g, (_match, typeAttr) => {
    const t = typeAttr ?? '';
    return `<dgm:shape${t} xmlns:r="${R_NS}" r:blip=""><dgm:adjLst/></dgm:shape>`;
  });
  return out;
}

// --- Round 7's new fix: add parTrans/sibTrans content points + attributes ---
function patchDataXmlWithTransitionPoints(xml) {
  let out = xml;

  // Insert a parTrans + sibTrans <dgm:pt> right after each node's own <dgm:pt>
  // closing tag, and record their ids so the matching structural <dgm:cxn>
  // can be given parTransId/sibTransId attributes in a second pass.
  const transIdsByNodeId = new Map();
  out = out.replace(/<dgm:pt modelId="(\d+)">(?:(?!<\/dgm:pt>)[\s\S])*<\/dgm:pt>/g, (match, nodeId) => {
    if (nodeId === '0') return match; // the doc point itself, not a node
    const cxnId = `c-struct-${nodeId}`;
    const parTransId = `pt-${nodeId}`;
    const sibTransId = `st-${nodeId}`;
    transIdsByNodeId.set(nodeId, { cxnId, parTransId, sibTransId });
    const parTransPt = `<dgm:pt modelId="${parTransId}" type="parTrans" cxnId="${cxnId}"><dgm:prSet/></dgm:pt>`;
    const sibTransPt = `<dgm:pt modelId="${sibTransId}" type="sibTrans" cxnId="${cxnId}"><dgm:prSet/></dgm:pt>`;
    return match + parTransPt + sibTransPt;
  });
  if (transIdsByNodeId.size === 0) throw new Error('round 7: no node content points found to attach parTrans/sibTrans to');

  // Give each structural parOf connection (srcId="0" destId="<nodeId>") a
  // matching cxnId (so parTrans/sibTrans's own cxnId can reference it) plus
  // the parTransId/sibTransId attributes real Word always includes.
  let patchedCount = 0;
  out = out.replace(
    /<dgm:cxn modelId="(c\d+)" type="parOf" srcId="0" destId="(\d+)" srcOrd="(\d+)" destOrd="0"\/>/g,
    (match, cxnModelId, destId, srcOrd) => {
      const ids = transIdsByNodeId.get(destId);
      if (!ids) return match;
      patchedCount++;
      return `<dgm:cxn modelId="${ids.cxnId}" srcId="0" destId="${destId}" srcOrd="${srcOrd}" destOrd="0" parTransId="${ids.parTransId}" sibTransId="${ids.sibTransId}"/>`;
    },
  );
  if (patchedCount !== transIdsByNodeId.size) {
    throw new Error(`round 7: expected to patch ${transIdsByNodeId.size} structural cxns, patched ${patchedCount}`);
  }

  return out;
}

console.log('1. Loading our own generated data1.xml/layout1.xml, patching both...');
const coreDist = join(repoRoot, 'packages', 'core', 'dist');
const { parseMermaid } = await import(join(coreDist, 'index.js'));
const { generateCycle } = await import(join(coreDist, 'smartart', 'cycle.js'));
const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C\n  C --> A\n');
const generated = generateCycle(ast);

const patchedLayoutXml = patchLayoutXml(generated.layoutXml);
const patchedDataXml = patchDataXmlWithTransitionPoints(generated.dataXml);
console.log('   layout1.xml: rounds 4 + 6 fixes applied.');
console.log('   data1.xml: parTrans/sibTrans content points + parTransId/sibTransId attributes added.');

console.log('\n2. Grafting into the real Word file (colors/quickStyle real, no drawing)...');
const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-r7-'));
try {
  execFileSync('unzip', ['-o', '-q', realSample, '-d', dir], { stdio: 'pipe' });
  writeFileSync(join(dir, 'word', 'diagrams', 'data1.xml'), patchedDataXml, 'utf8');
  writeFileSync(join(dir, 'word', 'diagrams', 'layout1.xml'), patchedLayoutXml, 'utf8');
  rmSync(join(dir, 'word', 'diagrams', 'drawing1.xml'));

  const relsPath = join(dir, 'word', '_rels', 'document.xml.rels');
  let relsXml = readFileSync(relsPath, 'utf8');
  relsXml = relsXml.replace(/<Relationship Id="rId8"[^>]*diagramDrawing[^>]*\/>/, '');
  writeFileSync(relsPath, relsXml, 'utf8');

  const ctPath = join(dir, '[Content_Types].xml');
  let ctXml = readFileSync(ctPath, 'utf8');
  ctXml = ctXml.replace(/<Override PartName="\/word\/diagrams\/drawing1\.xml"[^>]*\/>/, '');
  writeFileSync(ctPath, ctXml, 'utf8');

  const output = join(here, 'cycle-round7-graft.docx');
  copyFileSync(realSample, output);
  execFileSync('zip', ['-q', '-X', output, 'word/diagrams/data1.xml', 'word/diagrams/layout1.xml'], { cwd: dir, stdio: 'pipe' });
  execFileSync('zip', ['-q', '-X', '-d', output, 'word/diagrams/drawing1.xml'], { stdio: 'pipe' });
  execFileSync('zip', ['-q', '-X', output, '[Content_Types].xml', 'word/_rels/document.xml.rels'], { cwd: dir, stdio: 'pipe' });

  console.log('\n3. Sanity checks...');
  execFileSync('unzip', ['-t', output], { stdio: 'pipe' });
  console.log('   ZIP OK.');
  execFileSync('soffice', ['--headless', '--convert-to', 'png', '--outdir', here, output], { stdio: 'pipe' });
  console.log('   LibreOffice render OK.');
  console.log(`\n${output}\nis the file for round 7's test.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
