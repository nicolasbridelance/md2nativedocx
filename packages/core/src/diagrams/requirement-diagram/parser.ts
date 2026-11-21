/**
 * Parser for Mermaid `requirementDiagram`. Grammar read from Mermaid's own
 * (`requirementDiagram.jison` and `requirementDb.ts`, mermaid@12.3.0, the
 * version the official corpus is pinned to), reinterpreted here, not copied.
 * Line-oriented, same forgiving convention as `../class-diagram/parser.ts`.
 *
 * What it reads, as Mermaid does:
 * - Requirement blocks `<type> name { … }` with the 6 type keywords
 *   (case-insensitive) and the fields `id`, `text`, `risk`, `verifymethod`;
 *   element blocks `element name { … }` with `type` and `docref`. A name or a
 *   value may be quoted (`"…"`, quotes removed) and an unquoted name may hold
 *   spaces. `risk` and `verifymethod` are shown the way Mermaid shows them
 *   (`high` -> `High`, `test` -> `Test`).
 * - A block defined twice keeps its first definition (Mermaid ignores the
 *   second); a warning says so.
 * - Both relationship directions, `A - type -> B` and `B <- type - A`, with
 *   the 7 type keywords; ends may be quoted.
 * - `direction TB|BT|LR|RL`.
 * - Styling: `style ids css`, `classDef names css`, `class ids names`, and
 *   `:::names` after a block's name or on a line of its own (`id:::names`).
 *   Layered like the class diagram: `classDef default`, then each class in the
 *   order it was given, then each `style` in order. Mermaid writes a
 *   `classDef` as an `!important` rule of the page's stylesheet, so a class
 *   applies wherever its `classDef` sits; a `style` or `class` naming a block
 *   not defined yet does nothing, as in Mermaid. Only `fill`, `stroke`,
 *   `color`, `font-weight` and `font-style` are kept (`../../parser/css-style.ts`).
 *
 * Where Mermaid rejects the whole diagram (an unknown type keyword, risk or
 * verify method), this parser keeps the content as written and warns.
 */

import { extractNodeStyle, parseCssStyleProps, type NodeStylePatch } from '../../parser/css-style.js';
import { REQUIREMENT_TYPES } from './types.js';
import type { RequirementBoxStyle, RequirementDiagram, RequirementElement, RequirementRelationType, Requirement } from './types.js';

export interface RequirementDiagramParseResult {
  ast: RequirementDiagram;
  warnings: string[];
}

const RELATIONSHIP_TYPES = new Set<RequirementRelationType>([
  'contains',
  'copies',
  'derives',
  'satisfies',
  'verifies',
  'refines',
  'traces',
]);

/** Type keyword in lower case -> its canonical spelling (Mermaid's lexer ignores case). */
const TYPE_BY_LOWER = new Map<string, string>(REQUIREMENT_TYPES.map((t) => [t.toLowerCase(), t]));

/** How Mermaid displays each risk level and verify method it accepts (`requirementDb.ts`). */
const RISK_DISPLAY = new Map([
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
]);
const VERIFY_DISPLAY = new Map([
  ['analysis', 'Analysis'],
  ['demonstration', 'Demonstration'],
  ['inspection', 'Inspection'],
  ['test', 'Test'],
]);

function isRelationshipType(word: string): word is RequirementRelationType {
  return RELATIONSHIP_TYPES.has(word as RequirementRelationType);
}

/** `"name"` -> `name`; anything else trimmed and kept as written. */
function unquote(text: string): string {
  const t = text.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

/** Index of `needle` in `text` outside a `"…"` string, searching from the end if `last`; -1 if none. */
function indexOutsideQuotes(text: string, needle: string, last = false): number {
  let found = -1;
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && text.startsWith(needle, i)) {
      if (!last) return i;
      found = i;
    }
  }
  return found;
}

/** A comma-separated list of names, each possibly quoted. */
function nameList(text: string): string[] {
  return text
    .split(',')
    .map(unquote)
    .filter((n) => n.length > 0);
}

/** Split `head rest` at the first whitespace outside quotes. */
function splitFirstWord(text: string): { head: string; rest: string } {
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') inQuote = !inQuote;
    else if (!inQuote && /\s/.test(text[i]!)) return { head: text.slice(0, i), rest: text.slice(i + 1).trim() };
  }
  return { head: text, rest: '' };
}

/**
 * One relationship line in either direction: `source - type -> destination` or
 * `destination <- type - source`. Split on the arrow tokens and the `-`
 * separator outside quotes rather than with one combined regex (untrusted
 * input, `security/detect-unsafe-regex`); an unquoted name may then hold a `-`.
 */
