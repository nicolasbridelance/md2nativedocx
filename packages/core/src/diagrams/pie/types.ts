/**
 * Intermediate AST for a Mermaid `pie` chart (grammar verified against
 * `mermaid-js/mermaid`'s `docs/syntax/pie.md`, 2026-10-02).
 */

/** One `"label" : value` data row, in declaration order (slices run clockwise from 12 o'clock). */
export interface PieSlice {
  label: string;
  /** Strictly positive, per the Mermaid grammar. */
  value: number;
}

export interface PieChart {
  title?: string;
  /** `showData` keyword: append the raw value after each legend label. */
  showData: boolean;
  slices: PieSlice[];
}
