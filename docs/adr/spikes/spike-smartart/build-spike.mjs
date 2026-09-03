#!/usr/bin/env node
/**
 * Spike 1 (mmd2smartart, see docs/specs/FUTURE_mmd2smartart_SPEC.md §7) -- build a
 * minimal .docx containing a hand-built SmartArt hierarchy diagram, by
 * hand-editing the ZIP package of a Pandoc-produced base .docx.
 *
 * This is a STANDALONE EXPLORATORY SCRIPT, not part of the production
 * pipeline. AGENTS.md rule #7 ("don't touch .docx ZIP internals directly")
 * exists to keep ZIP packaging inside Pandoc's ownership for the shipping
 * pipeline; this script mirrors the precedent already accepted for spikes
 * (docs/adr/spikes/spike-pandoc/) and does not touch packages/cli or any
 * other production code.
 *
 * What it does, mechanically:
 *   1. Extracts base.docx (unzip) into a scratch directory.
 *   2. Writes word/diagrams/data1.xml and word/diagrams/layout1.xml (read
 *      verbatim from diagram-data1.xml / diagram-layout1.xml next to this
 *      script -- see those files' own comments for provenance).
 *   3. Adds two Override entries to [Content_Types].xml.
 *   4. Adds two internal-only Relationship entries to
 *      word/_rels/document.xml.rels (no TargetMode="External", ever --
 *      AGENTS.md rule #3).
 *   5. Inserts a <w:drawing> paragraph referencing the diagram via
 *      <dgm:relIds> into word/document.xml, adding the xmlns:dgm
 *      declaration on the document root if it isn't already there (the
 *      exact class of namespace bug documented in TODO.md under
 *      "mc:Ignorable": every prefix used must be declared in scope, and
 *      mc:Ignorable -- if touched at all -- must only list prefixes that
 *      are actually declared. This script does not touch mc:Ignorable;
 *      Pandoc's base document doesn't emit one, and this script has no
 *      reason to add one for a plain dgm: element Word does not need to be
 *      told it may ignore).
 *   6. Re-zips the scratch directory into spike.docx.
 *
 * All subprocess calls use execFileSync with argument arrays (AGENTS.md
 * rule #4) -- no shell string interpolation anywhere.
 *
 * Usage:
 *   node build-spike.mjs [base.docx] [spike.docx]
 *   (defaults: base.docx -> spike.docx, both resolved relative to this file)
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

const DIAGRAM_DATA_RELTYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData';
const DIAGRAM_LAYOUT_RELTYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout';
const DIAGRAM_DRAWING_RELTYPE =
  'http://schemas.microsoft.com/office/2007/relationships/diagramDrawing';
const DIAGRAM_DATA_CONTENTTYPE =
  'application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml';
const DIAGRAM_LAYOUT_CONTENTTYPE =
  'application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml';
const DIAGRAM_DRAWING_CONTENTTYPE =
  'application/vnd.ms-office.drawingml.diagramDrawing+xml';
const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';

function fail(msg) {
  console.error(`build-spike: ${msg}`);
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
  const outDocxArg = process.argv[3] ?? join(HERE, 'spike.docx');
  const baseDocx = resolve(baseDocxArg);
  const outDocx = resolve(outDocxArg);

  if (!existsSync(baseDocx)) {
    fail(
      `base docx not found at ${baseDocx}. Generate it first, e.g.:\n` +
        `  pandoc base.md -o base.docx`
    );
  }

  const dataXmlPath = join(HERE, 'diagram-data1.xml');
  const layoutXmlPath = join(HERE, 'diagram-layout1.xml');
  const drawingXmlPath = join(HERE, 'diagram-drawing1.xml');
  let dataXml = readFileSync(dataXmlPath, 'utf8');
  const layoutXml = readFileSync(layoutXmlPath, 'utf8');
  const drawingXml = readFileSync(drawingXmlPath, 'utf8');

  const work = mkdtempSync(join(tmpdir(), 'smartart-spike-'));
  try {
    // 1. Extract the base .docx (a ZIP archive) into the scratch directory.
    execFileSync('unzip', ['-o', '-q', baseDocx, '-d', work]);

    // 2. Write the three new diagram parts. drawing1.xml is the
    //    "dsp:drawing" pre-rendered fallback -- see spike.md's "The
    //    dsp:drawing fallback part" section for why this turned out to be
    //    necessary empirically, despite Microsoft's own docs listing only
    //    data+layout as mandatory.
    const diagramsDir = join(work, 'word', 'diagrams');
    mkdirSync(diagramsDir, { recursive: true });
    writeFileSync(join(diagramsDir, 'layout1.xml'), layoutXml, 'utf8');
    writeFileSync(join(diagramsDir, 'drawing1.xml'), drawingXml, 'utf8');

    // 2a. data1.xml's own part-relationships file: the <dsp:dataModelExt
    //     relId="..."/> extension inside data1.xml references drawing1.xml
    //     via a relationship ID that is scoped to data1.xml itself, per OPC
    //     rules (each part's relationships live in its own
    //     _rels/<part>.rels next to it) -- NOT via word/_rels/document.xml.rels.
    const dataRelsDir = join(diagramsDir, '_rels');
    mkdirSync(dataRelsDir, { recursive: true });
    const dataRelId = 'rId1';
    const dataRelsXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="${dataRelId}" Type="${DIAGRAM_DRAWING_RELTYPE}" Target="drawing1.xml" />` +
      '</Relationships>';
    writeFileSync(join(dataRelsDir, 'data1.xml.rels'), dataRelsXml, 'utf8');

    dataXml = dataXml.replace('__DRAWING_RELID__', dataRelId);
    if (dataXml.includes('__DRAWING_RELID__')) {
      fail('diagram-data1.xml placeholder __DRAWING_RELID__ was not fully substituted');
    }
    writeFileSync(join(diagramsDir, 'data1.xml'), dataXml, 'utf8');

    // 3. [Content_Types].xml -- add Override entries for the three new parts.
    const contentTypesPath = join(work, '[Content_Types].xml');
    let contentTypes = readFileSync(contentTypesPath, 'utf8');
    if (!contentTypes.includes('</Types>')) {
      fail('[Content_Types].xml has no </Types> closing tag');
    }
    const overrides =
      `<Override PartName="/word/diagrams/data1.xml" ContentType="${DIAGRAM_DATA_CONTENTTYPE}" />` +
      `<Override PartName="/word/diagrams/layout1.xml" ContentType="${DIAGRAM_LAYOUT_CONTENTTYPE}" />` +
      `<Override PartName="/word/diagrams/drawing1.xml" ContentType="${DIAGRAM_DRAWING_CONTENTTYPE}" />`;
    contentTypes = contentTypes.replace('</Types>', `${overrides}</Types>`);
    writeFileSync(contentTypesPath, contentTypes, 'utf8');

    // 4. word/_rels/document.xml.rels -- add internal-only relationships.
    const relsPath = join(work, 'word', '_rels', 'document.xml.rels');
    let relsXml = readFileSync(relsPath, 'utf8');
    if (!relsXml.includes('</Relationships>')) {
      fail('document.xml.rels has no </Relationships> closing tag');
    }
    const rIdData = nextFreeRelId(relsXml, 'rIdSmartArtData');
    const rIdLayout = nextFreeRelId(relsXml, 'rIdSmartArtLayout');
    const newRels =
      `<Relationship Id="${rIdData}" Type="${DIAGRAM_DATA_RELTYPE}" Target="diagrams/data1.xml" />` +
      `<Relationship Id="${rIdLayout}" Type="${DIAGRAM_LAYOUT_RELTYPE}" Target="diagrams/layout1.xml" />`;
    relsXml = relsXml.replace('</Relationships>', `${newRels}</Relationships>`);
    // Belt-and-braces: this script must never introduce an external
    // relationship (AGENTS.md rule #3). Both entries above are relative,
    // same-package Targets with no TargetMode attribute (defaults to
    // "Internal"), but assert it explicitly rather than trust a future
    // edit of this file.
    if (relsXml.includes('TargetMode="External"')) {
      fail('refusing to write a document.xml.rels containing an external relationship');
    }
    writeFileSync(relsPath, relsXml, 'utf8');

    // 5. word/document.xml -- declare xmlns:dgm on the root if missing, and
    //    insert a paragraph containing the <w:drawing> that references the
    //    diagram via the two relationship ids just created.
    const documentPath = join(work, 'word', 'document.xml');
    let documentXml = readFileSync(documentPath, 'utf8');

    const rootStart = documentXml.indexOf('<w:document');
    const rootTagEnd = documentXml.indexOf('>', rootStart);
    if (rootStart < 0 || rootTagEnd < 0) {
      fail('could not find <w:document> root element in word/document.xml');
    }
    const rootOpenTag = documentXml.slice(rootStart, rootTagEnd + 1);
    if (!rootOpenTag.includes('xmlns:dgm=')) {
      const patchedRootTag = rootOpenTag.replace(
        '>',
        ` xmlns:dgm="${DGM_NS}">`
      );
      documentXml =
        documentXml.slice(0, rootStart) +
        patchedRootTag +
        documentXml.slice(rootTagEnd + 1);
    }
    // Confirm every prefix the drawing fragment below uses (dgm, a, r, wp)
    // is now actually declared on the root -- the exact bug class from
    // TODO.md's mc:Ignorable incident, checked here for the prefixes this
    // script itself introduces.
    for (const prefix of ['dgm', 'a', 'r', 'wp']) {
      if (!documentXml.slice(rootStart, documentXml.indexOf('>', rootStart) + 1).includes(`xmlns:${prefix}=`)) {
        fail(`root <w:document> is missing xmlns:${prefix} -- would produce a Word-unreadable file`);
      }
    }

    const drawingParagraph = `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="5486400" cy="3200400"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="9001" name="SmartArt Spike Diagram"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:dm="${rIdData}" r:lo="${rIdLayout}" r:qs="" r:cs=""/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

    const bodyEndMarker = '</w:body>';
    const bodyEndIdx = documentXml.indexOf(bodyEndMarker);
    if (bodyEndIdx < 0) {
      fail('could not find </w:body> in word/document.xml');
    }
    // Insert right before </w:body> (after any existing sectPr would also
    // work, but sectPr must remain the last child of body per schema --
    // insert before it explicitly).
    const sectPrIdx = documentXml.lastIndexOf('<w:sectPr');
    const insertAt = sectPrIdx >= 0 && sectPrIdx < bodyEndIdx ? sectPrIdx : bodyEndIdx;
    documentXml =
      documentXml.slice(0, insertAt) + drawingParagraph + documentXml.slice(insertAt);

    writeFileSync(documentPath, documentXml, 'utf8');

    // 6. Re-zip. -X (no extra attributes), recurse into the directory so
    // paths are relative to `work` as required by the OPC container format.
    // [Content_Types].xml must be a real file at the archive root (it is).
    if (existsSync(outDocx)) rmSync(outDocx);
    execFileSync('zip', ['-X', '-r', '-q', outDocx, '.'], { cwd: work });

    console.log(`build-spike: wrote ${outDocx}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
