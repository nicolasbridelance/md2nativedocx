/**
 * SmartArt topology classifier (`FUTURE_mmd2smartart_SPEC.md` §4).
 *
 * Pure function, no dependency on Dagre or the OOXML translator: it runs on
 * the parsed {@link Flowchart} AST alone, before layout, and decides whether
 * a flowchart is one of the small set of topologies ("well-behaved" per the
 * spec) that Word's native SmartArt can render — as a complement to the
 * existing `wpg:wgp` shape translator, never a replacement for it. Every
 * flowchart this classifier rejects still renders correctly through the
 * existing pipeline; this module only ever adds an alternative rendering
 * path for a deliberately narrow subset.
 *
 * `mermaid2docx#docs/adr/0004-smartart-feasibility-spike.md` records the
 * empirical work behind the one constraint this module enforces that isn't
 * in the spec's original text: a `tree` classification is capped at depth 2
 * (root + one row of direct children). This is **not** a format limit —
 * Word's own built-in `hierarchy1` algorithm has no presentation template
 * beyond depth 4, and a fully self-authored `layoutDef` has no ceiling at
 * all (Round 5) — it's specific to `tree.ts`'s current generator, whose
 * fixed layoutDef reserves a static height split (35% node / 55% children
 * row) at one nesting level; naively repeating that split at further levels
 * would misallocate space for any node without grandchildren, since the
 * split isn't computed from the real subtree shape. Raise this once
 * `tree.ts` supports a size-aware deeper layout.
 */

import type { Flowchart } from '../types.js';

/** The three SmartArt layouts this classifier can select (spec §4 table). */
export type SmartArtLayout = 'chain' | 'tree' | 'cycle';

/**
 * Structured reason a flowchart was not classified into one of the three
 * supported layouts. Deliberately a closed set of codes, not a free-text
 * string: `packages/vscode-extension`'s hover provider and CodeLens (spec
 * §10.1) and the in-document fallback note (spec §10.3) all switch on this
 * value to phrase a specific, actionable message — never a generic
 * "unsupported diagram" disclaimer.
 */
export type SmartArtIneligibleReason =
  /** One or more `subgraph` blocks are present (spec §4: disqualifies before
   * chain/tree/cycle are even evaluated, independent of the §5 subgraph
   * bricolage, which is an explicit opt-in mode this classifier never
   * selects on its own). */
  | 'subgraph'
  /** An edge whose `from` and `to` are the same node. Not addressed by the
   * spec's chain/tree/cycle definitions; excluded defensively rather than
   * left to produce a degenerate SmartArt data model. */
  | 'self-loop'
  /** The flowchart has more than one connected component. A single SmartArt
   * diagram cannot represent two unrelated pieces of a graph. */
  | 'disconnected'
  /** A node has in-degree >= 2 — the decision -> Oui/Non -> merge pattern
   * the spec (§6, §10.1) identifies as probably the most common real
   * flowchart shape, and the one both `chain` and `tree` exclude by
   * definition. */
  | 'merge-after-branch'
  /** Every node has in-degree/out-degree <= 1 (so it isn't a merge) but the
   * graph still isn't a single simple chain, tree, or cycle — e.g. more than
   * one node with in-degree 0 in an otherwise tree-shaped graph. Kept
   * distinct from `merge-after-branch` because the actionable advice differs
   * (no single pair of nodes to point at). */
  | 'irregular-topology'
  /** The graph is a valid tree shape but deeper than `tree.ts`'s generator
   * currently supports (ADR 0004, "Round 5" + this session's geometry fix).
   * Depth 1 is the root; a value of 3 here means there's a grandchild level
   * the generator's fixed layoutDef has no room for. */
  | 'tree-too-deep';

/** A flowchart classified as eligible for one of the three SmartArt layouts. */
export interface SmartArtEligible {
  eligible: true;
  layout: SmartArtLayout;
}

/**
 * A flowchart classified as ineligible, with a structured reason (spec
 * §10.1) rather than a plain boolean — the hover/CodeLens/document-note UX
 * all key off `reason`, and `at` names the specific node ids a user-facing
 * message should point at (e.g. "fusion détectée entre {at[0]} et {at[1]}",
 * spec §10.3).
 */
export interface SmartArtIneligible {
  eligible: false;
  reason: SmartArtIneligibleReason;
  /** Node ids implicated in the disqualification, when applicable (empty for
   * reasons that aren't localized to specific nodes, e.g. `disconnected`). */
  at: string[];
}

export type SmartArtClassification = SmartArtEligible | SmartArtIneligible;

/**
 * The deepest tree `tree.ts`'s generator currently supports: a root plus one
 * row of direct children. Depth 1 is the root itself. This is a property of
 * that generator's fixed-height-split `layoutDef`, not of the OOXML diagram
 * format or of Word's own `hierarchy1` (which supports depth 4, and a fully
 * self-authored algorithm has no format-level ceiling at all — see ADR 0004
 * "Round 5"). Raise this once `tree.ts` supports a size-aware deeper layout.
 */
