/**
 * Parser for Mermaid `xychart-beta` / `xychart`: header with optional
 * `horizontal`, `title`, `x-axis` (category list, or `"title" min --> max`),
 * `y-axis ["title"] [min --> max]`, and `bar` / `line` series with an optional
 * name and a `[v, v "label", ...]` list (labels are line-only in Mermaid, kept
 * for both). Forgiving like the other parsers: an unrecognized line or a
 * non-numeric value is a warning (value -> 0), never a throw. Capped at 12
 * series, 200 points per series and 200 categories (hostile input);
 * frontmatter/config is skipped with one warning.
 */

import type { XyAxisX, XyAxisY, XyChart, XySeries } from './types.js';

export interface XyChartParseResult {
  ast: XyChart;
  warnings: string[];
}

const MAX_SERIES = 12;
const MAX_POINTS = 200;

/** Split on commas outside double/single quotes. */
function splitList(text: string): string[] {
  const out: string[] = [];
  let quote = '';
  let current = '';
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ',') {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

function unquote(s: string): string {
  const t = s.trim();
  const q = t[0];
  if ((q === '"' || q === "'") && t.length >= 2 && t.endsWith(q)) return t.slice(1, -1);
  return t;
}

/** Read a leading quoted string or bare word (up to whitespace or `[`); returns it and the remainder. */
function readTitle(rest: string): { text: string; remainder: string } {
  const q = rest[0];
  if (q === '"' || q === "'") {
    const end = rest.indexOf(q, 1);
    if (end < 0) return { text: rest.slice(1), remainder: '' };
    return { text: rest.slice(1, end), remainder: rest.slice(end + 1).trim() };
  }
  let i = 0;
  while (i < rest.length && rest[i] !== '[' && !/\s/.test(rest[i] ?? '')) i++;
  return { text: rest.slice(0, i), remainder: rest.slice(i).trim() };
}

/** `min --> max` -> both numbers, else undefined. */
function parseRange(text: string): [number, number] | undefined {
  const parts = text.split('-->');
  if (parts.length !== 2) return undefined;
  const a = Number((parts[0] ?? '').trim());
  const b = Number((parts[1] ?? '').trim());
  if (!Number.isFinite(a) || !Number.isFinite(b) || (parts[0] ?? '').trim() === '' || (parts[1] ?? '').trim() === '') return undefined;
  return [a, b];
}

/** Content between the first `[` and the last `]`, or undefined. */
function bracketContent(text: string): string | undefined {
  if (!text.startsWith('[')) return undefined;
  const end = text.lastIndexOf(']');
  return end < 1 ? text.slice(1) : text.slice(1, end);
}

export function parseXyChart(text: string): XyChartParseResult {
  const warnings: string[] = [];
  const xAxis: XyAxisX = {};
  const yAxis: XyAxisY = {};
  const series: XySeries[] = [];
  let title: string | undefined;
  let horizontal = false;
  let inFrontmatter = false;
  let sawHeader = false;
  let warnedFrontmatter = false;
  let warnedCap = false;
  let warnedPoints = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;

    if (line === '---' && !sawHeader) {
      inFrontmatter = !inFrontmatter;
      if (!warnedFrontmatter) {
        warnings.push('XYChart frontmatter/config is not supported and was ignored.');
        warnedFrontmatter = true;
      }
      continue;
    }
    if (inFrontmatter) continue;

    if (!sawHeader) {
      sawHeader = true;
      const header = line.match(/^xychart(?:-beta)?\b\s*(.*)$/i);
      if (header) {
        const opt = (header[1] ?? '').trim().toLowerCase();
        if (opt === 'horizontal') horizontal = true;
        else if (opt.length > 0) warnings.push(`Unrecognized xychart option ignored: ${opt}`);
        continue;
      }
    }

    const sp = line.search(/\s|\[/);
    const keyword = (sp < 0 ? line : line.slice(0, sp)).toLowerCase();
    const rest = (sp < 0 ? '' : line.slice(sp)).trim();

    if (keyword === 'title') {
      title = unquote(rest);
    } else if (keyword === 'x-axis' || keyword === 'y-axis') {
      let remainder = rest;
      let axisTitle: string | undefined;
      // A bare range (`y-axis 0 --> 100`) has no title; otherwise read one first.
      if (!remainder.startsWith('[') && !parseRange(remainder)) {
        const t = readTitle(remainder);
        axisTitle = t.text;
        remainder = t.remainder;
      }
      const list = bracketContent(remainder);
      const range = list === undefined ? parseRange(remainder) : undefined;
      if (remainder.length > 0 && list === undefined && !range) {
        warnings.push(`Unrecognized ${keyword} syntax ignored: ${remainder}`);
      }
      if (keyword === 'x-axis') {
        if (axisTitle) xAxis.title = axisTitle;
        if (list !== undefined) xAxis.categories = splitList(list).slice(0, MAX_POINTS).map(unquote);
        else if (range) [xAxis.min, xAxis.max] = range;
      } else {
        if (axisTitle) yAxis.title = axisTitle;
        if (range) [yAxis.min, yAxis.max] = range;
        else if (list !== undefined) warnings.push('y-axis does not take a list; ignored.');
      }
    } else if (keyword === 'bar' || keyword === 'line') {
      if (series.length >= MAX_SERIES) {
        if (!warnedCap) warnings.push(`XYChart limited to ${MAX_SERIES} series; the rest were ignored.`);
        warnedCap = true;
        continue;
      }
      const t = rest.startsWith('[') ? { text: '', remainder: rest } : readTitle(rest);
      const list = bracketContent(t.remainder);
      if (list === undefined) {
        warnings.push(`${keyword} series without a [values] list ignored.`);
        continue;
      }
      const items = splitList(list);
      if (items.length > MAX_POINTS && !warnedPoints) {
        warnings.push(`XYChart limited to ${MAX_POINTS} points per series; extra values ignored.`);
        warnedPoints = true;
      }
      const values: number[] = [];
      const labels: Array<string | undefined> = [];
      let bad = 0;
      for (const item of items.slice(0, MAX_POINTS)) {
        const cut = item.search(/\s/);
        const numText = cut < 0 ? item : item.slice(0, cut);
        const labelText = cut < 0 ? '' : item.slice(cut).trim();
        const n = Number(numText);
        if (numText === '' || !Number.isFinite(n)) bad++;
        values.push(Number.isFinite(n) ? n : 0);
        labels.push(labelText.length > 0 ? unquote(labelText) : undefined);
      }
      if (bad > 0) warnings.push(`${bad} non-numeric value(s) in a ${keyword} series were replaced by 0.`);
      series.push({ kind: keyword, ...(t.text ? { name: t.text } : {}), values, labels });
    } else {
      warnings.push(`Unsupported line ignored: ${line}`);
    }
  }

  return { ast: { horizontal, ...(title !== undefined ? { title } : {}), xAxis, yAxis, series }, warnings };
}
