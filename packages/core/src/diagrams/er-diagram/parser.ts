/**
 * Parser for Mermaid `erDiagram`. Grammar checked against Mermaid's syntax page and, since 2026-11-20, against
 * Mermaid's own parser on its official examples (`tools/mermaid-differential/`). Line-oriented, same forgiving
 * convention as `../../parser/parser.ts` and `../class-diagram/parser.ts`.
 *
 * Supported:
 * - Entity references: a name (letters in any script, digits, `_`, `-`) or a quoted name (`"This ❤ Unicode"`),
 *   an optional alias drawn instead of the name (`p[Person]`, `a["Customer Account"]`), an optional
 *   `:::class` suffix.
 * - Attribute blocks (`ENTITY { type name [PK|FK|UK[,...]] ["comment"] }`).
 * - Relationships `ENTITY1 <card><line><card> ENTITY2 [: label]`, with or without spaces around the tokens:
 *   cardinality as a crow's-foot symbol on either side (`|o` `o|` `||` `}o` `o{` `}|` `|{`) or in words
 *   (`only one`, `zero or more`, `many(0)`, `1+`...), and the line as `--`/`to` (identifying) or
 *   `..`/`optionally to` (non-identifying).
 * - A bare entity declaration (`CUSTOMER`, `"Quoted name"`, `HOUSE:::style`).
 *
 * - `direction TB|TD|BT|LR|RL`, for the diagram or, inside a group, for that group.
 * - `subgraph id [Title]` / `subgraph "Title"` / `subgraph Title` ... `end` groups, nested, as Mermaid reads
 *   them: a group holds the entities its statements name (both ends of a relationship) and the groups closed
 *   inside it; an entity already in an inner group stays there. A group's id in a relationship
 *   (`title1 ||--|| title2`) is the group: no entity of that name is drawn. Nesting capped at 20 levels.
 * - Styling: `style id[,id] props`, `classDef name[,name] props` applied through `:::name` or
 *   `class id[,id] name`, and `classDef default` for every entity, layered as Mermaid does (default, then
 *   each class in order, then `style`). Fill, stroke and text colour are read; `style` and `class` also
 *   colour a group.
 */

import { splitLines, splitStatements } from '../../parser/normalize-statements.js';
import { extractNodeStyle, parseCssStyleProps, type NodeStylePatch } from '../../parser/css-style.js';
import type { ErAttribute, ErCardinality, ErDiagram, ErEntity, ErGroup } from './types.js';

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
const MAX_GROUP_DEPTH = 20;
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

/** An entity reference as written: its id, the alias drawn instead (if any), the classes of its `:::` suffix. */
interface EntityRef {
  id: string;
  label?: string;
  classes: string[];
}

const splitList = (text: string): string[] =>
  text
    .split(',')
    .map((part) => stripQuotes(part))
    .filter((part) => part.length > 0);

/** `subgraph id [Title]`, `subgraph "Title"`, `subgraph Title`: the group's id and title. */
function parseSubgraphHeader(rest: string): { id: string; label: string } | undefined {
  const text = rest.trim();
  const open = text.indexOf('[');
  if (open > 0 && text.endsWith(']')) {
    const id = stripQuotes(text.slice(0, open));
    const label = stripQuotes(text.slice(open + 1, -1));
    return id === '' ? undefined : { id, label: label === '' ? id : label };
  }
  const id = stripQuotes(text);
  return id === '' ? undefined : { id, label: id };
}

/**
 * `classDef a,b props`, `style id,id props` or `class id,id name`, or `null`. Read by splitting at the first
 * spaces rather than with one regular expression (untrusted input, `security/detect-unsafe-regex`), as the
 * class diagram's parser does.
 */
