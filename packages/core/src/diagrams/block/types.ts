/**
 * Intermediate AST for a Mermaid `block-beta` diagram (grammar checked against
 * `mermaid-js/mermaid`'s `docs/syntax/block.md`).
 */

export type BlockShape = 'rect' | 'round' | 'stadium' | 'circle' | 'diamond';

/** Explicit colors from `style` / `classDef` (validated hex only). */
export interface BlockStyle {
  fill?: string;
  stroke?: string;
  color?: string;
}

/** One cell of a grid: a leaf block, an empty `space`, or a nested group. */
export interface BlockCell {
  kind: 'block' | 'space' | 'group';
  /** Block / group id; absent for `space` and anonymous groups. */
  id?: string;
  label: string;
  shape: BlockShape;
  /** Number of grid columns occupied (>= 1). */
  span: number;
  style: BlockStyle;
  /** Group only: its own column count (undefined = all children on one row). */
  columns?: number;
  children: BlockCell[];
}

export interface BlockLink {
  from: string;
  to: string;
  label?: string;
  /** `---` links carry no arrowhead. */
  arrow: boolean;
  dashed: boolean;
}

export interface BlockDiagram {
  /** Root grid. */
  root: BlockCell;
  links: BlockLink[];
}
