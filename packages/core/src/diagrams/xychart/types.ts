/**
 * Intermediate AST for a Mermaid `xychart-beta` (grammar verified against
 * `mermaid-js/mermaid`'s `docs/syntax/xyChart.md`, 2026-10-02).
 */

export interface XyAxisX {
  title?: string;
  /** Category labels (`x-axis [a, b, c]`). Mutually exclusive with `min`/`max`. */
  categories?: string[];
  /** Numeric range (`x-axis "t" 0 --> 10`). */
  min?: number;
  max?: number;
}

export interface XyAxisY {
  title?: string;
  /** Explicit range; both set together, otherwise derived from the data. */
  min?: number;
  max?: number;
}

export interface XySeries {
  kind: 'bar' | 'line';
  name?: string;
  values: number[];
  /** Per-point labels (`line [540 "label"]`), same length as `values`. */
  labels: Array<string | undefined>;
}

export interface XyChart {
  horizontal: boolean;
  title?: string;
  xAxis: XyAxisX;
  yAxis: XyAxisY;
  series: XySeries[];
}
