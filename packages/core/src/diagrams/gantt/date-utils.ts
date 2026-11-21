/**
 * Minimal, dependency-free date arithmetic for the Gantt module.
 *
 * Mermaid's own `ganttDb.js` (vendored for reference at
 * `docs/adr/spikes/spike-gantt-parser/reference/mermaid-gantt-source/`) uses `dayjs` +
 * 3 plugins for this, and its renderer D3's `d3-time-format` for the axis labels. Pulling
 * either into `packages/core` was considered and rejected in that spike alongside the bigger
 * question of depending on `mermaid` itself — everything Gantt actually needs (parse/format a
 * handful of date tokens, add a duration, find a weekday name, format an axis label) is a few
 * dozen lines of `Date.UTC` arithmetic.
 *
 * **All dates are UTC-anchored**, deliberately: a document generator must be
 * deterministic regardless of the machine's local timezone/DST, which local-time
 * `Date` arithmetic is not (mirroring `dayjs`'s local-time default would make the same
 * input render a different calendar depending on where the CLI runs).
 */

export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

const DATE_TOKEN = /YYYY|MM|DD|HH|mm|ss/g;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strict parse of `str` against a `dateFormat`: either `X` (Unix seconds) or `x` (Unix
 * milliseconds), as in dayjs, or a string built from `YYYY`/`MM`/`DD`/`HH`/`mm`/`ss` tokens
 * (everything else is a literal separator, e.g. `-`/`/`). Returns `null` rather than throwing on a
 * mismatch — this module's callers all have a "warn and skip" fallback, never a hard failure, per
 * this project's existing parser convention (see `../quadrant/parser.ts`'s doc comment).
 */
export function parseDateStrict(str: string, format: string): Date | null {
  const text = str.trim();
  const fmt = format.trim();
  if (fmt === 'X' || fmt === 'x') {
    // An integer, optionally signed: dayjs's strict `X`/`x` reads the same.
    if (!/^-?\d+$/.test(text)) return null;
    return new Date(Number(text) * (fmt === 'X' ? MS_PER_SECOND : 1));
  }

  const order: string[] = [];
  let pattern = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  DATE_TOKEN.lastIndex = 0;
  while ((match = DATE_TOKEN.exec(fmt))) {
    pattern += escapeRegExp(fmt.slice(lastIndex, match.index));
    order.push(match[0]);
    pattern += match[0] === 'YYYY' ? '(\\d{4})' : '(\\d{2})';
    lastIndex = match.index + match[0].length;
  }
  pattern += escapeRegExp(fmt.slice(lastIndex));

  const m = new RegExp(`^${pattern}$`).exec(text);
  if (!m) return null;

  const parts = { YYYY: 1970, MM: 1, DD: 1, HH: 0, mm: 0, ss: 0 };
  order.forEach((token, i) => {
    (parts as Record<string, number>)[token] = Number(m[i + 1]);
  });
  if (parts.MM < 1 || parts.MM > 12 || parts.DD < 1 || parts.DD > 31) return null;
  if (parts.HH > 23 || parts.mm > 59 || parts.ss > 59) return null;

  // `Date.UTC` maps a two-digit year to 19xx; `setUTCFullYear` does not, and a `YYYY` year is
  // always meant literally.
  const date = new Date(Date.UTC(2000, parts.MM - 1, parts.DD, parts.HH, parts.mm, parts.ss));
  date.setUTCFullYear(parts.YYYY);
  return date;
}

/** Inverse of {@link parseDateStrict} for the token formats — used to compare a `Date` against
 * `excludes`/`includes` tokens given in either the diagram's own `dateFormat` or plain
 * `YYYY-MM-DD`. */
