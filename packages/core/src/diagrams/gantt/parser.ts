/**
 * Parser for Mermaid `gantt` (grammar cross-checked against the vendored reference at
 * `docs/adr/spikes/spike-gantt-parser/reference/mermaid-gantt-source/gantt.jison` +
 * `ganttDb.js`, MIT, `mermaid-js/mermaid@12.0.0`, and against the `ganttDb`/`ganttRenderer` of
 * the `mermaid@12.3.0` the differential test runs — read as a spec, not imported; see that spike's
 * `spike.md` for why a runtime dependency on `mermaid` npm was rejected).
 * Line-oriented, same forgiving convention as `../quadrant/parser.ts`: an unrecognized
 * or unresolvable line is skipped with a warning rather than throwing.
 *
 * Three steps, as in Mermaid, whose directives hold for the whole diagram wherever they stand:
 * 1. read every line: directives, sections, task lines kept as raw text;
 * 2. read each task's data with the final `dateFormat`: optional leading tags
 *    (`active`/`done`/`crit`/`milestone`/`vert`), then `end`, `start, end` or `id, start, end`;
 *    a start is a date, `after <id...>` or omitted (chains from the previous task's end, Mermaid's
 *    global — not per-section — `lastTaskID` chaining); an end is a date, `until <id...>` or a
 *    `<n><ms|s|m|h|d|w|M|y>` duration;
 * 3. resolve the dates in passes until nothing changes, so `after`/`until` may name a task declared
 *    further down (Mermaid recompiles its tasks the same way, up to eleven passes); a task still
 *    unresolved then is part of a reference cycle and is dropped with a warning.
 *
 * Exclusions follow `ganttDb.js`'s `checkTaskDates`: when `excludes` is set, a task's end is pushed
 * one day further for every excluded day after its start, unless the end was written as a
 * `YYYY-MM-DD` date (Mermaid's `manualEndTime`, read with that fixed format whatever `dateFormat`
 * says). `includes` dates are never excluded; `weekend friday` makes `weekends` mean Friday and
 * Saturday. `inclusiveEndDates` adds a day to an end written as a date.
 *
 * Axis directives (`axisFormat`, `tickInterval`, `weekday`) are carried to the translator.
 * `topAxis` needs nothing: the axis is always drawn at the top. `todayMarker off` needs nothing
 * either; any other `todayMarker` is reported, since a document must not depend on the day it is
 * generated. Still unsupported, each reported: `click` (no OOXML equivalent), `accTitle`/
 * `accDescription`.
 *
 * **Deliberate deviations from Mermaid**, both for determinism (Mermaid uses wall-clock "today"):
 * an `after` naming no known task chains from the previous task, with a warning; an `until` naming
 * no known task drops the task, with a warning; a `dateFormat` with no date in it (`HH:mm`) puts the
 * times on 1970-01-01 (dayjs: on today). A start written as a number under `dateFormat X`
 * is read as seconds, like the end (Mermaid reads that start as milliseconds, its end as seconds).
 * A trailing `%%` comment in a task's data is ignored (Mermaid reads it as part of the data, which
 * makes the duration invalid).
 */

import type { GanttChart, GanttTag, GanttTask, GanttTickInterval } from './types.js';
import {
  addDays,
  addDuration,
  isExcludedDay,
  isWeekend,
  parseDateStrict,
  startOfDay,
  unsupportedAxisDirectives,
  WEEKDAY_NAMES,
  type DurationUnit,
  type ExclusionRules,
  type WeekdayName,
  type WeekendStart,
} from './date-utils.js';

export interface GanttParseResult {
  ast: GanttChart;
  warnings: string[];
}

const TAGS: readonly GanttTag[] = ['active', 'done', 'crit', 'milestone', 'vert'];
// `[\d.]+` rather than `\d+(?:\.\d+)?` — same dodge as `../quadrant/parser.ts`'s
// `POINT_TAIL` for eslint-plugin-security's detect-unsafe-regex heuristic (no real
// backtracking hazard either way, single bounded run, but this form doesn't trip it).
// Slightly more permissive (e.g. "1.2.3d"), harmless: `Number(...)` below rejects it.
const DURATION_RE = /^([\d.]+)(ms|[Mdhmswy])$/;
const AFTER_RE = /^after\s+(.+)$/i;
const UNTIL_RE = /^until\s+(.+)$/i;
const ISO_DATE = 'YYYY-MM-DD';
const TICK_INTERVAL_RE = /^([1-9]\d*)(millisecond|second|minute|hour|day|week|month)$/;

