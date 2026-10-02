/**
 * Intermediate AST for a Mermaid `radar-beta` chart (grammar verified against
 * `mermaid-js/mermaid`'s `docs/syntax/radar.md`, 2026-10-02).
 */

export interface RadarAxis {
  id: string;
  /** Display label; falls back to the id. */
  label: string;
}

export interface RadarCurve {
  id: string;
  label: string;
  /** One value per axis, in axis order (keyed curves are already re-ordered; gaps filled with `min`). */
  values: number[];
}

export type RadarGraticule = 'circle' | 'polygon';

export interface RadarChart {
  title?: string;
  axes: RadarAxis[];
  curves: RadarCurve[];
  showLegend: boolean;
  /** Scale minimum (default 0). */
  min: number;
  /** Scale maximum (default: the largest curve value; always > `min`). */
  max: number;
  graticule: RadarGraticule;
  /** Number of concentric rings, 1..20 (default 5). */
  ticks: number;
}
