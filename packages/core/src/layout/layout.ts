/**
 * Layered graph layout engine producing pixel coordinates.
 *
 * V1 delegates to **Dagre** (the same engine Mermaid uses internally, spec §5.2,
 * ADR 0001). This is a thin, pure wrapper: AST -> Dagre graph -> pixel
 * coordinates. Graphviz-WASM remains an optional future fallback for dense
 * graphs (>25 nodes) via the `engine` option, without changing the output
 * contract (pixel coordinates).
 *
 * This module is a pure function from AST to coordinates. It has no knowledge
 * of OOXML.
 */

import dagre from 'dagre';
import type {
  Flowchart,
  Layout,
  LayoutBox,
  LayoutPoint,
  LayoutResult,
  Subgraph,
  SubgraphBox,
} from '../types.js';

/** Default node dimensions in logical pixels. */
export const NODE_WIDTH = 120;
export const NODE_HEIGHT = 60;
/** Horizontal gap between nodes in the same rank. */
const RANK_GAP = 60;
/** Vertical gap between ranks. */
const LEVEL_GAP = 80;
/**
 * Vertical space reserved at the top of every subgraph box for its title bar.
 * Dagre sizes a cluster tightly around its child nodes with no allowance for
 * a label, so without this a subgraph's title (drawn by the translator at the
 * top of the box) overlaps the first contained node. Shared with
 * `ooxml-translator.ts`, which sizes the title textbox to this same height
 * (in EMU) — a single source of truth so the two can't drift apart.
 */
export const SUBGRAPH_TITLE_HEIGHT = 24;

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  /** Layout engine. `dagre` is the default; `graphviz` is reserved for future use. */
  engine?: 'dagre' | 'graphviz';
}

/**
 * Compute pixel coordinates for every node and subgraph in the flowchart.
 * Returns a {@link LayoutResult} with node boxes and subgraph container boxes.
 */
export function layout(flowchart: Flowchart, options: LayoutOptions = {}): LayoutResult {
  const nodeWidth = options.nodeWidth ?? NODE_WIDTH;
  const nodeHeight = options.nodeHeight ?? NODE_HEIGHT;
  const engine = options.engine ?? 'dagre';

  if (engine === 'graphviz') {
    // Graphviz-WASM is a reserved future option (ADR 0001). Not wired up yet.
    throw new Error('Layout engine "graphviz" is not implemented yet (see ADR 0001).');
  }

  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({
    rankdir: flowchart.direction === 'LR' ? 'LR' : 'TD',
    nodesep: RANK_GAP,
    ranksep: LEVEL_GAP,
    marginx: 0,
    marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of flowchart.nodes) {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  }
  for (const edge of flowchart.edges) {
    if (g.hasNode(edge.from) && g.hasNode(edge.to)) {
      g.setEdge(edge.from, edge.to);
    }
  }

  // Register subgraphs as Dagre clusters and assign their nodes to them.
  for (const sg of flowchart.subgraphs) {
    g.setNode(sg.id, { width: 0, height: 0, cluster: true });
    for (const nodeId of sg.nodeIds) {
      if (g.hasNode(nodeId)) g.setParent(nodeId, sg.id);
    }
    for (const childId of sg.subgraphIds) {
      if (g.hasNode(childId)) g.setParent(childId, sg.id);
    }
  }

  dagre.layout(g);

  // Use a null-prototype object so hostile node ids like `__proto__` or
  // `constructor` cannot collide with Object.prototype members (prototype
  // pollution). This is a security boundary: node ids come from untrusted text.
  const nodes: Layout = Object.create(null) as Layout;
  for (const node of flowchart.nodes) {
    const n = g.node(node.id);
    // Dagre positions by center; convert to top-left origin.
    nodes[node.id] = {
      x: n.x - n.width / 2,
      y: n.y - n.height / 2,
      width: n.width,
      height: n.height,
    };
  }

  // Subgraph container boxes from Dagre cluster geometry.
  const subgraphs: Record<string, SubgraphBox> = Object.create(null) as Record<string, SubgraphBox>;
  for (const sg of flowchart.subgraphs) {
    const c = g.node(sg.id);
    if (c) {
      subgraphs[sg.id] = {
        x: c.x - c.width / 2,
        y: c.y - c.height / 2,
        width: c.width,
        height: c.height,
      };
    }
  }

  // The route Dagre computed for each edge (>2 points when it routed around
  // an intermediate rank's nodes — see LayoutPoint's doc comment). Captured
  // in the same raw coordinate space as `nodes`/`subgraphs` above, before
  // normalization.
  const edges: LayoutPoint[][] = flowchart.edges.map((edge) => {
    const e = g.edge({ v: edge.from, w: edge.to });
    return e ? e.points.map((p) => ({ x: p.x, y: p.y })) : [];
  });

  // Normalize so the top-left of the diagram is at (0,0), using ONE offset
  // derived from nodes AND subgraph boxes and applied consistently to both
  // (plus edges). A subgraph's cluster box is not just the tight bbox of its
  // children — Dagre pads it with its own cluster margin — so it can extend
  // further left/up than every node combined; computing the offset from
  // nodes alone (an earlier version of this function did, matching the
  // original pre-refactor code's behaviour for nodes) left such a subgraph at
  // a negative x/y, which breaks rendering entirely (verified empirically:
  // LibreOffice renders nothing at all for a drawing with a negative-origin
  // child, no partial/degraded output). (That earlier version also inherited
  // a second, previously-latent bug: subgraphs were normalized using the
  // *already-normalized* nodes' minX/minY, i.e. always 0, so they were never
  // actually shifted at all — invisible only because Dagre's raw subgraph
  // origin happened to already be non-negative in every shape tried so far.)
  const [minX, minY] = boundsOrigin(nodes, subgraphs);
  const normalizedNodes = shiftLayout(nodes, minX, minY);
  const normalizedSubgraphs = shiftSubgraphs(subgraphs, minX, minY);
  const normalizedEdges = edges.map((points) => points.map((p) => ({ x: p.x - minX, y: p.y - minY })));

  // Reserve title-bar space in every subgraph box (spec §6.1) — see
  // reserveSubgraphTitleSpace for why this is safe to do once per subgraph,
  // independent of nesting order. Edge routes are NOT shifted by this pass:
  // the translator always re-derives an edge's actual start/end from the
  // (already title-shifted) node boxes, so only an edge that both crosses a
  // subgraph boundary AND routes around an intermediate rank could show a
  // few-pixel seam at the boundary — accepted for now as a minor cosmetic
  // gap, not a correctness one.
  reserveSubgraphTitleSpace(flowchart, normalizedNodes, normalizedSubgraphs);

  return { nodes: normalizedNodes, subgraphs: normalizedSubgraphs, edges: normalizedEdges };
}

/**
 * The (minX, minY) across every node's AND every subgraph's top-left corner,
 * or (0, 0) if there are none. Must include subgraphs — see the caller.
 */
function boundsOrigin(nodes: Layout, subgraphs: Record<string, SubgraphBox>): [number, number] {
  let minX = Infinity;
  let minY = Infinity;
  for (const box of Object.values(nodes)) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
  }
  for (const box of Object.values(subgraphs)) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
  }
  return minX === Infinity ? [0, 0] : [minX, minY];
}

