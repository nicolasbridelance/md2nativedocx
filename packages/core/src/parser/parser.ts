/**
 * Mermaid flowchart parser -> intermediate AST.
 *
 * V1 scope (spec §5.1): `graph`/`flowchart` with `TD`/`LR` direction only.
 * Supports node shapes from §6.1, edge types from §6.2, and `subgraph`
 * containers. `classDef`/`style` are intentionally ignored in V1 (§6.3).
 *
 * This module is a pure function from untrusted text to a typed AST. It never
 * emits XML itself — escaping happens in the translator.
 */

import type {
  EdgeType,
  FlowEdge,
  FlowNode,
  Flowchart,
  NodeShape,
  Subgraph,
} from '../types.js';

/** Shape of a node based on its bracket syntax (spec §6.1). */
const SHAPE_BY_SYNTAX: ReadonlyArray<{ open: string; close: string; shape: NodeShape }> = [
  // Longest patterns first so `([` matches stadium before `(` matches roundRect,
  // and `((` matches ellipse before `(` matches roundRect.
  { open: '([', close: '])', shape: 'stadium' },
  { open: '[(', close: ')]', shape: 'cylinder' },
  { open: '((', close: '))', shape: 'ellipse' },
  { open: '[', close: ']', shape: 'rect' },
  { open: '(', close: ')', shape: 'roundRect' },
  { open: '{', close: '}', shape: 'diamond' },
];

/** Edge syntax -> EdgeType (spec §6.2). */
const EDGE_SYNTAX: ReadonlyArray<{ pattern: string; type: EdgeType }> = [
  { pattern: '-.->', type: 'dotted' },
  { pattern: '==>', type: 'thick' },
  { pattern: '-->', type: 'arrow' },
  { pattern: '---', type: 'line' },
];

/**
 * Node ids that collide with Object.prototype members. Dagre stores nodes in a
 * plain object, so an id like `__proto__`, `constructor`, or `length` would
 * resolve to the prototype instead of the node, breaking layout (and enabling
 * prototype pollution). These ids are rejected with a warning (non-fatal).
 */
const RESERVED_IDS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'length',
  'name',
  'toString',
  'hasOwnProperty',
  'valueOf',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
]);

/** True if an id is safe to use as a key in a plain object (Dagre-safe). */
function isSafeId(id: string): boolean {
  return !RESERVED_IDS.has(id);
}

export interface ParseResult {
  ast: Flowchart;
  /** Human-readable warnings for unsupported constructs (non-fatal). */
  warnings: string[];
}

/**
 * Parse a Mermaid flowchart block into an intermediate AST.
 * Throws {@link MermaidParseError} on structurally invalid input.
 */