function parseRelationshipLine(line: string): { from: string; to: string; type: RequirementRelationType } | null {
  const rightArrow = indexOutsideQuotes(line, '->');
  if (rightArrow !== -1) {
    const left = line.slice(0, rightArrow);
    const dash = indexOutsideQuotes(left, '-', true);
    if (dash === -1) return null;
    return relationship(left.slice(0, dash), left.slice(dash + 1).trim(), line.slice(rightArrow + 2));
  }
  const leftArrow = indexOutsideQuotes(line, '<-');
  if (leftArrow !== -1) {
    const right = line.slice(leftArrow + 2);
    const dash = indexOutsideQuotes(right, '-');
    if (dash === -1) return null;
    return relationship(right.slice(dash + 1), right.slice(0, dash).trim(), line.slice(0, leftArrow));
  }
  return null;
}

function relationship(fromText: string, typeText: string, toText: string): { from: string; to: string; type: RequirementRelationType } | null {
  const from = unquote(fromText);
  const to = unquote(toText);
  const type = typeText.toLowerCase();
  if (from.length > 0 && to.length > 0 && isRelationshipType(type)) return { from, to, type };
  return null;
}

/** `<kw> name[:::classes]` (the `{` already removed): the name, quotes removed, and its classes. */
function parseBlockName(text: string): { name: string; classes: string[] } {
  const t = text.trim();
  if (t.startsWith('"')) {
    const close = t.indexOf('"', 1);
    if (close !== -1) {
      const after = t.slice(close + 1).trim();
      return { name: t.slice(1, close), classes: after.startsWith(':::') ? nameList(after.slice(3)) : [] };
    }
  }
  const sep = t.indexOf(':::');
  if (sep === -1) return { name: t, classes: [] };
  return { name: t.slice(0, sep).trim(), classes: nameList(t.slice(sep + 3)) };
}

interface Box {
  style: RequirementBoxStyle;
  classes: string[];
  inline: NodeStylePatch[];
}

