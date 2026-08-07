/**
 * Parses ```mermaid fenced code blocks out of raw Markdown text.
 *
 * Deliberately VS Code-API-free: takes and returns plain strings/numbers, not
 * `vscode.TextDocument`. That makes it testable with a plain `node:test` run,
 * no Extension Development Host required — mirrors packages/core's "pure
 * function, no I/O" convention for anything that can be one.
 */

export interface MermaidBlock {
  /** 0-based index among mermaid blocks in the document, in source order. */
  index: number;
  /** 0-based line of the opening ` ```mermaid ` fence. */
  fenceLine: number;
  /** 0-based line of the closing ` ``` ` fence. */
  closingFenceLine: number;
  /** Raw diagram source, fences excluded. */
  source: string;
  /** Nearest preceding ATX heading (`# ...`) text, or null if none. */
  precedingHeading: string | null;
}

const ANY_FENCE = /^(`{3,}|~{3,})/;
const OPEN_FENCE = /^(`{3,})\s*mermaid\s*$/i;
const HEADING = /^#{1,6}\s+(.+?)\s*#*$/;

export function parseMermaidBlocks(text: string): MermaidBlock[] {
  const lines = text.split(/\r\n|\r|\n/);
  const blocks: MermaidBlock[] = [];
  let currentHeading: string | null = null;
  let index = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    const openMatch = OPEN_FENCE.exec(trimmed);
    if (!openMatch) {
      // A non-mermaid fence (```js, ```bash, ~~~...) still opens a code
      // block that must be skipped wholesale — otherwise a shell/Python
      // comment line ("# some comment") inside it would be misread as a
      // Markdown heading and corrupt the title used for block-only export.
      const otherFence = ANY_FENCE.exec(trimmed);
      if (otherFence) {
        const marker = otherFence[1] ?? '```';
        const closeRe = new RegExp(`^${marker}\\s*$`);
        let j = i + 1;
        while (j < lines.length && !closeRe.test((lines[j] ?? '').trim())) j++;
        i = j; // if unterminated, j reaches EOF and the outer loop ends
        continue;
      }
      const headingMatch = HEADING.exec(line);
      if (headingMatch) {
        currentHeading = headingMatch[1] ?? null;
      }
      continue;
    }

    const fenceMarker = openMatch[1] ?? '```';
    const closeRe = new RegExp(`^${fenceMarker}\\s*$`);
    let closingFenceLine = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (closeRe.test((lines[j] ?? '').trim())) {
        closingFenceLine = j;
        break;
      }
    }
    // An unterminated fence (no closing ``` before EOF) is not a usable
    // block — nothing to export, and Pandoc itself would treat the rest of
    // the document as inside the code block. Skip it rather than guess.
    if (closingFenceLine === -1) break;

    blocks.push({
      index: index++,
      fenceLine: i,
      closingFenceLine,
      source: lines.slice(i + 1, closingFenceLine).join('\n'),
      precedingHeading: currentHeading,
    });
    i = closingFenceLine;
  }

  return blocks;
}

/** Find the block whose fence spans a given 0-based line, if any. */
export function blockAtLine(blocks: MermaidBlock[], line: number): MermaidBlock | null {
  return blocks.find((b) => line >= b.fenceLine && line <= b.closingFenceLine) ?? null;
}

/** Wrap a single diagram's source in a minimal, standalone Markdown document
 * (title + one mermaid block) — the same envelope shape used by the corpus
 * generator (scripts/generate-corpus.mjs), reused here for "export this
 * block only". */
export function wrapBlockAsDocument(block: MermaidBlock): string {
  const title = block.precedingHeading ?? 'Diagramme';
  return `# ${title}\n\n\`\`\`mermaid\n${block.source}\n\`\`\`\n`;
}
