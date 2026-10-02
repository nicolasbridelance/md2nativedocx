/**
 * Intermediate AST for a Mermaid `journey` (user journey) diagram (grammar
 * verified against `mermaid-js/mermaid`'s `docs/syntax/userJourney.md`).
 */

export interface JourneyTask {
  label: string;
  /** Satisfaction score, clamped to 1..5. */
  score: number;
  /** Actor names participating in this task (may be empty). */
  actors: string[];
  /** Index into {@link JourneyChart.sections}, or -1 for tasks before any `section`. */
  sectionIndex: number;
}

export interface JourneyChart {
  title?: string;
  sections: string[];
  tasks: JourneyTask[];
  /** Distinct actors in first-appearance order. */
  actors: string[];
}
