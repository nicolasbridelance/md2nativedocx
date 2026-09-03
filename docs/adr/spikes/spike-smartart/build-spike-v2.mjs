#!/usr/bin/env node
/**
 * Spike 1 v2 (mmd2smartart, see docs/specs/FUTURE_mmd2smartart_SPEC.md §7 and
 * docs/adr/0004-smartart-feasibility-spike.md) -- graft an AUTHENTIC,
 * real-Word-emitted SmartArt "Hiérarchie" (hierarchy1) diagram onto our own
 * minimal Pandoc-produced base.docx, via the same hand-zip-surgery
 * mechanism as build-spike.mjs (v1).
 *
 * Why a v2 exists: v1 hand-approximated diagram-layout1.xml from secondary
 * documentation (no primary source for Word's real hierarchy1 algorithm was
 * found) and rendered as a blank frame in both LibreOffice and real Word
 * (confirmed by the maintainer, see ADR 0004's "Confirmation en vrai Word"
 * section). The maintainer then created a real "Hiérarchie" + "Hiérarchie
 * horizontale" SmartArt pair in actual Word and provided the .docx
 * (SmartArt-Hierarchie+Hierarchiehorizontale.docx, extracted into
 * real-word-extract/ and the "Hiérarchie" diagram's 5 parts copied
 * verbatim into real-diagram1/). This script tests whether OUR zip-surgery
 * injection mechanism -- independent of whether we can ever hand-author a
 * correct layoutDef algorithm ourselves -- can correctly wire 100%
 * authentic diagram parts into an unrelated host document and have Word's
 * diagram engine render them.
 *
 * Two concrete corrections vs v1, both discovered by inspecting the real
 * extract (see spike.md "v2" section for detail):
 *   1. v1 assumed dsp:dataModelExt's relId is scoped to a part-specific
 *      word/diagrams/_rels/data1.xml.rels file (reasoning: OOXML
 *      relationship ids are normally scoped to the part that references
 *      them). The real Word document has NO such file at all -- data1.xml's
 *      <dsp:dataModelExt relId="rId8"/> resolves against
 *      word/_rels/document.xml.rels instead (rId8 there is the
 *      diagramDrawing relationship). This is a Microsoft diagram-specific
 *      convention, not plain OPC part-relationship scoping. v2 follows the
 *      real convention: no data1.xml.rels, all 5 diagram relationships
 *      (data/layout/quickStyle/colors/drawing) live in document.xml.rels,
 *      and data1.xml's dsp:dataModelExt relId is rewritten to whichever id
 *      this script assigns the drawing relationship.
 *   2. v1 used r:qs="" r:cs="" (empty-string, per the spec's own MVP
 *      decision to omit colors/quickStyle). Real Word always emits all 4
 *      parts for a UI-inserted SmartArt. v2 uses all 4 non-empty (plus
 *      drawing) to first prove the full authentic structure round-trips
 *      before testing whether the data+layout-only MVP omission (v1's
 *      approach) is itself what's safe to keep doing in a future v3.
 *
 * Still a STANDALONE EXPLORATORY SCRIPT (AGENTS.md rule #7 governs the
 * production pipeline, not this). Zero new npm dependencies; all
 * subprocess calls use execFileSync with argument arrays (rule #4); no
 * external relationship is ever written (rule #3, asserted below).
 *
 * Usage:
 *   node build-spike-v2.mjs [base.docx] [spike-v2.docx]
 */

import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_DIR = join(HERE, 'real-diagram1');

const RELTYPE = {
  data: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData',
  layout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout',
  quickStyle: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle',
  colors: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors',
  drawing: 'http://schemas.microsoft.com/office/2007/relationships/diagramDrawing',
};
const CONTENTTYPE = {
  data: 'application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml',
  layout: 'application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml',
  quickStyle: 'application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml',
  colors: 'application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml',
  drawing: 'application/vnd.ms-office.drawingml.diagramDrawing+xml',
};
const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';