/**
 * Collect every node id transitively contained in a subgraph (direct members
 * plus members of any nested subgraph, at any depth).
 */
function descendantNodeIds(sg: Subgraph, flowchart: Flowchart): string[] {
  const ids = [...sg.nodeIds];
  for (const childId of sg.subgraphIds) {
    const child = flowchart.subgraphs.find((s) => s.id === childId);
    if (child) ids.push(...descendantNodeIds(child, flowchart));
  }
  return ids;
}

/**
 * Collect every subgraph id transitively nested inside a subgraph (its direct
 * children plus their own children, at any depth) — not including `sg`
 * itself.
 */
function descendantSubgraphIds(sg: Subgraph, flowchart: Flowchart): string[] {
  const ids: string[] = [];
  for (const childId of sg.subgraphIds) {
    ids.push(childId);
    const child = flowchart.subgraphs.find((s) => s.id === childId);
    if (child) ids.push(...descendantSubgraphIds(child, flowchart));
  }
  return ids;
}

/**
 * Grow every subgraph's box by `SUBGRAPH_TITLE_HEIGHT` and push its
 * descendants down by the same amount, mutating `nodes`/`subgraphs` in place.
 *
 * Order does not matter: each subgraph's adjustment only reads the flowchart's
 * static containment tree (`nodeIds`/`subgraphIds`), never another
 * subgraph's already-mutated box, so processing subgraphs in any order (or in
 * parallel, conceptually) yields the same final, self-consistent result. A
 * node nested two levels deep ends up shifted down by two title heights, one
 * per ancestor subgraph — correct, since there are two title bars stacked
 * above it.
 */
function reserveSubgraphTitleSpace(
  flowchart: Flowchart,
  nodes: Layout,
  subgraphs: Record<string, SubgraphBox>,
): void {
  for (const sg of flowchart.subgraphs) {
    const box = subgraphs[sg.id];
    if (!box) continue;

    for (const nodeId of descendantNodeIds(sg, flowchart)) {
      const n = nodes[nodeId];
      if (n) n.y += SUBGRAPH_TITLE_HEIGHT;
    }
    for (const childId of descendantSubgraphIds(sg, flowchart)) {
      const childBox = subgraphs[childId];
      if (childBox) childBox.y += SUBGRAPH_TITLE_HEIGHT;
    }
    box.height += SUBGRAPH_TITLE_HEIGHT;
  }
}

function shiftSubgraphs(
  subgraphs: Record<string, SubgraphBox>,
  offsetX: number,
  offsetY: number,
): Record<string, SubgraphBox> {
  const out: Record<string, SubgraphBox> = Object.create(null) as Record<string, SubgraphBox>;
  for (const [id, box] of Object.entries(subgraphs)) {
    out[id] = { ...box, x: box.x - offsetX, y: box.y - offsetY };
  }
  return out;
}

function shiftLayout(layout: Layout, offsetX: number, offsetY: number): Layout {
  const out: Layout = Object.create(null) as Layout;
  for (const [id, box] of Object.entries(layout)) {
    out[id] = { ...box, x: box.x - offsetX, y: box.y - offsetY };
  }
  return out;
}

/** Compute the total bounding box of a layout, in pixels. */
export function boundingBox(layout: Layout): LayoutBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of Object.values(layout)) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
