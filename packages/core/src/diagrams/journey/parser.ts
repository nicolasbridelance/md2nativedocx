/**
 * Parser for Mermaid `journey`: optional `title`, `section <name>` groupings,
 * then `Task name: score: Actor1, Actor2` rows. Same forgiving convention as
 * the other diagram parsers (unrecognized line -> warning, never a throw).
 * Scores outside 1..5 are clamped with a warning; a row whose score is not a
 * number is dropped with a warning. Task count is capped (hostile input).
 * `config:` frontmatter is skipped with one warning.
 */

import type { JourneyChart } from './types.js';

export interface JourneyParseResult {
  ast: JourneyChart;
  warnings: string[];
}

const MAX_TASKS = 500;

export function parseJourney(text: string): JourneyParseResult {
  const warnings: string[] = [];
  const ast: JourneyChart = { sections: [], tasks: [], actors: [] };
  let currentSection = -1;
  let inFrontmatter = false;
  let sawFrontmatterNote = false;
  let capWarned = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;

    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      if (!sawFrontmatterNote) {
        warnings.push('Journey frontmatter/config is not supported and was ignored.');
        sawFrontmatterNote = true;
      }
      continue;
    }
    if (inFrontmatter) continue;

    if (/^journey\s*$/i.test(line)) continue;

    let match: RegExpMatchArray | null;
    if ((match = line.match(/^title\s+(.+)$/i))) {
      ast.title = (match[1] ?? '').trim();
      continue;
    }
    if ((match = line.match(/^section\s+(.+)$/i))) {
      ast.sections.push((match[1] ?? '').trim());
      currentSection = ast.sections.length - 1;
      continue;
    }

    const parts = line.split(':');
    const label = (parts[0] ?? '').trim();
    if (parts.length < 2 || label.length === 0) {
      warnings.push(`Unsupported line ignored: ${line}`);
      continue;
    }
    const rawScore = (parts[1] ?? '').trim();
    if (!/^-?\d+\.?\d*$/.test(rawScore)) {
      warnings.push(`Task "${label}" ignored: score "${rawScore}" is not a number.`);
      continue;
    }
    let score = Math.round(Number(rawScore));
    if (score < 1 || score > 5) {
      warnings.push(`Task "${label}": score ${rawScore} is outside 1..5 and was clamped.`);
      score = Math.min(5, Math.max(1, score));
    }
    if (ast.tasks.length >= MAX_TASKS) {
      if (!capWarned) warnings.push(`Journey limited to ${MAX_TASKS} tasks; the rest were ignored.`);
      capWarned = true;
      continue;
    }
    const actors = parts
      .slice(2)
      .join(':')
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    for (const a of actors) if (!ast.actors.includes(a)) ast.actors.push(a);
    ast.tasks.push({ label, score, actors, sectionIndex: currentSection });
  }

  return { ast, warnings };
}
