/**
 * Parser for Mermaid `classDiagram` (grammar verified against
 * mermaid.js.org/syntax/classDiagram.html, fetched 2026-09-09). Line-oriented,
 * same forgiving convention as `../../parser/parser.ts` and
 * `../quadrant/parser.ts`: an unrecognized line is skipped with a warning
 * rather than throwing.
 *
 * V1 scope, deliberately:
 * - Class declaration (`class Name`, `class Name["Label"]`, `class Name { ... }`,
 *   backtick-quoted ids) and its member block (colon or bracket member
 *   syntax — kept as raw display text, see `types.ts`).
 * - All 8 relationship arrow families with an optional `: Label` suffix.
 * - `direction TD|TB|LR|BT|RL` (same TB->TD normalization as flowchart).
 *
 * NOT implemented yet, each degrading to "recognized and warned", never
 * silently dropped:
 * - Generics (`List~int~`) — the `~...~` suffix is stripped from the id
 *   with no warning (harmless: the base id is exactly what relationships
 *   reference too), but the generic itself is not displayed.
 * - Annotations (`<<Interface>>`) are read in all three places Mermaid takes them (a class body's line,
 *   the class header, `<<Interface>> Name` on its own line) into `ClassBox.annotations`.
 * - `namespace` blocks (nested, dotted, with a `["label"]`) into `ClassDiagram.namespaces`, each class
 *   declared inside one recording it (`ClassBox.namespace`), qualified as Mermaid qualifies them.
 * - Styling: `style Id …`, `classDef name …` applied through `class Id:::name` or `cssClass "A,B" name`,
 *   and `classDef default …` for every class, as Mermaid layers them (default, then each class in order,
 *   then `style`). Only `fill`, `stroke` and `color` with a hex value are kept (`../../parser/css-style.ts`).
 * - Relationship cardinalities (`A "1" --> "*" B`): each quoted segment before the label goes to the end
 *   it is written next to, as Mermaid's grammar reads it (`fromCardinality`, `toCardinality`).
 * - `note`/`note for` — warned and skipped.
 *
 * None of the above affects which classes/members/relationships end up in
 * the AST — only cosmetic extras a first version can safely leave out.
 */

import { splitLines, splitStatements } from '../../parser/normalize-statements.js';
import { INTERACTIVE_DIRECTIVES_IGNORED, isInteractiveDirective } from '../../parser/interactive.js';
import type { ClassBox, ClassDiagram, ClassMember, ClassNamespace, ClassRelationType } from './types.js';
import { extractNodeStyle, parseCssStyleProps, type NodeStylePatch } from '../../parser/css-style.js';

export interface ClassDiagramParseResult {
  ast: ClassDiagram;
  warnings: string[];
}

/**
 * A relation as Mermaid's grammar writes it: an optional end on the left, a solid `--` or dotted `..` line, an
 * optional end on the right, each endpoint a plain id or a backtick-quoted one (which may contain spaces):
 * `A <|-- B`, `A ..|> B`, `classM <|.. classN`, `Animal <|--|> Zebra` (two-way). The `()` lollipop ends
 * (an interface drawn as a small circle) are not matched here; they fall through to the unsupported-line warning.
 */
// An unquoted id stops at a relation symbol; it is greedy, so `Foo--Bar` keeps `Foo` whole rather than reading
// its last `o` as an aggregation end, as Mermaid's own lexer does.
const ENDPOINT = '(`[^`]+`|[^\\s`<>|*.:"-]+)';
// Mermaid's lexer reads an end symbol whichever side it is on (`A |>.. B` is `A <|.. B`), so both ends accept
// every spelling.
const END = '(<\\||\\|>|\\*|o|<|>)?';
const REL_LINE = new RegExp(`^${ENDPOINT}\\s*${END}(--|\\.\\.)${END}\\s*${ENDPOINT}\\s*(?::\\s*(.+))?$`);

/** What an end symbol means, on whichever side it sits. */
const END_KIND: Readonly<Record<string, 'triangle' | 'composition' | 'aggregation' | 'arrow'>> = {
  '<|': 'triangle',
  '|>': 'triangle',
  '*': 'composition',
  o: 'aggregation',
  '<': 'arrow',
  '>': 'arrow',
};

function relationType(kind: 'triangle' | 'composition' | 'aggregation' | 'arrow' | undefined, dotted: boolean): ClassRelationType {
  switch (kind) {
    case 'triangle':
      return dotted ? 'realization' : 'inheritance';
    case 'composition':
      return 'composition';
    case 'aggregation':
      return 'aggregation';
    case 'arrow':
      return dotted ? 'dependency' : 'association';
    default:
      return dotted ? 'dashedLink' : 'link';
  }
}

