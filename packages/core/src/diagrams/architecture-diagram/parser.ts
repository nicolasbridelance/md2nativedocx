/**
 * Parser for Mermaid `architecture-beta` (grammar verified against
 * mermaid.js.org/syntax/architecture.html, fetched 2026-09-09 — a "New 🔥"
 * type, see `types.ts`'s doc comment). Line-oriented, same forgiving
 * convention as `../../parser/parser.ts` and `../class-diagram/parser.ts`.
 *
 * V1 scope, deliberately:
 * - `group`/`service`/`junction <id>[(icon)][[title]] [in <parentId>]`.
 * - Edges: `<id>[{group}]:<SIDE> [<]--[>] <SIDE>:<id>[{group}]` — the
 *   literal `{group}` suffix (disambiguates a group id from a same-named
 *   service for Mermaid's own resolver) is stripped; this project's AST
 *   doesn't need the distinction since a node's `kind` already says
 *   whether it's a group.
 *
 * The `in <parentId>` suffix is detected via `lastIndexOf(' in ')` on the
 * declaration line — a plain string search, not a regex spanning the whole
 * line (avoiding the detect-unsafe-regex false positive already documented
 * at `../quadrant/parser.ts`'s POINT_TAIL). This assumes a title doesn't
 * itself end in literal " in <word>" text; not confirmed impossible, but no
 * example on the source page suggests it's a real risk, and the corpus of
 * real architecture-beta diagrams available to verify against is small
 * (New 🔥 type).
 */

import type { ArchitectureDiagram, ArchitectureEdge, ArchitectureNode, ArchitectureNodeKind, ArchitectureSide } from './types.js';

export interface ArchitectureDiagramParseResult {
  ast: ArchitectureDiagram;
  warnings: string[];
}

const SIDES = new Set<ArchitectureSide>(['L', 'R', 'T', 'B']);

function isSide(token: string): token is ArchitectureSide {
  return SIDES.has(token as ArchitectureSide);
}

function stripGroupMarker(endpoint: string): string {
  return endpoint.replace('{group}', '').trim();
}

/** Parse the declaration tail after `group`/`service`/`junction ` — the id,
 * optional `(icon)`, optional `[title]`, optional trailing ` in parent`. */
function parseDeclaration(rest: string): { id: string; icon?: string; title?: string; parent?: string } {
  let body = rest.trim();
  let parent: string | undefined;
  const inIdx = body.toLowerCase().lastIndexOf(' in ');
  if (inIdx !== -1) {
    parent = body.slice(inIdx + 4).trim();
    body = body.slice(0, inIdx).trim();
  }

  let icon: string | undefined;
  let title: string | undefined;
  const parenIdx = body.indexOf('(');
  const bracketIdx = body.indexOf('[');

  let idEnd = body.length;
  if (parenIdx !== -1) idEnd = Math.min(idEnd, parenIdx);
  if (bracketIdx !== -1) idEnd = Math.min(idEnd, bracketIdx);
  const id = body.slice(0, idEnd).trim();

  if (parenIdx !== -1) {
    const closeIdx = body.indexOf(')', parenIdx);
    if (closeIdx !== -1) icon = body.slice(parenIdx + 1, closeIdx).trim();
  }
  if (bracketIdx !== -1) {
    const closeIdx = body.indexOf(']', bracketIdx);
    if (closeIdx !== -1) title = body.slice(bracketIdx + 1, closeIdx).trim();
  }

  return { id, ...(icon ? { icon } : {}), ...(title ? { title } : {}), ...(parent ? { parent } : {}) };
}

/** Parse one edge line: `endpoint1:SIDE [<]--[>] SIDE:endpoint2`. Split on
 * the literal `--` separator (and the optional `<`/`>` immediately around
 * it) rather than one combined regex — same rationale as `parseDeclaration`
 * above. */
function parseEdgeLine(line: string): ArchitectureEdge | null {
  const dashIdx = line.indexOf('--');
  if (dashIdx === -1) return null;

  let left = line.slice(0, dashIdx).trimEnd();
  let arrowAtFrom = false;
  if (left.endsWith('<')) {
    arrowAtFrom = true;
    left = left.slice(0, -1).trimEnd();
  }

  let right = line.slice(dashIdx + 2).trimStart();
  let arrowAtTo = false;
  if (right.startsWith('>')) {
    arrowAtTo = true;
    right = right.slice(1).trimStart();
  }

  const leftColonIdx = left.indexOf(':');
  const rightColonIdx = right.indexOf(':');
  if (leftColonIdx === -1 || rightColonIdx === -1) return null;

  const from = stripGroupMarker(left.slice(0, leftColonIdx));
  const fromSide = left.slice(leftColonIdx + 1).trim();
  const toSide = right.slice(0, rightColonIdx).trim();
  const to = stripGroupMarker(right.slice(rightColonIdx + 1));

  if (from.length === 0 || to.length === 0 || !isSide(fromSide) || !isSide(toSide)) return null;

  return { from, fromSide, to, toSide, arrowAtFrom, arrowAtTo };
}

export function parseArchitectureDiagram(text: string): ArchitectureDiagramParseResult {
  const warnings: string[] = [];
  const nodes = new Map<string, ArchitectureNode>();
  const edges: ArchitectureEdge[] = [];

  function declareNode(kind: ArchitectureNodeKind, rest: string): void {
    const decl = parseDeclaration(rest);
    if (decl.id.length === 0) {
      warnings.push(`Unsupported line ignored (could not read a ${kind} id): ${rest}`);
      return;
    }
    nodes.set(decl.id, { ...decl, kind });
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (/^architecture-beta\b/i.test(line)) continue;

    if (/^group\s+/i.test(line)) {
      declareNode('group', line.replace(/^group\s+/i, ''));
      continue;
    }
    if (/^service\s+/i.test(line)) {
      declareNode('service', line.replace(/^service\s+/i, ''));
      continue;
    }
    if (/^junction\s+/i.test(line)) {
      declareNode('junction', line.replace(/^junction\s+/i, ''));
      continue;
    }

    const edge = parseEdgeLine(line);
    if (edge) {
      nodes.set(edge.from, nodes.get(edge.from) ?? { id: edge.from, kind: 'service' });
      nodes.set(edge.to, nodes.get(edge.to) ?? { id: edge.to, kind: 'service' });
      edges.push(edge);
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  if ([...nodes.values()].some((n) => n.parent)) {
    warnings.push(
      'Group/parent containment ("in <id>") is not yet rendered as nested boxes; grouped nodes still render as standalone boxes at the top level.',
    );
  }

  return {
    ast: { nodes: [...nodes.values()], edges },
    warnings,
  };
}
