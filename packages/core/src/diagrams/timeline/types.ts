/**
 * Intermediate AST for a Mermaid `timeline` diagram (grammar verified against
 * `mermaid-js/mermaid`'s `docs/syntax/timeline.md`, 2026-10-02).
 */

/** One time period and the events listed under it (top to bottom). */
export interface TimelinePeriod {
  /** Period text; may contain `\n` from `<br>`. */
  label: string;
  events: string[];
  /** Index into {@link TimelineChart.sections}, or -1 for the default (section-less) group. */
  sectionIndex: number;
}

export interface TimelineChart {
  title?: string;
  /** Section (age) names in declaration order. */
  sections: string[];
  periods: TimelinePeriod[];
}
