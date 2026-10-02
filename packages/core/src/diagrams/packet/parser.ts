/**
 * Parser for Mermaid `packet`: one field per line, `start: "Name"`,
 * `start-end: "Name"` or `+count: "Name"` (starts right after the previous
 * field). `title <text>` on its own line, or `title: "<text>"` inside the
 * leading `---` frontmatter, sets the title. Trailing `%%` comments are
 * stripped. Other frontmatter (`showBits`, `bitOrder`, `bitsPerRow`, ...) is
 * not supported: skipped with one warning, rendered with Mermaid's defaults
 * (32 bits per row, lowest bit on the left, bit numbers shown).
 */

import type { PacketDiagram } from './types.js';

export interface PacketParseResult {
  ast: PacketDiagram;
  warnings: string[];
}

const MAX_BITS = 65536; // sanity cap so a hostile `+999999999` can't allocate unbounded rows

function stripQuotes(text: string): string {
  const t = text.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) return t.slice(1, -1);
  return t;
}

/** The quoted label, ignoring anything after its closing quote (e.g. a `%%` comment). */
function parseLabel(rest: string): string | undefined {
  const t = rest.trim();
  const quote = t[0];
  if (quote !== '"' && quote !== "'") return undefined;
  const close = t.indexOf(quote, 1);
  return close < 0 ? undefined : t.slice(1, close);
}

export function parsePacketDiagram(text: string): PacketParseResult {
  const warnings: string[] = [];
  const ast: PacketDiagram = { fields: [] };
  let nextBit = 0;
  let inFrontmatter = false;
  let sawFrontmatterNote = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;

    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) {
      const titleMatch = line.match(/^title\s*:\s*(.+)$/i);
      if (titleMatch) ast.title = stripQuotes(titleMatch[1] ?? '');
      else if (!sawFrontmatterNote) {
        warnings.push('Packet config (showBits, bitOrder, bitsPerRow, ...) is not supported and was ignored.');
        sawFrontmatterNote = true;
      }
      continue;
    }
    if (/^packet(-beta)?\b/i.test(line)) continue;

    let match: RegExpMatchArray | null;
    if ((match = line.match(/^title\s+(.+)$/i))) {
      ast.title = stripQuotes(match[1] ?? '');
      continue;
    }

    const colon = line.indexOf(':');
    const label = colon < 0 ? undefined : parseLabel(line.slice(colon + 1));
    if (colon < 0 || label === undefined) {
      warnings.push(`Unsupported line ignored: ${line}`);
      continue;
    }
    const spec = line.slice(0, colon).trim();

    let start: number;
    let end: number;
    if ((match = spec.match(/^\+(\d+)$/))) {
      const count = Number(match[1]);
      if (count < 1) {
        warnings.push(`Packet field needs at least 1 bit, ignored: ${line}`);
        continue;
      }
      start = nextBit;
      end = nextBit + count - 1;
    } else if ((match = spec.match(/^(\d+)$/))) {
      start = end = Number(match[1]);
    } else if ((match = spec.match(/^(\d+)\s*-\s*(\d+)$/))) {
      start = Number(match[1]);
      end = Number(match[2]);
    } else {
      warnings.push(`Unsupported line ignored: ${line}`);
      continue;
    }
    if (end < start) {
      warnings.push(`Packet field end bit is before its start bit, ignored: ${line}`);
      continue;
    }
    if (end >= MAX_BITS) {
      warnings.push(`Packet field exceeds the ${MAX_BITS}-bit limit, ignored: ${line}`);
      continue;
    }
    ast.fields.push({ start, end, label });
    nextBit = end + 1;
  }

  return { ast, warnings };
}
