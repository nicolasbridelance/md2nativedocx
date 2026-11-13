/**
 * Parser for Mermaid `cynefin-beta` diagrams (grammar verified against the
 * real `mermaid-js/mermaid` docs source, see `types.ts`'s doc comment for
 * the fetch note and the full v1 scope).
 *
 * Line-oriented, same forgiving convention as every other module here: an
 * unrecognized line is skipped with a warning rather than throwing. A
 * domain keyword line (`complex`/`complicated`/`clear`/`chaotic`/
 * `confusion`, alone on its own line) sets the "current domain" that
 * following quoted-string item lines attach to — implicitly closed by the
 * next domain keyword, transition line, or end of input, same shape as
 * `../gantt/parser.ts`'s `currentSection` tracking.
 *
 * Self-loop transitions (`complex --> complex`) are silently dropped, not
 * warned — this is Mermaid's own explicitly documented behavior ("Self-loop
 * transitions ... are silently ignored"), not a gap this project is
 * choosing to paper over.
 */

import type { CynefinDiagram, CynefinDomain, CynefinTransition } from './types.js';

export interface CynefinParseResult {
  ast: CynefinDiagram;
  warnings: string[];
}

const DOMAINS: readonly CynefinDomain[] = ['complex', 'complicated', 'clear', 'chaotic', 'confusion'];
const DOMAIN_SET = new Set<string>(DOMAINS);

const TITLE_RE = /^title\s+(.+)$/i;
const ITEM_RE = /^"([^"]*)"$/;
// Split the same way `../git-graph/parser.ts` splits its header/branch
// regexes — a small "leading shape" match, then the trailing `: "label"`
// parsed separately — rather than one regex combining the arrow with an
// optional trailing group (sidesteps the same eslint-plugin-security
// detect-unsafe-regex false positive documented there).
const TRANSITION_RE = /^(\S+)\s*-->\s*(\S+)(.*)$/;
const TRANSITION_LABEL_RE = /^:\s*(?:"([^"]*)"|(\S+))$/;

function emptyItems(): Record<CynefinDomain, string[]> {
  return { complex: [], complicated: [], clear: [], chaotic: [], confusion: [] };
}

export function parseCynefinDiagram(text: string): CynefinParseResult {
  const warnings: string[] = [];
  let title: string | undefined;
  const items = emptyItems();
  const transitions: CynefinTransition[] = [];
  let currentDomain: CynefinDomain | undefined;
  let warnedAccessibility = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (/^cynefin-beta\b/i.test(line)) continue;

    if (DOMAIN_SET.has(line.toLowerCase())) {
      currentDomain = line.toLowerCase() as CynefinDomain;
      continue;
    }

    const titleMatch = line.match(TITLE_RE);
    if (titleMatch) {
      title = titleMatch[1]!.trim();
      continue;
    }

    if (/^(?:accTitle|accDescr)\b/i.test(line)) {
      if (!warnedAccessibility) {
        warnedAccessibility = true;
        warnings.push('accTitle/accDescr accessibility directives are recognized but have no OOXML equivalent, ignored.');
      }
      continue;
    }

    const itemMatch = line.match(ITEM_RE);
    if (itemMatch) {
      if (!currentDomain) {
        warnings.push(`Item ignored (no preceding domain block): ${line}`);
        continue;
      }
      items[currentDomain].push(itemMatch[1]!);
      continue;
    }

    const transitionMatch = line.match(TRANSITION_RE);
    if (transitionMatch) {
      const from = transitionMatch[1]!.toLowerCase();
      const to = transitionMatch[2]!.toLowerCase();
      if (!DOMAIN_SET.has(from) || !DOMAIN_SET.has(to)) {
        warnings.push(`Transition ignored (unrecognized domain name — only complex/complicated/clear/chaotic/confusion are valid): ${line}`);
        continue;
      }
      if (from === to) continue; // self-loop, silently ignored — see module doc comment
      const rest = (transitionMatch[3] ?? '').trim();
      let label: string | undefined;
      if (rest.length > 0) {
        const labelMatch = rest.match(TRANSITION_LABEL_RE);
        if (labelMatch) {
          label = labelMatch[1] !== undefined ? labelMatch[1] : labelMatch[2];
        } else {
          warnings.push(`Unrecognized trailing text on transition ignored: ${line}`);
        }
      }
      transitions.push({ from: from as CynefinDomain, to: to as CynefinDomain, ...(label ? { label } : {}) });
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  return {
    ast: { ...(title ? { title } : {}), items, transitions },
    warnings,
  };
}
