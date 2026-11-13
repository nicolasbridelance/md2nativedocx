/**
 * Parser for Mermaid `treemap-beta`. Nesting is indentation-based (spaces or
 * tabs; a tab counts as 4 columns). A node is `"Name"` (section) or
 * `"Name": value` (leaf), optionally followed by `:::className`.
 * `classDef name fill:#RRGGBB,color:#RRGGBB,stroke:#RRGGBB;` lines define
 * styles; only `fill`/`color`/`stroke` as 3/6-digit hex or a handful of basic
 * CSS color names are honored (other properties/values ignored silently, as in
 * the flowchart `classDef` handling). Frontmatter is skipped with one warning.
 */

import type { TreemapDiagram, TreemapNode, TreemapStyle } from './types.js';

export interface TreemapParseResult {
  ast: TreemapDiagram;
  warnings: string[];
}

const NAMED_COLORS: Record<string, string> = {
  red: 'FF0000', blue: '0000FF', green: '008000', yellow: 'FFFF00', orange: 'FFA500',
  purple: '800080', black: '000000', white: 'FFFFFF', gray: '808080', grey: '808080',
};

const MAX_DEPTH = 32; // bounds recursion in the translator for hostile input

function toHex(value: string): string | undefined {
  const v = value.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{6}$/.test(v)) return v.toUpperCase();
  if (/^[0-9a-f]{3}$/.test(v)) return v.split('').map((c) => c + c).join('').toUpperCase();
  return NAMED_COLORS[v];
}

function indentOf(raw: string): number {
  let n = 0;
  for (const ch of raw) {
    if (ch === ' ') n += 1;
    else if (ch === '\t') n += 4;
    else break;
  }
  return n;
}

function parseClassDef(rest: string): { name: string; style: TreemapStyle } | undefined {
  const trimmed = rest.trim().replace(/;$/, '');
  const space = trimmed.search(/\s/);
  if (space < 0) return undefined;
  const name = trimmed.slice(0, space);
  const style: TreemapStyle = {};
  for (const pair of trimmed.slice(space).split(',')) {
    const colon = pair.indexOf(':');
    if (colon < 0) continue;
    const key = pair.slice(0, colon).trim().toLowerCase();
    const hex = toHex(pair.slice(colon + 1));
    if (hex && (key === 'fill' || key === 'color' || key === 'stroke')) style[key] = hex;
  }
  return { name, style };
}

export function parseTreemap(text: string): TreemapParseResult {
  const warnings: string[] = [];
  const ast: TreemapDiagram = { roots: [], classDefs: {} };
  const stack: { indent: number; node: TreemapNode }[] = [];
  let inFrontmatter = false;
  let sawFrontmatterNote = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;

    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      if (!sawFrontmatterNote) {
        warnings.push('Treemap frontmatter/config is not supported and was ignored.');
        sawFrontmatterNote = true;
      }
      continue;
    }
    if (inFrontmatter) continue;
    if (/^treemap(-beta)?\b/i.test(line)) continue;

    const classDef = line.match(/^classDef\s+(.+)$/i);
    if (classDef) {
      const parsed = parseClassDef(classDef[1] ?? '');
      if (parsed) ast.classDefs[parsed.name] = parsed.style;
      else warnings.push(`Unsupported line ignored: ${line}`);
      continue;
    }

    if (line[0] !== '"') {
      warnings.push(`Unsupported line ignored: ${line}`);
      continue;
    }
    const close = line.indexOf('"', 1);
    if (close < 0) {
      warnings.push(`Unsupported line ignored: ${line}`);
      continue;
    }
    const node: TreemapNode = { label: line.slice(1, close), children: [] };
    let rest = line.slice(close + 1).trim();
    const classAt = rest.indexOf(':::');
    if (classAt >= 0) {
      node.className = rest.slice(classAt + 3).trim() || undefined;
      rest = rest.slice(0, classAt).trim();
    }
    if (rest.startsWith(':')) {
      const raw = rest.slice(1).trim().replace(/,/g, '');
      const value = Number(raw);
      if (raw.length === 0 || !Number.isFinite(value) || value < 0) {
        warnings.push(`Treemap value must be a non-negative number, ignored: ${line}`);
        continue;
      }
      node.value = value;
    } else if (rest.length > 0) {
      warnings.push(`Unsupported line ignored: ${line}`);
      continue;
    }

    const indent = indentOf(rawLine);
    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? 0) >= indent) stack.pop();
    const parent = stack[stack.length - 1]?.node;
    if (parent) {
      if (stack.length >= MAX_DEPTH) {
        warnings.push(`Treemap nesting deeper than ${MAX_DEPTH} levels, ignored: ${line}`);
        continue;
      }
      parent.children.push(node);
    } else {
      ast.roots.push(node);
    }
    stack.push({ indent, node });
  }

  return { ast, warnings };
}