export function parseMermaid(text: string): ParseResult {
  const warnings: string[] = [];
  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const subgraphs: Subgraph[] = [];
  const subgraphStack: Subgraph[] = [];
  // class name -> fill color (hex, no `#`), from `classDef` (spec §6.3).
  const classDefs = new Map<string, string>();
  // node id -> fill color, for nodes assigned a class before they are defined.
  const pendingFills = new Map<string, string>();

  let direction: 'TD' | 'LR' = 'TD';

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    // Header line: graph TD / flowchart LR
    const header = line.match(/^(?:graph|flowchart)\s+(TD|LR)\b/i);
    if (header) {
      direction = header[1]!.toUpperCase() as 'TD' | 'LR';
      continue;
    }
    // Allow a bare "graph"/"flowchart" with no direction.
    if (/^(?:graph|flowchart)\s*$/i.test(line)) continue;

    // Comments
    if (line.startsWith('%%')) continue;

    // classDef Name fill:#XXXXXX (spec §6.3) — simplified mapping to fill only.
    const classDef = line.match(/^classDef\s+([A-Za-z0-9_-]+)\s+fill:#([0-9A-Fa-f]{6})\b/i);
    if (classDef) {
      classDefs.set(classDef[1]!, classDef[2]!.toUpperCase());
      continue;
    }
    // class A,B,C className — apply a defined class to nodes.
    const classAssign = line.match(/^class\s+([A-Za-z0-9_,\s-]+)\s+([A-Za-z0-9_-]+)\s*$/i);
    if (classAssign) {
      const className = classAssign[2]!;
      const fill = classDefs.get(className);
      if (fill) {
        for (const id of classAssign[1]!.split(',')) {
          const trimmed = id.trim();
          if (trimmed.length === 0) continue;
          const existing = nodes.get(trimmed);
          if (existing) {
            existing.fill = fill;
          } else {
            // Node may be defined later; remember the pending assignment.
            pendingFills.set(trimmed, fill);
          }
        }
      } else {
        warnings.push(`classDef "${className}" referenced but not defined.`);
      }
      continue;
    }

    // subgraph ... end
    if (/^subgraph\b/i.test(line)) {
      const sg = parseSubgraphHeader(line);
      subgraphs.push(sg);
      subgraphStack.push(sg);
      continue;
    }
    if (/^end\s*$/i.test(line)) {
      if (subgraphStack.length > 0) subgraphStack.pop();
      else warnings.push('Unexpected `end` without matching `subgraph`.');
      continue;
    }

    // Edge statement: A --> B, A -->|label| B, A --- B, etc.
    const edge = parseEdgeStatement(line);
    if (edge) {
      edges.push({
        from: edge.from,
        to: edge.to,
        type: edge.type,
        label: edge.label,
      });
      if (!registerNode(nodes, edge.from, edge.fromLabel, edge.fromShape)) {
        warnings.push(`Node id "${edge.from}" is reserved and was ignored.`);
      }
      if (!registerNode(nodes, edge.to, edge.toLabel, edge.toShape)) {
        warnings.push(`Node id "${edge.to}" is reserved and was ignored.`);
      }
      // Apply inline class fills (`A:::crit`) to the edge endpoints.
      applyClassFill(nodes, pendingFills, classDefs, edge.from, edge.fromClass, warnings);
      applyClassFill(nodes, pendingFills, classDefs, edge.to, edge.toClass, warnings);
      attachToCurrentSubgraph(subgraphStack, edge.from);
      attachToCurrentSubgraph(subgraphStack, edge.to);
      continue;
    }

    // Bare node definition: id[Text] or id
    const node = parseNodeStatement(line);
    if (node) {
      if (!registerNode(nodes, node.id, node.label, node.shape)) {
        warnings.push(`Node id "${node.id}" is reserved and was ignored.`);
      }
      attachToCurrentSubgraph(subgraphStack, node.id);
      continue;
    }

    // Unsupported construct — warn but keep going (V1 tolerance).
    warnings.push(`Unsupported line ignored: ${line}`);
  }

  // Apply any pending class fills to nodes that were defined after their class.
  for (const [id, fill] of pendingFills) {
    const existing = nodes.get(id);
    if (existing) existing.fill = fill;
  }

  // A subgraph id must not also be a node: Mermaid allows edges between
  // subgraphs (e.g. `U1 --> Y2`), and our parser would otherwise register the
  // subgraph id as a plain node, which breaks Dagre (an id cannot be both a
  // node and a cluster). Drop such nodes and warn. Edges referencing subgraphs
  // as endpoints are dropped too (V1 does not support inter-subgraph edges).
  const subgraphIdSet = new Set(subgraphs.map((s) => s.id));
  for (const id of subgraphIdSet) {
    if (nodes.has(id)) {
      nodes.delete(id);
      warnings.push(`Subgraph "${id}" was also used as a node; node ignored.`);
    }
  }
  const edgesWithoutSubgraphs = edges.filter((e) => {
    if (subgraphIdSet.has(e.from) || subgraphIdSet.has(e.to)) {
      warnings.push(`Edge ${e.from} -> ${e.to} references a subgraph; ignored (V1).`);
      return false;
    }
    return true;
  });

  if (subgraphStack.length > 0) {
    warnings.push('Unclosed `subgraph` block.');
  }

  return {
    ast: {
      direction,
      nodes: [...nodes.values()],
      edges: edgesWithoutSubgraphs,
      subgraphs,
    },
    warnings,
  };
}

function parseSubgraphHeader(line: string): Subgraph {
  const rest = line.replace(/^subgraph\b/i, '').trim();
  // subgraph id["Title"] or subgraph id[Title] or subgraph "Title" or subgraph id
  const withTitle = rest.match(/^([A-Za-z0-9_-]+)\s*\[\s*"([^"]*)"\s*\]/);
  if (withTitle) {
    return { id: withTitle[1]!, title: withTitle[2]!, nodeIds: [], subgraphIds: [] };
  }
  const withTitleNoQuotes = rest.match(/^([A-Za-z0-9_-]+)\s*\[\s*([^\]]*)\s*\]/);
  if (withTitleNoQuotes) {
    return { id: withTitleNoQuotes[1]!, title: withTitleNoQuotes[2]!.trim(), nodeIds: [], subgraphIds: [] };
  }
  const quotedTitle = rest.match(/^"([^"]+)"\s*$/);
  if (quotedTitle) {
    return { id: quotedTitle[1]!, title: quotedTitle[1]!, nodeIds: [], subgraphIds: [] };
  }
  // Bare id (or id with spaces used as title).
  const bare = rest.match(/^([A-Za-z0-9_-]+)\s*$/);
  if (bare) {
    return { id: bare[1]!, title: bare[1]!, nodeIds: [], subgraphIds: [] };
  }
  // Fallback: treat whole rest as id.
  return { id: rest, title: rest, nodeIds: [], subgraphIds: [] };
}

