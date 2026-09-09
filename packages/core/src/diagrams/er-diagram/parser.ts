/**
 * Parser for Mermaid `erDiagram` (grammar verified against
 * mermaid.js.org/syntax/entityRelationshipDiagram.html, fetched 2026-09-09).
 * Line-oriented, same forgiving convention as `../../parser/parser.ts` and
 * `../class-diagram/parser.ts`.
 *
 * V1 scope, deliberately:
 * - Entities with an attribute block (`ENTITY { type name [PK|FK|UK[,...]]
 *   ["comment"] }`).
 * - Relationships (`ENTITY1 <card><line><card> ENTITY2 [: "label"]`) with
 *   all 4 crow's-foot cardinality states on each end and the identifying
 *   (`--`) vs non-identifying (`..`) line style.
 *
 * NOT implemented yet, each degrading to "recognized and warned", never
 * silently dropped:
 * - `classDef`/`class`/`style` styling.
 * - A bare/undocumented `direction` statement, if erDiagram even supports
 *   one — not confirmed on the source page, left unhandled (falls through
 *   to the generic "unsupported line" warning) rather than guessed.
 * - Entity aliasing — no confirmed literal syntax was found on the source
 *   page (see `types.ts`'s doc comment); not implemented rather than
 *   guessed.
 */

import type { ErAttribute, ErCardinality, ErDiagram, ErEntity } from './types.js';

export interface ErDiagramParseResult {
  ast: ErDiagram;
  warnings: string[];
}

// Left-side and right-side cardinality tokens are mirrored spellings of the
// same 4 states (e.g. `|o` next to entity1 vs `o|` next to entity2).
const LEFT_CARDINALITY: Readonly<Record<string, ErCardinality>> = {
  '|o': 'zero-or-one',
  '||': 'exactly-one',
  '}o': 'zero-or-many',
  '}|': 'one-or-many',
};
const RIGHT_CARDINALITY: Readonly<Record<string, ErCardinality>> = {
  'o|': 'zero-or-one',
  '||': 'exactly-one',
  'o{': 'zero-or-many',
  '|{': 'one-or-many',
};

function stripQuotes(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

const ATTRIBUTE_BLOCK_OPEN = /^(\S+)\s*\{\s*$/;
const COMMENT_SUFFIX = /"([^"]*)"\s*$/;
const KEY_WORDS = new Set(['PK', 'FK', 'UK']);

function parseAttributeLine(line: string): ErAttribute | null {
  let rest = line;
  let comment: string | undefined;
  const commentMatch = rest.match(COMMENT_SUFFIX);
  if (commentMatch) {
    comment = commentMatch[1];
    rest = rest.slice(0, commentMatch.index).trim();
  }
  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const [type, name] = parts;
  const keys = parts
    .slice(2)
    .map((p) => p.replace(/,/g, '').toUpperCase())
    .filter((k) => KEY_WORDS.has(k));
  return { type: type!, name: name!, keys, ...(comment !== undefined ? { comment } : {}) };
}

export function parseErDiagram(text: string): ErDiagramParseResult {
  const warnings: string[] = [];
  const entities = new Map<string, ErEntity>();
  const relationships: ErDiagram['relationships'] = [];
  let openEntity: ErEntity | null = null;

  function getOrCreateEntity(id: string): ErEntity {
    let entity = entities.get(id);
    if (!entity) {
      entity = { id, attributes: [] };
      entities.set(id, entity);
    }
    return entity;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (/^erDiagram\b/i.test(line)) continue;

    if (openEntity) {
      if (line === '}') {
        openEntity = null;
        continue;
      }
      const attr = parseAttributeLine(line);
      if (attr) {
        openEntity.attributes.push(attr);
      } else {
        warnings.push(`Unsupported attribute line ignored: ${line}`);
      }
      continue;
    }

    const blockOpen = line.match(ATTRIBUTE_BLOCK_OPEN);
    if (blockOpen) {
      openEntity = getOrCreateEntity(blockOpen[1]!);
      continue;
    }

    // Relationship line: split on the literal `--`/`..` line-style token
    // rather than one combined regex spanning both cardinality tokens and
    // both entity names — the same detect-unsafe-regex false positive
    // already documented at `../quadrant/parser.ts`'s POINT_TAIL and
    // `../state-diagram/parser.ts`'s transition parsing.
    let sepIdx = line.indexOf('--');
    let identifying = true;
    if (sepIdx === -1) {
      sepIdx = line.indexOf('..');
      identifying = false;
    }
    if (sepIdx !== -1) {
      const leftTokens = line.slice(0, sepIdx).trim().split(/\s+/).filter(Boolean);
      const rightRest = line.slice(sepIdx + 2).trim();
      const rightSpaceIdx = rightRest.indexOf(' ');
      const rightCardToken = rightSpaceIdx === -1 ? rightRest : rightRest.slice(0, rightSpaceIdx);
      const afterRightCard = rightSpaceIdx === -1 ? '' : rightRest.slice(rightSpaceIdx + 1).trim();
      const colonIdx = afterRightCard.indexOf(':');
      const toId = (colonIdx === -1 ? afterRightCard : afterRightCard.slice(0, colonIdx)).trim();
      const labelRaw = colonIdx === -1 ? undefined : afterRightCard.slice(colonIdx + 1).trim();

      const fromId = leftTokens.length === 2 ? leftTokens[0]! : '';
      const leftCardToken = leftTokens.length === 2 ? leftTokens[1]! : '';
      const fromCardinality = LEFT_CARDINALITY[leftCardToken];
      const toCardinality = RIGHT_CARDINALITY[rightCardToken];

      if (fromId.length > 0 && toId.length > 0 && fromCardinality && toCardinality) {
        getOrCreateEntity(fromId);
        getOrCreateEntity(toId);
        relationships.push({
          from: fromId,
          to: toId,
          fromCardinality,
          toCardinality,
          identifying,
          ...(labelRaw ? { label: stripQuotes(labelRaw) } : {}),
        });
        continue;
      }
    }

    if (/^(?:classDef|class|style)\b/i.test(line)) {
      warnings.push(`Styling directives are not yet supported for ER diagrams, ignored: ${line}`);
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  if (openEntity) {
    warnings.push('One or more entity attribute blocks were not closed with a matching "}".');
  }

  return {
    ast: { entities: [...entities.values()], relationships },
    warnings,
  };
}
