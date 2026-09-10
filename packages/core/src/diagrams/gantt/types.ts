/**
 * Intermediate AST for a Mermaid `gantt` diagram (Family D per
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md`, option (b): OOXML shapes on a
 * calendar grid, no `c:chart` — see `docs/adr/spikes/spike-gantt-parser/spike.md` for
 * why option (a) and a runtime dependency on `mermaid` npm were both rejected).
 *
 * Dates are resolved to concrete `Date`s at parse time (dependency chains via
 * `after taskX`, duration arithmetic, weekend/`excludes` stretching all happen in
 * `parser.ts`) — the translator only ever positions already-resolved dates on an axis,
 * exactly like `../quadrant/translator.ts` only positions already-resolved `[x, y]`
 * points.
 */

export type GanttTag = 'active' | 'done' | 'crit' | 'milestone';

export interface GanttTask {
  id: string;
  text: string;
  /** `undefined` before the first `section` line, matching Mermaid's own
   * `currentSection = ''` default. */
  section?: string;
  start: Date;
  end: Date;
  tags: GanttTag[];
}

export interface GanttChart {
  title?: string;
  /** Declared section names, in first-seen order — a task's own `section` field is
   * the source of truth for grouping; this is only for rendering an empty section
   * (declared but given no tasks) if that ever matters to a future caller. */
  sections: string[];
  tasks: GanttTask[];
}
