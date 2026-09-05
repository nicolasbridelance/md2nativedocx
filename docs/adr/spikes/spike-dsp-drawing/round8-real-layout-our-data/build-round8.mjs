#!/usr/bin/env node
/**
 * Round 8 (2026-09-05) -- rounds 4, 6, and 7 each patched a real, verified
 * structural gap into OUR OWN layout.xml/data.xml (missing presOf/
 * constrLst/ruleLst on layoutNode; missing adjLst/r:blip on shape; missing
 * parTrans/sibTrans content points) and all three failed, alone and
 * cumulatively. Guessing more isolated element-level additions to our own
 * (still broken in some other way) content has a poor hit rate so far.
 *
 * New strategy: instead of adding pieces to our broken content, pair the
 * REAL layout.xml (Word's own "Basic Cycle" algorithm, completely
 * unchanged -- guaranteed structurally valid, it's what real Word wrote)
 * with a data.xml written in OUR OWN simple style (plain string modelIds,
 * no parTrans/sibTrans, no presLayoutVars, no GUIDs) but with presentation
 * names matching what the REAL layout actually expects: a FLAT structure
 * (root "cycle" -> per-item "node" directly, no intermediate level) rather
 * than our own generators' "root" -> "composite" -> "Main" 3-level nesting.
 *
 *   - Opens fine -> our own DATA AUTHORING STYLE is fine; the real problem
 *     is specifically something about OUR OWN layout.xml (very possibly
 *     the 2-level composite/Main nesting itself, not just the missing
 *     elements already patched).
 *   - Still fails -> even a simple, non-GUID, minimal data.xml is
 *     incompatible with real Word when paired with a real (working)
 *     layout.xml -- something more fundamental about our whole data.xml
 *     authoring approach (not just isolated missing elements) is wrong.
 *
 * Usage: node build-round8.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..', '..');
const realSample = join(repoRoot, 'handmade_samples', 'cycle-simple.docx');
const output = join(here, 'cycle-round8-real-layout.docx');

const REAL_LAYOUT_URN = 'urn:microsoft.com/office/officeart/2005/8/layout/cycle2';
const REAL_QS_URN = 'urn:microsoft.com/office/officeart/2005/8/quickstyle/simple1';
const REAL_CS_URN = 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2';

const NODES = [
  { id: '1', text: 'A' },
  { id: '2', text: 'B' },
  { id: '3', text: 'C' },
];

function buildDataXml() {
  const contentPts = NODES.map(
    (n) => `<dgm:pt modelId="${n.id}"><dgm:prSet phldrT="[Texte]"/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR"/><a:t>${n.text}</a:t></a:r></a:p></dgm:t></dgm:pt>`,
  ).join('');

  const structuralCxns = NODES.map(
    (n, i) => `<dgm:cxn modelId="c${n.id}" type="parOf" srcId="0" destId="${n.id}" srcOrd="${i}" destOrd="0"/>`,
  ).join('');

  const presNodePts = NODES.map(
    (n, i) =>
      `<dgm:pt modelId="p-node${n.id}" type="pres"><dgm:prSet presAssocID="${n.id}" presName="node" presStyleLbl="node1" presStyleIdx="${i}" presStyleCnt="${NODES.length}"><dgm:presLayoutVars><dgm:bulletEnabled val="1"/></dgm:presLayoutVars></dgm:prSet><dgm:spPr/></dgm:pt>`,
  ).join('');

  const presOfCxns = [
    `<dgm:cxn modelId="po0" type="presOf" srcId="0" destId="p-root" srcOrd="0" destOrd="0" presId="${REAL_LAYOUT_URN}"/>`,
    ...NODES.map(
      (n) => `<dgm:cxn modelId="po${n.id}" type="presOf" srcId="${n.id}" destId="p-node${n.id}" srcOrd="0" destOrd="0" presId="${REAL_LAYOUT_URN}"/>`,
    ),
  ].join('');

  const presParOfCxns = NODES.map(
    (n, i) => `<dgm:cxn modelId="pp${n.id}" type="presParOf" srcId="p-root" destId="p-node${n.id}" srcOrd="${i}" destOrd="0" presId="${REAL_LAYOUT_URN}"/>`,
  ).join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<dgm:ptLst>' +
    `<dgm:pt modelId="0" type="doc"><dgm:prSet loTypeId="${REAL_LAYOUT_URN}" loCatId="cycle" qsTypeId="${REAL_QS_URN}" qsCatId="simple" csTypeId="${REAL_CS_URN}" csCatId="accent1"/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="fr-FR"/></a:p></dgm:t></dgm:pt>` +
    contentPts +
    `<dgm:pt modelId="p-root" type="pres"><dgm:prSet presAssocID="0" presName="cycle" presStyleCnt="0"><dgm:presLayoutVars><dgm:dir/><dgm:resizeHandles val="exact"/></dgm:presLayoutVars></dgm:prSet><dgm:spPr/></dgm:pt>` +
    presNodePts +
    '</dgm:ptLst>' +
    '<dgm:cxnLst>' +
    structuralCxns +
    presOfCxns +
    presParOfCxns +
    '</dgm:cxnLst>' +
    '<dgm:bg/><dgm:whole/>' +
    '</dgm:dataModel>'
  );
}

console.log('1. Building a data.xml in our own simple style, with presentation names matching the REAL layout1.xml (flat "cycle"->"node", no composite/Main level)...');
const dataXml = buildDataXml();

console.log('2. Grafting into the real Word file (layout1.xml UNCHANGED, colors/quickStyle real, no drawing)...');
const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-r8-'));
try {
  execFileSync('unzip', ['-o', '-q', realSample, '-d', dir], { stdio: 'pipe' });
  writeFileSync(join(dir, 'word', 'diagrams', 'data1.xml'), dataXml, 'utf8');
  // layout1.xml is NOT touched at all in this round.
  rmSync(join(dir, 'word', 'diagrams', 'drawing1.xml'));

  const relsPath = join(dir, 'word', '_rels', 'document.xml.rels');
  let relsXml = readFileSync(relsPath, 'utf8');
  relsXml = relsXml.replace(/<Relationship Id="rId8"[^>]*diagramDrawing[^>]*\/>/, '');
  writeFileSync(relsPath, relsXml, 'utf8');

  const ctPath = join(dir, '[Content_Types].xml');
  let ctXml = readFileSync(ctPath, 'utf8');
  ctXml = ctXml.replace(/<Override PartName="\/word\/diagrams\/drawing1\.xml"[^>]*\/>/, '');
  writeFileSync(ctPath, ctXml, 'utf8');

  copyFileSync(realSample, output);
  execFileSync('zip', ['-q', '-X', output, 'word/diagrams/data1.xml'], { cwd: dir, stdio: 'pipe' });
  execFileSync('zip', ['-q', '-X', '-d', output, 'word/diagrams/drawing1.xml'], { stdio: 'pipe' });
  execFileSync('zip', ['-q', '-X', output, '[Content_Types].xml', 'word/_rels/document.xml.rels'], { cwd: dir, stdio: 'pipe' });

  console.log('\n3. Sanity checks...');
  execFileSync('unzip', ['-t', output], { stdio: 'pipe' });
  console.log('   ZIP OK.');
  execFileSync('soffice', ['--headless', '--convert-to', 'png', '--outdir', here, output], { stdio: 'pipe' });
  console.log('   LibreOffice render OK.');
  console.log(`\n${output}\nis the file for round 8's test.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
