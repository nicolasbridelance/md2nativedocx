/**
 * Size limits for everything that goes through Dagre.
 *
 * Dagre's cost grows much faster than the input: measured on a dense flowchart (two edges per node),
 * 100 nodes take 1.6 s, 300 take 21 s and 500 take 99 s, and a 3 000-node chain overflows the stack.
 * `core` accepts untrusted text, and an MCP server or any other host would hand it to anyone, so every
 * Dagre call goes through {@link layoutWithinLimits}, which refuses an oversized graph before the layout
 * starts instead of letting it run for minutes or crash with a raw `RangeError`.
 *
 * The node and edge caps alone do not bound the cost: it depends on the structure, not only the size. A sparse
 * 413-node (subgraphs included), 690-edge report lays out in 0.7 s, but a dense graph whose edges span many
 * ranks makes Dagre insert one dummy node per rank crossed, and its ordering phase then scans every node once per
 * rank. {@link estimateLayoutWork} measures that before the layout starts and `maxWork` refuses the pathological
 * cases (measured 2026-11-15: about 100 000 work units per second, so the default is roughly 15 s here). A host
 * that must answer within a hard deadline still runs the conversion under its own timeout.
 */

import dagre from 'dagre';

/** Default cap on nodes, subgraph containers included. Override with {@link GraphLimits.maxNodes}. */
export const DEFAULT_MAX_NODES = 500;
/** Default cap on edges. Override with {@link GraphLimits.maxEdges}. */
export const DEFAULT_MAX_EDGES = 800;
/** Default cap on {@link estimateLayoutWork}. Override with {@link GraphLimits.maxWork}. */
export const DEFAULT_MAX_WORK = 1_500_000;

/** Caps on the graph handed to the layout engine. Absent fields use the defaults above. */
export interface GraphLimits {
  /** Maximum number of nodes, subgraph containers included (default {@link DEFAULT_MAX_NODES}). */
  maxNodes?: number;
  /** Maximum number of edges (default {@link DEFAULT_MAX_EDGES}). */
  maxEdges?: number;
  /** Maximum {@link estimateLayoutWork} of the graph (default {@link DEFAULT_MAX_WORK}). */
  maxWork?: number;
}

/** What went over the limit. `work` is the estimated layout cost, see {@link estimateLayoutWork}. */
export type DiagramLimit = 'nodes' | 'edges' | 'source' | 'work';

/**
 * A diagram bigger than the configured limits: it was not laid out. The message is safe to show to a
 * user; `limit`, `actual` and `max` say which cap was hit and by how much, so a caller can raise it.
 */
export class DiagramTooLargeError extends Error {
  readonly limit: DiagramLimit;
  readonly actual: number;
  readonly max: number;

  constructor(limit: DiagramLimit, actual: number, max: number) {
    const what = limit === 'source' ? 'characters of source' : limit === 'work' ? 'units of estimated layout work' : limit;
    super(`diagram too large: ${actual} ${what}, the limit is ${max}`);
    this.name = 'DiagramTooLargeError';
    this.limit = limit;
    this.actual = actual;
    this.max = max;
  }
}

/**
 * `dagre.layout(g)`, after checking the graph against `limits`.
 * @throws {DiagramTooLargeError} when the graph has more nodes or edges than allowed.
 */
export function layoutWithinLimits(g: dagre.graphlib.Graph, limits: GraphLimits = {}): void {
  assertWithinLimits(g, limits);
  safeDagreLayout(g);
}

/**
 * The key a diagram id is stored under in a Dagre graph. graphlib keeps nodes in plain objects too, so an id
 * of `__proto__` set through `setNode` was lost (the box came out with `NaN` coordinates): every translator
 * that builds a graph from user ids goes through this.
 */
export function nodeKey(id: string): string {
  return `id:${id}`;
}

/**
 * `dagre.layout(g)` safe for any node id. Dagre keeps nodes in plain objects internally, so an id that names a
 * built-in property (`constructor`, `valueOf`, `__proto__`: user text, a class or state name) crashed the layout
 * with a raw `TypeError`. The layout runs on a copy whose ids carry a prefix; the copy shares every node, edge
 * and graph label object with `g`, so the coordinates Dagre writes into them are visible through `g` as usual.
 */
