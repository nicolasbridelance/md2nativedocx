/**
 * Parser for Mermaid `treeView-beta`. Hierarchy comes from the column where a
 * label starts (tab = 4 columns); leading box-drawing characters (`├ └ │ ─`)
 * count as indentation, so both styles work. A label is quoted (`"my file"`)
 * or bare text running to the first annotation; a trailing `/` marks a directory. Annotations after the
 * label, in any order: `:::class` (only `highlight` is honoured), `## text`
 * (description), `icon(name)` (ignored, warned once). Unrecognized text ->
 * warning, never a throw. Depth is capped at 32 and nodes at 2000 (hostile
 * input). Frontmatter/config is skipped with one warning.
 */

import type { TreeViewDiagram, TreeViewNode } from './types.js';

export interface TreeViewParseResult {
  ast: TreeViewDiagram;
  warnings: string[];
}

const MAX_DEPTH = 32;
const MAX_NODES = 2000;
const PREFIX_CHARS = new Set([' ', '│', '├', '└', '─', '┬', '┼', '╰', '╭', '|']);

export function parseTreeView(text: string): TreeViewParseResult {
  const warnings: string[] = [];
  const nodes: TreeViewNode[] = [];
  /** Open ancestors: label column and node index. */
  const stack: Array<{ col: number; index: number }> = [];
  let inFrontmatter = false;
  let sawHeader = false;
  let warnedFrontmatter = false;
  let warnedIcon = false;
  let warnedClass = false;
  let warnedDepth = false;
  let warnedCap = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith('%%')) continue;

    if (trimmed === '---' && !sawHeader) {
      inFrontmatter = !inFrontmatter;
      if (!warnedFrontmatter) {
        warnings.push('TreeView frontmatter/config is not supported and was ignored.');
        warnedFrontmatter = true;
      }
      continue;
    }
    if (inFrontmatter) continue;

    if (!sawHeader) {
      sawHeader = true;
      if (/^treeView(?:-beta)?\b/i.test(trimmed)) continue;
    }

    // Column of the first label character, tabs expanded to 4 columns.
    let col = 0;
    let i = 0;
    for (; i < rawLine.length; i++) {
      const ch = rawLine[i] ?? '';
      if (ch === '\t') col += 4;
      else if (PREFIX_CHARS.has(ch)) col += 1;
      else break;
    }
    let rest = rawLine.slice(i);

    let label: string;
    if (rest.startsWith('"')) {
      const end = rest.indexOf('"', 1);
      label = end < 0 ? rest.slice(1) : rest.slice(1, end);
      rest = end < 0 ? '' : rest.slice(end + 1);
    } else {
      // A bare label runs to the first annotation (`###`, `:::`, `##`, ` icon(`) or the end of the
      // line, so `🚀 rocket-app/` keeps its space like Mermaid's own render.
      const stops = ['###', ':::', '##'].map((t) => rest.indexOf(t)).filter((n) => n >= 0);
      const iconAt = rest.search(/\sicon\(/);
      if (iconAt >= 0) stops.push(iconAt);
      const cut = stops.length > 0 ? Math.min(...stops) : rest.length;
      label = rest.slice(0, cut);
      rest = rest.slice(cut);
    }
    label = label.trim();
    if (label.length === 0) {
      warnings.push(`Unsupported line ignored: ${trimmed}`);
      continue;
    }
    const isDirectory = label.endsWith('/');

    let description: string | undefined;
    let highlighted = false;
    let remaining = rest.trim();
    while (remaining.length > 0) {
      let m: RegExpMatchArray | null;
      if ((m = remaining.match(/^:::([\w-]+)\s*/))) {
        if (m[1] === 'highlight') highlighted = true;
        else if (!warnedClass) {
          warnings.push('Custom TreeView classes are not supported (only "highlight"); ignored.');
          warnedClass = true;
        }
      } else if ((m = remaining.match(/^icon\([^)]*\)\s*/))) {
        if (!warnedIcon) {
          warnings.push('TreeView icons are not supported and were ignored.');
          warnedIcon = true;
        }
      } else if ((m = remaining.match(/^##\s*(.*)$/))) {
        description = (m[1] ?? '').trim();
      } else {
        warnings.push(`Unrecognized text after "${label}" ignored: ${remaining}`);
        break;
      }
      remaining = remaining.slice(m[0].length).trim();
    }

    while (stack.length > 0 && (stack[stack.length - 1]?.col ?? 0) >= col) stack.pop();
    if (stack.length >= MAX_DEPTH) {
      if (!warnedDepth) warnings.push(`TreeView nesting limited to ${MAX_DEPTH} levels; deeper lines ignored.`);
      warnedDepth = true;
      continue;
    }
    if (nodes.length >= MAX_NODES) {
      if (!warnedCap) warnings.push(`TreeView limited to ${MAX_NODES} nodes; the rest were ignored.`);
      warnedCap = true;
      continue;
    }
    const parent = stack[stack.length - 1]?.index ?? -1;
    nodes.push({ label, isDirectory, ...(description ? { description } : {}), highlighted, depth: stack.length, parent });
    stack.push({ col, index: nodes.length - 1 });
  }

  return { ast: { nodes }, warnings };
}
