/**
 * Parser for Mermaid `mindmap`, following the grammar of `mermaid@12.3.0` (`mindmap.jison` and
 * `mindmapDb.ts`, read from the package the differential test pins, `tools/mermaid-differential/`).
 * Indentation-based tree: each node line's leading whitespace *count* (compared only against previously
 * seen lines, never an absolute tab width) makes it a child of the last node indented less, Mermaid's
 * `getParent()`.
 *
 * What Mermaid's grammar accepts, and this parser with it:
 *  - the 6 named shapes (`[]`, `()`, `(())`, `))((`, `)(`, `{{}}`) and the unshaped default, an optional id
 *    before the delimiter;
 *  - a quoted label (`"…"` or `` "`…`" ``), which may run over several lines;
 *  - every label read as Markdown (`**bold**`, `*italic*`, a newline is a line break), as Mermaid gives
 *    every mindmap node `labelType: 'markdown'`; `<br/>` and `#name;` entities as everywhere else;
 *  - `::icon(…)` and `:::classes` on a line of their own, decorating the node added just before
 *    (`decorateNode()`). Also accepted at the end of a node line, which Mermaid rejects but an author
 *    clearly means the same way. Kept in the AST, not drawn (see `types.ts`), with a warning.
 *
 * Where this parser is more tolerant than Mermaid, which fails the whole diagram: a second top-level
 * node (Mermaid: "There can be only one root") is warned and skipped; a decoration before any node, or a
 * quoted label never closed, is warned and the line kept as plain text.
 */

import type { MindmapChart, MindmapNode, MindmapShape } from './types.js';
import { parseLabel } from '../../parser/label.js';

export interface MindmapParseResult {
  ast: MindmapChart;
  warnings: string[];
}

const CLASS_NAME = /^[\w-]+$/;
const OWN_LINE_ICON = /^::icon\(([^)]*)\)$/;
const TRAILING_ICON = /::icon\(([^)]*)\)$/;

interface ShapeDelimiter {
  open: string;
  close: string;
  shape: MindmapShape;
}

// Mermaid's lexer order: a double delimiter before the single one it starts with (`((` before `(`,
// `))` before `)`).
const SHAPE_DELIMITERS: readonly ShapeDelimiter[] = [
  { open: '((', close: '))', shape: 'circle' },
  { open: '))', close: '((', shape: 'bang' },
  { open: '{{', close: '}}', shape: 'hexagon' },
  { open: '(', close: ')', shape: 'rounded' },
  { open: ')', close: '(', shape: 'cloud' },
  { open: '[', close: ']', shape: 'square' },
];