export function safeDagreLayout(g: dagre.graphlib.Graph): void {
  const key = (id: string): string => `n:${id}`;
  // graphlib has `isCompound()`; @types/dagre leaves it out.
  const compound = (g as unknown as { isCompound(): boolean }).isCompound();
  const copy = new dagre.graphlib.Graph({ directed: g.isDirected(), multigraph: g.isMultigraph(), compound });
  copy.setGraph(g.graph());
  for (const v of g.nodes()) copy.setNode(key(v), g.node(v));
  if (compound) {
    for (const v of g.nodes()) {
      const parent = g.parent(v);
      if (parent !== undefined) copy.setParent(key(v), key(parent));
    }
  }
  for (const e of g.edges()) copy.setEdge(key(e.v), key(e.w), g.edge(e), e.name);
  dagre.layout(copy);
}

/** The check alone, for a caller that lays the graph out more than once. */
export function assertWithinLimits(g: dagre.graphlib.Graph, limits: GraphLimits = {}): void {
  const maxNodes = limits.maxNodes ?? DEFAULT_MAX_NODES;
  const maxEdges = limits.maxEdges ?? DEFAULT_MAX_EDGES;
  if (g.nodeCount() > maxNodes) throw new DiagramTooLargeError('nodes', g.nodeCount(), maxNodes);
  if (g.edgeCount() > maxEdges) throw new DiagramTooLargeError('edges', g.edgeCount(), maxEdges);
  const maxWork = limits.maxWork ?? DEFAULT_MAX_WORK;
  const work = estimateLayoutWork(g);
  if (work > maxWork) throw new DiagramTooLargeError('work', work, maxWork);
}

/**
 * Cheap estimate (O(V + E)) of how much work Dagre will do, from the graph alone.
 *
 * Layers the graph by longest path (back edges found by an iterative depth-first search are ignored, as
 * Dagre's own cycle removal does), then counts the dummy nodes Dagre inserts for edges that span several ranks:
 * `dummies = sum(span - 1)`. Dagre's ordering phase builds one layer graph per rank and scans every node for
 * each, so the cost grows like `ranks * (nodes + dummies)`; that product is the result. Subgraph containers
 * are ignored (they add little compared with long edges). It is an estimate to refuse hopeless inputs, not
 * a prediction: from 100 000 units up it tracks the measured time within roughly an order of magnitude
 * (dense graphs run at about 100 000 units per second, graphs with many subgraph containers up to 6 times
 * slower); below that Dagre's fixed costs dominate and the estimate is irrelevant.
 */
export function estimateLayoutWork(g: dagre.graphlib.Graph): number {
  const nodes = g.nodes();
  const out = new Map<string, string[]>();
  for (const v of nodes) out.set(v, []);
  for (const e of g.edges()) if (e.v !== e.w) out.get(e.v)?.push(e.w);

  const state = new Map<string, 1 | 2>(); // 1 = on the DFS stack, 2 = done
  const dagOut = new Map<string, string[]>();
  const postOrder: string[] = [];
  for (const start of nodes) {
    if (state.has(start)) continue;
    state.set(start, 1);
    const stack: Array<{ v: string; i: number }> = [{ v: start, i: 0 }];
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const next = out.get(top.v)!;
      if (top.i < next.length) {
        const w = next[top.i++]!;
        const s = state.get(w);
        if (s === 1) continue; // back edge: Dagre reverses it, it adds no span
        let kept = dagOut.get(top.v);
        if (!kept) dagOut.set(top.v, (kept = []));
        kept.push(w);
        if (s === undefined) {
          state.set(w, 1);
          stack.push({ v: w, i: 0 });
        }
      } else {
        state.set(top.v, 2);
        postOrder.push(top.v);
        stack.pop();
      }
    }
  }

  const rank = new Map<string, number>();
  let ranks = 1;
  for (let k = postOrder.length - 1; k >= 0; k--) {
    const v = postOrder[k]!;
    const r = rank.get(v) ?? 0;
    rank.set(v, r);
    if (r + 1 > ranks) ranks = r + 1;
    for (const w of dagOut.get(v) ?? []) if ((rank.get(w) ?? 0) < r + 1) rank.set(w, r + 1);
  }
  let dummies = 0;
  for (const [v, ws] of dagOut) for (const w of ws) dummies += Math.max(0, rank.get(w)! - rank.get(v)! - 1);
  return ranks * dummies + nodes.length + dummies;
}
