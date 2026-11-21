/**
 * The Gantt time axis: where a date falls on the chart, and which dates get a tick.
 *
 * The scale is linear in time, {@link BASE_PX_PER_DAY} pixels per day, so the chart grows with the
 * span the way Mermaid's grows with the page; between {@link MIN_CHART_WIDTH} and
 * {@link MAX_CHART_WIDTH} the width follows the span, beyond that the span is fitted into the bound.
 * The upper bound keeps a long project (or the decades of a timeline drawn as a Gantt) from being a
 * huge drawing that Word then shrinks until the labels are unreadable.
 *
 * Ticks follow the `tickInterval` directive when there is one (aligned like D3's `every`, which
 * Mermaid uses), otherwise the smallest step of {@link AUTO_STEPS} that leaves
 * {@link MIN_TICK_SPACING} pixels between two labels. Weekly ticks fall on `weekday` when it is
 * given, otherwise on the chart's first day (more readable than D3's Sunday). Labels use
 * `axisFormat` when given, otherwise a format suited to the step.
 */

import type { GanttTickInterval } from './types.js';
import {
  addDays,
  formatAxisDate,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  startOfDay,
  WEEKDAY_NAMES,
  type WeekdayName,
} from './date-utils.js';

export const BASE_PX_PER_DAY = 22;
export const MIN_CHART_WIDTH = 220;
/** 40 days at {@link BASE_PX_PER_DAY}. */
export const MAX_CHART_WIDTH = 880;
/** Room for one label: `2026-01` or `17:49` at the axis font size (about 40 px), with a gap. */
const MIN_TICK_SPACING = 50;
/** Mermaid's own guard against a `tickInterval` far too small for the span. */
const MAX_TICK_COUNT = 10_000;

export interface TimeScale {
  /** First and last instant of the chart, in milliseconds. */
  t0: number;
  t1: number;
  /** Width of the time area, in pixels. */
  width: number;
  /** Pixels per millisecond. */
  pxPerMs: number;
}

/** The scale for a chart running from `t0` to `t1` (an empty span counts as one day). */
export function timeScale(t0: Date, t1: Date): TimeScale {
  const start = t0.getTime();
  const end = t1.getTime() > start ? t1.getTime() : start + MS_PER_DAY;
  const natural = ((end - start) / MS_PER_DAY) * BASE_PX_PER_DAY;
  const width = Math.min(MAX_CHART_WIDTH, Math.max(MIN_CHART_WIDTH, natural));
  return { t0: start, t1: end, width, pxPerMs: width / (end - start) };
}

/** Horizontal position of `date` in the time area, in pixels from its left edge. */
export function xOf(scale: TimeScale, date: Date | number): number {
  return ((typeof date === 'number' ? date : date.getTime()) - scale.t0) * scale.pxPerMs;
}

type StepUnit = GanttTickInterval['unit'] | 'year';

interface Step {
  every: number;
  unit: StepUnit;
}

const UNIT_MS: Record<Exclude<StepUnit, 'month' | 'year'>, number> = {
  millisecond: 1,
  second: MS_PER_SECOND,
  minute: MS_PER_MINUTE,
  hour: MS_PER_HOUR,
  day: MS_PER_DAY,
  week: 7 * MS_PER_DAY,
};

/** Approximate length of a step, to compare it with the space it gets. */
function stepMs({ every, unit }: Step): number {
  if (unit === 'month') return every * 30.44 * MS_PER_DAY;
  if (unit === 'year') return every * 365.25 * MS_PER_DAY;
  return every * UNIT_MS[unit];
}

/** The steps automatic ticks choose from, smallest first. */
const AUTO_STEPS: readonly Step[] = [
  ...[1, 2, 5, 10, 15, 20, 30].map((every) => ({ every, unit: 'second' as const })),
  ...[1, 2, 5, 10, 15, 20, 30].map((every) => ({ every, unit: 'minute' as const })),
  ...[1, 3, 6, 12].map((every) => ({ every, unit: 'hour' as const })),
  ...[1, 2].map((every) => ({ every, unit: 'day' as const })),
  { every: 1, unit: 'week' },
  ...[1, 3, 6].map((every) => ({ every, unit: 'month' as const })),
  ...[1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].map((every) => ({ every, unit: 'year' as const })),
];

