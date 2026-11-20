/**
 * Node entry points of the post-processing: the same steps as `postprocess.mjs` and `chartParts.mjs`, on a
 * `.docx` file on disk (adm-zip) and with the parts the Pandoc bridge wrote into directories
 * (`MD2NATIVEDOCX_SMARTART_DIR`, `MD2NATIVEDOCX_CHART_DIR`, see `md2nativedocx-core.mjs`). The browser
 * converter (`packages/web`) runs the same steps on bytes, with the parts held in memory.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { AdmZip, readZipEntry, setZipEntry } from './zipUtils.mjs';
import { isPartId } from './placeholderIds.mjs';
import { postProcessPackage, injectSmartArtIntoPackage } from './postprocess.mjs';
import { injectChartsIntoPackage } from './chartParts.mjs';

/** @typedef {import('./docxPackage.mjs').DocxPackage} DocxPackage */
/** @typedef {import('./docxPackage.mjs').DiagramPartsSource} DiagramPartsSource */

/**
 * A {@link DocxPackage} over an open adm-zip archive (changes stay in memory until `zip.writeZip()`).
 * @param {AdmZip} zip
 * @returns {DocxPackage}
 */
export function admZipPackage(zip) {
  return {
    names: () => zip.getEntries().map((entry) => entry.entryName),
    readText: (name) => readZipEntry(zip, name),
    write: (name, content) => setZipEntry(zip, name, typeof content === 'string' ? content : Buffer.from(content)),
  };
}

/** The zip writer `buildWorkbookXlsx` needs, with adm-zip. @param {Array<[string, string]>} entries */
export function admZipWriter(entries) {
  const zip = new AdmZip();
  for (const [name, text] of entries) zip.addFile(name, Buffer.from(text, 'utf8'));
  return zip.toBuffer();
}

/**
 * `dir/id` resolved, or `null` when the id is not a generated part id or the result escapes `dir`.
 * @param {string} dir The parts directory.
 * @param {string} id An id read from `document.xml`.
 * @returns {string | null}
 */
export function resolvePartDir(dir, id) {
  if (!isPartId(id)) return null;
  const root = resolve(dir);
  const target = resolve(root, id);
  return target.startsWith(root + sep) ? target : null;
}

/** The text of `dir/name`, or `undefined` when the file does not exist. */
function readOptional(dir, name) {
  const file = join(dir, name);
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

/**
 * A {@link DiagramPartsSource} over the directories the bridge writes: `<dir>/<id>/data.xml`,
 * `layout.xml`, `colors.xml`, `quickStyle.xml`, optional `drawing.xml` for SmartArt; `chart.xml`,
 * `meta.json`, `data.json` for charts.
 *
 * @param {{ smartArtDir?: string | null, chartDir?: string | null }} dirs
 * @returns {DiagramPartsSource}
 */
export function directoryPartsSource({ smartArtDir = null, chartDir = null }) {
  const partDir = (root, id) => {
    if (!root) return null;
    const dir = resolvePartDir(root, id);
    return dir !== null && existsSync(dir) ? dir : null;
  };
  return {
    smartArt(id) {
      const dir = partDir(smartArtDir, id);
      if (dir === null) return null;
      return {
        dataXml: readFileSync(join(dir, 'data.xml'), 'utf8'),
        layoutXml: readFileSync(join(dir, 'layout.xml'), 'utf8'),
        colorsXml: readFileSync(join(dir, 'colors.xml'), 'utf8'),
        styleXml: readFileSync(join(dir, 'quickStyle.xml'), 'utf8'),
        drawingXml: readOptional(dir, 'drawing.xml'),
      };
    },
    chart(id) {
      const dir = partDir(chartDir, id);
      if (dir === null) return null;
      const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
      const data = readOptional(dir, 'data.json');
      return {
        chartXml: readFileSync(join(dir, 'chart.xml'), 'utf8'),
        hasWorkbook: Boolean(meta.hasWorkbook),
        workbook: data === undefined ? undefined : JSON.parse(data),
      };
    },
  };
}

/** Open `docxPath`, run `step` on it, and write the archive back only when `step` changed something. */
function patchFile(docxPath, step) {
  const archive = resolve(docxPath);
  const zip = new AdmZip(archive);
  if (step(admZipPackage(zip))) zip.writeZip(archive);
}

/**
 * {@link postProcessPackage} on a `.docx` file, in place.
 * @param {string} docxPath
 * @param {{ toc?: boolean, emojiFont?: boolean }} [options]
 */
export function postProcessDocx(docxPath, options = {}) {
  patchFile(docxPath, (pkg) => postProcessPackage(pkg, options));
}

/**
 * {@link injectSmartArtIntoPackage} on a `.docx` file, in place, with the parts the bridge wrote under
 * `smartArtDir`. A no-op (the archive is not rewritten) when the document has no SmartArt.
 * @param {string} docxPath
 * @param {string | null | undefined} smartArtDir
 */
export function injectSmartArtParts(docxPath, smartArtDir) {
  const parts = smartArtDir ? directoryPartsSource({ smartArtDir }) : null;
  patchFile(docxPath, (pkg) => injectSmartArtIntoPackage(pkg, parts, smartArtDir ?? undefined));
}

/**
 * {@link injectChartsIntoPackage} on a `.docx` file, in place, with the parts the bridge wrote under
 * `chartDir`. A no-op when the document has no native chart.
 * @param {string} docxPath
 * @param {string | null | undefined} chartDir
 */
export function injectChartParts(docxPath, chartDir) {
  const parts = chartDir ? directoryPartsSource({ chartDir }) : null;
  patchFile(docxPath, (pkg) => injectChartsIntoPackage(pkg, parts, admZipWriter, chartDir ?? undefined));
}
