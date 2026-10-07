/**
 * Markdown -> `.pptx` orchestration: one slide per ```mermaid block.
 *
 * Each block goes through core's `renderDiagram()`, the same entry point the Pandoc filter's bridge
 * calls, so every diagram type core supports is supported here with no per-type code. In process: no
 * subprocess, no temporary file (ADR 0012, spec 01 §6).
 */

import { renderDiagram } from '@md2nativedocx/core';
import { type DiagramArea, buildPptx, diagramAreaFor } from './build-pptx.js';
import { PptxConversionError } from './errors.js';
import { extractMermaidBlocks } from './markdown-blocks.js';

/** Turns Mermaid text into a core `<w:p>` fragment (and any warnings). Injectable for tests. */
export type FragmentProvider = (
  mermaidText: string,
  area: DiagramArea,
) => Promise<{ fragmentXml: string; warnings: string[] }>;

/** Options for {@link exportPptx}. */
export interface ExportPptxOptions {
  /** Replace the default core-bridge subprocess (tests, embedding). */
  fragmentProvider?: FragmentProvider;
  /** Document title stored in the file's properties. */
  title?: string;
  /** Fixed timestamp for reproducible output. */
  now?: Date;
  /** Show each diagram's Mermaid source in a panel beside it (off by default: decks are for audiences). */
  showSource?: boolean;
}

/** Result of {@link exportPptx}. */
export interface ExportPptxResult {
  /** The complete `.pptx` file. */
  buffer: Buffer;
  /** Number of slides produced. */
  slideCount: number;
  /** Warnings from the bridge and the converter (the caller decides how to surface them). */
  warnings: string[];
}

/**
 * Default provider: core's `renderDiagram()`, shapes only (SmartArt and chart parts exist only in a
 * `.docx` package), with the drawing sized to the slide area. The name predates the in-process call,
 * when this ran the core bridge as a child process.
 */
export const coreBridgeProvider: FragmentProvider = (mermaidText, area) => {
  try {
    const result = renderDiagram(mermaidText, {
      smartArt: false,
      nativeCharts: false,
      // Whole EMU, as the bridge's environment variables carried them.
      ...(Math.trunc(area.cx) > 0 ? { maxDrawingCx: Math.trunc(area.cx) } : {}),
      ...(Math.trunc(area.cy) > 0 ? { maxDrawingCy: Math.trunc(area.cy) } : {}),
    });
    // Same wording as the bridge's stderr lines, which this list used to be read from.
    return Promise.resolve({ fragmentXml: result.fragment, warnings: result.metadata.warnings.map((w) => `warning: ${w}`) });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return Promise.reject(new PptxConversionError(`diagram rendering failed: ${detail}`));
  }
};

/**
 * Convert Markdown into a `.pptx` with one slide per Mermaid block.
 *
 * Text outside Mermaid blocks is ignored (spec Google Slides §5). A slide is titled with the
 * nearest preceding Markdown heading.
 *
 * @throws {PptxConversionError} when the document has no Mermaid block, or a block cannot be rendered.
 */
export async function exportPptx(markdown: string, options: ExportPptxOptions = {}): Promise<ExportPptxResult> {
  const blocks = extractMermaidBlocks(markdown);
  if (blocks.length === 0) {
    throw new PptxConversionError('no ```mermaid block found: nothing to put on a slide');
  }
  const provider = options.fragmentProvider ?? coreBridgeProvider;
  const warnings: string[] = [];
  const slides = [];
  for (const [index, block] of blocks.entries()) {
    const area = diagramAreaFor(block.title !== undefined, false, options.showSource === true);
    const { fragmentXml, warnings: blockWarnings } = await provider(block.text, area);
    warnings.push(...blockWarnings.map((w) => `slide ${index + 1}: ${w}`));
    slides.push({
      fragmentXml,
      ...(block.title !== undefined ? { title: block.title } : {}),
      ...(options.showSource === true ? { source: block.text } : {}),
    });
  }
  const built = buildPptx(slides, {
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  });
  warnings.push(...built.warnings);
  return { buffer: built.buffer, slideCount: slides.length, warnings };
}
