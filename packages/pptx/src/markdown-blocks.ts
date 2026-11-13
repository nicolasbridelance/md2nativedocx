/**
 * Finds the ```mermaid blocks of a Markdown document and the heading that introduces each one.
 *
 * Deliberately tiny: slide structure is "one slide per Mermaid block, titled with the nearest
 * preceding heading". All other Markdown (prose, lists, tables) is out of scope for the pptx
 * export (docs/specs/cahier_des_charges_google_slides.md §5) and is ignored, not parsed.
 */

/** One Mermaid diagram and its slide title, if a heading precedes it. */
export interface MermaidBlock {
  /** Raw Mermaid text between the fences. */
  text: string;
  /** Nearest preceding Markdown heading (inline markup stripped), if any. */
  title?: string;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^ {0,3}#{1,6}[ \t]+(.*)$/;

/** Drop an optional closing `##` sequence (ATX headings) without a backtracking regex. */
function stripClosingHashes(text: string): string {
  const trimmed = text.trimEnd();
  const without = trimmed.replace(/#+$/, '');
  return without !== trimmed && /[ \t]$/.test(without) ? without : trimmed;
}

function stripInlineMarkup(text: string): string {
  return stripClosingHashes(text)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim();
}

/** Extract every Mermaid block (in order) with its slide title. */
export function extractMermaidBlocks(markdown: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  const lines = markdown.split(/\r?\n/);
  let title: string | undefined;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const open = FENCE_OPEN.exec(line);
    if (open) {
      const fence = open[1] ?? '```';
      const lang = (open[2] ?? '').toLowerCase();
      const body: string[] = [];
      i++;
      while (i < lines.length && !isClosingFence(lines[i] ?? '', fence)) {
        body.push(lines[i] ?? '');
        i++;
      }
      i++; // closing fence (or end of input for an unterminated block)
      if (lang === 'mermaid') {
        blocks.push(title === undefined ? { text: body.join('\n') } : { text: body.join('\n'), title });
      }
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const cleaned = stripInlineMarkup(heading[1] ?? '');
      title = cleaned === '' ? undefined : cleaned;
    }
    i++;
  }
  return blocks;
}

function isClosingFence(line: string, fence: string): boolean {
  const ch = fence.charAt(0);
  const trimmed = line.trim();
  return trimmed.length >= fence.length && trimmed === ch.repeat(trimmed.length);
}