/** Mermaid's `NODE_ID`: everything up to the first shape delimiter. */
const NODE_ID = /^[^([){}]*/;

/** Where a node line's shape starts, and the quote its label opens, if any. */
function shapeStart(content: string): { idPart: string; delimiter: ShapeDelimiter; inner: string } | undefined {
  const idPart = NODE_ID.exec(content)?.[0] ?? '';
  const rest = content.slice(idPart.length);
  const delimiter = SHAPE_DELIMITERS.find((d) => rest.startsWith(d.open));
  return delimiter ? { idPart, delimiter, inner: rest.slice(delimiter.open.length) } : undefined;
}

/** The closing quote of a quoted label (`` `" `` or `"`), or undefined when the label is not quoted. */
function closingQuote(inner: string): string | undefined {
  if (inner.startsWith('"`')) return '`"';
  if (inner.startsWith('"')) return '"';
  return undefined;
}

/** The closing quote a node line leaves open, for a label that continues on the next lines. */
function openQuote(content: string): string | undefined {
  const start = shapeStart(content);
  if (!start) return undefined;
  const close = closingQuote(start.inner);
  if (close === undefined) return undefined;
  return start.inner.indexOf(close, close === '"' ? 1 : 2) < 0 ? close : undefined;
}

interface ParsedNode {
  id?: string;
  body: string;
  shape: MindmapShape;
}

/**
 * A node's id, label text and shape. A label that does not end with its shape's closing delimiter is
 * the whole line as a default node, never a half-guessed shape (Mermaid fails the diagram there).
 */
function parseNodeText(content: string): ParsedNode {
  const plain: ParsedNode = { body: content, shape: 'default' };
  const start = shapeStart(content);
  if (!start) return plain;
  const { idPart, delimiter, inner } = start;
  const id = idPart.trim() || undefined;
  const close = closingQuote(inner);
  if (close !== undefined) {
    const openLength = close === '"' ? 1 : 2;
    const end = inner.indexOf(close, openLength);
    if (end < 0 || inner.slice(end + close.length).trim() !== delimiter.close) return plain;
    return { id, body: inner.slice(openLength, end), shape: delimiter.shape };
  }
  const trimmed = inner.trimEnd();
  if (!trimmed.endsWith(delimiter.close) || trimmed.length === delimiter.close.length) return plain;
  return { id, body: trimmed.slice(0, -delimiter.close.length).trim(), shape: delimiter.shape };
}

/** `text:::a b c` -> `{ text, classes: 'a b c' }`, or undefined when the line does not end with classes.
 * Mermaid takes a space-separated class list running to the end of the line; a string split (not one big
 * regex) keeps this linear and clear of `security/detect-unsafe-regex`. */
function splitClassSuffix(content: string): { text: string; classes: string } | undefined {
  const at = content.lastIndexOf(':::');
  if (at < 0) return undefined;
  const classes = content.slice(at + 3).trim();
  const names = classes.split(/\s+/);
  if (classes.length === 0 || !names.every((name) => CLASS_NAME.test(name))) return undefined;
  return { text: content.slice(0, at).trim(), classes: names.join(' ') };
}

function iconWarning(node: MindmapNode): string {
  return `Mindmap icons are not drawn (they need the icon font of the page Mermaid runs in), ignored on "${node.label}": ::icon(${node.icon ?? ''})`;
}

function classWarning(node: MindmapNode): string {
  return `Mindmap classes are not applied (they refer to the stylesheet of the page Mermaid runs in), ignored on "${node.label}": :::${node.className ?? ''}`;
}

export function parseMindmap(text: string): MindmapParseResult {
  const warnings: string[] = [];
  let counter = 0;
  const autoId = () => `n${++counter}`;

  const stack: Array<{ indent: number; node: MindmapNode }> = [];
  let root: MindmapNode | null = null;
  let rootIndent: number | undefined;
  let last: MindmapNode | undefined;
  let headerSeen = false;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? '';
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith('%%')) continue;
    if (!headerSeen) {
      headerSeen = true;
      if (/^mindmap\b/i.test(trimmed)) continue;
    }

    const indent = rawLine.length - rawLine.trimStart().length;
    let content = trimmed;

    // A decoration on a line of its own applies to the node added just before.
    const ownIcon = OWN_LINE_ICON.exec(content);
    const ownClass = content.startsWith(':::') ? splitClassSuffix(content) : undefined;
    if (ownIcon || ownClass) {
      if (!last) {
        warnings.push(`A mindmap decoration before any node is ignored: ${content}`);
      } else if (ownIcon) {
        last.icon = (ownIcon[1] ?? '').trim();
        warnings.push(iconWarning(last));
      } else if (ownClass) {
        last.className = ownClass.classes;
        warnings.push(classWarning(last));
      }
      continue;
    }

    // A quoted label left open continues on the next lines, up to its closing quote.
    const close = openQuote(content);
    if (close !== undefined) {
      const end = lines.findIndex((l, j) => j > i && l.includes(close));
      if (end < 0) {
        warnings.push(`Unclosed quoted label in a mindmap, kept as plain text: ${content}`);
      } else {
        content = [content, ...lines.slice(i + 1, end + 1).map((l) => l.trim())].join('\n');
        i = end;
      }
    }

    let className: string | undefined;
    let icon: string | undefined;
    const classSuffix = splitClassSuffix(content);
    if (classSuffix) {
      content = classSuffix.text;
      className = classSuffix.classes;
    }
    const iconSuffix = TRAILING_ICON.exec(content);
    if (iconSuffix) {
      content = content.slice(0, iconSuffix.index).trim();
      icon = (iconSuffix[1] ?? '').trim();
    }
    if (content.length === 0) continue;

    const parsed = parseNodeText(content);
    const label = parseLabel(parsed.body, { markdown: true });
    const node: MindmapNode = {
      id: parsed.id ?? autoId(),
      label: label.text.trim(),
      labelRuns: label.runs,
      shape: parsed.shape,
      ...(icon !== undefined ? { icon } : {}),
      ...(className !== undefined ? { className } : {}),
      children: [],
    };
    if (icon !== undefined) warnings.push(iconWarning(node));
    if (className !== undefined) warnings.push(classWarning(node));

    if (root === null) {
      root = node;
      rootIndent = indent;
      stack.push({ indent, node });
      last = node;
      continue;
    }
    if (rootIndent !== undefined && indent <= rootIndent) {
      warnings.push(`Mermaid mindmaps support exactly one root; extra top-level node ignored: ${node.label}`);
      continue;
    }

    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? -1) >= indent) {
      stack.pop();
    }
    // The root's indent is below every other node's (checked above), so the root is never popped.
    const parent = stack[stack.length - 1]?.node ?? root;
    parent.children.push(node);
    stack.push({ indent, node });
    last = node;
  }

  return { ast: { root }, warnings };
}
