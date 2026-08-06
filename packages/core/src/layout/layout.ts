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
import type { Flowchart, Layout, LayoutBox, LayoutResult, SubgraphBox } from '../types.js';

/** Default node dimensions in logical pixels. */
export const NODE_WIDTH = 120;
export const NODE_HEIGHT = 60;
/** Horizontal gap between nodes in the same rank. */
const RANK_GAP = 60;
/** Vertical gap between ranks. */
const LEVEL_GAP = 80;

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

  // Normalize so the top-left of the diagram is at (0,0).
  const normalizedNodes = normalize(nodes);
  const normalizedSubgraphs = normalizeSubgraphs(subgraphs, normalizedNodes);
  return { nodes: normalizedNodes, subgraphs: normalizedSubgraphs };
}

function normalizeSubgraphs(
  subgraphs: Record<string, SubgraphBox>,
  nodes: Layout,
): Record<string, SubgraphBox> {
  let minX = Infinity;
  let minY = Infinity;
  for (const box of Object.values(nodes)) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
  }
  if (minX === Infinity) return subgraphs;
  const out: Record<string, SubgraphBox> = Object.create(null) as Record<string, SubgraphBox>;
  for (const [id, box] of Object.entries(subgraphs)) {
    out[id] = { ...box, x: box.x - minX, y: box.y - minY };
  }
  return out;
}

function normalize(layout: Layout): Layout {
  let minX = Infinity;
  let minY = Infinity;
  for (const box of Object.values(layout)) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
  }
  if (minX === Infinity) return layout;
  const out: Layout = Object.create(null) as Layout;
  for (const [id, box] of Object.entries(layout)) {
    out[id] = { ...box, x: box.x - minX, y: box.y - minY };
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