function attachToCurrentSubgraph(stack: Subgraph[], nodeId: string): void {
  const top = stack[stack.length - 1];
  if (top && !top.nodeIds.includes(nodeId)) {
    top.nodeIds.push(nodeId);
  }
}

function registerNode(
  nodes: Map<string, FlowNode>,
  id: string,
  label: string,
  shape: NodeShape = 'rect',
): boolean {
  // Reject ids that collide with Object.prototype (Dagre breaks on them).
  if (!isSafeId(id)) return false;
  const existing = nodes.get(id);
  if (existing) {
    // Keep first-seen shape/label; later bare references don't override.
    return true;
  }
  nodes.set(id, { id, label, shape });
  return true;
}

/**
 * Apply a class's fill color to a node (from `:::class` inline or `class`).
 * If the node is not yet defined, the fill is remembered in `pendingFills`.
 */
function applyClassFill(
  nodes: Map<string, FlowNode>,
  pendingFills: Map<string, string>,
  classDefs: Map<string, string>,
  nodeId: string,
  className: string | null,
  warnings: string[],
): void {
  if (!className) return;
  const fill = classDefs.get(className);
  if (!fill) {
    warnings.push(`classDef "${className}" referenced but not defined.`);
    return;
  }
  const existing = nodes.get(nodeId);
  if (existing) {
    existing.fill = fill;
  } else {
    pendingFills.set(nodeId, fill);
  }
}

/** Parse a node statement like `A[Text]`, `B{Decision}`, or bare `C`. */
function parseNodeStatement(line: string): FlowNode | null {
  const idMatch = line.match(/^([A-Za-z0-9_-]+)\s*(.*)$/);
  if (!idMatch) return null;
  const id = idMatch[1]!;
  const rest = idMatch[2]!.trim();

  if (rest.length === 0) {
    return { id, label: id, shape: 'rect' };
  }

  for (const { open, close, shape } of SHAPE_BY_SYNTAX) {
    // Longest patterns first to avoid `(` matching `((`.
    if (rest.startsWith(open) && rest.endsWith(close)) {
      const inner = rest.slice(open.length, rest.length - close.length).trim();
      return { id, label: inner, shape };
    }
  }

  return null;
}

/** Parse a node reference at an edge endpoint: bare id or id with shape. */
function parseNodeRef(
  ref: string,
): { id: string; label: string; shape: NodeShape; className: string | null } | null {
  const trimmed = ref.trim();
  const idMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*(.*)$/);
  if (!idMatch) return null;
  const id = idMatch[1]!;
  let rest = idMatch[2]!.trim();

  // Optional inline class: `A[Text]:::crit` or `A:::crit`.
  let className: string | null = null;
  const classMatch = rest.match(/^(.+?):::\s*([A-Za-z0-9_-]+)\s*$/);
  if (classMatch) {
    className = classMatch[2]!;
    rest = classMatch[1]!.trim();
  }

  if (rest.length === 0) return { id, label: id, shape: 'rect', className };
  for (const { open, close, shape } of SHAPE_BY_SYNTAX) {
    if (rest.startsWith(open) && rest.endsWith(close)) {
      const inner = rest.slice(open.length, rest.length - close.length).trim();
      return { id, label: inner, shape, className };
    }
  }
  return null;
}

function parseEdgeStatement(
  line: string,
): { from: string; to: string; fromLabel: string; toLabel: string; fromShape: NodeShape; toShape: NodeShape; fromClass: string | null; toClass: string | null; type: EdgeType; label: string | null } | null {
  for (const { pattern, type } of EDGE_SYNTAX) {
    // Edge with label: A -->|label| B
    const withLabel = new RegExp(
      `^(.+?)\\s*${escapeRegex(pattern)}\\|([^|]*)\\|\\s*(.+?)\\s*$`,
    );
    const mLabel = line.match(withLabel);
    if (mLabel) {
      const from = parseNodeRef(mLabel[1]!);
      const to = parseNodeRef(mLabel[3]!);
      if (from && to) {
        return { from: from.id, to: to.id, fromLabel: from.label, toLabel: to.label, fromShape: from.shape, toShape: to.shape, fromClass: from.className, toClass: to.className, type, label: mLabel[2]! };
      }
    }
    // Edge without label: A --> B
    const plain = new RegExp(
      `^(.+?)\\s*${escapeRegex(pattern)}\\s*(.+?)\\s*$`,
    );
    const mPlain = line.match(plain);
    if (mPlain) {
      const from = parseNodeRef(mPlain[1]!);
      const to = parseNodeRef(mPlain[2]!);
      if (from && to) {
        return { from: from.id, to: to.id, fromLabel: from.label, toLabel: to.label, fromShape: from.shape, toShape: to.shape, fromClass: from.className, toClass: to.className, type, label: null };
      }
    }
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Error thrown for structurally invalid Mermaid input. */
export class MermaidParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MermaidParseError';
  }
}
