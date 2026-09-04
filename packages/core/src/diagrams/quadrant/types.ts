/**
 * Intermediate AST for a Mermaid `quadrantChart` (`docs/smartart-full-catalog-cross-mermaid.md`
 * archetype #9, "Matrice"). Deliberately separate from `../../types.ts` (the
 * flowchart AST) — a quadrant chart has no node/edge graph at all, just axis
 * labels, four quadrant labels, and scattered points. First diagram module
 * under `packages/core/src/diagrams/<type>/`, the convention proposed by
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §4 item 2.
 */

/** One data point (`Name: [x, y]`), coordinates in Mermaid's own 0–1 range. */
export interface QuadrantPoint {
  name: string;
  /** 0 = left, 1 = right. */
  x: number;
  /** 0 = bottom, 1 = top (matches quadrant-1 = top-right in Mermaid's own numbering). */
  y: number;
  /** Fill color (hex, no `#`) from `color: #RRGGBB`, if given. */
  color?: string;
}

/** The four quadrant labels, indexed 1–4 exactly like Mermaid's own
 * `quadrant-1`..`quadrant-4` statements (1 = top-right, 2 = top-left,
 * 3 = bottom-left, 4 = bottom-right). `undefined` when not given. */
export interface QuadrantLabels {
  1?: string;
  2?: string;
  3?: string;
  4?: string;
}

export interface QuadrantAxis {
  /** Label at the low end (left for x, bottom for y). */
  low: string;
  /** Label at the high end (right for x, top for y); `undefined` for the
   * one-sided `x-axis <text>` / `y-axis <text>` form. */
  high?: string;
}

export interface QuadrantChart {
  title?: string;
  xAxis?: QuadrantAxis;
  yAxis?: QuadrantAxis;
  quadrants: QuadrantLabels;
  points: QuadrantPoint[];
}
