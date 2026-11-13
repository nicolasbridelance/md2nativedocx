/**
 * Parser for Mermaid `ishikawa-beta`. The first line after the header is the
 * effect; every later line is a cause whose depth comes from its indentation
 * (tab = 4 columns). Mermaid's own example indents the effect and the
 * categories equally, so any line at or left of the first category's column is
 * a category. Depth is
 * capped at 8 levels and the diagram at 500 lines (hostile input);
 * frontmatter is skipped with one warning.
 */

import type { IshikawaCategory, IshikawaDiagram } from './types.js';

export interface IshikawaParseResult {
  ast: IshikawaDiagram;
  warnings: string[];
}

const MAX_DEPTH = 8;
const MAX_LINES = 500;

export function parseIshikawa(text: string): IshikawaParseResult {
  const warnings: string[] = [];
  const categories: IshikawaCategory[] = [];
  let effect = '';
  let haveEffect = false;
  /** Indent columns of the open ancestors below the category level (category itself first). */
  let stack: number[] = [];
  let inFrontmatter = false;
  let sawHeader = false;
  let count = 0;
  let warnedFrontmatter = false;
  let warnedDepth = false;
  let warnedCap = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith('%%')) continue;

    if (trimmed === '---' && !sawHeader) {
      inFrontmatter = !inFrontmatter;
      if (!warnedFrontmatter) {
        warnings.push('Ishikawa frontmatter/config is not supported and was ignored.');
        warnedFrontmatter = true;
      }
      continue;
    }
    if (inFrontmatter) continue;

    if (!sawHeader) {
      sawHeader = true;
      if (/^ishikawa(?:-beta)?\b/i.test(trimmed)) continue;
    }

    if (count >= MAX_LINES) {
      if (!warnedCap) warnings.push(`Ishikawa limited to ${MAX_LINES} lines; the rest were ignored.`);
      warnedCap = true;
      continue;
    }
    count++;

    if (!haveEffect) {
      effect = trimmed;
      haveEffect = true;
      continue;
    }

    let col = 0;
    for (const ch of rawLine) {
      if (ch === '\t') col += 4;
      else if (ch === ' ') col += 1;
      else break;
    }

    while (stack.length > 0 && (stack[stack.length - 1] ?? 0) >= col) stack.pop();
    // Empty stack: this line is at or left of the current category's column (or is the first one).
    if (stack.length === 0) {
      categories.push({ label: trimmed, causes: [] });
      stack = [col];
      continue;
    }
    const depth = stack.length;
    if (depth > MAX_DEPTH) {
      if (!warnedDepth) warnings.push(`Ishikawa nesting limited to ${MAX_DEPTH} levels; deeper lines ignored.`);
      warnedDepth = true;
      continue;
    }
    categories[categories.length - 1]?.causes.push({ label: trimmed, depth });
    stack.push(col);
  }

  return { ast: { effect, categories }, warnings };
}
