/**
 * Intermediate AST types produced by the parser and consumed by the layout
 * engine and the OOXML translator.
 *
 * These types are the contract between the three stages of `packages/core`.
 * They carry NO knowledge of Pandoc, VS Code, or Office.js.
 */

/**
 * Node shapes supported in V1 (spec §6.1): the original bracket-syntax set
 * plus a curated subset of the v11.3+ `@{ shape: ... }` expanded shape
 * catalog (`SHAPE_ALIAS_MAP` in `parser.ts`) — only names with a faithful
 * single-preset DrawingML match; see that map's doc comment for the ones
 * intentionally left unsupported (they degrade to `rect` rather than being
 * lost, per spec §10).
 */
export type NodeShape =
  | 'rect'
  | 'roundRect'
  | 'stadium'
  | 'diamond'
  | 'cylinder'
  | 'ellipse'
  | 'hexagon'
  | 'parallelogram'
  | 'parallelogramAlt'
  | 'trapezoid'
  | 'trapezoidAlt'
  | 'subroutine'
  | 'doubleCircle'
  | 'document'
  | 'card'
  | 'delay'
  | 'triangle'
  | 'triangleInverted'
  | 'windowPane'
  | 'hourglass'
  | 'curvedTrapezoid'
  | 'bolt'
  | 'braceLeft'
  | 'braceRight'
  | 'bracePair'
  | 'crossedCircle'
  | 'filledCircle'
  | 'paperTape'
  | 'horizontalCylinder'
  | 'linedCylinder'
  | 'manualInput'
  | 'asymmetric';

/**
 * Edge line/arrowhead styles supported (spec §6.2). Named after Mermaid's own
 * operator syntax rather than a generic "style + arrow" pair, to keep the
 * parser's operator table a simple 1:1 lookup:
 *   arrow `-->` / line `---` / dotted `-.->` / dottedLine `-.-` /
 *   thick `==>` / thickLine `===` / bidirectional `<-->` /
 *   circle `--o` / cross `--x` / circleBoth `o--o` / crossBoth `x--x` /
 *   invisible `~~~` (no visible line; kept in the AST so layout still ranks
 *   on it, matching Mermaid's own behavior).
 */
export type EdgeType =
  | 'arrow'
  | 'line'
  | 'dotted'
  | 'dottedLine'
  | 'thick'
  | 'thickLine'
  | 'bidirectional'
  | 'circle'
  | 'cross'
  | 'circleBoth'
  | 'crossBoth'
  | 'invisible';

/**
 * One inline-styled text segment within a node/edge label's rich-text body
 * (Mermaid's backtick-delimited "Markdown string" convention — `**bold**`/
 * `_italic_` inside `` id["`...`"] ``).
 */
export interface LabelRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/**
 * A label's structured body: a flat sequence of styled runs and explicit
 * line breaks (Mermaid's `<br/>`/`<br>`/`<br />`), rendered by the
 * translator as one text body with a real run/line-break per token instead
 * of flattening everything to plain text. `label`/`FlowEdge.label` (below)
 * stay the flattened plain-text fallback — used for box-name attributes and
 * anywhere only a flat display string is needed, e.g. `label-runs.ts`'s
 * `labelLines()` for width/height estimation, which doesn't need to know
 * about a bold/italic span.
 */
export type LabelToken = LabelRun | { break: true };

/** A single flowchart node. */
export interface FlowNode {
  id: string;
  label: string;
  /** Structured rich-text body for `label` — see {@link LabelToken}. */
  labelRuns: LabelToken[];
  shape: NodeShape;
  /** Fill color (hex, no `#`) from `classDef`/`style`/`:::` `fill:#XXXXXX` (spec §6.3). */
  fill?: string;
  /** Border color (hex, no `#`) from `classDef`/`style`/`:::` `stroke:#XXXXXX` (spec §6.3). */
  stroke?: string;
}

/** A single directed edge between two nodes. */
export interface FlowEdge {
  from: string;
  to: string;
  type: EdgeType;
  label: string | null;
  /** Structured rich-text body for `label` — see {@link LabelToken}. `null` iff `label` is `null`. */
  labelRuns: LabelToken[] | null;
  /** Line color (hex, no `#`) from `linkStyle N stroke:#XXXXXX` (spec §6.3). */
  stroke?: string;
  /** Line width in px (Mermaid's own unit) from `linkStyle N stroke-width:Npx`;
   * converted to EMU by the translator, same as every other px value in the AST. */
  strokeWidth?: number;
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
  direction: 'TD' | 'LR' | 'BT' | 'RL';
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

/** A single point in logical pixels. */
export interface LayoutPoint {
  x: number;
  y: number;
}

/** Full layout output: node coordinates + subgraph container boxes. */
export interface LayoutResult {
  /** Node coordinates, keyed by node id. */
  nodes: Layout;
  /** Subgraph container boxes, keyed by subgraph id. */
  subgraphs: Record<string, SubgraphBox>;
  /**
   * The route Dagre computed for each edge, indexed like `Flowchart.edges`
   * (parallel array, not keyed by id — a `Flowchart` has none for edges).
   * Always at least 2 points (source, target); more when Dagre routed the
   * edge around intermediate nodes (an edge spanning more than one rank).
   * Only the translator's need for those intermediate waypoints justifies
   * exposing this — the start/end points here are Dagre's own approximate
   * attachment points, not the node-perimeter sites the translator actually
   * renders from.
   */
  edges: LayoutPoint[][];
  /**
   * Non-fatal warnings from the layout pass itself (empty in the normal
   * case) -- e.g. Dagre's cluster+order bug forcing a retry without
   * subgraph containers, see `layout()`. Mirrors `ParseResult.warnings`
   * (spec §10, "surface warnings").
   */
  warnings: string[];
}
