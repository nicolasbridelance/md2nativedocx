/**
 * Parser for PlantUML class diagrams (`@startuml` ... `@enduml`), into the same AST as Mermaid's
 * `classDiagram` (`../class-diagram/types.ts`), so layout, translation and the inheritance-tree SmartArt are
 * shared. Line-oriented and forgiving like the other parsers: an unrecognized line is a warning, never a throw.
 *
 * Supported: element declarations (`class`, `abstract [class]`, `interface`, `enum`, `annotation`, `struct`,
 * `exception`, `entity`, `protocol`, `metaclass`, `stereotype`, `record`, `dataclass`), quoted names and
 * `as` aliases, generics (`Foo<T>`, not displayed), stereotypes, colours and `extends` / `implements`
 * (drawn as relations); member blocks `{ ... }` with visibility, `{static}` / `{abstract}` / `{field}` /
 * `{method}` modifiers and separator lines skipped; `Class : member` lines; relations with every end
 * (`<|` `|>` `^` `*` `o` `<` `>` `#` `x` `}` `{` `+`), solid or dotted shafts, direction hints (`-up->`,
 * `-[#red]->`), quoted cardinalities (drawn at their end, as in a Mermaid class diagram; roles `"1"/role`
 * dropped with a warning) and `: label` (direction marks `<` `>`
 * dropped); `left to right direction`. Kept with a warning: `package` / `namespace` / `together` blocks
 * (contents parsed, grouping not drawn). Ignored with a warning: notes, `skinparam`, `<style>`, `hide` /
 * `show` / `remove`, preprocessor lines, `!include` (never followed: it would read a file or a URL).
 * Capped (hostile input): 300 classes, 600 relations, 100 members per class.
 */

import type { ClassBox, ClassDiagram, ClassMember, ClassRelationType } from '../class-diagram/types.js';

export interface PlantUmlClassParseResult {
  ast: ClassDiagram;
  warnings: string[];
}

const MAX_CLASSES = 300;
const MAX_RELATIONS = 600;
const MAX_MEMBERS = 100;
const MAX_LINE = 2000;

const KINDS = String.raw`abstract\s+class|abstract|class|interface|enum|annotation|struct|exception|entity|protocol|metaclass|stereotype|record|dataclass|circle|diamond`;
/** An element name: a quoted string or a run of name characters (dots for packages, `$` like Java). */
const NAME = String.raw`"[^"]+"|[\w.$À-￿]+(?:::[\w.$À-￿]+)*`;
const DECLARATION = new RegExp(String.raw`^(${KINDS})\s+(${NAME})(.*)$`, 'i');

/**
 * Relation: optional quoted cardinality, left end, shaft (dashes or dots, with an optional direction word or
 * `[...]` style inside), right end, optional cardinality. Ends are matched as short alternations, never nested
 * quantifiers.
 */
const LEFT_END = String.raw`<\||\^|\*|o|<|#|x|\}|\+|\(\)`;
const RIGHT_END = String.raw`\|>|\^|\*|o|>|#|x|\{|\+|\(\)`;
/** A cardinality, with an optional role, next to a relation end: `"1"`, `"0..n"/items`; captured as `group`. */
const card = (group: string): string => String.raw`(?:"(?<${group}>[^"]*)"(?:\/\S+)?\s*)?`;
const SHAFT = String.raw`(?:-+|\.+)(?:(?:up|down|left|right|u|d|l|r|le|ri|do)?(?:\[[^\]]*\])?)(?:-*|\.*)`;
const RELATION = new RegExp(
  String.raw`^(?<a>${NAME})\s*${card('ca')}(?<l>${LEFT_END})?(?<shaft>${SHAFT})(?<r>${RIGHT_END})?\s*${card('cb')}(?<b>${NAME})(?:\s+#\S+)?\s*(?::(?<label>.*))?$`,
  'i',
);

const unquote = (s: string): string => s.trim().replace(/^"(.*)"$/, '$1');

/** Which UML relation two ends and a shaft mean, and which side carries the marker. */
function relationOf(left: string, right: string, dotted: boolean): { type: ClassRelationType; markerEnd: 'from' | 'to' | 'none' } {
  const kindOf = (end: string): ClassRelationType | undefined => {
    if (end === '<|' || end === '|>' || end === '^') return dotted ? 'realization' : 'inheritance';
    if (end === '*') return 'composition';
    if (end === 'o') return 'aggregation';
    if (end === '<' || end === '>') return dotted ? 'dependency' : 'association';
    return undefined; // `#`, `x`, `}`, `{`, `+`: no matching marker in the shared drawing; a plain line
  };
  // The more specific marker wins when both ends carry one (`<|--*` is rare; inheritance first).
  const order: ClassRelationType[] = ['inheritance', 'realization', 'composition', 'aggregation', 'dependency', 'association'];
  const l = kindOf(left);
  const r = kindOf(right);
  if (l !== undefined && (r === undefined || order.indexOf(l) <= order.indexOf(r))) return { type: l, markerEnd: 'from' };
  if (r !== undefined) return { type: r, markerEnd: 'to' };
  return { type: dotted ? 'dashedLink' : 'link', markerEnd: 'none' };
}

