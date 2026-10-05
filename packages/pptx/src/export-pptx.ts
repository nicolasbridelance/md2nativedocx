/**
 * Markdown -> `.pptx` orchestration: one slide per ```mermaid block.
 *
 * Each block is run through the same core bridge the Pandoc filter uses
 * (`@md2nativedocx/pandoc-filter`'s `md2nativedocx-core.mjs`), so every diagram type core supports
 * is supported here with no per-type code. The bridge is invoked with `execFile` and an argument
 * array, never a shell string (AGENTS.md rule #4); diagram text travels through a temp file.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { type DiagramArea, buildPptx, diagramAreaFor } from './build-pptx.js';
import { PptxConversionError } from './errors.js';
import { extractMermaidBlocks } from './markdown-blocks.js';

const execFileAsync = promisify(execFile);

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

/** Default provider: runs the core bridge in a child process, sizing the drawing to the slide area. */
export const coreBridgeProvider: FragmentProvider = async (mermaidText, area) => {
  const bridgePath = fileURLToPath(import.meta.resolve('@md2nativedocx/pandoc-filter/bin/md2nativedocx-core.mjs'));
  const dir = await mkdtemp(join(tmpdir(), 'md2nativedocx-pptx-'));
  try {
    const file = join(dir, 'diagram.mmd');
    await writeFile(file, mermaidText, 'utf8');
    const env = { ...process.env };
    delete env['MD2NATIVEDOCX_SMARTART_DIR']; // SmartArt parts exist only in .docx
    env['MD2NATIVEDOCX_MAX_DRAWING_CX'] = String(area.cx);
    env['MD2NATIVEDOCX_MAX_DRAWING_CY'] = String(area.cy);
    const { stdout, stderr } = await execFileAsync(process.execPath, [bridgePath, file], {
      env,
      maxBuffer: 64 * 1024 * 1024,
    });
    const warnings = stderr
      .split('\n')
      .filter((l) => l.startsWith('md2nativedocx: '))
      .map((l) => l.slice('md2nativedocx: '.length));
    return { fragmentXml: stdout, warnings };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new PptxConversionError(`core bridge failed: ${detail}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
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
