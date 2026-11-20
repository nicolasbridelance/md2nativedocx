/**
 * The in-memory view of a `.docx` that the post-processing steps work on, so the same steps run under
 * Node (on a file, through adm-zip: `docxFiles.mjs`) and in a browser (on bytes, through the page's own
 * ZIP reader: `packages/web`). This module has no Node import on purpose.
 *
 * @typedef {object} DocxPackage
 * @property {() => string[]} names Every entry name in the archive.
 * @property {(name: string) => string} readText The entry as UTF-8 text; throws when it does not exist.
 * @property {(name: string, content: string | Uint8Array) => void} write Adds or replaces an entry.
 *
 * The SmartArt and chart parts the core rendered out of band (`RenderResult.parts`), looked up by the id
 * written in a `SMARTART_PLACEHOLDER:` / `CHART_PLACEHOLDER:` marker. Both shapes are the core's own part
 * objects, so a caller holding `renderDiagram()` results can serve them directly.
 *
 * @typedef {object} SmartArtPartsData
 * @property {string} dataXml
 * @property {string} layoutXml
 * @property {string} colorsXml
 * @property {string} styleXml
 * @property {string} [drawingXml] The optional pre-rendered `dsp:drawing`.
 *
 * @typedef {object} ChartPartsData
 * @property {string} chartXml
 * @property {boolean} hasWorkbook
 * @property {{ sheetName: string, header: string[], rows: Array<[string, ...Array<number|null|undefined>]> }} [workbook]
 *
 * @typedef {object} DiagramPartsSource
 * @property {(id: string) => SmartArtPartsData | null} smartArt
 * @property {(id: string) => ChartPartsData | null} chart
 */

/** Thrown as before by the file-based steps: a part Pandoc must have written is missing. */
export function missingEntry(name) {
  return new Error(`md2nativedocx: missing ${name} in the .docx archive`);
}

/**
 * A {@link DiagramPartsSource} over parts held in memory, keyed by part id (the shape of
 * `RenderResult.parts` from `@md2nativedocx/core`).
 *
 * @param {Iterable<{ kind: 'smartart' | 'chart', id: string }>} parts
 * @returns {DiagramPartsSource}
 */
export function memoryPartsSource(parts) {
  const byId = new Map();
  for (const part of parts) byId.set(part.id, part);
  return {
    smartArt: (id) => {
      const part = byId.get(id);
      return part && part.kind === 'smartart' ? part : null;
    },
    chart: (id) => {
      const part = byId.get(id);
      return part && part.kind === 'chart' ? part : null;
    },
  };
}
