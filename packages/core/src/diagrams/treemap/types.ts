/**
 * Intermediate AST for a Mermaid `treemap-beta` diagram (grammar verified
 * against `mermaid-js/mermaid`'s `docs/syntax/treemap.md`, 2026-10-02).
 */

export interface TreemapNode {
  label: string;
  /** Own value for a leaf (`"Name": 12`); sections get theirs from their children. */
  value?: number;
  children: TreemapNode[];
  /** `:::class` reference, resolved against {@link TreemapDiagram.classDefs}. */
  className?: string;
}

/** The subset of a `classDef` this translator honors (hex colors, no `#`). */
export interface TreemapStyle {
  fill?: string;
  color?: string;
  stroke?: string;
}

export interface TreemapDiagram {
  roots: TreemapNode[];
  classDefs: Record<string, TreemapStyle>;
}
