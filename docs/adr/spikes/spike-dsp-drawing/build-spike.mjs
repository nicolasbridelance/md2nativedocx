#!/usr/bin/env node
/**
 * Spike (Milestone 0 of the SmartArt coverage plan, 2026-09-05) -- add a
 * hand-built `dsp:drawing` fallback part to a real `cycle` SmartArt diagram,
 * to test the working hypothesis in TODO.md's "Incident SmartArt 'cycle'
 * cassé en Word réel": that Word refuses to open a custom (non-Microsoft-URN)
 * `dgm:layoutDef` unless this pre-rendered safety net is present.
 *
 * Two questions this spike answers *before* investing in a real geometry
 * engine (packages/core/src/smartart/drawing.ts, per the plan):
 *   1. What must `dsp:sp/@modelId` reference? Answered by inspecting
 *      handmade_samples/cycle-simple.docx directly: every `dsp:sp/@modelId`
 *      in the real sample's drawing1.xml is a PRESENTATION point
 *      (`dgm:pt/@type="pres"`) from data1.xml, never a content point. Our
 *      own generators already have such points (`p-main{N}`, the ones
 *      carrying `presStyleLbl="node1"`) -- this script reuses those ids
 *      as-is, unchanged format (confirms ADR 0004 "Round 3": modelId format
 *      itself has no bearing on rendering, only referential correctness to
 *      an existing pres point does).
 *   2. Does adding a plausible `dsp:drawing` break anything under
 *      LibreOffice? Answered empirically below -- see spike.md for the
 *      surprising result (LibreOffice PREFERS the pre-rendered fallback over
 *      re-running the live algorithm once one is present).
 *
 * This is a STANDALONE EXPLORATORY SCRIPT (same precedent as
 * docs/adr/spikes/spike-smartart/build-spike.mjs): it reuses the real,
 * unmodified production pipeline (packages/cli/bin/md2nativedocx.mjs) to
 * produce the known-working 4-part baseline, then hand-patches in the 5th
 * part -- exactly the part packages/cli/src/postprocess.mjs's
 * injectSmartArtParts() does NOT yet emit (that's Milestone 1, gated on this
 * spike's real-Word result). No production code is touched.
 *
 * All subprocess calls use execFileSync with argument arrays (AGENTS.md
 * rule #4).
 *
 * Usage: node build-spike.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const cliBin = join(repoRoot, 'packages', 'cli', 'bin', 'md2nativedocx.mjs');
const mdInput = join(here, 'cycle.md');
const baseDocx = join(here, 'cycle-base.docx');
const withDrawingDocx = join(here, 'cycle-with-drawing.docx');

/** EMU canvas + circle geometry -- same proportions as CYCLE_LAYOUT_XML's
 * own `dgm:constr type="diam" fact="0.3"` (30% of the shorter canvas
 * dimension), transposed to concrete numbers for this fallback. */
const CANVAS_W = 5486400;
const CANVAS_H = 3200400;
const DIAM = 1200000;
const [CX, CY] = [CANVAS_W / 2, CANVAS_H / 2];
const RADIUS = 1000000;

function dspShape(modelId, text, x, y) {
  return (
    `<dsp:sp modelId="${modelId}">` +
    '<dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>' +
    '<dsp:spPr>' +
    `<a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${DIAM}" cy="${DIAM}"/></a:xfrm>` +
    '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>' +
    '<a:solidFill><a:schemeClr val="accent1"/></a:solidFill>' +
    '<a:ln w="0"><a:noFill/></a:ln>' +
    '</dsp:spPr>' +
    // Same style reference vocabulary as CYCLE_STYLE_XML's "node1" styleLbl
    // (packages/core/src/smartart/cycle.ts) -- the fallback should look like
    // the live diagram, not merely exist.
    '<dsp:style>' +
    '<a:lnRef idx="0"><a:schemeClr val="accent1"/></a:lnRef>' +
    '<a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>' +
    '<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef>' +
    '<a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef>' +
    '</dsp:style>' +
    '<dsp:txBody>' +
    '<a:bodyPr spcFirstLastPara="0" vert="horz" wrap="square" anchor="ctr" anchorCtr="0"><a:noAutofit/></a:bodyPr>' +
    '<a:lstStyle/>' +
    `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="fr-FR" sz="1800"/><a:t>${text}</a:t></a:r></a:p>` +
    '</dsp:txBody>' +
    '</dsp:sp>'
  );
}

function buildDrawingXml(mainIds) {
  const shapes = mainIds.map(({ modelId, text }, i) => {
    const angle = ((90 - i * (360 / mainIds.length)) * Math.PI) / 180;
    const x = CX + RADIUS * Math.cos(angle) - DIAM / 2;
    const y = CY - RADIUS * Math.sin(angle) - DIAM / 2;
    return dspShape(modelId, text, x, y);
  });
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<dsp:drawing xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" ' +
    'xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr>' +
    '<dsp:grpSpPr/>' +
    shapes.join('') +
    '</dsp:spTree></dsp:drawing>'
  );
}

