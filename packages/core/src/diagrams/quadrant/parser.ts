/**
 * Parser for Mermaid `quadrantChart` (grammar verified against
 * mermaid.js.org/syntax/quadrantChart.html, fetched 2026-09-04). Line-oriented,
 * same forgiving convention as `../../parser/parser.ts`: an unrecognized line
 * is skipped with a warning rather than throwing, since this project has no
 * evidence that real Mermaid input needs a hard-reject path here any more
 * than it did for flowcharts.
 *
 * V1 scope, deliberately: `title`, `x-axis`/`y-axis` (one- and two-sided),
 * `quadrant-1..4`, and points (`name: [x, y]`) with an optional `color:`
 * override. NOT implemented yet (each degrades to "ignored, with a
 * warning", never silently dropped): per-point `radius:`/`stroke-color:`/
 * `stroke-width:`, and `classDef`/`:::className` point styling. None of
 * these affect *position* (the only thing the OOXML translator's matrix
 * layout actually depends on), so leaving them out doesn't misplace or lose
 * a point — it only loses cosmetic styling, listed here so a successor
 * doesn't have to rediscover the gap.
 */

import type { QuadrantAxis, QuadrantChart, QuadrantPoint } from './types.js';

export interface QuadrantParseResult {
  ast: QuadrantChart;
  warnings: string[];
}

function stripQuotes(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseAxis(rest: string): QuadrantAxis {
  const arrowIdx = rest.indexOf('-->');
  if (arrowIdx === -1) return { low: rest.trim() };
  return {
    low: rest.slice(0, arrowIdx).trim(),
    high: rest.slice(arrowIdx + 3).trim(),
  };
}

// Matched against the *tail* of a line, not the whole thing (two small,
// unambiguous regexes instead of one combining a leading `.+?` with the
// bracket/coordinate structure) — flagged by eslint-plugin-security's
// detect-unsafe-regex heuristic on the combined form, even though the
// combined form has no actual nested-quantifier backtracking hazard (single
// bounded `[\d.]+` runs, no ambiguous alternation). Splitting it also
// happens to make each half easier to read.
const POINT_TAIL = /:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]\s*(.*)$/;
const CLASS_SUFFIX = /:::[A-Za-z0-9_-]+$/;
const COLOR_ATTR = /color:\s*(#[0-9A-Fa-f]{6})/;

export function parseQuadrantChart(text: string): QuadrantParseResult {
  const warnings: string[] = [];
  const ast: QuadrantChart = { quadrants: {}, points: [] };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (/^quadrantChart\b/i.test(line)) continue;

    let match: RegExpMatchArray | null;

    if ((match = line.match(/^title\s+(.+)$/i))) {
      ast.title = (match[1] ?? '').trim();
      continue;
    }
    if ((match = line.match(/^x-axis\s+(.+)$/i))) {
      ast.xAxis = parseAxis(match[1] ?? '');
      continue;
    }
    if ((match = line.match(/^y-axis\s+(.+)$/i))) {
      ast.yAxis = parseAxis(match[1] ?? '');
      continue;
    }
    if ((match = line.match(/^quadrant-([1-4])\s+(.+)$/i))) {
      const index = Number(match[1]) as 1 | 2 | 3 | 4;
      ast.quadrants[index] = (match[2] ?? '').trim();
      continue;
    }
    if (/^classDef\b/i.test(line)) {
      warnings.push(`classDef styling is not yet supported for quadrant charts, ignored: ${line}`);
      continue;
    }
    if ((match = line.match(POINT_TAIL))) {
      const [, xStr, yStr, extra] = match;
      const x = Number(xStr);
      const y = Number(yStr);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        warnings.push(`Unsupported line ignored (non-numeric point coordinates): ${line}`);
        continue;
      }
      const rawName = line.slice(0, match.index ?? 0).replace(CLASS_SUFFIX, '');
      const point: QuadrantPoint = { name: stripQuotes(rawName), x, y };
      const colorMatch = (extra ?? '').match(COLOR_ATTR);
      if (colorMatch) point.color = (colorMatch[1] ?? '').slice(1).toUpperCase();
      ast.points.push(point);
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  return { ast, warnings };
}
