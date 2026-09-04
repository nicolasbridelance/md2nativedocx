/**
 * Parser for Mermaid `venn-beta` (grammar as documented at
 * mermaid.js.org/syntax/venn.html, fetched 2026-09-04 — treat with more
 * caution than a stable-status type: `venn-beta` is one of Mermaid's "New 🔥"
 * additions, this project's first look at its exact grammar). Same
 * forgiving, line-oriented convention as `../quadrant/parser.ts` and the
 * flowchart parser: an unrecognized line is skipped with a warning, never a
 * throw.
 *
 * V1 scope, deliberately: `set <id> [<label>]`, `union <id>,<id>,...`,
 * `text [<label>]` attached to the immediately preceding `set`/`union`, and
 * `style <id> fill:#RRGGBB` for a single set. NOT implemented yet (each
 * degrades to "ignored, with a warning", never silently dropped): the `:N`
 * size suffix on `set`/`union` (this project's translator computes its own
 * fixed circle layout, see `translator.ts`), and a `style` targeting a
 * *union* rather than a single set — the translator renders overlap color as
 * the natural alpha-blend of the two sets' own fills rather than an
 * independent override, so there is no shape for a union-specific fill to
 * attach to yet.
 */

import type { VennChart, VennSet, VennUnion } from './types.js';

export interface VennParseResult {
  ast: VennChart;
  warnings: string[];
}

function stripQuotes(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Extract a trailing `[...]` bracket (Mermaid's display-label syntax) from
 * `rest`, returning the label (quotes stripped) and what remains before it. */
function extractBracket(rest: string): { before: string; label?: string } {
  const bracketMatch = rest.match(/\[(.*)\]\s*$/);
  if (!bracketMatch) return { before: rest.trim() };
  return {
    before: rest.slice(0, bracketMatch.index).trim(),
    label: stripQuotes(bracketMatch[1] ?? ''),
  };
}

/** Strip a trailing `:N` size suffix (recognized, ignored — see module doc
 * comment) so it doesn't get parsed as part of an id/bracket. */
function stripSize(rest: string): string {
  return rest.replace(/:\d+\s*$/, '');
}

const FILL_ATTR = /fill:\s*(#[0-9A-Fa-f]{6})/;

export function parseVennChart(text: string): VennParseResult {
  const warnings: string[] = [];
  const ast: VennChart = { sets: [], unions: [] };
  const setById = new Map<string, VennSet>();
  let lastTarget: VennSet | VennUnion | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (/^venn-beta\b/i.test(line)) continue;

    let match: RegExpMatchArray | null;

    if ((match = line.match(/^title\s+(.+)$/i))) {
      ast.title = (match[1] ?? '').trim();
      continue;
    }

    if ((match = line.match(/^set\s+(.+)$/i))) {
      const { before, label } = extractBracket(stripSize(match[1] ?? ''));
      const id = stripQuotes(before);
      if (!id) {
        warnings.push(`Unsupported line ignored (set with no id): ${line}`);
        continue;
      }
      const set: VennSet = { id, label: label ?? id };
      ast.sets.push(set);
      setById.set(id, set);
      lastTarget = set;
      continue;
    }

    if ((match = line.match(/^union\s+(.+)$/i))) {
      const setIds = stripSize(match[1] ?? '')
        .split(',')
        .map((part) => stripQuotes(part))
        .filter((part) => part.length > 0);
      if (setIds.length < 2) {
        warnings.push(`Unsupported line ignored (union needs at least 2 sets): ${line}`);
        continue;
      }
      const unknown = setIds.filter((id) => !setById.has(id));
      if (unknown.length > 0) {
        warnings.push(`Unsupported line ignored (union references undeclared set(s) ${unknown.join(', ')}): ${line}`);
        continue;
      }
      const union: VennUnion = { setIds };
      ast.unions.push(union);
      lastTarget = union;
      continue;
    }

    if ((match = line.match(/^text\s+(.+)$/i))) {
      const { label } = extractBracket(match[1] ?? '');
      const text = label ?? stripQuotes(match[1] ?? '');
      if (!lastTarget) {
        warnings.push(`Unsupported line ignored (text with no preceding set/union): ${line}`);
        continue;
      }
      lastTarget.label = text;
      continue;
    }

    if ((match = line.match(/^style\s+(\S+)\s+(.+)$/i))) {
      const targetIds = (match[1] ?? '').split(',').map((part) => stripQuotes(part));
      const colorMatch = (match[2] ?? '').match(FILL_ATTR);
      if (targetIds.length === 1) {
        const set = setById.get(targetIds[0] ?? '');
        if (!set) {
          warnings.push(`Unsupported line ignored (style targets unknown set): ${line}`);
          continue;
        }
        if (colorMatch) set.fill = (colorMatch[1] ?? '').slice(1).toUpperCase();
      } else {
        warnings.push(
          `Union-specific fill styling is not yet supported for Venn diagrams, ignored (overlap color derives from each set's own fill): ${line}`,
        );
      }
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  return { ast, warnings };
}
