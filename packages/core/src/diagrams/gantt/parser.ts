/**
 * Parser for Mermaid `gantt` (grammar cross-checked against the vendored reference at
 * `docs/adr/spikes/spike-gantt-parser/reference/mermaid-gantt-source/gantt.jison` +
 * `ganttDb.js`, MIT, `mermaid-js/mermaid@12.0.0` — read as a spec, not imported; see
 * that spike's `spike.md` for why a runtime dependency on `mermaid` npm was rejected).
 * Line-oriented, same forgiving convention as `../quadrant/parser.ts`: an unrecognized
 * or unresolvable line is skipped with a warning rather than throwing.
 *
 * V1 scope: `title`, `dateFormat`, `excludes` (`weekends` + weekday names + explicit
 * dates), `section`, and task lines — id/tags(`active`/`done`/`crit`/`milestone`)
 * optional, start as an explicit date **or** `after <id...>` **or** omitted (chains
 * from the previous task's end, matching Mermaid's own global — not per-section —
 * `lastTaskID` chaining, confirmed against `ganttDb.js`), end as an explicit date
 * **or** `until <id...>` **or** a `<n><d|w|M|y|h>` duration. A duration-based end is
 * stretched past any `excludes`-matched day exactly like `ganttDb.js`'s
 * `fixTaskDates` (an explicit end date is taken as authoritative and never stretched
 * — also matching upstream).
 *
 * NOT implemented (each degrades to "ignored, with a warning", never silently
 * dropped, same policy as quadrant's `classDef`): `axisFormat`, `tickInterval`,
 * `todayMarker`, `includes`, `weekday <day>`/`weekend friday` (alternate week
 * start/weekend — this module's weekend is fixed Sat/Sun), `inclusiveEndDates`,
 * `topAxis`, `accTitle`/`accDescription`, `click` interactivity. None of these affect
 * task *position* on the calendar, only cosmetics or in-app interactivity that has no
 * OOXML equivalent anyway.
 *
 * **Deliberate deviation from Mermaid**: an unresolvable `after <id>` (unknown/
 * forward-referenced id) falls back to the previous task's end, not wall-clock
 * "today" like `ganttDb.js`'s `getStartDate` — a document-generation pipeline must be
 * deterministic regardless of the day it happens to run on.
 */

import type { GanttChart, GanttTag, GanttTask } from './types.js';
import { addDays, addDuration, isExcludedDay, parseDateStrict } from './date-utils.js';

export interface GanttParseResult {
  ast: GanttChart;
  warnings: string[];
}

const TAGS: readonly GanttTag[] = ['active', 'done', 'crit', 'milestone'];
// `[\d.]+` rather than `\d+(?:\.\d+)?` — same dodge as `../quadrant/parser.ts`'s
// `POINT_TAIL` for eslint-plugin-security's detect-unsafe-regex heuristic (no real
// backtracking hazard either way, single bounded run, but this form doesn't trip it).
// Slightly more permissive (e.g. "1.2.3d"), harmless: `Number(...)` below rejects it.
const DURATION_RE = /^([\d.]+)([dwMyh])$/;
const AFTER_RE = /^after\s+(.+)$/i;
const UNTIL_RE = /^until\s+(.+)$/i;