function nextFreeRelId(relsXml) {
  const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  return `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
}

console.log('1. Building the known-working 4-part baseline via the real CLI...');
execFileSync('node', [cliBin, mdInput, '-o', baseDocx], {
  env: { ...process.env, MD2NATIVEDOCX_ENABLE_SMARTART: '1' },
  stdio: 'inherit',
});

console.log('2. Extracting and patching in a hand-built 5th part (dsp:drawing)...');
const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-spike-dsp-'));
try {
  execFileSync('unzip', ['-o', '-q', baseDocx, '-d', dir], { stdio: 'pipe' });

  const dataPath = join(dir, 'word', 'diagrams', 'data1.xml');
  const dataXml = readFileSync(dataPath, 'utf8');

  // Find every "Main" presentation point (the shape-carrying pres points,
  // per the real-sample finding above) and its associated node text, in
  // document order.
  const mainIds = [];
  for (const m of dataXml.matchAll(/<dgm:pt modelId="(p-main\d+)" type="pres"><dgm:prSet presAssocID="(\d+)"/g)) {
    const [, modelId, contentId] = m;
    const textMatch = dataXml.match(
      new RegExp(`<dgm:pt modelId="${contentId}">[\\s\\S]*?<a:t>([^<]*)</a:t>`),
    );
    mainIds.push({ modelId, text: textMatch ? textMatch[1] : '' });
  }
  if (mainIds.length === 0) throw new Error('no p-main* presentation points found in data1.xml');
  console.log('   Main presentation points found:', mainIds.map((n) => `${n.modelId}=${n.text}`).join(', '));

  writeFileSync(join(dir, 'word', 'diagrams', 'drawing1.xml'), buildDrawingXml(mainIds), 'utf8');

  const relsPath = join(dir, 'word', '_rels', 'document.xml.rels');
  const relsXml = readFileSync(relsPath, 'utf8');
  const rId = nextFreeRelId(relsXml);
  const rel = `<Relationship Id="${rId}" Type="http://schemas.microsoft.com/office/2007/relationships/diagramDrawing" Target="diagrams/drawing1.xml"/>`;
  writeFileSync(relsPath, relsXml.replace('</Relationships>', `${rel}</Relationships>`), 'utf8');

  const contentTypesPath = join(dir, '[Content_Types].xml');
  const contentTypesXml = readFileSync(contentTypesPath, 'utf8');
  const override =
    '<Override PartName="/word/diagrams/drawing1.xml" ContentType="application/vnd.ms-office.drawingml.diagramDrawing+xml" />';
  writeFileSync(contentTypesPath, contentTypesXml.replace('</Types>', `${override}</Types>`), 'utf8');

  // Position confirmed against the real sample: dsp:dataModelExt sits inside
  // dgm:extLst, as the last child of dgm:dataModel (after dgm:whole).
  const ext =
    `<dgm:extLst><a:ext uri="http://schemas.microsoft.com/office/drawing/2008/diagram">` +
    `<dsp:dataModelExt xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" relId="${rId}" ` +
    `minVer="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:ext></dgm:extLst>`;
  if (!dataXml.includes('<dgm:whole/></dgm:dataModel>')) {
    throw new Error('expected trailing <dgm:whole/></dgm:dataModel> not found -- generator output shape changed?');
  }
  writeFileSync(dataPath, dataXml.replace('<dgm:whole/></dgm:dataModel>', `<dgm:whole/>${ext}</dgm:dataModel>`), 'utf8');

  copyFileSync(baseDocx, withDrawingDocx);
  execFileSync(
    'zip',
    ['-q', '-X', withDrawingDocx, '[Content_Types].xml', 'word/_rels/document.xml.rels', 'word/diagrams/data1.xml', 'word/diagrams/drawing1.xml'],
    { cwd: dir, stdio: 'pipe' },
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('3. Sanity checks (ZIP validity + well-formed XML)...');
execFileSync('unzip', ['-t', withDrawingDocx], { stdio: 'pipe' });
console.log('   ZIP OK.');

console.log('4. Rendering both via LibreOffice headless for visual comparison...');
for (const docx of [baseDocx, withDrawingDocx]) {
  if (existsSync(docx)) {
    execFileSync('soffice', ['--headless', '--convert-to', 'png', '--outdir', here, docx], { stdio: 'pipe' });
  }
}

console.log('\nDone. See cycle-base.png (live layoutDef, LibreOffice-computed) vs');
console.log('cycle-with-drawing.png (the hand-built dsp:drawing fallback) in this directory.');
console.log(`\n${withDrawingDocx}\nis the file to open in a REAL Word to answer the actual open question.`);
