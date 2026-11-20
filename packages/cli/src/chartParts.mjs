/**
 * Native-chart hand-off (ADR 0011): completes the `c:chart` wiring for every diagram the core bridge
 * dispatched to a native Word chart, and builds the embedded `.xlsx` workbook behind it.
 *
 * Same discipline as `postprocess.mjs`'s `injectSmartArtIntoPackage`, and within AGENTS.md rule 7's
 * allowlist (new parts under `word/charts/` and `word/embeddings/`): it only **adds** parts, relationships and content types, never rewrites a part
 * Pandoc wrote beyond swapping its own placeholder, and is a no-op when the document has no native
 * chart. Every relationship it adds is internal (no `TargetMode`, rule 3). The workbook is a small zip
 * written by the caller's zip writer (`adm-zip` under Node, docxFiles.mjs; the page's own in the
 * browser), so no new dependency (rule 6). No Node import here: the browser converter uses this module.
 */

import { UUID_SOURCE, isPartId } from './placeholderIds.mjs';

/** @typedef {import('./docxPackage.mjs').DocxPackage} DocxPackage */
/** @typedef {import('./docxPackage.mjs').DiagramPartsSource} DiagramPartsSource */
/** @typedef {(entries: Array<[string, string]>) => Uint8Array} ZipWriter Builds a zip archive from (name, UTF-8 text) entries. */

const PLACEHOLDER_RE = new RegExp(`CHART_PLACEHOLDER:(${UUID_SOURCE})`, 'g');
const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CHART_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * Strict XML escaping of user-controlled text (AGENTS.md rule #2). Characters XML 1.0 forbids
 * outright (C0 controls but TAB/LF/CR, U+FFFE/U+FFFF, lone surrogates) become U+FFFD, as in core's
 * `escapeXml`: no entity can express them.
 */
function esc(text) {
  return String(text)
    // eslint-disable-next-line no-control-regex -- matching control characters is the whole point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Column letters for a 0-based index: A..Z, AA..AZ, … */
function col(index) {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function textCell(ref, text) {
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
}

/**
 * Build the embedded workbook: one sheet, a header row, then one row per category (label, then one
 * value per series; an `undefined`/`null` value is an empty cell).
 *
 * @param {{ sheetName: string, header: string[], rows: Array<[string, ...Array<number|null|undefined>]> }} data
 * @param {ZipWriter} zipWriter
 * @returns {Uint8Array} the `.xlsx` file
 */
export function buildWorkbookXlsx(data, zipWriter) {
  const headerRow = `<row r="1">${data.header.map((h, c) => textCell(`${col(c)}1`, h)).join('')}</row>`;
  const dataRows = data.rows.map((row, i) => {
    const r = i + 2;
    const [label, ...values] = row;
    const cells = values
      .map((value, c) => {
        if (value === undefined || value === null) return '';
        const n = Number(value);
        if (!Number.isFinite(n)) throw new Error('md2nativedocx: chart value is not a finite number');
        return `<c r="${col(c + 1)}${r}"><v>${n}</v></c>`;
      })
      .join('');
    return `<row r="${r}">${textCell(`A${r}`, label)}${cells}</row>`;
  });
  const rows = [headerRow, ...dataRows].join('');
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  /** @type {Array<[string, string]>} */
  const entries = [];
  const add = (name, xml) => entries.push([name, XML_DECL + xml]);
  add(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>',
  );
  add(
    '_rels/.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_BASE}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  add(
    'xl/workbook.xml',
    `<workbook xmlns="${main}" xmlns:r="${REL_BASE}"><sheets><sheet name="${esc(data.sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  add(
    'xl/_rels/workbook.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="${REL_BASE}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${REL_BASE}/styles" Target="styles.xml"/>` +
      '</Relationships>',
  );
  add('xl/worksheets/sheet1.xml', `<worksheet xmlns="${main}"><sheetData>${rows}</sheetData></worksheet>`);
  add(
    'xl/styles.xml',
    `<styleSheet xmlns="${main}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>',
  );
  return zipWriter(entries);
}

function nextChartNumber(pkg) {
  let max = 0;
  for (const name of pkg.names()) {
    const m = /^word\/charts\/chart(\d+)\.xml$/.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/**
 * Complete the native-chart wiring for every placeholder in the package's `word/document.xml`.
 * Must run after `postProcessPackage` (it reads the namespace-fixed, id-renumbered document).
 *
 * @param {DocxPackage} pkg
 * @param {DiagramPartsSource | null} parts where each placeholder id's `chartXml`, `hasWorkbook` and `workbook` are found
 * @param {ZipWriter} zipWriter builds the embedded workbook
 * @param {string} [where] named in the error when a chart's parts are missing
 * @returns {boolean} whether anything was written
 */
export function injectChartsIntoPackage(pkg, parts, zipWriter, where = 'the rendered parts') {
  let documentXml = pkg.readText('word/document.xml');
  const ids = [...new Set([...documentXml.matchAll(PLACEHOLDER_RE)].map((m) => m[1]))];
  if (ids.length === 0) return false;
  if (!parts) throw new Error('md2nativedocx: document.xml references native charts but no chartDir was given');

  let contentTypes = pkg.readText('[Content_Types].xml');
  let relsXml = pkg.readText('word/_rels/document.xml.rels');
  let n = nextChartNumber(pkg);
  const newParts = [];

  for (const id of ids) {
    // The id comes from document.xml, which holds author text too: only a generated id is looked up.
    const source = isPartId(id) ? parts.chart(id) : null;
    if (!source) throw new Error(`md2nativedocx: no chart parts found for "${id}" in ${where}`);
    const chartXml = source.chartXml;
    const chartPath = `word/charts/chart${n}.xml`;
    const relId = `rIdChart${n}`;
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="${relId}" Type="${REL_BASE}/chart" Target="charts/chart${n}.xml"/></Relationships>`,
    );
    contentTypes = contentTypes.replace('</Types>', `<Override PartName="/${chartPath}" ContentType="${CHART_CONTENT_TYPE}"/></Types>`);
    newParts.push([chartPath, chartXml]);

    if (source.hasWorkbook) {
      if (!source.workbook) throw new Error(`md2nativedocx: chart "${id}" has no workbook data`);
      const workbookPath = `word/embeddings/Microsoft_Excel_Sheet${n}.xlsx`;
      newParts.push([workbookPath, buildWorkbookXlsx(source.workbook, zipWriter)]);
      newParts.push([
        `word/charts/_rels/chart${n}.xml.rels`,
        XML_DECL +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          `<Relationship Id="rId1" Type="${REL_BASE}/package" Target="../embeddings/Microsoft_Excel_Sheet${n}.xlsx"/>` +
          '</Relationships>',
      ]);
      if (!/Extension="xlsx"/i.test(contentTypes)) {
        contentTypes = contentTypes.replace('</Types>', `<Default Extension="xlsx" ContentType="${XLSX_CONTENT_TYPE}"/></Types>`);
      }
    }
    documentXml = documentXml.split(`CHART_PLACEHOLDER:${id}`).join(relId);
    n += 1;
  }

  pkg.write('word/document.xml', documentXml);
  pkg.write('[Content_Types].xml', contentTypes);
  pkg.write('word/_rels/document.xml.rels', relsXml);
  for (const [path, content] of newParts) pkg.write(path, content);
  return true;
}