/** Parse PlantUML class-diagram text into the shared class AST. Never throws on malformed input. */
export function parsePlantUmlClass(source: string): PlantUmlClassParseResult {
  const warnings: string[] = [];
  const warned = new Set<string>();
  const ast: ClassDiagram = { direction: 'TD', classes: [], relationships: [] };
  const warnOnce = (key: string, message: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push(message);
  };

  const find = (id: string): ClassBox | undefined => ast.classes.find((c) => c.id === id);
  const ensure = (id: string, label?: string): ClassBox | undefined => {
    const existing = find(id);
    if (existing) {
      if (label !== undefined) existing.label = label;
      return existing;
    }
    if (ast.classes.length >= MAX_CLASSES) {
      warnOnce('classes', `Class diagram limited to ${MAX_CLASSES} classes; the rest were ignored.`);
      return undefined;
    }
    const box: ClassBox = { id, label: label ?? id, attributes: [], methods: [] };
    ast.classes.push(box);
    return box;
  };
  const relate = (
    from: string,
    to: string,
    type: ClassRelationType,
    markerEnd: 'from' | 'to' | 'none',
    label?: string,
    cardinalities: { fromCardinality?: string; toCardinality?: string } = {},
  ): void => {
    if (ast.relationships.length >= MAX_RELATIONS) return warnOnce('relations', `Class diagram limited to ${MAX_RELATIONS} relations; the rest were ignored.`);
    if (!ensure(from) || !ensure(to)) return;
    ast.relationships.push({ from, to, type, markerEnd, ...(label ? { label } : {}), ...cardinalities });
  };

  const addMember = (box: ClassBox, raw: string): void => {
    let line = raw.replace(/\{(?:static|classifier|abstract|field|method)\}\s*/gi, '').trim();
    if (line === '' || /^(?:--|\.\.|==|__)/.test(line)) return; // separator, possibly titled (`-- title --`)
    if (box.attributes.length + box.methods.length >= MAX_MEMBERS) return warnOnce('members', `Classes limited to ${MAX_MEMBERS} members each; the rest were ignored.`);
    let visibility: ClassMember['visibility'];
    const v = line.charAt(0);
    if (v === '+' || v === '-' || v === '#' || v === '~') {
      visibility = v;
      line = line.slice(1).trim();
    }
    const member: ClassMember = visibility ? { visibility, text: line } : { text: line };
    if (/\(/.test(line)) box.methods.push(member);
    else box.attributes.push(member);
  };

  /** Element ids in `extends A, B` / `implements C` lists. */
  const names = (list: string): string[] => list.split(',').map((s) => unquote(s.replace(/<[^>]*>/g, ''))).filter((s) => s !== '');

  /** Open `{` blocks: a member block (the class it fills) or a grouping block (package, namespace...). */
  const blocks: Array<ClassBox | 'group' | 'skip'> = [];
  let multi: RegExp | undefined; // the end line of a block whose content is ignored (note, legend, style...)
  let inBlockComment = false;
  /** Names of notes (`note as N1`): a link to one (`N1 .. Foo`) is not a class relation. */
  const noteIds = new Set<string>();

  for (const rawLine of source.split(/\r?\n/)) {
    let line = rawLine.trim().slice(0, MAX_LINE);
    if (inBlockComment) {
      if (line.includes("'/")) inBlockComment = false;
      continue;
    }
    if (multi) {
      if (multi.test(line)) multi = undefined;
      continue;
    }
    if (line.length === 0 || line.startsWith("'")) continue;
    if (line.startsWith("/'")) {
      if (!line.includes("'/", 2)) inBlockComment = true;
      continue;
    }

    const top = blocks[blocks.length - 1];
    if (top === 'skip') {
      // Ignored content (skinparam, json, map...): only nesting matters.
      if (/^[}\]]/.test(line)) blocks.pop();
      else if (/[{[]$/.test(line)) blocks.push('skip');
      continue;
    }
    if (top !== undefined && top !== 'group') {
      // Inside a class body: members until the closing brace.
      if (line === '}') blocks.pop();
      else addMember(top, line);
      continue;
    }

    let m: RegExpMatchArray | null;
    // Shorthands rewritten to the long form: element visibility (`-class X`), `()` / `<>` (circle / diamond),
    // and a qualifier on a relation end (`A [key] -- B`), which is not drawn.
    line = line
      .replace(/^[-#~+](?=(?:abstract|class|interface|enum)\b)/i, '')
      .replace(/^\(\)\s+/, 'circle ')
      .replace(/^<>\s+/, 'diamond ')
      .replace(new RegExp(String.raw`^(${NAME})\s*\[[^\]]*\]\s*(?=[-.<^*o#x}+(])`), '$1 ');

    if ((m = line.match(new RegExp(String.raw`^\(\s*(${NAME})\s*,\s*(${NAME})\s*\)\s*\.+\s*(${NAME})$`)))) {
      // Association class: `(A, B) .. C`. Drawn as dotted links from C to A and to B.
      warnOnce('assocclass', 'Association classes (`(A, B) .. C`) are drawn as dotted links to both classes.');
      const c = unquote(m[3] as string);
      relate(unquote(m[1] as string), c, 'dashedLink', 'none');
      relate(unquote(m[2] as string), c, 'dashedLink', 'none');
    } else if ((m = line.match(new RegExp(String.raw`^(object|map|json)\s+(${NAME})(.*)$`, 'i')))) {
      // Objects, maps and JSON blocks: a box with the name; map entries and JSON content are not shown.
      warnOnce('objects', 'Objects, maps and JSON blocks in a class diagram are drawn as plain boxes; map and JSON content is not shown.');
      const kind = (m[1] as string).toLowerCase();
      const box = ensure(unquote(m[2] as string));
      if ((m[3] as string).trim().endsWith('{')) blocks.push(kind === 'object' && box ? box : 'skip');
    } else if (/^@(start|end)uml\b/i.test(line)) {
      continue;
    } else if (line === '}') {
      if (blocks.length > 0) blocks.pop();
      else warnings.push('`}` without an open block ignored.');
    } else if (/^!include/i.test(line)) {
      warnOnce('include', '`!include` is not followed (it would read a file or a URL); its content is missing.');
    } else if (/^!/.test(line)) {
      warnOnce('preprocessor', 'PlantUML preprocessor lines (`!theme`, `!define`, variables...) are ignored.');
    } else if (/^skinparam\b/i.test(line)) {
      warnOnce('skinparam', '`skinparam` styling is ignored; the diagram uses the default look.');
      if (line.endsWith('{')) blocks.push('skip');
    } else if (/^<style>/i.test(line)) {
      warnOnce('style', '`<style>` blocks are ignored; the diagram uses the default look.');
      if (!/<\/style>\s*$/i.test(line)) multi = /^<\/style>$/i;
    } else if (/^left\s+to\s+right\s+direction$/i.test(line)) {
      ast.direction = 'LR';
    } else if (/^top\s+to\s+bottom\s+direction$/i.test(line)) {
      ast.direction = 'TD';
    } else if (/^(?:hide|show|remove|restore|set|scale|title|caption|header|footer|mainframe|allowmixing|allow_mixing|page)\b/i.test(line)) {
      warnOnce('display', 'Display commands (`hide`, `show`, `title`, `set`, ...) are ignored.');
    } else if (/^legend\b/i.test(line)) {
      warnOnce('legend', '`legend` blocks are ignored.');
      multi = /^end\s*legend$/i;
    } else if (/^[hr]?note\b/i.test(line)) {
      warnOnce('note', 'Notes are not drawn in class diagrams.');
      // A named note (`note "text" as N1`, `note as N1`) can be linked to a class later: remember its name.
      const named = /\bas\s+(\S+)$/i.exec(line);
      if (named) noteIds.add(named[1] as string);
      // A one-line note has a `:` or a quoted text; otherwise the text runs to `end note`.
      // (`A::counter` names a member; only a lone `:` starts the note's text.)
      if (!/(?<!:):(?!:)/.test(line) && !/^[hr]?note\s+"[^"]*"/i.test(line)) multi = /^end\s*[hr]?note$/i;
    } else if ((m = line.match(/^(package|namespace|together|frame|folder|node|rectangle|cloud|database)\b.*\{$/i))) {
      warnOnce('package', `\`${(m[1] as string).toLowerCase()}\` groups are not drawn; their classes are kept.`);
      blocks.push('group');
    } else if ((m = line.match(DECLARATION))) {
      let rest = (m[3] as string).trim();
      const kind = (m[1] as string).toLowerCase().replace(/\s+/g, ' ');
      let id = unquote(m[2] as string);
      let label: string | undefined;
      const alias = new RegExp(String.raw`^as\s+(${NAME})\s*`, 'i').exec(rest);
      if (alias) {
        // `class "Long name" as L` / `class L as "Long name"`: the quoted side is the label.
        const other = alias[1] as string;
        if ((m[2] as string).startsWith('"')) [id, label] = [unquote(other), id];
        else label = unquote(other);
        rest = rest.slice(alias[0].length);
      }
      rest = rest.replace(/^<(?!<)[^>]*>\s*/, ''); // generics (`Foo<T>`): not displayed; `<<` is a stereotype
      if (!/^(class|entity)$/.test(kind)) warnOnce('kinds', 'Interfaces, enums, abstract classes and other element kinds are drawn as plain class boxes.');
      // Stereotypes (`<<Serializable>>`) become the box's annotations, drawn `«Serializable»` above its name
      // like a Mermaid annotation (the first only; PlantUML's `(S,#color)` spot inside one is not drawn).
      const stereotypes = [...rest.matchAll(/<<(.*?)>>/g)].map((s) => (s[1] as string).replace(/^\s*\([^)]*\)\s*/, '').trim()).filter((s) => s.length > 0);
      // Stereotypes, `$tags`, then colours and inline styles (`#red-green`, `##[dashed]blue`, `#line:red;back:x`).
      rest = rest
        .replace(/<<.*?>>/g, '')
        .replace(/(?:^|\s)\$[\w.]+/g, ' ')
        .replace(/##\[[^\]]*\][^\s{]*/g, '')
        .replace(/#[^\s{]*/g, '')
        .trim();
      const box = ensure(id, label);
      if (!box) continue;
      if (stereotypes.length > 0) (box.annotations ??= []).push(...stereotypes);
      let ext: RegExpExecArray | null;
      while ((ext = /^(extends|implements)\s+(.+?)(?=\s+(?:extends|implements)\s|\s*\{?\s*$)/i.exec(rest))) {
        const realization = (ext[1] as string).toLowerCase() === 'implements';
        for (const parent of names(ext[2] as string)) relate(parent, id, realization ? 'realization' : 'inheritance', 'from');
        rest = rest.slice(ext[0].length).trim();
      }
      if (rest.startsWith('{')) {
        const inline = /^\{(.*)\}$/.exec(rest);
        if (inline) for (const part of (inline[1] as string).split(';')) addMember(box, part);
        else blocks.push(box);
      } else if (rest !== '') {
        warnings.push(`Unsupported part of a declaration ignored: ${line}`);
      }
    } else if ((m = line.match(RELATION)) && m.groups) {
      const g = m.groups;
      if (noteIds.has(unquote(g.a as string)) || noteIds.has(unquote(g.b as string))) continue;
      const shaft = g.shaft as string;
      if (/"\//.test(line.replace(/:.*$/, ''))) warnOnce('roles', 'Relation roles (`"1"/role`) are not displayed; the cardinality is.');
      const cardinalities = {
        ...(g.ca?.trim() ? { fromCardinality: g.ca.trim() } : {}),
        ...(g.cb?.trim() ? { toCardinality: g.cb.trim() } : {}),
      };
      const { type, markerEnd } = relationOf(g.l ?? '', g.r ?? '', shaft.startsWith('.'));
      if (/[#x}{+(]/.test((g.l ?? '') + (g.r ?? ''))) warnOnce('ends', 'Relation ends `#`, `x`, `}`, `{`, `+` and `()` are drawn as plain lines.');
      const label = (g.label ?? '').trim().replace(/^[<>]\s*|\s*[<>]$/g, '').trim();
      relate(unquote(g.a as string), unquote(g.b as string), type, markerEnd, label === '' ? undefined : label, cardinalities);
    } else if ((m = line.match(new RegExp(String.raw`^(${NAME})\s*:\s*(.+)$`)))) {
      const box = ensure(unquote(m[1] as string));
      if (box) addMember(box, m[2] as string);
    } else if ((m = line.match(new RegExp(String.raw`^(${NAME})\s*\{$`)))) {
      // `Foo {` after a declaration elsewhere: more members for it.
      const box = ensure(unquote(m[1] as string));
      blocks.push(box ?? 'skip');
    } else {
      warnings.push(`Unsupported line ignored: ${line}`);
    }
  }

  if (multi) warnings.push('A multi-line block (`note`, `legend`, `<style>`) was never closed; the rest was ignored.');
  if (blocks.length > 0) warnings.push('One or more `{` blocks were never closed; closed automatically.');
  return { ast, warnings };
}
