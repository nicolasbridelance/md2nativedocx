#!/usr/bin/env node
/**
 * Round 6 (2026-09-05) -- round 5 cleared the layout URN entirely (a real
 * Word file with ONLY its URN swapped to ours opened fine), so the real
 * problem is still somewhere in the structural differences between our
 * from-scratch layoutDef and Word's own. Round 4's fix (presOf/constrLst/
 * ruleLst on layoutNode) was insufficient alone.
 *
 * New finding from a closer structural pass: EVERY `dgm:shape` element in
 * the real file (all 4 of them: the root "cycle" node, the per-item "node",
 * the "sibTrans" connector, "connectorText") has:
 *   1. an `<dgm:adjLst/>` CHILD element -- ours are always self-closed with
 *      no children at all (`<dgm:shape/>` or `<dgm:shape type="roundRect"/>`).
 *   2. an `xmlns:r=".../relationships"` declaration + `r:blip=""` attribute
 *      (empty, meaning "no image fill") -- ours have neither at all.
 * Both look like the same class of bug round 4 found on `dgm:layoutNode`
 * (presOf/constrLst/ruleLst): a required-by-schema element/attribute that
 * can be empty but must be PRESENT, which Word's strict parser enforces and
 * LibreOffice's lenient one does not.
 *
 * This round combines round 4's already-tested fix with both new ones on
 * every `dgm:shape` in our layoutDef, and grafts the result into the real
 * Word file (round 3's cleanest isolation method) for one decisive test.
 *
 * Usage: node build-round6.mjs
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

function patchLayoutXml(xml) {
  let out = xml;

  // Round 4's fix (kept): presOf/constrLst/ruleLst on "root" and "composite".
  const step1 = out;
  out = out.replace(
    '<dgm:alg type="cycle"/><dgm:shape/><dgm:constrLst>',
    '<dgm:alg type="cycle"/><dgm:shape/><dgm:presOf/><dgm:constrLst>',
  );
  if (out === step1) throw new Error('round 4 fix 1/3: pattern not found');

  const step2 = out;
  out = out.replace(
    '</dgm:constrLst><dgm:forEach name="nodesForEach"',
    '</dgm:constrLst><dgm:ruleLst/><dgm:forEach name="nodesForEach"',
  );
  if (out === step2) throw new Error('round 4 fix 2/3: pattern not found');

  const step3 = out;
  out = out.replace(
    '<dgm:alg type="composite"/><dgm:shape/><dgm:layoutNode name="Main"',
    '<dgm:alg type="composite"/><dgm:shape/><dgm:presOf/><dgm:constrLst/><dgm:ruleLst/><dgm:layoutNode name="Main"',
  );
  if (out === step3) throw new Error('round 4 fix 3/3: pattern not found');

  // Round 6's new fix: every remaining self-closed <dgm:shape/> or
  // <dgm:shape type="..."/> becomes <dgm:shape ... xmlns:r="..." r:blip="">
  // <dgm:adjLst/></dgm:shape> -- matching the real file's shape exactly.
  const before = out;
  out = out.replace(/<dgm:shape(\s+type="[^"]*")?\s*\/>/g, (_match, typeAttr) => {
    const t = typeAttr ?? '';
    return `<dgm:shape${t} xmlns:r="${R_NS}" r:blip=""><dgm:adjLst/></dgm:shape>`;
  });
  if (out === before) throw new Error('round 6 fix: no self-closed <dgm:shape/> found to patch');
  const shapeCountBefore = (before.match(/<dgm:shape\b/g) ?? []).length;
  const shapeCountAfter = (out.match(/<dgm:shape\b/g) ?? []).length;
  if (shapeCountBefore !== shapeCountAfter) throw new Error('round 6 fix: shape count changed unexpectedly');
  console.log(`   Patched ${shapeCountBefore} <dgm:shape> elements: added xmlns:r/r:blip="" + <dgm:adjLst/> child.`);

  return out;
}

console.log('1. Loading our own generated data1.xml/layout1.xml and patching layout1.xml...');
const coreDist = join(repoRoot, 'packages', 'core', 'dist');
const { parseMermaid } = await import(join(coreDist, 'index.js'));
const { generateCycle } = await import(join(coreDist, 'smartart', 'cycle.js'));
const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C\n  C --> A\n');
const generated = generateCycle(ast);
const patchedLayoutXml = patchLayoutXml(generated.layoutXml);

console.log('\n2. Grafting patched data+layout into the real Word file (colors/quickStyle real, no drawing)...');
const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-r6-'));
try {
  execFileSync('unzip', ['-o', '-q', realSample, '-d', dir], { stdio: 'pipe' });
  writeFileSync(join(dir, 'word', 'diagrams', 'data1.xml'), generated.dataXml, 'utf8');
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

  const output = join(here, 'cycle-round6-graft.docx');
  copyFileSync(realSample, output);
  execFileSync('zip', ['-q', '-X', output, 'word/diagrams/data1.xml', 'word/diagrams/layout1.xml'], { cwd: dir, stdio: 'pipe' });
  execFileSync('zip', ['-q', '-X', '-d', output, 'word/diagrams/drawing1.xml'], { stdio: 'pipe' });
  execFileSync('zip', ['-q', '-X', output, '[Content_Types].xml', 'word/_rels/document.xml.rels'], { cwd: dir, stdio: 'pipe' });

  console.log('\n3. Sanity checks...');
  execFileSync('unzip', ['-t', output], { stdio: 'pipe' });
  console.log('   ZIP OK.');
  execFileSync('soffice', ['--headless', '--convert-to', 'png', '--outdir', here, output], { stdio: 'pipe' });
  console.log('   LibreOffice render OK.');
  console.log(`\n${output}\nis the file for round 6's test.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
