/**
 * Parser for Mermaid `erDiagram`. Grammar checked against Mermaid's syntax page and, since 2026-11-20, against
 * Mermaid's own parser on its official examples (`tools/mermaid-differential/`). Line-oriented, same forgiving
 * convention as `../../parser/parser.ts` and `../class-diagram/parser.ts`.
 *
 * Supported:
 * - Entity references: a name (letters in any script, digits, `_`, `-`) or a quoted name (`"This ❤ Unicode"`),
 *   an optional alias drawn instead of the name (`p[Person]`, `a["Customer Account"]`), an optional
 *   `:::class` suffix (styling is not applied, warned once).
 * - Attribute blocks (`ENTITY { type name [PK|FK|UK[,...]] ["comment"] }`).
 * - Relationships `ENTITY1 <card><line><card> ENTITY2 [: label]`, with or without spaces around the tokens:
 *   cardinality as a crow's-foot symbol on either side (`|o` `o|` `||` `}o` `o{` `}|` `|{`) or in words
 *   (`only one`, `zero or more`, `many(0)`, `1+`...), and the line as `--`/`to` (identifying) or
 *   `..`/`optionally to` (non-identifying).
 * - A bare entity declaration (`CUSTOMER`, `"Quoted name"`, `HOUSE:::style`).
 *
 * - `direction TB|TD|BT|LR|RL`.
 *
 * Recognized and warned, never silently dropped: `classDef`/`class`/`style`, and `subgraph`
 * groups (their entities are kept, the group box is not drawn).
 */

import { splitLines, splitStatements } from '../../parser/normalize-statements.js';
import type { ErAttribute, ErCardinality, ErDiagram, ErEntity } from './types.js';

export interface ErDiagramParseResult {
  ast: ErDiagram;
  warnings: string[];
}

/** Crow's-foot symbols: each state has a spelling for each side, and Mermaid accepts either on either side. */
const CARDINALITY_SYMBOLS: ReadonlyArray<readonly [string, ErCardinality]> = [
  ['|o', 'zero-or-one'],
  ['o|', 'zero-or-one'],
  ['||', 'exactly-one'],
  ['}o', 'zero-or-many'],
  ['o{', 'zero-or-many'],
  ['}|', 'one-or-many'],
  ['|{', 'one-or-many'],
];

/** Cardinality in words (Mermaid's aliases), longest first so `1+` is not read as `1`. */
const CARDINALITY_WORDS: ReadonlyArray<readonly [string, ErCardinality]> = [
  ['zero or more', 'zero-or-many'],
  ['zero or many', 'zero-or-many'],
  ['one or more', 'one-or-many'],
  ['one or many', 'one-or-many'],
  ['one or zero', 'zero-or-one'],
  ['zero or one', 'zero-or-one'],
  ['only one', 'exactly-one'],
  ['many(0)', 'zero-or-many'],
  ['many(1)', 'one-or-many'],
  ['0+', 'zero-or-many'],
  ['1+', 'one-or-many'],
  ['1', 'exactly-one'],
];

/** Relationship line: symbols, then words (which need a space after them). `true` = identifying. */
const LINE_SYMBOLS: ReadonlyArray<readonly [string, boolean]> = [
  ['--', true],
  ['..', false],
];
const LINE_WORDS: ReadonlyArray<readonly [string, boolean]> = [
  ['optionally to', false],
  ['to', true],
];

const NAME = /[\p{L}\p{N}_][\p{L}\p{N}_-]*/uy;
const CLASS_SUFFIX = /:::[\w,-]+/y;
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