function fail(msg) {
  console.error(`build-spike-v2: ${msg}`);
  process.exit(1);
}

/** Pick a relationship Id not already used in the .rels file's raw text. */
function nextFreeRelId(relsXml, base) {
  let n = 1;
  let candidate = `${base}${n}`;
  while (relsXml.includes(`Id="${candidate}"`)) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
}

function main() {
  const baseDocxArg = process.argv[2] ?? join(HERE, 'base.docx');
  const outDocxArg = process.argv[3] ?? join(HERE, 'spike-v2.docx');
  const baseDocx = resolve(baseDocxArg);
  const outDocx = resolve(outDocxArg);

  if (!existsSync(baseDocx)) {
    fail(`base docx not found at ${baseDocx}. Generate it first: pandoc base.md -o base.docx`);
  }
  for (const part of ['data1', 'layout1', 'colors1', 'quickStyle1', 'drawing1']) {
    if (!existsSync(join(REAL_DIR, `${part}.xml`))) {
      fail(`missing ${part}.xml in ${REAL_DIR} -- run the extraction step first (see spike.md)`);
    }
  }

  let dataXml = readFileSync(join(REAL_DIR, 'data1.xml'), 'utf8');
  const layoutXml = readFileSync(join(REAL_DIR, 'layout1.xml'), 'utf8');
  const colorsXml = readFileSync(join(REAL_DIR, 'colors1.xml'), 'utf8');
  const quickStyleXml = readFileSync(join(REAL_DIR, 'quickStyle1.xml'), 'utf8');
  const drawingXml = readFileSync(join(REAL_DIR, 'drawing1.xml'), 'utf8');

  // v2 correction #1 sanity check: v1's part-scoped assumption doesn't apply
  // here. Confirm the real data1.xml really does carry a dsp:dataModelExt
  // with exactly one relId to rewrite, before we go further.
  const relIdMatches = [...dataXml.matchAll(/dsp:dataModelExt[^>]*\brelId="([^"]+)"/g)];
  if (relIdMatches.length !== 1) {
    fail(
      `expected exactly one dsp:dataModelExt relId in the real data1.xml, found ${relIdMatches.length}`
    );
  }
  const originalDrawingRelId = relIdMatches[0][1];

  const work = mkdtempSync(join(tmpdir(), 'smartart-spike-v2-'));
  try {
    execFileSync('unzip', ['-o', '-q', baseDocx, '-d', work]);

    const diagramsDir = join(work, 'word', 'diagrams');
    mkdirSync(diagramsDir, { recursive: true });
    writeFileSync(join(diagramsDir, 'layout1.xml'), layoutXml, 'utf8');
    writeFileSync(join(diagramsDir, 'colors1.xml'), colorsXml, 'utf8');
    writeFileSync(join(diagramsDir, 'quickStyle1.xml'), quickStyleXml, 'utf8');
    writeFileSync(join(diagramsDir, 'drawing1.xml'), drawingXml, 'utf8');
    // Deliberately NOT creating word/diagrams/_rels/data1.xml.rels -- see
    // correction #1 above. data1.xml's dsp:dataModelExt relId is rewritten
    // below to point into word/_rels/document.xml.rels instead.

    // [Content_Types].xml -- 5 Override entries.
    const contentTypesPath = join(work, '[Content_Types].xml');
    let contentTypes = readFileSync(contentTypesPath, 'utf8');
    if (!contentTypes.includes('</Types>')) fail('[Content_Types].xml has no </Types>');
    const overrides = ['data', 'layout', 'quickStyle', 'colors', 'drawing']
      .map(
        (k) =>
          `<Override PartName="/word/diagrams/${k === 'quickStyle' ? 'quickStyle1' : k + '1'}.xml" ContentType="${CONTENTTYPE[k]}" />`
      )
      .join('');
    contentTypes = contentTypes.replace('</Types>', `${overrides}</Types>`);
    writeFileSync(contentTypesPath, contentTypes, 'utf8');

    // word/_rels/document.xml.rels -- 5 internal-only relationships.
    const relsPath = join(work, 'word', '_rels', 'document.xml.rels');
    let relsXml = readFileSync(relsPath, 'utf8');
    if (!relsXml.includes('</Relationships>')) fail('document.xml.rels has no </Relationships>');

    const rId = {};
    for (const k of ['data', 'layout', 'quickStyle', 'colors', 'drawing']) {
      rId[k] = nextFreeRelId(relsXml, `rIdSmartArt${k[0].toUpperCase()}${k.slice(1)}`);
      const target =
        k === 'quickStyle' ? 'diagrams/quickStyle1.xml' : `diagrams/${k}1.xml`;
      relsXml = relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${rId[k]}" Type="${RELTYPE[k]}" Target="${target}" /></Relationships>`
      );
    }
    if (relsXml.includes('TargetMode="External"')) {
      fail('refusing to write a document.xml.rels containing an external relationship');
    }
    writeFileSync(relsPath, relsXml, 'utf8');

    // data1.xml: rewrite dsp:dataModelExt's relId to the drawing relationship
    // id we just assigned in document.xml.rels (correction #1).
    dataXml = dataXml.replace(
      `relId="${originalDrawingRelId}"`,
      `relId="${rId.drawing}"`
    );
    writeFileSync(join(diagramsDir, 'data1.xml'), dataXml, 'utf8');

    // word/document.xml -- declare xmlns:dgm if missing, insert the
    // <w:drawing> paragraph referencing all 4 relIds (dm/lo/qs/cs).
    const documentPath = join(work, 'word', 'document.xml');
    let documentXml = readFileSync(documentPath, 'utf8');

    const rootStart = documentXml.indexOf('<w:document');
    const rootTagEnd = documentXml.indexOf('>', rootStart);
    if (rootStart < 0 || rootTagEnd < 0) fail('could not find <w:document> root element');
    const rootOpenTag = documentXml.slice(rootStart, rootTagEnd + 1);
    if (!rootOpenTag.includes('xmlns:dgm=')) {
      documentXml =
        documentXml.slice(0, rootStart) +
        rootOpenTag.replace('>', ` xmlns:dgm="${DGM_NS}">`) +
        documentXml.slice(rootTagEnd + 1);
    }
    for (const prefix of ['dgm', 'a', 'r', 'wp']) {
      if (!documentXml.slice(rootStart, documentXml.indexOf('>', rootStart) + 1).includes(`xmlns:${prefix}=`)) {
        fail(`root <w:document> is missing xmlns:${prefix} -- would produce a Word-unreadable file`);
      }
    }

    const drawingParagraph =
      `<w:p><w:r><w:drawing>` +
      `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="5486400" cy="3200400"/>` +
      `<wp:effectExtent l="0" t="0" r="0" b="57150"/>` +
      `<wp:docPr id="9002" name="SmartArt Spike Diagram v2"/>` +
      `<wp:cNvGraphicFramePr/>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">` +
      `<dgm:relIds xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
      `r:dm="${rId.data}" r:lo="${rId.layout}" r:qs="${rId.quickStyle}" r:cs="${rId.colors}"/>` +
      `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

    const bodyEndIdx = documentXml.indexOf('</w:body>');
    if (bodyEndIdx < 0) fail('could not find </w:body>');
    const sectPrIdx = documentXml.lastIndexOf('<w:sectPr');
    const insertAt = sectPrIdx >= 0 && sectPrIdx < bodyEndIdx ? sectPrIdx : bodyEndIdx;
    documentXml = documentXml.slice(0, insertAt) + drawingParagraph + documentXml.slice(insertAt);
    writeFileSync(documentPath, documentXml, 'utf8');

    if (existsSync(outDocx)) rmSync(outDocx);
    execFileSync('zip', ['-X', '-r', '-q', outDocx, '.'], { cwd: work });

    console.log(`build-spike-v2: wrote ${outDocx}`);
    console.log(`build-spike-v2: relationship ids used -> ${JSON.stringify(rId)}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
