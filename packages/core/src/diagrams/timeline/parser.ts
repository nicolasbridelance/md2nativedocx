/**
 * Parser for Mermaid `timeline`: `timeline [LR|TD]`, optional `title`,
 * optional `section <name>` groupings, then `period : event [: event ...]`
 * rows. A row starting with `:` adds more events to the previous period.
 * `<br>` in any text becomes a line break. Same forgiving convention as the
 * other diagram parsers (unrecognized line -> warning, never a throw).
 *
 * V1 gap: the `TD` direction (v11.14+) is parsed and warned, and rendered as
 * the default left-to-right layout. `config:` frontmatter/theme variables are
 * skipped with one warning, as for every other module here.
 */

import type { TimelineChart, TimelinePeriod } from './types.js';

export interface TimelineParseResult {
  ast: TimelineChart;
  warnings: string[];
}

/** Normalise `<br>` variants to `\n` and trim each resulting line. */
function cleanText(text: string): string {
  return text
    .split(/<br\s*\/?>/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n');
}

export function parseTimeline(text: string): TimelineParseResult {
  const warnings: string[] = [];
  const ast: TimelineChart = { sections: [], periods: [] };
  let currentSection = -1;
  let last: TimelinePeriod | undefined;
  let inFrontmatter = false;
  let sawFrontmatterNote = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;

    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      if (!sawFrontmatterNote) {
        warnings.push('Timeline frontmatter/config is not supported and was ignored.');
        sawFrontmatterNote = true;
      }
      continue;
    }
    if (inFrontmatter) continue;

    let match: RegExpMatchArray | null;

    if ((match = line.match(/^timeline\b\s*(\w*)\s*$/i))) {
      if (/^(td|tb)$/i.test(match[1] ?? '')) {
        warnings.push('Timeline TD direction is not yet supported; rendered left to right.');
      }
      continue;
    }

    if ((match = line.match(/^title\s+(.+)$/i))) {
      ast.title = cleanText(match[1] ?? '').replace(/\n/g, ' ');
      continue;
    }

    if ((match = line.match(/^section\s+(.+)$/i))) {
      ast.sections.push(cleanText(match[1] ?? ''));
      currentSection = ast.sections.length - 1;
      continue;
    }

    if (line.startsWith(':')) {
      if (!last) {
        warnings.push(`Unsupported line ignored (event with no preceding period): ${line}`);
        continue;
      }
      last.events.push(...splitEvents(line.slice(1)));
      continue;
    }

    const colon = line.indexOf(':');
    const label = cleanText(colon < 0 ? line : line.slice(0, colon));
    if (label.length === 0) {
      warnings.push(`Unsupported line ignored: ${line}`);
      continue;
    }
    last = { label, events: colon < 0 ? [] : splitEvents(line.slice(colon + 1)), sectionIndex: currentSection };
    ast.periods.push(last);
  }

  return { ast, warnings };
}

function splitEvents(rest: string): string[] {
  return rest
    .split(':')
    .map((part) => cleanText(part))
    .filter((part) => part.length > 0);
}
