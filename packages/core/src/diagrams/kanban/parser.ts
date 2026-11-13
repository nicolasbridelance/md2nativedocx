/**
 * Parser for Mermaid `kanban`. Structure is indentation-based: the least
 * indented item lines are columns, anything indented deeper is a card of the
 * most recent column. An item is `id[Title]`, `[Title]` or a bare `Title`
 * (which doubles as its own id), optionally followed by
 * `@{ ticket: X, assigned: 'y', priority: 'High' }` metadata.
 *
 * Deliberately NOT implemented: the `ticketBaseUrl` frontmatter option, which
 * would turn tickets into hyperlinks — this project never emits remote
 * references (AGENTS.md rule 3). Frontmatter is skipped with one warning.
 */

import type { KanbanBoard, KanbanCard, KanbanColumn, KanbanPriority } from './types.js';

export interface KanbanParseResult {
  ast: KanbanBoard;
  warnings: string[];
}

const PRIORITIES: readonly KanbanPriority[] = ['Very High', 'High', 'Low', 'Very Low'];

function stripQuotes(text: string): string {
  const t = text.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) return t.slice(1, -1);
  return t;
}

/** Split `a: 1, b: 'x, y'` on commas that are outside quotes. */
function splitMeta(meta: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote = '';
  for (const ch of meta) {
    if (quote) {
      if (ch === quote) quote = '';
      current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

interface Item {
  id: string;
  title: string;
  meta?: string;
}

function parseItem(line: string): Item | undefined {
  let rest = line;
  let meta: string | undefined;
  const at = rest.lastIndexOf('@{');
  if (at >= 0 && rest.trimEnd().endsWith('}')) {
    meta = rest.slice(at + 2, rest.trimEnd().length - 1);
    rest = rest.slice(0, at).trim();
  }
  const open = rest.indexOf('[');
  const close = rest.lastIndexOf(']');
  if (open >= 0 && close > open) {
    const title = rest.slice(open + 1, close).trim();
    const id = rest.slice(0, open).trim();
    if (title.length === 0) return undefined;
    return { id: id || title, title, meta };
  }
  if (rest.length === 0) return undefined;
  return { id: rest, title: rest, meta };
}

export function parseKanban(text: string): KanbanParseResult {
  const warnings: string[] = [];
  const columns: KanbanColumn[] = [];
  let columnIndent = -1;
  let inFrontmatter = false;
  let sawFrontmatterNote = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;

    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      if (!sawFrontmatterNote) {
        warnings.push('Kanban frontmatter/config (including ticketBaseUrl) is not supported and was ignored.');
        sawFrontmatterNote = true;
      }
      continue;
    }
    if (inFrontmatter) continue;
    if (/^kanban\b/i.test(line)) continue;

    const item = parseItem(line);
    if (!item) {
      warnings.push(`Unsupported line ignored: ${line}`);
      continue;
    }
    const indent = rawLine.length - rawLine.trimStart().length;
    if (columnIndent < 0) columnIndent = indent;

    const column = columns[columns.length - 1];
    if (indent <= columnIndent || !column) {
      columns.push({ id: item.id, title: item.title, cards: [] });
      continue;
    }

    const card: KanbanCard = { id: item.id, title: item.title };
    if (item.meta !== undefined) {
      for (const pair of splitMeta(item.meta)) {
        const colon = pair.indexOf(':');
        if (colon < 0) continue;
        const key = pair.slice(0, colon).trim().toLowerCase();
        const value = stripQuotes(pair.slice(colon + 1));
        if (key === 'ticket') card.ticket = value;
        else if (key === 'assigned') card.assigned = value;
        else if (key === 'priority') {
          const match = PRIORITIES.find((p) => p.toLowerCase() === value.toLowerCase());
          if (match) card.priority = match;
          else warnings.push(`Unknown kanban priority "${value}" ignored.`);
        } else {
          warnings.push(`Unknown kanban metadata key "${key}" ignored.`);
        }
      }
    }
    column.cards.push(card);
  }

  return { ast: { columns }, warnings };
}
