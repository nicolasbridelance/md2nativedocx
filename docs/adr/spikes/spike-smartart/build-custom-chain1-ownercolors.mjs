#!/usr/bin/env node
/**
 * Decisive test: OUR OWN custom layoutDef (layout-chain1.xml, proven to render
 * in real Word) + OUR OWN data with a hand-built presOf/presParOf mirror
 * (data-chain1-realstyle.xml) + the REAL Word colors1.xml/quickStyle1.xml
 * (borrowed from real-diagram1/, kept local/gitignored, not committed) --
 * to check whether supplying real colors/quickStyle (not the algorithm
 * itself) is what LibreOffice needs to draw actual shape geometry, given
 * that adding presOf/presParOf alone got text but no shapes (custom-chain1-
 * withpres.docx / custom-chain1-mainfill.docx).
 *
 * Standalone exploratory script, same conventions as the others in this
 * directory (AGENTS.md rules #3/#4/#5/#7 respected identically).
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

const RELTYPE = {
  data: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData',
  layout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout',
  quickStyle: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle',
  colors: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors',
};
const CONTENTTYPE = {
  data: 'application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml',
  layout: 'application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml',
  quickStyle: 'application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml',
  colors: 'application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml',
};
const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';

function fail(msg) {
  console.error(`build-custom-chain1-ownercolors: ${msg}`);
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
  const baseDocx = resolve(join(HERE, 'base.docx'));
  const outDocx = resolve(join(HERE, 'custom-chain1-ownercolors.docx'));
  if (!existsSync(baseDocx)) fail(`base docx not found at ${baseDocx}`);

  const dataXml = readFileSync(join(HERE, 'custom-algo', 'data-chain1-realstyle.xml'), 'utf8');
  const layoutXml = readFileSync(join(HERE, 'custom-algo', 'layout-chain1.xml'), 'utf8');
  const colorsPath = join(HERE, 'custom-algo', 'colors-chain1.xml');
  const quickStylePath = join(HERE, 'real-diagram1', 'quickStyle1.xml');
  if (!existsSync(colorsPath) || !existsSync(quickStylePath)) {
    fail(
      'colors-chain1.xml or real-diagram1/quickStyle1.xml not found locally (gitignored, research-only) -- ' +
        'this test needs them on disk even though they are never committed.'
    );
  }
  const colorsXml = readFileSync(colorsPath, 'utf8');
  const quickStyleXml = readFileSync(quickStylePath, 'utf8');

  const work = mkdtempSync(join(tmpdir(), 'custom-chain1-realstyle-'));
  try {
    execFileSync('unzip', ['-o', '-q', baseDocx, '-d', work]);
    const diagramsDir = join(work, 'word', 'diagrams');
    mkdirSync(diagramsDir, { recursive: true });
    writeFileSync(join(diagramsDir, 'data1.xml'), dataXml, 'utf8');
    writeFileSync(join(diagramsDir, 'layout1.xml'), layoutXml, 'utf8');
    writeFileSync(join(diagramsDir, 'colors1.xml'), colorsXml, 'utf8');
    writeFileSync(join(diagramsDir, 'quickStyle1.xml'), quickStyleXml, 'utf8');

    const contentTypesPath = join(work, '[Content_Types].xml');
    let contentTypes = readFileSync(contentTypesPath, 'utf8');
    const overrides = ['data', 'layout', 'quickStyle', 'colors']
      .map((k) => `<Override PartName="/word/diagrams/${k === 'quickStyle' ? 'quickStyle1' : k + '1'}.xml" ContentType="${CONTENTTYPE[k]}" />`)
      .join('');
    contentTypes = contentTypes.replace('</Types>', `${overrides}</Types>`);
    writeFileSync(contentTypesPath, contentTypes, 'utf8');

    const relsPath = join(work, 'word', '_rels', 'document.xml.rels');
    let relsXml = readFileSync(relsPath, 'utf8');
    const rId = {};
    for (const k of ['data', 'layout', 'quickStyle', 'colors']) {
      rId[k] = nextFreeRelId(relsXml, `rIdCustomStyle${k[0].toUpperCase()}${k.slice(1)}`);
      const target = k === 'quickStyle' ? 'diagrams/quickStyle1.xml' : `diagrams/${k}1.xml`;
      relsXml = relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${rId[k]}" Type="${RELTYPE[k]}" Target="${target}" /></Relationships>`
      );
    }
    if (relsXml.includes('TargetMode="External"')) fail('refusing external relationship');
    writeFileSync(relsPath, relsXml, 'utf8');

    const documentPath = join(work, 'word', 'document.xml');
    let documentXml = readFileSync(documentPath, 'utf8');
    const rootStart = documentXml.indexOf('<w:document');
    const rootTagEnd = documentXml.indexOf('>', rootStart);
    const rootOpenTag = documentXml.slice(rootStart, rootTagEnd + 1);
    if (!rootOpenTag.includes('xmlns:dgm=')) {
      documentXml =
        documentXml.slice(0, rootStart) +
        rootOpenTag.replace('>', ` xmlns:dgm="${DGM_NS}">`) +
        documentXml.slice(rootTagEnd + 1);
    }

    const drawingParagraph =
      `<w:p><w:r><w:drawing>` +
      `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="5486400" cy="3200400"/>` +
      `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
      `<wp:docPr id="9010" name="Custom Chain1 Realstyle"/>` +
      `<wp:cNvGraphicFramePr/>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">` +
      `<dgm:relIds xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
      `r:dm="${rId.data}" r:lo="${rId.layout}" r:qs="${rId.quickStyle}" r:cs="${rId.colors}"/>` +
      `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

    const bodyEndIdx = documentXml.indexOf('</w:body>');
    const sectPrIdx = documentXml.lastIndexOf('<w:sectPr');
    const insertAt = sectPrIdx >= 0 && sectPrIdx < bodyEndIdx ? sectPrIdx : bodyEndIdx;
    documentXml = documentXml.slice(0, insertAt) + drawingParagraph + documentXml.slice(insertAt);
    writeFileSync(documentPath, documentXml, 'utf8');

    if (existsSync(outDocx)) rmSync(outDocx);
    execFileSync('zip', ['-X', '-r', '-q', outDocx, '.'], { cwd: work });
    console.log(`build-custom-chain1-ownercolors: wrote ${outDocx}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
main();
