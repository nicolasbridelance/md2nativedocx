/**
 * Minimal, dependency-free date arithmetic for the Gantt module.
 *
 * Mermaid's own `ganttDb.js` (vendored for reference at
 * `docs/adr/spikes/spike-gantt-parser/reference/mermaid-gantt-source/`) uses `dayjs` +
 * 3 plugins for this. Pulling `dayjs` into `packages/core` was considered and rejected
 * in that spike alongside the bigger question of depending on `mermaid` itself — this
 * project's core has exactly one dependency (`dagre`) today, and everything Gantt
 * actually needs (parse/format a handful of date tokens, add days/weeks/months/years,
 * find a weekday name) is a few dozen lines of `Date.UTC` arithmetic.
 *
 * **All dates are UTC-anchored**, deliberately: a document generator must be
 * deterministic regardless of the machine's local timezone/DST, which local-time
 * `Date` arithmetic is not (mirroring `dayjs`'s local-time default would make the same
 * input render a different calendar depending on where the CLI runs).
 */

const MS_PER_DAY = 86_400_000;

const DATE_TOKEN = /YYYY|MM|DD|HH|mm|ss/g;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strict parse of `str` against a `dateFormat` string built from `YYYY`/`MM`/`DD`/
 * `HH`/`mm`/`ss` tokens (everything else is a literal separator, e.g. `-`/`/`). Returns
 * `null` rather than throwing on a mismatch — this module's callers all have a
 * "warn and skip" fallback, never a hard failure, per this project's existing parser
 * convention (see `../quadrant/parser.ts`'s doc comment).
 */
export function parseDateStrict(str: string, format: string): Date | null {
  const order: string[] = [];
  let pattern = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  DATE_TOKEN.lastIndex = 0;
  while ((match = DATE_TOKEN.exec(format))) {
    pattern += escapeRegExp(format.slice(lastIndex, match.index));
    order.push(match[0]);
    pattern += match[0] === 'YYYY' ? '(\\d{4})' : '(\\d{2})';
    lastIndex = match.index + match[0].length;
  }
  pattern += escapeRegExp(format.slice(lastIndex));

  const m = new RegExp(`^${pattern}$`).exec(str.trim());
  if (!m) return null;

  const parts = { YYYY: 1970, MM: 1, DD: 1, HH: 0, mm: 0, ss: 0 };
  order.forEach((token, i) => {
    (parts as Record<string, number>)[token] = Number(m[i + 1]);
  });
  if (parts.MM < 1 || parts.MM > 12 || parts.DD < 1 || parts.DD > 31) return null;

  return new Date(Date.UTC(parts.YYYY, parts.MM - 1, parts.DD, parts.HH, parts.mm, parts.ss));
}

/** Inverse of {@link parseDateStrict} — used to compare a `Date` against `excludes`
 * tokens given in either the diagram's own `dateFormat` or plain `YYYY-MM-DD`. */
export function formatDate(date: Date, format: string): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return format.replace(DATE_TOKEN, (token) => {
    switch (token) {
      case 'YYYY':
        return String(date.getUTCFullYear());
      case 'MM':
        return pad(date.getUTCMonth() + 1);
      case 'DD':
        return pad(date.getUTCDate());
      case 'HH':
        return pad(date.getUTCHours());
      case 'mm':
        return pad(date.getUTCMinutes());
      case 'ss':
        return pad(date.getUTCSeconds());
      default:
        return token;
    }
  });
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** `str.trim()` must already look like `/^\d+(\.\d+)?[dwMyh]$/` (checked by the
 * caller) — mirrors `ganttDb.js`'s `parseDuration`, minus the units this project's
 * Gantt module doesn't support yet (`s`/`ms`/bare `M` ambiguity resolved the same way
 * Mermaid resolves it: capital `M` = months). */
export function addDuration(date: Date, amount: number, unit: 'd' | 'w' | 'M' | 'y' | 'h'): Date {
  switch (unit) {
    case 'h':
      return new Date(date.getTime() + amount * 3_600_000);
    case 'd':
      return addDays(date, amount);
    case 'w':
      return addDays(date, amount * 7);
    case 'M':
      return new Date(
        Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth() + Math.trunc(amount),
          date.getUTCDate(),
          date.getUTCHours(),
          date.getUTCMinutes(),
          date.getUTCSeconds(),
        ),
      );
    case 'y':
      return new Date(
        Date.UTC(
          date.getUTCFullYear() + Math.trunc(amount),
          date.getUTCMonth(),
          date.getUTCDate(),
          date.getUTCHours(),
          date.getUTCMinutes(),
          date.getUTCSeconds(),
        ),
      );
  }
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export function weekdayName(date: Date): (typeof WEEKDAY_NAMES)[number] {
  return WEEKDAY_NAMES[date.getUTCDay()] as (typeof WEEKDAY_NAMES)[number];
}

/** Saturday/Sunday, the fixed weekend this v1 supports — Mermaid's alternate
 * `weekend friday` (Fri/Sat weekend) directive is parsed and warned-about as
 * unsupported by `parser.ts`, never silently applied. */
export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

/**
 * Is `date` matched by any `excludes` token? Mirrors `ganttDb.js`'s `isInvalidDate`:
 * `'weekends'` (fixed Sat/Sun, see {@link isWeekend}'s doc comment), a lowercase
 * weekday name, or an explicit date string in either `dateFormat` or plain
 * `YYYY-MM-DD` (Mermaid accepts both; a diagram author might paste an `excludes` list
 * they wrote before/independent of `dateFormat`). Shared by `parser.ts` (to stretch a
 * duration-based task's end date past excluded days) and `translator.ts` (to shade
 * excluded columns on the calendar) so the two never disagree on what's excluded.
 */
export function isExcludedDay(date: Date, excludes: readonly string[], dateFormat: string): boolean {
  if (excludes.length === 0) return false;
  if (excludes.includes('weekends') && isWeekend(date)) return true;
  if (excludes.includes(weekdayName(date))) return true;
  const inDateFormat = formatDate(date, dateFormat);
  const isoDate = formatDate(date, 'YYYY-MM-DD');
  return excludes.includes(inDateFormat) || excludes.includes(isoDate);
}
