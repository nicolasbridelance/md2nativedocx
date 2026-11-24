/**
 * Intermediate AST for a Mermaid `architecture-beta` diagram, as the grammar of Mermaid 12.3 reads it
 * (`architecture.langium`): groups, services and junctions, each optionally `in` a group; edges between
 * two ports (`L`/`R`/`T`/`B`), with an optional arrowhead on either end, an optional `-[label]-`, and a
 * `{group}` marker that makes an end start on the frame of the node's group; `align row|column` hints.
 */

/** A port: the side of a node an edge leaves or enters by. */
export type ArchitectureSide = 'L' | 'R' | 'T' | 'B';
export type ArchitectureNodeKind = 'service' | 'group' | 'junction';

export interface ArchitectureNode {
  id: string;
  kind: ArchitectureNodeKind;
  /** Icon name in `(…)`: `cloud`, `database`, `disk`, `internet`, `server`, or a pack icon (`logos:aws-s3`). */
  icon?: string;
  /** A service's text in quotes, drawn inside a blank icon (`service a"API"[Gateway]`); exclusive with `icon`. */
  iconText?: string;
  title?: string;
  /** The `in <groupId>` group this node belongs to, if any (always a declared group). */
  parent?: string;
}

export interface ArchitectureEdge {
  from: string;
  fromSide: ArchitectureSide;
  to: string;
  toSide: ArchitectureSide;
  arrowAtFrom: boolean;
  arrowAtTo: boolean;
  /** `from{group}`: this end starts on the frame of `from`'s group rather than on `from` itself. */
  fromGroup?: boolean;
  /** `to{group}`: this end ends on the frame of `to`'s group. */
  toGroup?: boolean;
  /** The `-[label]-` text, if any. */
  label?: string;
}

/** `align row a b c` (left to right, one row) or `align column a b c` (top to bottom, one column). */
export interface ArchitectureAlignment {
  direction: 'row' | 'column';
  /** Services or junctions, in order; at least two. */
  members: string[];
}

export interface ArchitectureDiagram {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  alignments?: ArchitectureAlignment[];
  /** `title …`: read, not drawn (Mermaid does not draw it either); names the drawing in Word. */
  title?: string;
  accTitle?: string;
  accDescr?: string;
}
