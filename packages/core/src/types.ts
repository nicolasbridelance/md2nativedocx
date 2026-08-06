/**
 * Intermediate AST types produced by the parser and consumed by the layout
 * engine and the OOXML translator.
 *
 * These types are the contract between the three stages of `packages/core`.
 * They carry NO knowledge of Pandoc, VS Code, or Office.js.
 */

/** Node shapes supported in V1 (spec §6.1). */
export type NodeShape =
  | 'rect'
  | 'roundRect'
  | 'stadium'
  | 'diamond'
  | 'cylinder'
  | 'ellipse';

/** Edge arrow-head types supported in V1 (spec §6.2). */
export type EdgeType = 'arrow' | 'line' | 'dotted' | 'thick';

/** A single flowchart node. */
export interface FlowNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** Fill color (hex, no `#`) from `classDef fill:#XXXXXX` (spec §6.3). */
  fill?: string;
}

/** A single directed edge between two nodes. */
export interface FlowEdge {
  from: string;
  to: string;
  type: EdgeType;
  label: string | null;
}

/** A subgraph container (spec §6.1). */
export interface Subgraph {
  id: string;
  title: string;
  /** Node ids contained directly in this subgraph (not nested). */
  nodeIds: string[];
  /** Child subgraph ids contained directly in this subgraph. */
  subgraphIds: string[];
}

/** The full intermediate AST for one flowchart. */
export interface Flowchart {
  direction: 'TD' | 'LR';
  nodes: FlowNode[];
  edges: FlowEdge[];
  subgraphs: Subgraph[];
}

/** Layout box for a node, in logical pixels. */
export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Layout output: coordinates for every node. */
export type Layout = Record<string, LayoutBox>;

/** Layout box for a subgraph container (spec §6.1). */
export interface SubgraphBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Full layout output: node coordinates + subgraph container boxes. */
export interface LayoutResult {
  /** Node coordinates, keyed by node id. */
  nodes: Layout;
  /** Subgraph container boxes, keyed by subgraph id. */
  subgraphs: Record<string, SubgraphBox>;
}
