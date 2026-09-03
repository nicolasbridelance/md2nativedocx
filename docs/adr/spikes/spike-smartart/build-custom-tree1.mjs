#!/usr/bin/env node
/**
 * Spike 1 v3 -- the decisive test. v2 proved the zip-surgery mechanism
 * works when EVERY diagram part (data/layout/colors/quickStyle/drawing) is
 * copied verbatim from a real Word document. That alone doesn't prove a
 * future generator is viable: data1.xml in that real document also
 * contains ~40 auto-generated "pres" (presentation) points mirroring the
 * layout algorithm's internal shape tree, which nothing in
 * FUTURE_mmd2smartart_SPEC.md anticipated hand-authoring, and drawing1.xml
 * caches the exact rendered shapes for that ONE specific tree shape.
 * Neither generalizes to "generate a data1.xml for an arbitrary Mermaid
 * tree" if the render only ever replays those caches.
 *
 * v3 tests the actual MVP target from FUTURE_mmd2smartart_SPEC.md §3: only
 * data1.xml + layout1.xml (no colors/quickStyle/drawing, r:qs=""/r:cs=""
 * per that MVP decision), using the AUTHENTIC layout1.xml extracted from
 * real Word (unlike v1, which failed with a hand-approximated one) paired
 * with a HAND-AUTHORED data1.xml (hand-data-v3.xml, next to this script)
 * that:
 *   - has a DIFFERENT topology than the real extract (1 root + 3 children,
 *     vs. the real one's 3-level 2/2/1 branching),
 *   - has different text (including one long label, to see wrapping),
 *   - uses plain integer modelIds instead of Word's GUIDs (data1.xml's
 *     modelId is just an XML ID -- nothing in the schema requires GUIDs;
 *     this also tests that assumption),
 *   - contains ZERO "pres" points or presOf/presParOf connections -- only
 *     doc/plain/parTrans/sibTrans points and plain (default type = parOf)
 *     cxn entries, the part of the real data1.xml that looks generalizable
 *     to arbitrary trees.
 *
 * If this renders as a correct 1-root/3-children tree, it proves the
 * layout algorithm itself resolves the presentation tree from the logical
 * data alone at render time -- meaning a future generator only needs to
 * emit doc/plain/parTrans/sibTrans/cxn nodes for an arbitrary Mermaid tree
 * and reuse the ONE fixed, authentic layout1.xml verbatim forever. That
 * would fully de-risk FUTURE_mmd2smartart_SPEC.md's generator step (§7
 * step 4) for the tree/chain case.
 *
 * If it renders blank or wrong, the "pres" points are load-bearing and a
 * generator would need to compute them too -- a much bigger, likely
 * layout-specific undertaking, worth flagging back to the maintainer
 * before committing to the classifier+generator investment.
 *
 * Standalone exploratory script, same conventions as v1/v2 (AGENTS.md
 * rules #3/#4/#5/#7 all apply and are respected identically).
 *
 * Usage: node build-custom-tree1.mjs [base.docx] [custom-tree1.docx]
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
const DIAGRAM_DATA_CONTENTTYPE =
  'application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml';
const DIAGRAM_LAYOUT_CONTENTTYPE =
  'application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml';
const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';

function fail(msg) {
  console.error(`build-custom-tree1: ${msg}`);
  process.exit(1);
}

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
  const outDocxArg = process.argv[3] ?? join(HERE, 'custom-tree1.docx');
  const baseDocx = resolve(baseDocxArg);
  const outDocx = resolve(outDocxArg);

  if (!existsSync(baseDocx)) fail(`base docx not found at ${baseDocx}`);

  const dataXml = readFileSync(join(HERE, 'custom-algo', 'data-tree1.xml'), 'utf8');
  const layoutXml = readFileSync(join(HERE, 'custom-algo', 'layout-tree1.xml'), 'utf8');

  const work = mkdtempSync(join(tmpdir(), 'smartart-spike-v3-'));
  try {
    execFileSync('unzip', ['-o', '-q', baseDocx, '-d', work]);

    const diagramsDir = join(work, 'word', 'diagrams');
    mkdirSync(diagramsDir, { recursive: true });
    writeFileSync(join(diagramsDir, 'data1.xml'), dataXml, 'utf8');
    writeFileSync(join(diagramsDir, 'layout1.xml'), layoutXml, 'utf8');
    // Deliberately no colors1.xml / quickStyle1.xml / drawing1.xml -- this
    // is the actual §3 MVP target (data + layout only).

    const contentTypesPath = join(work, '[Content_Types].xml');
    let contentTypes = readFileSync(contentTypesPath, 'utf8');
    if (!contentTypes.includes('</Types>')) fail('[Content_Types].xml has no </Types>');
    contentTypes = contentTypes.replace(
      '</Types>',
      `<Override PartName="/word/diagrams/data1.xml" ContentType="${DIAGRAM_DATA_CONTENTTYPE}" />` +
        `<Override PartName="/word/diagrams/layout1.xml" ContentType="${DIAGRAM_LAYOUT_CONTENTTYPE}" />` +
        '</Types>'
    );
    writeFileSync(contentTypesPath, contentTypes, 'utf8');

    const relsPath = join(work, 'word', '_rels', 'document.xml.rels');
    let relsXml = readFileSync(relsPath, 'utf8');
    if (!relsXml.includes('</Relationships>')) fail('document.xml.rels has no </Relationships>');
    const rIdData = nextFreeRelId(relsXml, 'rIdSmartArtDataV3_');
    const rIdLayout = nextFreeRelId(relsXml, 'rIdSmartArtLayoutV3_');
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="${rIdData}" Type="${DIAGRAM_DATA_RELTYPE}" Target="diagrams/data1.xml" />` +
        `<Relationship Id="${rIdLayout}" Type="${DIAGRAM_LAYOUT_RELTYPE}" Target="diagrams/layout1.xml" />` +
        '</Relationships>'
    );
    if (relsXml.includes('TargetMode="External"')) {
      fail('refusing to write a document.xml.rels containing an external relationship');
    }
    writeFileSync(relsPath, relsXml, 'utf8');

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
        fail(`root <w:document> is missing xmlns:${prefix}`);
      }
    }

    const drawingParagraph =
      `<w:p><w:r><w:drawing>` +
      `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="5486400" cy="3200400"/>` +
      `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
      `<wp:docPr id="9003" name="SmartArt Spike Diagram v3"/>` +
      `<wp:cNvGraphicFramePr/>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">` +
      `<dgm:relIds xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
      `r:dm="${rIdData}" r:lo="${rIdLayout}" r:qs="" r:cs=""/>` +
      `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

    const bodyEndIdx = documentXml.indexOf('</w:body>');
    if (bodyEndIdx < 0) fail('could not find </w:body>');
    const sectPrIdx = documentXml.lastIndexOf('<w:sectPr');
    const insertAt = sectPrIdx >= 0 && sectPrIdx < bodyEndIdx ? sectPrIdx : bodyEndIdx;
    documentXml = documentXml.slice(0, insertAt) + drawingParagraph + documentXml.slice(insertAt);
    writeFileSync(documentPath, documentXml, 'utf8');

    if (existsSync(outDocx)) rmSync(outDocx);
    execFileSync('zip', ['-X', '-r', '-q', outDocx, '.'], { cwd: work });
    console.log(`build-custom-tree1: wrote ${outDocx}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
