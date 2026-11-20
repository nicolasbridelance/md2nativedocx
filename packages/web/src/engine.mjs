/**
 * Markdown to `.docx` with `pandoc.wasm` and the core, without a server or a subprocess. No DOM here:
 * the page runs it in a Web Worker, the CI smoke test under Node.
 *
 * 1. Pandoc reads the Markdown into its JSON AST.
 * 2. Each diagram block is rendered by `renderDiagram()` and put back as a raw OOXML block.
 * 3. Pandoc writes the `.docx` from the AST, with the project's `reference.docx`.
 * 4. The CLI's own post-processing steps (namespaces, drawing ids, SmartArt and chart parts) run on the
 *    archive in memory (AGENTS.md rule 7: Pandoc writes the package, the steps stay on the allowlist).
 */

import { renderDiagram, DiagramTooLargeError, buildDiagramTooLargeNoteXml } from '@md2nativedocx/core';
// Not exported by @md2nativedocx/cli (its public entry point is convert(), which runs Pandoc as a
// process); the browser converter is built from the same monorepo, so it imports the modules directly.
import { postProcessPackage, injectSmartArtIntoPackage } from '../../cli/src/postprocess.mjs';
import { injectChartsIntoPackage } from '../../cli/src/chartParts.mjs';
import { memoryPartsSource } from '../../cli/src/docxPackage.mjs';
import { unclosedFenceWarnings } from '../../cli/src/unclosedFences.mjs';
import { countDiagramBlocks, replaceDiagramBlocks } from './diagram-blocks.mjs';
import { openZip, storedZip } from './zip.mjs';

/**
 * @typedef {object} ConvertOptions
 * @property {boolean} [smartArt] SmartArt where a diagram fits one (default `true`, as in the CLI).
 * @property {boolean} [nativeCharts] Word charts for pie, xychart and radar (default `true`).
 * @property {boolean} [toc] A table of contents after the title.
 *
 * @typedef {'read' | 'diagrams' | 'write' | 'finish'} ConvertStep
 * @typedef {(step: ConvertStep, detail?: { done?: number, total?: number }) => void} ProgressListener
 *
 * @typedef {object} ConvertResult
 * @property {Uint8Array} docx
 * @property {string[]} warnings For the person converting: diagrams drawn approximately, images left out…
 * @property {number} diagrams How many diagram blocks the document had.
 */

/** Pandoc's own messages worth showing: what it could not do, not what it loaded. */
function pandocWarnings(warnings) {
  return warnings
    .filter((w) => w.verbosity === 'WARNING' || w.verbosity === 'ERROR')
    .map((w) => (w.type === 'CouldNotFetchResource' ? `image not included (this page reads no file or URL): ${w.resource ?? w.pretty ?? ''}` : w.pretty ?? String(w.type)));
}

/**
 * @param {{ convert: (options: Record<string, unknown>, stdin: string, files?: Record<string, Uint8Array | string>) => { stdout: string, stderr: string, warnings: any[], output?: Uint8Array } }} pandoc
 *   A started `pandoc.wasm` (pandoc-wasm.mjs).
 * @param {Uint8Array} referenceDocx The bundled `reference.docx` (packages/cli/assets).
 */
export function createConverter(pandoc, referenceDocx) {
  /**
   * @param {string} markdown
   * @param {ConvertOptions} [options]
   * @param {ProgressListener} [onProgress]
   * @returns {Promise<ConvertResult>}
   */
  return async function convertMarkdown(markdown, options = {}, onProgress = () => {}) {
    const warnings = [...unclosedFenceWarnings(markdown)];

    onProgress('read');
    const read = pandoc.convert({ from: 'markdown', to: 'json' }, markdown);
    if (!read.stdout) throw new Error(read.stderr.trim() || 'Pandoc could not read the Markdown');
    const ast = JSON.parse(read.stdout);
    warnings.push(...pandocWarnings(read.warnings));

    const total = countDiagramBlocks(ast);
    onProgress('diagrams', { done: 0, total });
    /** @type {Array<{ kind: 'smartart' | 'chart', id: string }>} */
    const parts = [];
    const renderOptions = {
      smartArt: options.smartArt !== false,
      nativeCharts: options.nativeCharts !== false,
      newPartId: () => crypto.randomUUID(),
    };
    let done = 0;
    const found = replaceDiagramBlocks(ast, (source, block) => {
      let fragment;
      try {
        const result = renderDiagram(source, renderOptions);
        warnings.push(...result.metadata.warnings);
        parts.push(...result.parts);
        fragment = result.fragment;
      } catch (err) {
        if (err instanceof DiagramTooLargeError) {
          // Deliberate fallback, as in the CLI: a visible note, the rest of the document converts.
          warnings.push(err.message);
          fragment = buildDiagramTooLargeNoteXml(err);
        } else {
          // As in the CLI, a diagram the core cannot read stays as its source code, with a warning.
          warnings.push(`diagram left as code: ${err instanceof Error ? err.message : String(err)}`);
          return block;
        }
      } finally {
        done += 1;
        onProgress('diagrams', { done, total });
      }
      return { t: 'RawBlock', c: ['openxml', fragment] };
    });

    onProgress('write');
    const pandocOptions = { from: 'json', to: 'docx', 'output-file': 'output.docx', 'reference-doc': 'reference.docx' };
    if (options.toc) Object.assign(pandocOptions, { toc: true, 'toc-depth': 3 });
    const written = pandoc.convert(pandocOptions, JSON.stringify(ast), { 'reference.docx': referenceDocx });
    if (!written.output || written.output.length === 0) throw new Error(written.stderr.trim() || 'Pandoc wrote no document');
    warnings.push(...pandocWarnings(written.warnings));

    onProgress('finish');
    const archive = await openZip(written.output);
    postProcessPackage(archive.pkg, { toc: Boolean(options.toc), emojiFont: true });
    const source = memoryPartsSource(parts);
    injectSmartArtIntoPackage(archive.pkg, source);
    injectChartsIntoPackage(archive.pkg, source, storedZip);
    return { docx: await archive.toBytes(), warnings, diagrams: found };
  };
}