function stripInlineComment(text: string): string {
  const idx = text.search(/[#;]/);
  return idx === -1 ? text : text.slice(0, idx);
}

function mergeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((t) => t.length > 0);
}

interface RawFields {
  tags: GanttTag[];
  fields: string[];
}

function extractTagsAndFields(dataStr: string): RawFields {
  const fields = stripInlineComment(dataStr)
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
  const tags: GanttTag[] = [];
  while (fields.length > 0 && (TAGS as readonly string[]).includes(fields[0] ?? '')) {
    tags.push(fields.shift() as GanttTag);
  }
  return { tags, fields };
}

export function parseGanttChart(text: string): GanttParseResult {
  const warnings: string[] = [];
  const ast: GanttChart = { sections: [], tasks: [] };
  const tasksById = new Map<string, GanttTask>();

  let dateFormat = 'YYYY-MM-DD';
  const excludes: string[] = [];
  let currentSection: string | undefined;
  let autoTaskCounter = 0;

  function resolveRefList(raw: string, pick: (candidates: GanttTask[]) => GanttTask | undefined): GanttTask | undefined {
    const ids = raw.trim().split(/\s+/);
    const candidates = ids.map((id) => tasksById.get(id)).filter((t): t is GanttTask => t !== undefined);
    return pick(candidates);
  }

  function resolveStart(raw: string, line: string): Date | undefined {
    const trimmed = raw.trim();
    const afterMatch = AFTER_RE.exec(trimmed);
    if (afterMatch) {
      const latest = resolveRefList(afterMatch[1] ?? '', (candidates) =>
        candidates.reduce<GanttTask | undefined>((best, t) => (!best || t.end > best.end ? t : best), undefined),
      );
      if (latest) return latest.end;
      const previous = ast.tasks[ast.tasks.length - 1];
      if (previous) return previous.end;
      warnings.push(`Task ignored (unresolvable "after" reference and no previous task to fall back to): ${line}`);
      return undefined;
    }
    const parsed = parseDateStrict(trimmed, dateFormat);
    if (parsed) return parsed;
    warnings.push(`Task ignored (invalid start date "${trimmed}" for dateFormat "${dateFormat}"): ${line}`);
    return undefined;
  }

  function resolveEnd(raw: string, start: Date, line: string): { end: Date; manual: boolean } | undefined {
    const trimmed = raw.trim();
    const untilMatch = UNTIL_RE.exec(trimmed);
    if (untilMatch) {
      const earliest = resolveRefList(untilMatch[1] ?? '', (candidates) =>
        candidates.reduce<GanttTask | undefined>((best, t) => (!best || t.start < best.start ? t : best), undefined),
      );
      if (earliest) return { end: earliest.start, manual: true };
      warnings.push(`Task ignored (unresolvable "until" reference): ${line}`);
      return undefined;
    }
    const explicit = parseDateStrict(trimmed, dateFormat);
    if (explicit) return { end: explicit, manual: true };
    const durationMatch = DURATION_RE.exec(trimmed);
    if (durationMatch) {
      const amount = Number(durationMatch[1]);
      const unit = durationMatch[2] as 'd' | 'w' | 'M' | 'y' | 'h';
      if (Number.isFinite(amount)) {
        return { end: addDuration(start, amount, unit), manual: false };
      }
    }
    warnings.push(`Task ignored (invalid end/duration "${trimmed}"): ${line}`);
    return undefined;
  }

  function stretchPastExcludes(start: Date, end: Date): Date {
    if (excludes.length === 0) return end;
    let cursor = addDays(start, 1);
    let result = end;
    let guard = 0;
    while (cursor.getTime() <= result.getTime() && guard < 20_000) {
      if (isExcludedDay(cursor, excludes, dateFormat)) {
        result = addDays(result, 1);
      }
      cursor = addDays(cursor, 1);
      guard++;
    }
    return result;
  }

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
      dateFormat = (match[1] ?? '').trim();
      continue;
    }
    if ((match = line.match(/^excludes\s+(.+)$/i))) {
      excludes.push(...mergeTokens(match[1] ?? ''));
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
    if (/^(axisFormat|tickInterval|todayMarker|includes|weekday\s|weekend\s|inclusiveEndDates|topAxis|accTitle|accDescription)\b/i.test(line)) {
      warnings.push(`Unsupported directive ignored (cosmetic/interactive, no bearing on task position): ${line}`);
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      warnings.push(`Unsupported line ignored: ${line}`);
      continue;
    }
    const taskText = line.slice(0, colonIdx).trim();
    const { tags, fields } = extractTagsAndFields(line.slice(colonIdx + 1));

    let id: string | undefined;
    let startRaw: string | undefined;
    let endRaw: string | undefined;
    if (fields.length === 1) {
      endRaw = fields[0];
    } else if (fields.length === 2) {
      [startRaw, endRaw] = fields;
    } else if (fields.length >= 3) {
      [id, startRaw, endRaw] = fields;
    } else {
      warnings.push(`Task ignored (no date/duration data): ${line}`);
      continue;
    }

    let start: Date | undefined;
    if (startRaw !== undefined) {
      start = resolveStart(startRaw, line);
    } else {
      const previous = ast.tasks[ast.tasks.length - 1];
      if (previous) {
        start = previous.end;
      } else {
        warnings.push(`Task ignored (no start date and no previous task to chain from): ${line}`);
      }
    }
    if (!start) continue;

    const endResult = endRaw !== undefined ? resolveEnd(endRaw, start, line) : undefined;
    if (!endResult) continue;
    const end = endResult.manual ? endResult.end : stretchPastExcludes(start, endResult.end);

    const task: GanttTask = {
      id: id ?? `task${++autoTaskCounter}`,
      text: taskText,
      section: currentSection,
      start,
      end,
      tags,
    };
    ast.tasks.push(task);
    tasksById.set(task.id, task);
  }

  return { ast, warnings };
}
