/**
 * Parser for Mermaid `pie` (grammar: `pie [showData]`, optional
 * `title <text>` on the header line or its own line, then
 * `"label" : <positive number>` rows). Same forgiving line-oriented
 * convention as the other diagram parsers: an unrecognized or invalid line
 * is skipped with a warning, never a throw.
 *
 * NOT implemented (v1): `config:` frontmatter (`textPosition`, `donutHole`,
 * `legendPosition`, `highlightSlice`) and theme variables — no precedent for
 * frontmatter handling anywhere else in this project. `accTitle`/`accDescr`
 * are recognized and warned once (no OOXML equivalent).
 */

import type { PieChart } from './types.js';

export interface PieParseResult {
  ast: PieChart;
  warnings: string[];
}

// Split on the closing quote + colon instead of one regex spanning both
// sides (avoids eslint-plugin-security's detect-unsafe-regex false positive,
// same fix as state-diagram/parser.ts).
const INTEGER = /^-?\d+$/;
const DECIMAL = /^-?\d+\.\d+$/;

function parseSliceLine(line: string): { label: string; value: number } | undefined {
  if (!line.startsWith('"')) return undefined;
  const close = line.indexOf('"', 1);
  if (close < 0) return undefined;
  const rest = line.slice(close + 1).trim();
  if (!rest.startsWith(':')) return undefined;
  const raw = rest.slice(1).trim();
  if (!INTEGER.test(raw) && !DECIMAL.test(raw)) return undefined;
  return { label: line.slice(1, close), value: Number(raw) };
}

export function parsePieChart(text: string): PieParseResult {
  const warnings: string[] = [];
  const ast: PieChart = { showData: false, slices: [] };
  let inFrontmatter = false;
  let sawFrontmatterNote = false;
  let sawAccNote = false;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (line.length === 0 || line.startsWith('%%')) continue;

    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      if (!sawFrontmatterNote) {
        warnings.push('Pie chart frontmatter/config is not supported and was ignored.');
        sawFrontmatterNote = true;
      }
      continue;
    }
    if (inFrontmatter) continue;

    let match: RegExpMatchArray | null;

    if ((match = line.match(/^pie\b(.*)$/i))) {
      let rest = (match[1] ?? '').trim();
      if ((match = rest.match(/^showData\b(.*)$/i))) {
        ast.showData = true;
        rest = (match[1] ?? '').trim();
      }
      if ((match = rest.match(/^title\s+(.+)$/i))) ast.title = (match[1] ?? '').trim();
      continue;
    }

    if ((match = line.match(/^showData$/i))) {
      ast.showData = true;
      continue;
    }

    if ((match = line.match(/^title\s+(.+)$/i))) {
      ast.title = (match[1] ?? '').trim();
      continue;
    }

    if (/^(accTitle|accDescr)\b/i.test(line)) {
      if (!sawAccNote) {
        warnings.push('accTitle/accDescr have no OOXML equivalent and were ignored.');
        sawAccNote = true;
      }
      continue;
    }

    const slice = parseSliceLine(line);
    if (slice) {
      const { value } = slice;
      if (!(value > 0)) {
        warnings.push(`Pie slice value must be greater than zero, slice ignored: ${line}`);
        continue;
      }
      ast.slices.push(slice);
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  return { ast, warnings };
}
