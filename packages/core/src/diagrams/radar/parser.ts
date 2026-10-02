/**
 * Parser for Mermaid `radar-beta`: optional `title`, `axis id["Label"], ...`,
 * `curve id["Label"]{1, 2, 3}` or `curve id{ axisId: 30, ... }` (several
 * comma-separated per line), and the options `showLegend`, `max`, `min`,
 * `graticule circle|polygon`, `ticks`. Same forgiving convention as the other
 * diagram parsers (unrecognized line -> warning, never a throw). Axes and
 * curves are capped at 64 each (hostile input); frontmatter/config is skipped
 * with one warning.
 */

import type { RadarAxis, RadarChart, RadarCurve, RadarGraticule } from './types.js';

export interface RadarParseResult {
  ast: RadarChart;
  warnings: string[];
}

const MAX_ITEMS = 64;

/** Split on commas that are outside `{}`, `[]` and double/single quotes. */
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

interface Entry {
  id: string;
  label?: string;
  /** Text between `{` and `}`, when present. */
  body?: string;
}

/** Parse `id`, `id["Label"]`, `id{...}` or `id["Label"]{...}`; undefined when malformed. */
function parseEntry(item: string): Entry | undefined {
  const id = item.match(/^[A-Za-z_][\w-]*/)?.[0];
  if (!id) return undefined;
  let rest = item.slice(id.length).trim();
  const entry: Entry = { id };
  if (rest.startsWith('[')) {
    const close = rest.indexOf(']');
    if (close < 0) return undefined;
    const inner = rest.slice(1, close).trim();
    const q = inner[0];
    if ((q !== '"' && q !== "'") || inner.length < 2 || inner[inner.length - 1] !== q) return undefined;
    entry.label = inner.slice(1, -1);
    rest = rest.slice(close + 1).trim();
  }
  if (rest.startsWith('{')) {
    if (!rest.endsWith('}')) return undefined;
    entry.body = rest.slice(1, -1);
    rest = '';
  }
  return rest.length === 0 ? entry : undefined;
}

interface RawCurve {
  id: string;
  label: string;
  body: string;
}

export function parseRadar(text: string): RadarParseResult {
  const warnings: string[] = [];
  const axes: RadarAxis[] = [];
  const rawCurves: RawCurve[] = [];
  let title: string | undefined;
  let showLegend = true;
  let min = 0;
  let maxOpt: number | undefined;
  let graticule: RadarGraticule = 'circle';
  let ticks = 5;
  let inFrontmatter = false;
  let warnedFrontmatter = false;
  let warnedCap = false;

  const capped = (count: number): boolean => {
    if (count < MAX_ITEMS) return false;
    if (!warnedCap) warnings.push(`Radar limited to ${MAX_ITEMS} axes and ${MAX_ITEMS} curves; the rest were ignored.`);
    warnedCap = true;
    return true;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;

    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      if (!warnedFrontmatter) {
        warnings.push('Radar frontmatter/config is not supported and was ignored.');
        warnedFrontmatter = true;
      }
      continue;
    }
    if (inFrontmatter) continue;
    if (/^radar-beta\s*$/i.test(line)) continue;

    let m: RegExpMatchArray | null;
    if ((m = line.match(/^title\s+(.+)$/i))) {
      title = (m[1] ?? '').trim();
    } else if ((m = line.match(/^axis\s+(.+)$/i))) {
      for (const item of splitTopLevel(m[1] ?? '')) {
        const e = parseEntry(item);
        if (!e || e.body !== undefined) {
          warnings.push(`Unsupported axis ignored: ${item}`);
          continue;
        }
        if (capped(axes.length)) break;
        axes.push({ id: e.id, label: e.label ?? e.id });
      }
    } else if ((m = line.match(/^curve\s+(.+)$/i))) {
      for (const item of splitTopLevel(m[1] ?? '')) {
        const e = parseEntry(item);
        if (!e || e.body === undefined) {
          warnings.push(`Unsupported curve ignored: ${item}`);
          continue;
        }
        if (capped(rawCurves.length)) break;
        rawCurves.push({ id: e.id, label: e.label ?? e.id, body: e.body });
      }
    } else if ((m = line.match(/^showLegend\s+(true|false)\s*$/i))) {
      showLegend = (m[1] ?? '').toLowerCase() === 'true';
    } else if ((m = line.match(/^(max|min)\s+(-?\d+\.?\d*)\s*$/i))) {
      if ((m[1] ?? '').toLowerCase() === 'max') maxOpt = Number(m[2]);
      else min = Number(m[2]);
    } else if ((m = line.match(/^graticule\s+(circle|polygon)\s*$/i))) {
      graticule = (m[1] ?? '').toLowerCase() as RadarGraticule;
    } else if ((m = line.match(/^ticks\s+(\d+)\s*$/i))) {
      ticks = Math.min(20, Math.max(1, Number(m[1])));
    } else {
      warnings.push(`Unsupported line ignored: ${line}`);
    }
  }

  const curves: RadarCurve[] = rawCurves.map((raw) => {
    const values = axes.map(() => min);
    const parts = splitTopLevel(raw.body);
    if (parts.length > 0 && parts.every((p) => p.includes(':'))) {
      for (const part of parts) {
        const [key, val] = part.split(':').map((s) => s.trim());
        const index = axes.findIndex((a) => a.id === key);
        const num = Number(val);
        if (index < 0 || val === undefined || val === '' || !Number.isFinite(num)) {
          warnings.push(`Curve "${raw.id}": entry "${part}" ignored (unknown axis or bad number).`);
          continue;
        }
        values[index] = num;
      }
    } else {
      parts.forEach((part, i) => {
        const num = Number(part);
        if (part === '' || !Number.isFinite(num)) {
          warnings.push(`Curve "${raw.id}": value "${part}" is not a number; treated as ${min}.`);
          return;
        }
        if (i < values.length) values[i] = num;
        else if (i === values.length) warnings.push(`Curve "${raw.id}" has more values than axes; extra values ignored.`);
      });
    }
    return { id: raw.id, label: raw.label, values };
  });

  const dataMax = Math.max(min + 1, ...curves.flatMap((c) => c.values));
  let max = maxOpt ?? dataMax;
  if (max <= min) {
    warnings.push('Radar max must be greater than min; using the largest data value instead.');
    max = dataMax;
  }

  return { ast: { ...(title ? { title } : {}), axes, curves, showLegend, min, max, graticule, ticks }, warnings };
}