/** Mermaid stops drawing excluded days past five years (a performance guard); so does this. */
const MAX_SHADED_SPAN_YEARS = 5;
/** Mermaid's own bound on how far `excludes` may push one task (`fixTaskDates`). */
const MAX_EXCLUDED_DAYS = 10_000;

/** Task data ends at `#`, `;` (Mermaid's `taskData` token) or a `%%` comment. */
function stripInlineComment(text: string): string {
  const idx = text.search(/[#;]|%%/);
  return idx === -1 ? text : text.slice(0, idx);
}

function mergeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((t) => t.length > 0);
}

/** A task line as written, before `dateFormat` is known for sure. */
interface RawTask {
  text: string;
  section?: string;
  tags: GanttTag[];
  id: string;
  startRaw?: string;
  endRaw: string;
  line: string;
}

type StartSpec = { kind: 'previous' } | { kind: 'after'; ids: string[] } | { kind: 'date'; date: Date };
type EndSpec =
  | { kind: 'until'; ids: string[] }
  | { kind: 'date'; date: Date; manual: boolean }
  | { kind: 'duration'; amount: number; unit: DurationUnit; manual: boolean };

/** A task whose start and end could be read, waiting for its dates. */
interface PendingTask {
  raw: RawTask;
  start: StartSpec;
  end: EndSpec;
  previous?: PendingTask;
  resolved?: { start: Date; end: Date };
}

export function parseGanttChart(text: string): GanttParseResult {
  const warnings: string[] = [];
  const ast: GanttChart = { sections: [], tasks: [] };

  let dateFormat = ISO_DATE;
  const excludes: string[] = [];
  const includes: string[] = [];
  let weekend: WeekendStart = 'saturday';
  let inclusiveEndDates = false;
  let currentSection: string | undefined;
  let autoTaskCounter = 0;
  const rawTasks: RawTask[] = [];

  // --- 1. Lines ---------------------------------------------------------------------------------------

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (/^gantt\b/i.test(line)) continue;

    let match: RegExpMatchArray | null;

    if ((match = line.match(/^title\s+(.+)$/i))) {
      ast.title = (match[1] ?? '').trim();
      continue;
    }
    if ((match = line.match(/^dateFormat\s+(.+)$/i))) {
      dateFormat = stripInlineComment(match[1] ?? '').trim();
      continue;
    }
    if ((match = line.match(/^excludes\s+(.+)$/i))) {
      excludes.push(...mergeTokens(stripInlineComment(match[1] ?? '')));
      continue;
    }
    if ((match = line.match(/^includes\s+(.+)$/i))) {
      includes.push(...mergeTokens(stripInlineComment(match[1] ?? '')));
      continue;
    }
    if ((match = line.match(/^weekend\s+(friday|saturday)\b/i))) {
      weekend = (match[1] ?? '').toLowerCase() as WeekendStart;
      continue;
    }
    if ((match = line.match(/^weekday\s+(\w+)\s*$/i))) {
      const day = (match[1] ?? '').toLowerCase();
      if ((WEEKDAY_NAMES as readonly string[]).includes(day)) {
        ast.weekday = day as WeekdayName;
      } else {
        warnings.push(`Unknown weekday ignored: ${line}`);
      }
      continue;
    }
    if (/^inclusiveEndDates\b/i.test(line)) {
      inclusiveEndDates = true;
      continue;
    }
    if (/^topAxis\b/i.test(line)) {
      // The axis is always drawn at the top of the chart; nothing more to do.
      continue;
    }
    if ((match = line.match(/^axisFormat\s+(.+)$/i))) {
      const format = stripInlineComment(match[1] ?? '').trim();
      ast.axisFormat = format;
      const unsupported = unsupportedAxisDirectives(format);
      if (unsupported.length > 0) {
        warnings.push(`axisFormat directive(s) ${unsupported.join(', ')} not supported, shown as written: ${line}`);
      }
      continue;
    }
    if ((match = line.match(/^tickInterval\s+(.+)$/i))) {
      const value = stripInlineComment(match[1] ?? '').trim();
      const tick = TICK_INTERVAL_RE.exec(value);
      if (tick) {
        ast.tickInterval = { every: Number(tick[1]), unit: tick[2] as GanttTickInterval['unit'] };
      } else {
        // Mermaid ignores it too, silently: say so, the author expects some ticks.
        warnings.push(`tickInterval "${value}" ignored (Mermaid accepts a number followed by millisecond, second, minute, hour, day, week or month), automatic ticks used: ${line}`);
      }
      continue;
    }
    if ((match = line.match(/^todayMarker\s+(.+)$/i))) {
      if ((match[1] ?? '').trim().toLowerCase() !== 'off') {
        warnings.push(`todayMarker ignored: a document does not depend on the day it is generated: ${line}`);
      }
      continue;
    }
    if ((match = line.match(/^section\s+(.+)$/i))) {
      currentSection = (match[1] ?? '').trim();
      if (!ast.sections.includes(currentSection)) ast.sections.push(currentSection);
      continue;
    }
    if (/^click\s/i.test(line)) {
      warnings.push(`Task click interactivity is not supported (no OOXML equivalent), ignored: ${line}`);
      continue;
    }
    if (/^(accTitle|accDescr|accDescription)\b/i.test(line)) {
      warnings.push(`Unsupported directive ignored (accessibility text has no OOXML equivalent here): ${line}`);
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      warnings.push(`Unsupported line ignored: ${line}`);
      continue;
    }
    const fields = stripInlineComment(line.slice(colonIdx + 1))
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    const tags: GanttTag[] = [];
    while (fields.length > 0 && (TAGS as readonly string[]).includes(fields[0] ?? '')) {
      tags.push(fields.shift() as GanttTag);
    }
    if (fields.length === 0) {
      warnings.push(`Task ignored (no date/duration data): ${line}`);
      continue;
    }
    // Mermaid numbers id-less tasks `task1`, `task2`… in declaration order.
    const id = fields.length >= 3 ? (fields[0] ?? '') : `task${++autoTaskCounter}`;
    const startRaw = fields.length === 1 ? undefined : fields[fields.length >= 3 ? 1 : 0];
    const endRaw = fields[fields.length === 1 ? 0 : fields.length >= 3 ? 2 : 1] ?? '';
    rawTasks.push({ text: line.slice(0, colonIdx).trim(), section: currentSection, tags, id, startRaw, endRaw, line });
  }

  const rules: ExclusionRules = { excludes, includes, weekend, dateFormat };

  // --- 2. Each task's data, now that `dateFormat` is final ------------------------------------------

  const knownIds = new Set(rawTasks.map((t) => t.id));

  function readStart(raw: RawTask): StartSpec | undefined {
    if (raw.startRaw === undefined) return { kind: 'previous' };
    const afterMatch = AFTER_RE.exec(raw.startRaw);
    if (afterMatch) {
      const ids = (afterMatch[1] ?? '').split(/\s+/).filter((id) => id.length > 0);
      const unknown = ids.filter((id) => !knownIds.has(id));
      if (unknown.length > 0) {
        warnings.push(`"after" names unknown task id(s) ${unknown.join(', ')}${unknown.length === ids.length ? ', chained from the previous task instead' : ''}: ${raw.line}`);
      }
      const known = ids.filter((id) => knownIds.has(id));
      return known.length > 0 ? { kind: 'after', ids: known } : { kind: 'previous' };
    }
    const date = parseDateStrict(raw.startRaw, dateFormat);
    if (date) return { kind: 'date', date };
    warnings.push(`Task ignored (invalid start date "${raw.startRaw}" for dateFormat "${dateFormat}"): ${raw.line}`);
    return undefined;
  }

  function readEnd(raw: RawTask): EndSpec | undefined {
    const untilMatch = UNTIL_RE.exec(raw.endRaw);
    if (untilMatch) {
      const ids = (untilMatch[1] ?? '').split(/\s+/).filter((id) => knownIds.has(id));
      if (ids.length > 0) return { kind: 'until', ids };
      warnings.push(`Task ignored (unresolvable "until" reference): ${raw.line}`);
      return undefined;
    }
    const manual = parseDateStrict(raw.endRaw, ISO_DATE) !== null;
    const date = parseDateStrict(raw.endRaw, dateFormat);
    if (date) return { kind: 'date', date: inclusiveEndDates ? addDays(date, 1) : date, manual };
    const duration = DURATION_RE.exec(raw.endRaw);
    const amount = Number(duration?.[1]);
    if (duration && Number.isFinite(amount)) return { kind: 'duration', amount, unit: duration[2] as DurationUnit, manual };
    // Mermaid keeps the task, with no duration.
    warnings.push(`Invalid end/duration "${raw.endRaw}", task drawn with no duration: ${raw.line}`);
    return { kind: 'duration', amount: 0, unit: 'ms', manual };
  }

  const pending: PendingTask[] = [];
  for (const raw of rawTasks) {
    const start = readStart(raw);
    if (!start) continue;
    if (start.kind === 'previous' && pending.length === 0) {
      warnings.push(`Task ignored (no start date and no previous task to chain from): ${raw.line}`);
      continue;
    }
    const end = readEnd(raw);
    if (!end) continue;
    pending.push({ raw, start, end, previous: pending[pending.length - 1] });
  }
  // Mermaid's `taskDb` keeps the last task declared under an id.
  const byId = new Map<string, PendingTask>(pending.map((t) => [t.raw.id, t]));

  // --- 3. Dates, in passes ----------------------------------------------------------------------------

  /** Push `end` one day further for each excluded day after `start` (Mermaid's `fixTaskDates`). */
  function stretchPastExcludes(start: Date, end: Date): Date {
    if (excludes.length === 0) return end;
    let cursor = addDays(start, 1);
    let result = end;
    for (let pushed = 0; cursor.getTime() <= result.getTime() && pushed < MAX_EXCLUDED_DAYS; cursor = addDays(cursor, 1)) {
      if (isExcludedDay(cursor, rules)) {
        result = addDays(result, 1);
        pushed++;
      }
    }
    return result;
  }

  /** The tasks `ids` names, or `undefined` while one of them still waits for its dates. */
  function referenced(ids: readonly string[]): { start: Date; end: Date }[] | undefined {
    const dates = ids.map((id) => byId.get(id)?.resolved);
    return dates.every((d) => d !== undefined) ? (dates as { start: Date; end: Date }[]) : undefined;
  }

  function tryResolve(task: PendingTask): boolean {
    let start: Date | undefined;
    if (task.start.kind === 'date') {
      start = task.start.date;
    } else if (task.start.kind === 'previous') {
      start = task.previous?.resolved?.end;
    } else {
      start = referenced(task.start.ids)?.reduce<Date | undefined>((latest, d) => (!latest || d.end > latest ? d.end : latest), undefined);
    }
    if (!start) return false;

    let end: Date | undefined;
    if (task.end.kind === 'until') {
      end = referenced(task.end.ids)?.reduce<Date | undefined>((earliest, d) => (!earliest || d.start < earliest ? d.start : earliest), undefined);
    } else if (task.end.kind === 'date') {
      end = task.end.date;
    } else {
      end = addDuration(start, task.end.amount, task.end.unit);
    }
    if (!end) return false;
    // `until` is never a written date, so Mermaid stretches it too.
    const manual = task.end.kind !== 'until' && task.end.manual;
    task.resolved = { start, end: manual ? end : stretchPastExcludes(start, end) };
    return true;
  }

  for (let progress = true; progress; ) {
    progress = false;
    for (const task of pending) {
      if (!task.resolved && tryResolve(task)) progress = true;
    }
  }

  for (const task of pending) {
    if (!task.resolved) {
      warnings.push(`Task ignored (its "after"/"until" references form a cycle, or chain from a task that does): ${task.raw.line}`);
      continue;
    }
    const resolved: GanttTask = {
      id: task.raw.id,
      text: task.raw.text,
      section: task.raw.section,
      start: task.resolved.start,
      end: task.resolved.end,
      tags: task.raw.tags,
    };
    ast.tasks.push(resolved);
  }

  ast.shadedDays = shadedDays(ast.tasks, rules);
  return { ast, warnings };
}

/** The days to shade within the chart's span: see {@link GanttChart.shadedDays}. */
function shadedDays(tasks: readonly GanttTask[], rules: ExclusionRules): Date[] {
  if (tasks.length === 0) return [];
  const t0 = new Date(Math.min(...tasks.map((t) => t.start.getTime())));
  const t1 = new Date(Math.max(...tasks.map((t) => t.end.getTime())));
  const limit = new Date(t0.getTime());
  limit.setUTCFullYear(limit.getUTCFullYear() + MAX_SHADED_SPAN_YEARS + 1);
  if (t1 >= limit) return [];
  const days: Date[] = [];
  for (let day = startOfDay(t0); day < t1; day = addDays(day, 1)) {
    if (rules.excludes.length > 0 ? isExcludedDay(day, rules) : isWeekend(day, rules.weekend)) days.push(day);
  }
  return days;
}