const CLASS_HEADER = new RegExp(
  // id, generic, ["label"], :::style, <<annotation>>, {
  '^class\\s+(?:`([^`]+)`|([A-Za-z_$][\\w$]*))(?:~[^~]*~)?' +
    '(?:\\[(?:"([^"]*)"|([^\\]]*))\\])?(:::[\\w,-]+)?\\s*(<<[^>]*>>)?\\s*(\\{)?\\s*$',
  'i',
);

/**
 * A relation line split at its label's `:`, the first one outside quotes: `Customer "1" --> "*" Order` and
 * `places`. `label` is `undefined` when there is no `:`.
 */
function splitRelationLabel(line: string): { head: string; label?: string } {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ':' && !inQuote) return { head: line.slice(0, i), label: line.slice(i + 1) };
  }
  return { head: line };
}

/**
 * `line` for relation matching: its cardinalities (quoted segments before the label, read apart by
 * `relationCardinalities`) removed, its label kept as written, quotes included.
 */
function stripQuotedSegments(line: string): string {
  const { head, label } = splitRelationLabel(line);
  const clean = head.replace(/"[^"]*"/g, ' ').replace(/\s+/g, ' ').trim();
  return label === undefined ? clean : `${clean} :${label}`;
}

/**
 * `namespace Name {` or `namespace Name["Label"] {`, or `null`. Read in steps rather than with one regular
 * expression whose optional label group sat between free-spacing runs (flagged by
 * `security/detect-unsafe-regex`: untrusted input).
 */
function parseNamespaceHeader(line: string): { name: string; label?: string } | null {
  if (!/^namespace\s/i.test(line) || !line.endsWith('{')) return null;
  const rest = line.slice('namespace'.length, -1).trim();
  const name = /^[\w.$-]+/.exec(rest)?.[0];
  if (name === undefined) return null;
  const tail = rest.slice(name.length).trim();
  if (tail.length === 0) return { name };
  const label = /^\["([^"]*)"\]$/.exec(tail.replace(/^\[\s*/, '[').replace(/\s*\]$/, ']'));
  return label ? { name, label: (label[1] ?? '').trim() } : null;
}

/**
 * `classDef a,b props`, `style Id props` or `cssClass "A,B" name`, or `null`. Read by splitting at the first
 * spaces rather than with one regular expression (untrusted input, `security/detect-unsafe-regex`).
 */
function parseStyleStatement(
  line: string,
):
  | { kind: 'classDef'; names: string[]; patch: NodeStylePatch }
  | { kind: 'style'; id: string; patch: NodeStylePatch }
  | { kind: 'cssClass'; ids: string[]; name: string }
  | null {
  const keyword = /^(classDef|style|cssClass)\s/i.exec(line)?.[1]?.toLowerCase();
  if (keyword === undefined) return null;
  const rest = line.slice(keyword.length).trim();
  if (keyword === 'cssclass') {
    const quoted = /^"([^"]*)"\s+([\w-]+)$/.exec(rest);
    if (!quoted) return null;
    return { kind: 'cssClass', ids: (quoted[1] ?? '').split(',').map((id) => stripIdQuotes(id)).filter((id) => id.length > 0), name: quoted[2]! };
  }
  const space = rest.search(/\s/);
  if (space === -1) return null;
  const target = rest.slice(0, space);
  const patch = extractNodeStyle(parseCssStyleProps(rest.slice(space + 1)));
  if (keyword === 'style') return { kind: 'style', id: stripIdQuotes(target), patch };
  return { kind: 'classDef', names: target.split(',').map((n) => n.trim()).filter((n) => n.length > 0), patch };
}

/**
 * The cardinalities of a relation line: a quoted segment before the line's operator belongs to the left
 * end, one after it to the right end (`Customer "1" --> "*" Order : places`). Only the part before the
 * label's `:` is read, so a quote in the label is not taken for one.
 */
