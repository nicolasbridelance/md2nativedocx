/**
 * Parser for Mermaid `mindmap` (grammar verified against the raw
 * mermaid-js/mermaid `docs/syntax/mindmap.md` source, fetched 2026-09-04 —
 * cross-checked against the rendered mermaid.js.org page after the first
 * fetch returned an implausible "bang" shape, see `git log` for that
 * correction). Indentation-based tree, not line-oriented statements like
 * `../quadrant/parser.ts`/`../venn/parser.ts`: each content line's leading
 * whitespace *count* (compared only against previously-seen lines, never an
 * absolute tab width — Mermaid's own documented rule) determines its parent.
 *
 * V1 scope: all 6 named shapes (`[]`/`()`/`(())`/`))((`/`)( `/`{{}}`) plus
 * the unshaped default, and one root. NOT implemented yet (recognized,
 * warned, stripped — never silently producing a wrong label): `::icon(...)`
 * and `:::className`. Multiple top-level (root-indent) lines are a malformed
 * mindmap (Mermaid supports exactly one root) — the first is the root, any
 * further one is warned and skipped rather than guessed at.
 */

import type { MindmapChart, MindmapNode, MindmapShape } from './types.js';

export interface MindmapParseResult {
  ast: MindmapChart;
  warnings: string[];
}

const ICON_SUFFIX = /::icon\([^)]*\)/g;
const CLASS_SUFFIX = /:::[\w-]+/g;

interface ShapeMatcher {
  shape: MindmapShape;
  pattern: RegExp;
}

// Order matters: a double-delimiter shape must be checked before the
// single-delimiter shape whose pattern it would otherwise also satisfy
// (circle `((..))` before rounded `(..)`; bang `))..((` before cloud `)..(`).
const SHAPES: ShapeMatcher[] = [
  { shape: 'circle', pattern: /^(\S*)\(\((.+)\)\)$/ },
  { shape: 'bang', pattern: /^(\S*)\)\)(.+)\(\($/ },
  { shape: 'hexagon', pattern: /^(\S*)\{\{(.+)\}\}$/ },
  { shape: 'rounded', pattern: /^(\S*)\((.+)\)$/ },
  { shape: 'cloud', pattern: /^(\S*)\)(.+)\($/ },
  { shape: 'square', pattern: /^(\S*)\[(.+)\]$/ },
];

function parseNodeLine(content: string, autoId: () => string): { id: string; label: string; shape: MindmapShape } {
  for (const { shape, pattern } of SHAPES) {
    const match = content.match(pattern);
    if (match) {
      const id = (match[1] ?? '').trim();
      const label = (match[2] ?? '').trim();
      return { id: id || autoId(), label, shape };
    }
  }
  return { id: autoId(), label: content.trim(), shape: 'default' };
}

export function parseMindmap(text: string): MindmapParseResult {
  const warnings: string[] = [];
  let counter = 0;
  const autoId = () => `n${++counter}`;

  const stack: Array<{ indent: number; node: MindmapNode }> = [];
  let root: MindmapNode | null = null;
  let rootIndent: number | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.trim().length === 0 || rawLine.trim().startsWith('%%')) continue;
    if (/^\s*mindmap\b/i.test(rawLine)) continue;

    const indent = rawLine.length - rawLine.trimStart().length;
    let content = rawLine.trim();

    if (content.match(ICON_SUFFIX)) {
      warnings.push(`::icon(...) is not yet supported for mindmaps, ignored: ${content}`);
      content = content.replace(ICON_SUFFIX, '').trim();
    }
    if (content.match(CLASS_SUFFIX)) {
      warnings.push(`:::className is not yet supported for mindmaps, ignored: ${content}`);
      content = content.replace(CLASS_SUFFIX, '').trim();
    }
    if (content.length === 0) continue;

    const { id, label, shape } = parseNodeLine(content, autoId);
    const node: MindmapNode = { id, label, shape, children: [] };

    if (root === null) {
      root = node;
      rootIndent = indent;
      stack.push({ indent, node });
      continue;
    }
    if (rootIndent !== undefined && indent <= rootIndent) {
      warnings.push(`Mermaid mindmaps support exactly one root; extra top-level node ignored: ${content}`);
      continue;
    }

    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? -1) >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1]?.node;
    if (parent) {
      parent.children.push(node);
      stack.push({ indent, node });
    } else {
      // Popped past the root (shouldn't happen given the rootIndent guard
      // above, kept defensively rather than dropping the node silently).
      root.children.push(node);
      stack.push({ indent, node });
    }
  }

  return { ast: { root }, warnings };
}