export function parseRequirementDiagram(text: string): RequirementDiagramParseResult {
  const warnings: string[] = [];
  const requirements = new Map<string, Requirement>();
  const elements = new Map<string, RequirementElement>();
  const relationships: RequirementDiagram['relationships'] = [];
  let direction: RequirementDiagram['direction'];

  // Styling state. `boxes` is keyed by name; Mermaid looks a requirement up first, then an element.
  const boxes = new Map<string, Box>();
  const classDefs = new Map<string, NodeStylePatch>();
  const boxNamed = (name: string): Box | undefined => boxes.get(`r:${name}`) ?? boxes.get(`e:${name}`);
  const addClasses = (names: string[], classNames: string[]): void => {
    for (const name of names) boxNamed(name)?.classes.push(...classNames);
  };

  type Block = { kind: 'requirement'; req: Requirement; discard: boolean } | { kind: 'element'; el: RequirementElement; discard: boolean };
  let open: Block | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    // Mermaid's lexer skips `%…` and `#…` up to the end of the line.
    if (line.length === 0 || line.startsWith('%') || line.startsWith('#')) continue;
    if (/^requirementDiagram\b/i.test(line)) continue;

    if (open) {
      if (line === '}') {
        open = null;
        continue;
      }
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) {
        warnings.push(`Unsupported field line ignored: ${line}`);
        continue;
      }
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const value = unquote(line.slice(colonIdx + 1));
      if (open.kind === 'requirement') {
        const req = open.req;
        if (key === 'id') req.id = value;
        else if (key === 'text') req.text = value;
        else if (key === 'risk') {
          req.risk = RISK_DISPLAY.get(value.toLowerCase()) ?? value;
          if (!RISK_DISPLAY.has(value.toLowerCase()) && !open.discard) {
            warnings.push(`Risk "${value}" of requirement "${req.name}" is not Low, Medium or High (Mermaid rejects it); shown as written.`);
          }
        } else if (key === 'verifymethod') {
          req.verifyMethod = VERIFY_DISPLAY.get(value.toLowerCase()) ?? value;
          if (!VERIFY_DISPLAY.has(value.toLowerCase()) && !open.discard) {
            warnings.push(`Verify method "${value}" of requirement "${req.name}" is not Analysis, Demonstration, Inspection or Test (Mermaid rejects it); shown as written.`);
          }
        } else warnings.push(`Unsupported requirement field ignored: ${line}`);
      } else {
        if (key === 'type') open.el.type = value;
        else if (key === 'docref') open.el.docRef = value;
        else warnings.push(`Unsupported element field ignored: ${line}`);
      }
      continue;
    }

    const directionMatch = /^direction\s+(TB|TD|BT|LR|RL)$/i.exec(line);
    if (directionMatch) {
      const requested = directionMatch[1]!.toUpperCase();
      direction = requested === 'TB' ? 'TD' : (requested as NonNullable<RequirementDiagram['direction']>);
      continue;
    }

    if (line.endsWith('{')) {
      const { head: keyword, rest } = splitFirstWord(line.slice(0, -1).trim());
      const { name, classes } = parseBlockName(rest);
      if (name.length === 0) {
        warnings.push(`Unsupported block opener ignored: ${line}`);
        continue;
      }
      if (keyword.toLowerCase() === 'element') {
        const key = `e:${name}`;
        const discard = boxes.has(key);
        const el: RequirementElement = { name };
        if (discard) warnings.push(`Element "${name}" is defined twice; the first definition is kept, as in Mermaid.`);
        else {
          elements.set(name, el);
          boxes.set(key, { style: el, classes: [], inline: [] });
        }
        open = { kind: 'element', el, discard };
      } else {
        const type = TYPE_BY_LOWER.get(keyword.toLowerCase());
        if (type === undefined) warnings.push(`"${keyword}" is not a requirement type Mermaid knows (it rejects the diagram); "${name}" is drawn as a requirement of that type.`);
        const key = `r:${name}`;
        const discard = boxes.has(key);
        const req: Requirement = { name, type: type ?? keyword };
        if (discard) warnings.push(`Requirement "${name}" is defined twice; the first definition is kept, as in Mermaid.`);
        else {
          requirements.set(name, req);
          boxes.set(key, { style: req, classes: [], inline: [] });
        }
        open = { kind: 'requirement', req, discard };
      }
      if (!open.discard) addClasses([name], classes);
      continue;
    }

    const keyword = /^(classDef|class|style)\s/i.exec(line)?.[1]?.toLowerCase();
    if (keyword !== undefined) {
      const { head, rest } = splitFirstWord(line.slice(keyword.length).trim());
      const targets = nameList(head);
      if (targets.length === 0 || rest.length === 0) {
        warnings.push(`Unsupported line ignored: ${line}`);
      } else if (keyword === 'classdef') {
        const patch = extractNodeStyle(parseCssStyleProps(rest));
        for (const name of targets) classDefs.set(name, { ...classDefs.get(name), ...patch });
      } else if (keyword === 'class') {
        addClasses(targets, nameList(rest));
      } else {
        const patch = extractNodeStyle(parseCssStyleProps(rest));
        for (const name of targets) boxNamed(name)?.inline.push(patch);
      }
      continue;
    }

    const rel = parseRelationshipLine(line);
    if (rel) {
      relationships.push(rel);
      continue;
    }

    // `id:::classes` on a line of its own.
    const sep = indexOutsideQuotes(line, ':::');
    if (sep > 0) {
      addClasses([unquote(line.slice(0, sep))], nameList(line.slice(sep + 3)));
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  if (open) {
    warnings.push('One or more requirement/element blocks were not closed with a matching "}".');
  }

  const undefinedClasses = new Set<string>();
  for (const box of boxes.values()) {
    const patch: NodeStylePatch = { ...classDefs.get('default') };
    for (const name of box.classes) {
      const def = classDefs.get(name);
      if (def) Object.assign(patch, def);
      else if (name !== 'default') undefinedClasses.add(name);
    }
    for (const inline of box.inline) Object.assign(patch, inline);
    if (patch.fill !== undefined) box.style.fill = patch.fill;
    if (patch.stroke !== undefined) box.style.stroke = patch.stroke;
    if (patch.color !== undefined) box.style.textColor = patch.color;
    if (patch.bold !== undefined) box.style.bold = patch.bold;
    if (patch.italic !== undefined) box.style.italic = patch.italic;
  }
  for (const name of undefinedClasses) warnings.push(`classDef "${name}" referenced but not defined.`);

  for (const rel of relationships) {
    for (const end of [rel.from, rel.to]) {
      if (!boxNamed(end)) warnings.push(`Relationship "${rel.from} - ${rel.type} -> ${rel.to}" names "${end}", which is not defined; it is not drawn.`);
    }
  }

  return {
    ast: {
      requirements: [...requirements.values()],
      elements: [...elements.values()],
      relationships,
      ...(direction ? { direction } : {}),
    },
    warnings,
  };
}