function defaultLabelFormat(unit: StepUnit): string {
  switch (unit) {
    case 'millisecond':
      return '%H:%M:%S.%L';
    case 'second':
      return '%H:%M:%S';
    case 'minute':
    case 'hour':
      return '%H:%M';
    case 'day':
    case 'week':
      return '%m-%d';
    case 'month':
      return '%Y-%m';
    case 'year':
      return '%Y';
  }
}

/** The first tick at or after `t0` for `step`, aligned as D3's `every` aligns it. */
function firstTick(t0: number, step: Step, weekday: WeekdayName | undefined): Date {
  const date = new Date(t0);
  switch (step.unit) {
    case 'millisecond':
    case 'second':
    case 'minute':
    case 'hour': {
      // Multiples of the step within the day (`:00`, `:05`, `:10`… for five minutes).
      const size = step.every * UNIT_MS[step.unit];
      const day = startOfDay(date).getTime();
      return new Date(day + Math.ceil((t0 - day) / size) * size);
    }
    case 'day': {
      // Days 1, 1 + n, 1 + 2n… of the month.
      let d = startOfDay(date);
      if (d.getTime() < t0) d = addDays(d, 1);
      while ((d.getUTCDate() - 1) % step.every !== 0) d = addDays(d, 1);
      return d;
    }
    case 'week': {
      if (weekday === undefined) return date;
      let d = startOfDay(date);
      if (d.getTime() < t0) d = addDays(d, 1);
      while (d.getUTCDay() !== WEEKDAY_NAMES.indexOf(weekday)) d = addDays(d, 1);
      return d;
    }
    case 'month': {
      const d = new Date(Date.UTC(2000, date.getUTCMonth(), 1));
      d.setUTCFullYear(date.getUTCFullYear());
      if (d.getTime() < t0) d.setUTCMonth(d.getUTCMonth() + 1);
      while (d.getUTCMonth() % step.every !== 0) d.setUTCMonth(d.getUTCMonth() + 1);
      return d;
    }
    case 'year': {
      const d = new Date(Date.UTC(2000, 0, 1));
      let year = date.getUTCFullYear();
      d.setUTCFullYear(year);
      if (d.getTime() < t0) year++;
      year = Math.ceil(year / step.every) * step.every;
      d.setUTCFullYear(year);
      return d;
    }
  }
}

function nextTick(date: Date, step: Step): Date {
  const next = new Date(date.getTime());
  if (step.unit === 'month') next.setUTCMonth(next.getUTCMonth() + step.every);
  else if (step.unit === 'year') next.setUTCFullYear(next.getUTCFullYear() + step.every);
  else next.setTime(next.getTime() + step.every * UNIT_MS[step.unit]);
  return next;
}

export interface AxisOptions {
  tickInterval?: GanttTickInterval;
  weekday?: WeekdayName;
  axisFormat?: string;
}

/** The ticks of `scale`, each with its label. */
export function buildTicks(scale: TimeScale, options: AxisOptions = {}): { date: Date; label: string }[] {
  let step: Step | undefined;
  const asked = options.tickInterval;
  if (asked && (scale.t1 - scale.t0) / stepMs(asked) <= MAX_TICK_COUNT) step = asked;
  step ??= AUTO_STEPS.find((s) => stepMs(s) * scale.pxPerMs >= MIN_TICK_SPACING) ?? AUTO_STEPS[AUTO_STEPS.length - 1]!;

  const format = options.axisFormat ?? defaultLabelFormat(step.unit);
  const ticks: { date: Date; label: string }[] = [];
  for (let d = firstTick(scale.t0, step, options.weekday); d.getTime() <= scale.t1; d = nextTick(d, step)) {
    ticks.push({ date: d, label: formatAxisDate(d, format) });
  }
  return ticks;
}
