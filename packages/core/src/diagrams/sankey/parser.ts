/**
 * Parser for Mermaid `sankey-beta` / `sankey`: a header followed by CSV records
 * `source,target,value` (RFC-4180-style quoting, `""` escapes a quote, blank
 * lines and `%%` comments skipped). Forgiving like the other parsers: a bad
 * record is a warning, never a throw. Self-links and links that would close a
 * cycle are dropped (a Sankey flows one way). Capped (hostile input) at 500
 * links and 200 nodes; frontmatter is skipped with one warning.
 */

import type { SankeyDiagram, SankeyLink } from './types.js';

export interface SankeyParseResult {
  ast: SankeyDiagram;
  warnings: string[];
}

const MAX_LINKS = 500;
const MAX_NODES = 200;

/** Split one CSV record; quotes may contain commas, `""` is a literal quote. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Whether adding `source -> target` would close a cycle over `links`. */
function reaches(links: SankeyLink[], from: string, to: string): boolean {
  const seen = new Set<string>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const n = queue.pop() as string;
    if (n === to) return true;
    for (const l of links) {
      if (l.source === n && !seen.has(l.target)) {
        seen.add(l.target);
        queue.push(l.target);
      }
    }
  }
  return false;
}

export function parseSankey(text: string): SankeyParseResult {
  const warnings: string[] = [];
  const nodes: string[] = [];
  const known = new Set<string>();
  const links: SankeyLink[] = [];
  let inFrontmatter = false;
  let sawHeader = false;
  let warnedFrontmatter = false;
  let warnedLinks = false;
  let warnedNodes = false;
  let dropped = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (line === '---' && !sawHeader) {
      inFrontmatter = !inFrontmatter;
      if (!warnedFrontmatter) {
        warnings.push('Sankey frontmatter/config is not supported and was ignored.');
        warnedFrontmatter = true;
      }
      continue;
    }
    if (inFrontmatter) continue;
    if (!sawHeader) {
      sawHeader = true;
      if (/^sankey(?:-beta)?\b/i.test(line)) continue;
    }

    const fields = splitCsv(line);
    const [source, target, rawValue] = fields;
    const value = Number(rawValue);
    if (fields.length !== 3 || !source || !target || rawValue === '' || !Number.isFinite(value) || value <= 0) {
      warnings.push(`Unsupported record ignored: ${line}`);
      continue;
    }
    if (source === target || reaches(links, target, source)) {
      dropped++;
      continue;
    }
    if (links.length >= MAX_LINKS) {
      if (!warnedLinks) warnings.push(`Sankey limited to ${MAX_LINKS} links; the rest were ignored.`);
      warnedLinks = true;
      continue;
    }
    const fresh = [source, target].filter((n) => !known.has(n));
    if (known.size + new Set(fresh).size > MAX_NODES) {
      if (!warnedNodes) warnings.push(`Sankey limited to ${MAX_NODES} nodes; links to further nodes were ignored.`);
      warnedNodes = true;
      continue;
    }
    for (const n of fresh) {
      known.add(n);
      nodes.push(n);
    }
    links.push({ source, target, value });
  }
  if (dropped > 0) warnings.push(`${dropped} self-link or circular link(s) ignored (a Sankey flows one way).`);

  return { ast: { nodes, links }, warnings };
}