export const MAX_TREE_DEPTH = 2;

function eligible(layout: SmartArtLayout): SmartArtEligible {
  return { eligible: true, layout };
}

function ineligible(reason: SmartArtIneligibleReason, at: string[] = []): SmartArtIneligible {
  return { eligible: false, reason, at };
}

/**
 * Classify a parsed flowchart's topology for SmartArt eligibility (spec §4).
 *
 * Runs before layout — it only looks at the graph structure (nodes, edges,
 * subgraphs), never at Dagre's coordinates. Every flowchart this function
 * marks ineligible remains fully supported by the existing `wpg:wgp`
 * translator; this classifier only ever gates entry to the *additional*
 * SmartArt path, never removes support from the default one.
 */
export function classifyTopology(flowchart: Flowchart): SmartArtClassification {
  if (flowchart.subgraphs.length > 0) {
    return ineligible(
      'subgraph',
      flowchart.subgraphs.map((s) => s.id)
    );
  }

  for (const edge of flowchart.edges) {
    if (edge.from === edge.to) {
      return ineligible('self-loop', [edge.from]);
    }
  }

  const nodeIds = flowchart.nodes.map((n) => n.id);
  if (nodeIds.length === 0) {
    return ineligible('irregular-topology');
  }

  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const predecessors = new Map<string, string[]>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    outDegree.set(id, 0);
    predecessors.set(id, []);
  }
  for (const edge of flowchart.edges) {
    outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    predecessors.get(edge.to)?.push(edge.from);
  }

  if (!isConnected(nodeIds, flowchart.edges)) {
    return ineligible('disconnected');
  }

  const mergedNode = nodeIds.find((id) => (inDegree.get(id) ?? 0) >= 2);
  if (mergedNode !== undefined) {
    return ineligible('merge-after-branch', predecessors.get(mergedNode) ?? []);
  }

  // Past this point every node has in-degree <= 1 (no merges) and the graph
  // is connected. Whether a root (in-degree 0 node) exists is what actually
  // separates the tree/chain family from the cycle family — NOT in-degree/
  // out-degree bounds alone: a pure cycle has in-degree == out-degree == 1
  // for every node, which would otherwise also satisfy a naively-written
  // "in-degree <= 1 and out-degree <= 1" chain check (caught by this
  // module's own test suite: a 3-node cycle was misclassified as a chain
  // before this root check was added).
  const roots = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0);

  if (roots.length === 1) {
    // n-1 edges, one root, every other node has exactly one parent -> a
    // tree shape (a chain is just the special case with no branching).
    const isChain = nodeIds.every((id) => (outDegree.get(id) ?? 0) <= 1);
    if (isChain) {
      return eligible('chain');
    }

    const depth = treeDepth(roots[0]!, flowchart.edges);
    if (depth > MAX_TREE_DEPTH) {
      return ineligible('tree-too-deep', [roots[0]!]);
    }
    return eligible('tree');
  }

  if (roots.length === 0) {
    // n edges, every node in-degree exactly 1 (no root) -> either a single
    // pure cycle (also out-degree exactly 1 everywhere) or a cycle with an
    // extra branch hanging off one of its nodes (that node's out-degree
    // >= 2), which isn't representable as `cycleMatrix`/`basicCycle`.
    const isCycle = nodeIds.every((id) => (outDegree.get(id) ?? 0) === 1);
    if (isCycle) {
      return eligible('cycle');
    }
    return ineligible('irregular-topology');
  }

  // Unreachable given the in-degree <= 1 invariant established above (a
  // connected functional in-forest with max in-degree 1 has either exactly
  // one root or none — see classify.test.ts and this module's design notes)
  // but kept as a defensive fallback rather than a non-null assertion.
  return ineligible('irregular-topology');
}

function isConnected(
  nodeIds: string[],
  edges: { from: string; to: string }[]
): boolean {
  if (nodeIds.length <= 1) return true;

  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) adjacency.set(id, []);
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }

  const visited = new Set<string>([nodeIds[0]!]);
  const queue = [nodeIds[0]!];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return visited.size === nodeIds.length;
}

/** Depth of a tree rooted at `rootId` (root itself counts as depth 1). */
function treeDepth(rootId: string, edges: { from: string; to: string }[]): number {
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    if (!children.has(edge.from)) children.set(edge.from, []);
    children.get(edge.from)!.push(edge.to);
  }

  let maxDepth = 1;
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 1 }];
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    maxDepth = Math.max(maxDepth, depth);
    for (const childId of children.get(id) ?? []) {
      queue.push({ id: childId, depth: depth + 1 });
    }
  }
  return maxDepth;
}