function relationCardinalities(line: string): { fromCardinality?: string; toCardinality?: string } {
  const { head } = splitRelationLabel(line);
  const result: { fromCardinality?: string; toCardinality?: string } = {};
  let before = '';
  for (const part of head.split(/("[^"]*")/)) {
    if (part.length >= 2 && part.startsWith('"') && part.endsWith('"')) {
      const text = part.slice(1, -1).trim();
      if (text.length === 0) continue;
      if (before.includes('--') || before.includes('..')) result.toCardinality = text;
      else result.fromCardinality = text;
    } else {
      before += part;
    }
  }
  return result;
}

function stripIdQuotes(id: string): string {
  return id.replace(/^`|`$/g, '').trim();
}

export function parseClassDiagram(text: string): ClassDiagramParseResult {
  const warnings: string[] = [];
  const classes = new Map<string, ClassBox>();
  const relationships: ClassDiagram['relationships'] = [];
  let direction: ClassDiagram['direction'] = 'TD';

  function getOrCreateClass(id: string): ClassBox {
    let box = classes.get(id);
    if (!box) {
      box = { id, label: id, attributes: [], methods: [] };
      classes.set(id, box);
    }
    return box;
  }

  // Brace-nesting stack: a `namespace` frame gives its qualified id to the classes declared in it; only
  // 'class' frames get their lines treated as member declarations.
  type Frame = { kind: 'class'; box: ClassBox } | { kind: 'namespace'; id: string };
  const stack: Frame[] = [];
  const namespaces = new Map<string, ClassNamespace>();
  const currentNamespace = (): string | undefined => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const frame = stack[i]!;
      if (frame.kind === 'namespace') return frame.id;
    }
    return undefined;
  };
  // As Mermaid's classDb does: qualify the name with the enclosing namespace, then create every missing
  // ancestor of a dotted id, labelled with its own last segment; a declared `["label"]` names the leaf.
  const declareNamespace = (name: string, label: string | undefined): string => {
    const enclosing = currentNamespace();
    const id = enclosing === undefined ? name : `${enclosing}.${name}`;
    const parts = id.split('.');
    let parent: string | undefined;
    for (let i = 0; i < parts.length; i++) {
      const partial = parts.slice(0, i + 1).join('.');
      if (!namespaces.has(partial)) {
        namespaces.set(partial, { id: partial, label: parts[i]!, ...(parent !== undefined ? { parent } : {}) });
      }
      parent = partial;
    }
    if (label !== undefined) namespaces.get(id)!.label = label;
    return id;
  };
  // Styling, resolved once every line is read: a `classDef` may come after the class that uses it.
  const classDefs = new Map<string, NodeStylePatch>();
  const classNames = new Map<string, string[]>();
  const inlineStyles = new Map<string, NodeStylePatch>();
  const assignClasses = (id: string, names: string[]): void => {
    const list = classNames.get(id) ?? [];
    for (const name of names) if (name.length > 0) list.push(name);
    classNames.set(id, list);
  };
  const annotate = (box: ClassBox, annotation: string): void => {
    const text = annotation.trim();
    if (text.length > 0) (box.annotations ??= []).push(text);
  };

  for (const rawLine of splitLines(text).flatMap((l) => splitStatements(l))) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (/^classDiagram\b/i.test(line)) continue;

    const top = stack[stack.length - 1];

    if (top?.kind !== 'class' && isInteractiveDirective(line, ['click', 'link', 'callback'])) {
      if (!warnings.includes(INTERACTIVE_DIRECTIVES_IGNORED)) warnings.push(INTERACTIVE_DIRECTIVES_IGNORED);
      continue;
    }

    if (line === '}') {
      if (stack.length > 0) stack.pop();
      else warnings.push(`Unexpected "}" without a matching block opener: ${line}`);
      continue;
    }

    if (top?.kind === 'class') {
      const bodyAnnotation = /^<<(.*)>>$/.exec(line);
      if (bodyAnnotation) {
        annotate(top.box, bodyAnnotation[1] ?? '');
        continue;
      }
      const visMatch = line.match(/^([+\-#~])\s*(.+)$/);
      const visibility = visMatch ? (visMatch[1] as ClassMember['visibility']) : undefined;
      const memberText = (visMatch ? visMatch[2] : line)!.trim();
      const member: ClassMember = visibility ? { visibility, text: memberText } : { text: memberText };
      if (memberText.includes('(')) top.box.methods.push(member);
      else top.box.attributes.push(member);
      continue;
    }

    const dirMatch = line.match(/^direction\s+(TD|TB|LR|BT|RL)\b/i);
    if (dirMatch) {
      const requested = dirMatch[1]!.toUpperCase();
      direction = requested === 'TB' ? 'TD' : (requested as ClassDiagram['direction']);
      continue;
    }

    const classMatch = line.match(CLASS_HEADER);
    if (classMatch) {
      const id = stripIdQuotes(classMatch[1] ?? classMatch[2] ?? '');
      if (id.length === 0) {
        warnings.push(`Unsupported line ignored (could not read a class id): ${line}`);
        continue;
      }
      const box = getOrCreateClass(id);
      const namespace = currentNamespace();
      if (namespace !== undefined) box.namespace = namespace;
      const label = classMatch[3] ?? classMatch[4];
      if (label !== undefined) box.label = label.trim();
      if (classMatch[5]) assignClasses(id, classMatch[5].slice(3).split(',').map((n) => n.trim()));
      if (classMatch[6]) annotate(box, classMatch[6].slice(2, -2));
      if (classMatch[7] === '{') stack.push({ kind: 'class', box });
      continue;
    }

    const namespaceHeader = parseNamespaceHeader(line);
    if (namespaceHeader) {
      stack.push({ kind: 'namespace', id: declareNamespace(namespaceHeader.name, namespaceHeader.label) });
      continue;
    }

    const clean = stripQuotedSegments(line);
    const relMatch = clean.match(REL_LINE);
    if (relMatch) {
      const fromId = stripIdQuotes(relMatch[1] ?? '');
      const fromKind = relMatch[2] ? END_KIND[relMatch[2]] : undefined;
      const dotted = relMatch[3] === '..';
      const toKind = relMatch[4] ? END_KIND[relMatch[4]] : undefined;
      const toId = stripIdQuotes(relMatch[5] ?? '');
      if (fromId.length > 0 && toId.length > 0) {
        getOrCreateClass(fromId);
        getOrCreateClass(toId);
        if (fromKind && toKind && fromKind !== toKind) {
          warnings.push(`A relation with two different ends is drawn with the right-hand one only: ${line}`);
        }
        const markerEnd = fromKind && toKind ? (fromKind === toKind ? 'both' : 'to') : fromKind ? 'from' : toKind ? 'to' : 'none';
        relationships.push({
          from: fromId,
          to: toId,
          type: relationType(toKind ?? fromKind, dotted),
          markerEnd,
          ...(relMatch[6] ? { label: relMatch[6].trim() } : {}),
          ...relationCardinalities(line),
        });
        continue;
      }
    }

    // Alternate one-line member syntax outside a `{ }` block:
    // `ClassName : +member text`.
    const standaloneMember = line.match(/^(?:`([^`]+)`|([A-Za-z_$][\w$]*))\s*:\s*(.+)$/);
    if (standaloneMember) {
      const id = stripIdQuotes(standaloneMember[1] ?? standaloneMember[2] ?? '');
      const box = getOrCreateClass(id);
      const rest = (standaloneMember[3] ?? '').trim();
      const visMatch = rest.match(/^([+\-#~])\s*(.+)$/);
      const visibility = visMatch ? (visMatch[1] as ClassMember['visibility']) : undefined;
      const memberText = (visMatch ? visMatch[2] : rest)!.trim();
      const member: ClassMember = visibility ? { visibility, text: memberText } : { text: memberText };
      if (memberText.includes('(')) box.methods.push(member);
      else box.attributes.push(member);
      continue;
    }

    const styling = parseStyleStatement(line);
    if (styling) {
      if (styling.kind === 'classDef') for (const name of styling.names) classDefs.set(name, styling.patch);
      // As in Mermaid, `style` on a class that does not exist does nothing (it does not create one).
      else if (styling.kind === 'style') inlineStyles.set(styling.id, { ...inlineStyles.get(styling.id), ...styling.patch });
      else for (const id of styling.ids) assignClasses(id, [styling.name]);
      continue;
    }
    if (/^(?:classDef|style|cssClass)\b/i.test(line)) {
      warnings.push(`Unsupported line ignored: ${line}`);
      continue;
    }
    if (/^note\b/i.test(line)) {
      warnings.push(`Notes are not yet supported for class diagrams, ignored: ${line}`);
      continue;
    }
    // `<<interface>> Shape`: an annotation for a class declared elsewhere (or not yet).
    const lineAnnotation = /^<<([^>]*)>>\s*(?:`([^`]+)`|([A-Za-z_$][\w$]*))\s*$/.exec(line);
    if (lineAnnotation) {
      annotate(getOrCreateClass(stripIdQuotes(lineAnnotation[2] ?? lineAnnotation[3] ?? '')), lineAnnotation[1] ?? '');
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  if (stack.length > 0) {
    warnings.push('One or more class/namespace blocks were not closed with a matching "}".');
  }
  const undefinedNames = new Set<string>();
  for (const box of classes.values()) {
    const patch: NodeStylePatch = { ...classDefs.get('default') };
    for (const name of classNames.get(box.id) ?? []) {
      const def = classDefs.get(name);
      if (def) Object.assign(patch, def);
      else undefinedNames.add(name);
    }
    Object.assign(patch, inlineStyles.get(box.id));
    if (patch.fill !== undefined) box.fill = patch.fill;
    if (patch.stroke !== undefined) box.stroke = patch.stroke;
    if (patch.color !== undefined) box.textColor = patch.color;
  }
  for (const name of undefinedNames) warnings.push(`classDef "${name}" referenced but not defined.`);
  for (const box of classes.values()) {
    if ((box.annotations?.length ?? 0) > 1) {
      warnings.push(`Class "${box.id}" has several annotations; only the first, «${box.annotations![0]}», is drawn (as in Mermaid).`);
    }
  }

  return {
    ast: {
      direction,
      classes: [...classes.values()],
      relationships,
      ...(namespaces.size > 0 ? { namespaces: [...namespaces.values()] } : {}),
    },
    warnings,
  };
}
