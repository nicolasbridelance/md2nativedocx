/**
 * Size limits for everything that goes through Dagre.
 *
 * Dagre's cost grows much faster than the input: measured on a dense flowchart (two edges per node),
 * 100 nodes take 1.6 s, 300 take 21 s and 500 take 99 s, and a 3 000-node chain overflows the stack.
 * `core` accepts untrusted text, and an MCP server or any other host would hand it to anyone, so every
 * Dagre call goes through {@link layoutWithinLimits}, which refuses an oversized graph before the layout
 * starts instead of letting it run for minutes or crash with a raw `RangeError`.
 *
 * The caps bound the worst case, they do not make it cheap: the cost depends on the structure, not only the
 * size. A sparse 413-node (subgraphs included), 690-edge report lays out in 0.7 s; a random dense graph at the defaults can still
 * take tens of seconds. A host that must answer within a deadline runs the conversion under its own timeout.
 */

import dagre from 'dagre';

/** Default cap on nodes, subgraph containers included. Override with {@link GraphLimits.maxNodes}. */
export const DEFAULT_MAX_NODES = 500;
/** Default cap on edges. Override with {@link GraphLimits.maxEdges}. */
export const DEFAULT_MAX_EDGES = 800;

/** Caps on the graph handed to the layout engine. Absent fields use the defaults above. */
export interface GraphLimits {
  /** Maximum number of nodes, subgraph containers included (default {@link DEFAULT_MAX_NODES}). */
  maxNodes?: number;
  /** Maximum number of edges (default {@link DEFAULT_MAX_EDGES}). */
  maxEdges?: number;
}

/** What went over the limit. */
export type DiagramLimit = 'nodes' | 'edges' | 'source';

/**
 * A diagram bigger than the configured limits: it was not laid out. The message is safe to show to a
 * user; `limit`, `actual` and `max` say which cap was hit and by how much, so a caller can raise it.
 */
export class DiagramTooLargeError extends Error {
  readonly limit: DiagramLimit;
  readonly actual: number;
  readonly max: number;

  constructor(limit: DiagramLimit, actual: number, max: number) {
    const what = limit === 'source' ? 'characters of source' : limit;
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
  dagre.layout(g);
}

/** The check alone, for a caller that lays the graph out more than once. */
export function assertWithinLimits(g: dagre.graphlib.Graph, limits: GraphLimits = {}): void {
  const maxNodes = limits.maxNodes ?? DEFAULT_MAX_NODES;
  const maxEdges = limits.maxEdges ?? DEFAULT_MAX_EDGES;
  if (g.nodeCount() > maxNodes) throw new DiagramTooLargeError('nodes', g.nodeCount(), maxNodes);
  if (g.edgeCount() > maxEdges) throw new DiagramTooLargeError('edges', g.edgeCount(), maxEdges);
}
