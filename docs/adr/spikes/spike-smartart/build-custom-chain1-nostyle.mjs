#!/usr/bin/env node
/**
 * Same as build-custom-chain1-ownercolors.mjs but WITHOUT quickStyle at all
 * (r:qs="") -- isolates whether colorsDef alone (self-authored) is
 * sufficient, or whether quickStyle is also load-bearing for LibreOffice's
 * shape rendering.
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
  colors: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors',
};
const CONTENTTYPE = {
  data: 'application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml',
  layout: 'application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml',
  colors: 'application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml',
};
const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';

function fail(msg) {
  console.error(`build-custom-chain1-nostyle: ${msg}`);
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
  const outDocx = resolve(join(HERE, 'custom-chain1-nostyle.docx'));
  const dataXml = readFileSync(join(HERE, 'custom-algo', 'data-chain1-realstyle.xml'), 'utf8');
  const layoutXml = readFileSync(join(HERE, 'custom-algo', 'layout-chain1.xml'), 'utf8');
  const colorsXml = readFileSync(join(HERE, 'custom-algo', 'colors-chain1.xml'), 'utf8');

  const work = mkdtempSync(join(tmpdir(), 'custom-chain1-nostyle-'));
  try {
    execFileSync('unzip', ['-o', '-q', baseDocx, '-d', work]);
    const diagramsDir = join(work, 'word', 'diagrams');
    mkdirSync(diagramsDir, { recursive: true });
    writeFileSync(join(diagramsDir, 'data1.xml'), dataXml, 'utf8');
    writeFileSync(join(diagramsDir, 'layout1.xml'), layoutXml, 'utf8');
    writeFileSync(join(diagramsDir, 'colors1.xml'), colorsXml, 'utf8');

    const contentTypesPath = join(work, '[Content_Types].xml');
    let contentTypes = readFileSync(contentTypesPath, 'utf8');
    const overrides = ['data', 'layout', 'colors']
      .map((k) => `<Override PartName="/word/diagrams/${k}1.xml" ContentType="${CONTENTTYPE[k]}" />`)
      .join('');
    contentTypes = contentTypes.replace('</Types>', `${overrides}</Types>`);
    writeFileSync(contentTypesPath, contentTypes, 'utf8');

    const relsPath = join(work, 'word', '_rels', 'document.xml.rels');
    let relsXml = readFileSync(relsPath, 'utf8');
    const rId = {};
    for (const k of ['data', 'layout', 'colors']) {
      rId[k] = nextFreeRelId(relsXml, `rIdNoStyle${k[0].toUpperCase()}${k.slice(1)}`);
      relsXml = relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${rId[k]}" Type="${RELTYPE[k]}" Target="diagrams/${k}1.xml" /></Relationships>`
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
      `<wp:docPr id="9011" name="Custom Chain1 No QuickStyle"/>` +
      `<wp:cNvGraphicFramePr/>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">` +
      `<dgm:relIds xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
      `r:dm="${rId.data}" r:lo="${rId.layout}" r:qs="" r:cs="${rId.colors}"/>` +
      `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

    const bodyEndIdx = documentXml.indexOf('</w:body>');
    const sectPrIdx = documentXml.lastIndexOf('<w:sectPr');
    const insertAt = sectPrIdx >= 0 && sectPrIdx < bodyEndIdx ? sectPrIdx : bodyEndIdx;
    documentXml = documentXml.slice(0, insertAt) + drawingParagraph + documentXml.slice(insertAt);
    writeFileSync(documentPath, documentXml, 'utf8');

    if (existsSync(outDocx)) rmSync(outDocx);
    execFileSync('zip', ['-X', '-r', '-q', outDocx, '.'], { cwd: work });
    console.log(`build-custom-chain1-nostyle: wrote ${outDocx}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
main();