function stripQuotes(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

/** An entity reference as written: its id, the alias drawn instead (if any), whether it carried `:::class`. */
interface EntityRef {
  id: string;
  label?: string;
  styled: boolean;
}

/** A cursor over one statement; each `read*` either consumes what it recognizes or leaves the cursor as it was. */
class Cursor {
  constructor(
    readonly text: string,
    public at = 0,
  ) {}

  skipSpaces(): void {
    while (this.at < this.text.length && /\s/.test(this.text[this.at]!)) this.at++;
  }

  get done(): boolean {
    return this.at >= this.text.length;
  }

  /** `true` if `token` is next (case-insensitive) and, when `word`, followed by a space; consumes it. */
  take(token: string, word: boolean): boolean {
    const next = this.text.slice(this.at, this.at + token.length);
    if (next.toLowerCase() !== token.toLowerCase()) return false;
    if (word && !/\s/.test(this.text[this.at + token.length] ?? '')) return false;
    this.at += token.length;
    return true;
  }

  readSticky(pattern: RegExp): string | undefined {
    pattern.lastIndex = this.at;
    const m = pattern.exec(this.text);
    if (!m) return undefined;
    this.at += m[0].length;
    return m[0];
  }

  readEntity(): EntityRef | undefined {
    const start = this.at;
    let id: string | undefined;
    if (this.text[this.at] === '"') {
      const close = this.text.indexOf('"', this.at + 1);
      if (close > this.at + 1) {
        id = this.text.slice(this.at + 1, close);
        this.at = close + 1;
      }
    } else {
      id = this.readSticky(NAME);
    }
    if (id === undefined) {
      this.at = start;
      return undefined;
    }
    let label: string | undefined;
    if (this.text[this.at] === '[') {
      const close = this.text.indexOf(']', this.at);
      if (close === -1) {
        this.at = start;
        return undefined;
      }
      label = stripQuotes(this.text.slice(this.at + 1, close));
      this.at = close + 1;
    }
    const styled = this.readSticky(CLASS_SUFFIX) !== undefined;
    return { id, ...(label ? { label } : {}), styled };
  }

  readCardinality(): ErCardinality | undefined {
    for (const [symbol, cardinality] of CARDINALITY_SYMBOLS) if (this.take(symbol, false)) return cardinality;
    for (const [word, cardinality] of CARDINALITY_WORDS) if (this.take(word, true)) return cardinality;
    return undefined;
  }

  readLine(): boolean | undefined {
    for (const [symbol, identifying] of LINE_SYMBOLS) if (this.take(symbol, false)) return identifying;
    for (const [word, identifying] of LINE_WORDS) if (this.take(word, true)) return identifying;
    return undefined;
  }
}

type Statement =
  | { kind: 'relationship'; from: EntityRef; to: EntityRef; fromCardinality: ErCardinality; toCardinality: ErCardinality; identifying: boolean; label?: string }
  | { kind: 'block'; entity: EntityRef }
  | { kind: 'entity'; entity: EntityRef };

/** Read one statement made of entity references: a relationship, a block opening, or a bare declaration. */
function readStatement(line: string): Statement | undefined {
  const c = new Cursor(line);
  const from = c.readEntity();
  if (!from) return undefined;
  c.skipSpaces();
  if (c.done) return { kind: 'entity', entity: from };
  if (c.take('{', false)) {
    c.skipSpaces();
    return c.done ? { kind: 'block', entity: from } : undefined;
  }
  const fromCardinality = c.readCardinality();
  if (!fromCardinality) return undefined;
  c.skipSpaces();
  const identifying = c.readLine();
  if (identifying === undefined) return undefined;
  c.skipSpaces();
  const toCardinality = c.readCardinality();
  if (!toCardinality) return undefined;
  c.skipSpaces();
  const to = c.readEntity();
  if (!to) return undefined;
  c.skipSpaces();
  let label: string | undefined;
  if (c.take(':', false)) label = stripQuotes(line.slice(c.at));
  else if (!c.done) return undefined;
  return { kind: 'relationship', from, to, fromCardinality, toCardinality, identifying, ...(label ? { label } : {}) };
}

export function parseErDiagram(text: string): ErDiagramParseResult {
  const warnings: string[] = [];
  const warned = new Set<string>();
  const warnOnce = (key: string, message: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push(message);
  };
  const entities = new Map<string, ErEntity>();
  const relationships: ErDiagram['relationships'] = [];
  let openEntity: ErEntity | null = null;
  let subgraphDepth = 0;
  let direction: ErDiagram['direction'];

  function entity(ref: EntityRef): ErEntity {
    let found = entities.get(ref.id);
    if (!found) {
      found = { id: ref.id, attributes: [] };
      entities.set(ref.id, found);
    }
    if (ref.label !== undefined) found.label = ref.label;
    if (ref.styled) warnOnce('style', 'Styling directives are not yet supported for ER diagrams: `:::class` on an entity is ignored.');
    return found;
  }

  for (const rawLine of splitLines(text).flatMap((l) => splitStatements(l, { brackets: false }))) {
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

    if (/^subgraph\b/i.test(line)) {
      subgraphDepth++;
      warnOnce('subgraph', 'ER groups (`subgraph`) are not drawn as boxes; their entities are kept.');
      continue;
    }
    if (/^end$/i.test(line) && subgraphDepth > 0) {
      subgraphDepth--;
      continue;
    }
    const directionMatch = /^direction\s+(TB|TD|BT|LR|RL)$/i.exec(line);
    if (directionMatch) {
      const requested = directionMatch[1]!.toUpperCase();
      direction = requested === 'TB' ? 'TD' : (requested as NonNullable<ErDiagram['direction']>);
      continue;
    }
    if (/^(?:classDef|class|style)\b/i.test(line)) {
      warnings.push(`Styling directives are not yet supported for ER diagrams, ignored: ${line}`);
      continue;
    }

    const statement = readStatement(line);
    if (statement?.kind === 'block') {
      openEntity = entity(statement.entity);
      continue;
    }
    if (statement?.kind === 'entity') {
      entity(statement.entity);
      continue;
    }
    if (statement?.kind === 'relationship') {
      entity(statement.from);
      entity(statement.to);
      relationships.push({
        from: statement.from.id,
        to: statement.to.id,
        fromCardinality: statement.fromCardinality,
        toCardinality: statement.toCardinality,
        identifying: statement.identifying,
        ...(statement.label ? { label: statement.label } : {}),
      });
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  if (openEntity) {
    warnings.push('One or more entity attribute blocks were not closed with a matching "}".');
  }

  return {
    ast: { ...(direction ? { direction } : {}), entities: [...entities.values()], relationships },
    warnings,
  };
}