function parseStyling(
  line: string,
):
  | { kind: 'classDef'; names: string[]; patch: NodeStylePatch }
  | { kind: 'style'; ids: string[]; patch: NodeStylePatch }
  | { kind: 'class'; ids: string[]; names: string[] }
  | null {
  const keyword = /^(classDef|style|class)\s/i.exec(line)?.[1]?.toLowerCase();
  if (keyword === undefined) return null;
  const rest = line.slice(keyword.length).trim();
  const space = rest.search(/\s/);
  if (space === -1) return null;
  const targets = splitList(rest.slice(0, space));
  const value = rest.slice(space + 1).trim();
  if (targets.length === 0 || value === '') return null;
  if (keyword === 'class') return { kind: 'class', ids: targets, names: splitList(value) };
  const patch = extractNodeStyle(parseCssStyleProps(value));
  return keyword === 'style' ? { kind: 'style', ids: targets, patch } : { kind: 'classDef', names: targets, patch };
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
    const suffix = this.readSticky(CLASS_SUFFIX);
    return { id, ...(label ? { label } : {}), classes: suffix ? splitList(suffix.slice(3)) : [] };
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
  let direction: ErDiagram['direction'];
  /**
   * Open `subgraph`s, innermost last, each with the names its statements gave; `null` for one that is not
   * drawn (past MAX_GROUP_DEPTH, nameless, or a second group of a name), whose names go to the drawn group
   * around it.
   */
  const openGroups: Array<{ group: ErGroup; names: string[] } | null> = [];
  /** Closed groups, inner before outer (the order they close in). */
  const groups = new Map<string, ErGroup>();
  /** Entities and groups already placed in a group: an outer group does not take them again. */
  const placed = new Set<string>();
  // Styling, resolved once every line is read: a `classDef` may come after the entity that uses it.
  const classDefs = new Map<string, NodeStylePatch>();
  const classNames = new Map<string, string[]>();
  const inlineStyles = new Map<string, NodeStylePatch>();
  const assignClasses = (id: string, names: string[]): void => {
    if (names.length > 0) classNames.set(id, [...(classNames.get(id) ?? []), ...names]);
  };

  const innermost = (): { group: ErGroup; names: string[] } | null | undefined => openGroups[openGroups.length - 1];
  const innermostDrawn = (): { group: ErGroup; names: string[] } | undefined => {
    for (let i = openGroups.length - 1; i >= 0; i--) {
      const open = openGroups[i];
      if (open) return open;
    }
    return undefined;
  };
  function entity(ref: EntityRef): ErEntity {
    let found = entities.get(ref.id);
    if (!found) {
      found = { id: ref.id, attributes: [] };
      entities.set(ref.id, found);
    }
    if (ref.label !== undefined) found.label = ref.label;
    assignClasses(ref.id, ref.classes);
    innermostDrawn()?.names.push(ref.id);
    return found;
  }

  function closeGroup(): void {
    const top = openGroups.pop();
    if (!top) return;
    const { group, names } = top;
    for (const name of new Set(names)) {
      if (placed.has(name)) continue;
      placed.add(name);
      const child = groups.get(name);
      if (child) child.parent = group.id;
      else {
        const member = entities.get(name);
        if (member) member.group = group.id;
      }
    }
    groups.set(group.id, group);
    innermostDrawn()?.names.push(group.id);
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

    const subgraph = /^subgraph\b(.*)$/i.exec(line);
    if (subgraph) {
      const header = parseSubgraphHeader(subgraph[1] as string);
      if (openGroups.filter((g) => g !== null).length >= MAX_GROUP_DEPTH) {
        warnOnce('depth', `ER groups nested deeper than ${MAX_GROUP_DEPTH} levels are not drawn; their entities are kept.`);
        openGroups.push(null);
      } else if (!header || groups.has(header.id) || openGroups.some((g) => g?.group.id === header.id)) {
        warnings.push(header ? `Group "${header.id}" is declared twice; the second one is not drawn.` : 'A `subgraph` without a name is not drawn.');
        openGroups.push(null);
      } else {
        openGroups.push({ group: { id: header.id, label: header.label }, names: [] });
      }
      continue;
    }
    if (/^end$/i.test(line) && openGroups.length > 0) {
      if (innermost() === null) openGroups.pop();
      else closeGroup();
      continue;
    }
    const directionMatch = /^direction\s+(TB|TD|BT|LR|RL)$/i.exec(line);
    if (directionMatch) {
      const requested = directionMatch[1]!.toUpperCase();
      const value = requested === 'TB' ? 'TD' : (requested as NonNullable<ErDiagram['direction']>);
      const open = innermost();
      if (open) open.group.direction = value;
      else if (open === undefined) direction = value;
      continue;
    }
    const styling = parseStyling(line);
    if (styling) {
      if (styling.kind === 'classDef') for (const name of styling.names) classDefs.set(name, styling.patch);
      else if (styling.kind === 'style') for (const id of styling.ids) inlineStyles.set(id, { ...inlineStyles.get(id), ...styling.patch });
      else for (const id of styling.ids) assignClasses(id, styling.names);
      continue;
    }
    if (/^(?:classDef|class|style)\b/i.test(line)) {
      warnings.push(`Unsupported line ignored: ${line}`);
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
  if (openGroups.length > 0) {
    warnings.push(`${openGroups.length} group(s) were never closed with \`end\`; closed automatically.`);
    while (openGroups.length > 0) {
      if (innermost() === null) openGroups.pop();
      else closeGroup();
    }
  }

  // A group's name in a relationship is the group (Mermaid): the entity that name created is not drawn.
  for (const id of groups.keys()) {
    const shadowed = entities.get(id);
    if (!shadowed) continue;
    if (shadowed.attributes.length > 0) warnings.push(`Entity "${id}" has the name of a group; the group is drawn, not the entity.`);
    entities.delete(id);
  }

  const undefinedNames = new Set<string>();
  const resolve = (id: string, withDefault: boolean): NodeStylePatch => {
    const patch: NodeStylePatch = withDefault ? { ...classDefs.get('default') } : {};
    for (const name of classNames.get(id) ?? []) {
      const def = classDefs.get(name);
      if (def) Object.assign(patch, def);
      else undefinedNames.add(name);
    }
    return Object.assign(patch, inlineStyles.get(id));
  };
  for (const e of entities.values()) {
    const patch = resolve(e.id, true);
    if (patch.fill !== undefined) e.fill = patch.fill;
    if (patch.stroke !== undefined) e.stroke = patch.stroke;
    if (patch.color !== undefined) e.textColor = patch.color;
  }
  for (const g of groups.values()) {
    const patch = resolve(g.id, false);
    if (patch.fill !== undefined) g.fill = patch.fill;
    if (patch.stroke !== undefined) g.stroke = patch.stroke;
  }
  for (const name of undefinedNames) warnings.push(`classDef "${name}" referenced but not defined.`);

  // Groups close inner first; the AST lists an enclosing group before the groups inside it.
  const depth = (g: ErGroup): number => (g.parent === undefined ? 0 : 1 + depth(groups.get(g.parent) as ErGroup));
  const ordered = [...groups.values()].sort((a, b) => depth(a) - depth(b));

  return {
    ast: {
      ...(direction ? { direction } : {}),
      entities: [...entities.values()],
      relationships,
      ...(ordered.length > 0 ? { groups: ordered } : {}),
    },
    warnings,
  };
}
