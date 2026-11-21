/**
 * Intermediate AST for a Mermaid `gantt` diagram (Family D per
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md`, option (b): OOXML shapes on a
 * calendar grid, no `c:chart` — see `docs/adr/spikes/spike-gantt-parser/spike.md` for
 * why option (a) and a runtime dependency on `mermaid` npm were both rejected).
 *
 * Dates are resolved to concrete `Date`s at parse time (dependency chains via
 * `after taskX`, duration arithmetic, weekend/`excludes` stretching all happen in
 * `parser.ts`), and so is the list of days to shade — the translator only ever positions
 * already-resolved dates on an axis, exactly like `../quadrant/translator.ts` only positions
 * already-resolved `[x, y]` points. The optional fields carry the axis directives; a chart built
 * without them gets the translator's defaults.
 */

import type { WeekdayName } from './date-utils.js';

/** `vert` is Mermaid's vertical marker line: a dated line across the chart, not a row. */
export type GanttTag = 'active' | 'done' | 'crit' | 'milestone' | 'vert';

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

/** A `tickInterval` directive: one tick every `every` `unit`s. */
export interface GanttTickInterval {
  every: number;
  unit: 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month';
}

export interface GanttChart {
  title?: string;
  /** Declared section names, in first-seen order — a task's own `section` field is
   * the source of truth for grouping; this is only for rendering an empty section
   * (declared but given no tasks) if that ever matters to a future caller. */
  sections: string[];
  tasks: GanttTask[];
  /** `axisFormat`: a D3 `timeFormat` specifier for the axis labels (`%H:%M`). */
  axisFormat?: string;
  /** `tickInterval`, when valid. */
  tickInterval?: GanttTickInterval;
  /** `weekday`: the day weekly ticks fall on. Without it, weekly ticks start at the first task. */
  weekday?: WeekdayName;
  /**
   * Midnight (UTC) of each day to shade within the chart's span: the days `excludes` removes
   * (after `includes` and `weekend`) when there is an `excludes`, otherwise the weekend, which is
   * shaded only to help reading. Empty past five years, as Mermaid. When absent, the translator
   * shades Saturdays and Sundays.
   */
  shadedDays?: Date[];
}