export function formatDate(date: Date, format: string): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return format.replace(DATE_TOKEN, (token) => {
    switch (token) {
      case 'YYYY':
        return String(date.getUTCFullYear()).padStart(4, '0');
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

/** Midnight (UTC) of `date`'s day. */
export function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** A Mermaid duration unit, as in `ganttDb.js`'s `parseDuration`: capital `M` is months, lower
 * `m` minutes. */
export type DurationUnit = 'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'M' | 'y';

const FIXED_UNIT_MS: Partial<Record<DurationUnit, number>> = {
  ms: 1,
  s: MS_PER_SECOND,
  m: MS_PER_MINUTE,
  h: MS_PER_HOUR,
  d: MS_PER_DAY,
  w: 7 * MS_PER_DAY,
};

/** `date` moved by `amount` `unit`s. Months and years move the calendar field (a whole number of
 * them, as `Date` itself does), every other unit a fixed number of milliseconds. */
export function addDuration(date: Date, amount: number, unit: DurationUnit): Date {
  const fixed = FIXED_UNIT_MS[unit];
  if (fixed !== undefined) return new Date(date.getTime() + amount * fixed);
  const result = new Date(date.getTime());
  if (unit === 'M') result.setUTCMonth(result.getUTCMonth() + Math.trunc(amount));
  else result.setUTCFullYear(result.getUTCFullYear() + Math.trunc(amount));
  return result;
}

export const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export type WeekdayName = (typeof WEEKDAY_NAMES)[number];

export function weekdayName(date: Date): WeekdayName {
  return WEEKDAY_NAMES[date.getUTCDay()] as WeekdayName;
}

/** The two days `excludes weekends` means: Saturday and Sunday by default, Friday and Saturday
 * after `weekend friday` (Mermaid's two choices). */
export type WeekendStart = 'saturday' | 'friday';

export function isWeekend(date: Date, weekend: WeekendStart = 'saturday'): boolean {
  const day = date.getUTCDay();
  return weekend === 'friday' ? day === 5 || day === 6 : day === 6 || day === 0;
}

/** What `excludes`, `includes` and `weekend` say about which days a task skips. */
export interface ExclusionRules {
  excludes: readonly string[];
  includes: readonly string[];
  weekend: WeekendStart;
  dateFormat: string;
}

/**
 * Is `date` matched by an `excludes` token and not rescued by an `includes` one? Same rule as
 * `ganttDb.js`'s `isInvalidDate`: `'weekends'` (see {@link isWeekend}), a lowercase weekday name,
 * or an explicit date in either `dateFormat` or plain `YYYY-MM-DD` (Mermaid accepts both; a diagram
 * author might paste a list written independently of `dateFormat`); an `includes` date always wins.
 * Used by the parser both to stretch a duration-based task past excluded days and to list the
 * days the translator shades, so the two never disagree on what's excluded.
 */
export function isExcludedDay(date: Date, rules: ExclusionRules): boolean {
  if (rules.excludes.length === 0) return false;
  const inDateFormat = formatDate(date, rules.dateFormat);
  const isoDate = formatDate(date, 'YYYY-MM-DD');
  if (rules.includes.includes(inDateFormat) || rules.includes.includes(isoDate)) return false;
  if (rules.excludes.includes('weekends') && isWeekend(date, rules.weekend)) return true;
  if (rules.excludes.includes(weekdayName(date))) return true;
  return rules.excludes.includes(inDateFormat) || rules.excludes.includes(isoDate);
}

// --- Axis labels: the strftime subset of D3's `d3-time-format`, which Mermaid's `axisFormat` uses -----

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayOfYear(date: Date): number {
  return Math.floor((startOfDay(date).getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / MS_PER_DAY) + 1;
}

/** Each supported directive: its value and the width D3 zero-pads it to. */
const DIRECTIVES: Record<string, (d: Date) => [value: string | number, width: number]> = {
  a: (d) => [(DAYS[d.getUTCDay()] ?? '').slice(0, 3), 0],
  A: (d) => [DAYS[d.getUTCDay()] ?? '', 0],
  b: (d) => [(MONTHS[d.getUTCMonth()] ?? '').slice(0, 3), 0],
  B: (d) => [MONTHS[d.getUTCMonth()] ?? '', 0],
  d: (d) => [d.getUTCDate(), 2],
  e: (d) => [d.getUTCDate(), -2],
  H: (d) => [d.getUTCHours(), 2],
  I: (d) => [d.getUTCHours() % 12 || 12, 2],
  j: (d) => [dayOfYear(d), 3],
  L: (d) => [d.getUTCMilliseconds(), 3],
  m: (d) => [d.getUTCMonth() + 1, 2],
  M: (d) => [d.getUTCMinutes(), 2],
  p: (d) => [d.getUTCHours() < 12 ? 'AM' : 'PM', 0],
  Q: (d) => [d.getTime(), 0],
  s: (d) => [Math.floor(d.getTime() / MS_PER_SECOND), 0],
  S: (d) => [d.getUTCSeconds(), 2],
  u: (d) => [d.getUTCDay() || 7, 0],
  w: (d) => [d.getUTCDay(), 0],
  y: (d) => [d.getUTCFullYear() % 100, 2],
  Y: (d) => [d.getUTCFullYear(), 4],
  Z: () => ['+0000', 0],
};

/** D3's composite, locale-dependent directives, in the `en-US` locale D3 defaults to. */
const COMPOSITES: Record<string, string> = { c: '%x, %X', x: '%-m/%-d/%Y', X: '%-I:%M:%S %p', D: '%m/%d/%y', F: '%Y-%m-%d', T: '%H:%M:%S', R: '%H:%M' };

// A directive: `%`, an optional pad flag (`-` none, `_` space, `0` zero), one letter or `%`.
const DIRECTIVE = /%([-_0]?)([A-Za-z%])/g;

/**
 * `date` formatted by a D3 `timeFormat` specifier (what Mermaid's `axisFormat` takes), in UTC like
 * every date here. Supports the directives of {@link DIRECTIVES} and {@link COMPOSITES}, the
 * `-`/`_`/`0` padding flags and `%%`; an unsupported directive is left as written (and reported once
 * by the parser, see {@link unsupportedAxisDirectives}).
 */
export function formatAxisDate(date: Date, specifier: string): string {
  return specifier.replace(DIRECTIVE, (whole, flag: string, letter: string) => {
    if (letter === '%') return '%';
    const composite = COMPOSITES[letter];
    if (composite !== undefined) return formatAxisDate(date, composite);
    const directive = DIRECTIVES[letter];
    if (!directive) return whole;
    const [value, width] = directive(date);
    if (typeof value === 'string') return value;
    const text = String(value);
    // `%e` is space-padded by default, every other numeric directive zero-padded.
    const padWith = flag === '-' ? '' : flag === '_' ? ' ' : flag === '0' ? '0' : width < 0 ? ' ' : '0';
    return padWith === '' ? text : text.padStart(Math.abs(width), padWith);
  });
}

/** The directives of `specifier` that {@link formatAxisDate} leaves as written (`%U`, `%V`…). */
export function unsupportedAxisDirectives(specifier: string): string[] {
  const unsupported = new Set<string>();
  for (const m of specifier.matchAll(DIRECTIVE)) {
    const letter = m[2] ?? '';
    if (letter !== '%' && !(letter in DIRECTIVES) && !(letter in COMPOSITES)) unsupported.add(`%${letter}`);
  }
  return [...unsupported];
}
