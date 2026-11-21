/**
 * Parser for Mermaid C4 diagrams (see `types.ts`'s doc comment for the AST and what Mermaid itself reads).
 *
 * C4's grammar is a PlantUML-style function-call syntax (`Type(alias, "label", ...)`), so this parser is
 * built around one generic `parseCall()` (name + comma-split args, respecting quotes, plus a trailing `{`
 * for a block opener) rather than per-construct regexes. Every example in Mermaid's docs writes one call
 * per line with the opening `{` (if any) on that same line, so this is a line-oriented parser.
 *
 * Frames (`*Boundary`, `Deployment_Node`, `Node*`) ending in `{` push onto a stack; every element and
 * frame declared while one is on top gets it as `parent`. `UpdateElementStyle` / `UpdateRelStyle` apply to
 * what is already declared when they are read, as in Mermaid; `UpdateRelStyle(a, b)` names a relationship
 * as it was written, so it finds `Rel_Back(a, b)` too although that one is stored as `b -> a`. Also as in
 * Mermaid, a relationship needs a label, and a second one written between the same two ends replaces the
 * first.
 */

import { parseHexColor } from '../../parser/css-style.js';
import { decodeMermaidEntities } from '../../parser/entities.js';
import type {
  C4Boundary,
  C4Category,
  C4Diagram,
  C4Element,
  C4ElementStyle,
  C4LayoutConfig,
  C4Level,
  C4Relationship,
  C4RelationshipStyle,
  C4Variant,
} from './types.js';

export interface C4ParseResult {
  ast: C4Diagram;
  warnings: string[];
}

interface ElementKind {
  category: C4Category;
  external: boolean;
  variant?: C4Variant;
}

const ELEMENT_KIND: Readonly<Record<string, ElementKind>> = {
  Person: { category: 'person', external: false },
  Person_Ext: { category: 'person', external: true },
  System: { category: 'system', external: false },
  System_Ext: { category: 'system', external: true },
  SystemDb: { category: 'system', external: false, variant: 'db' },
  SystemDb_Ext: { category: 'system', external: true, variant: 'db' },
  SystemQueue: { category: 'system', external: false, variant: 'queue' },
  SystemQueue_Ext: { category: 'system', external: true, variant: 'queue' },
  Container: { category: 'container', external: false },
  Container_Ext: { category: 'container', external: true },
  ContainerDb: { category: 'container', external: false, variant: 'db' },
  ContainerDb_Ext: { category: 'container', external: true, variant: 'db' },
  ContainerQueue: { category: 'container', external: false, variant: 'queue' },
  ContainerQueue_Ext: { category: 'container', external: true, variant: 'queue' },
  Component: { category: 'component', external: false },
  Component_Ext: { category: 'component', external: true },
  ComponentDb: { category: 'component', external: false, variant: 'db' },
  ComponentDb_Ext: { category: 'component', external: true, variant: 'db' },
  ComponentQueue: { category: 'component', external: false, variant: 'queue' },
  ComponentQueue_Ext: { category: 'component', external: true, variant: 'queue' },
};

/** Positional slots after (alias, label) for each category. */
const ELEMENT_POSITIONALS: Readonly<Record<C4Category, string[]>> = {
  person: ['descr', 'sprite', 'tags', 'link'],
  system: ['descr', 'sprite', 'tags', 'link'],
  container: ['techn', 'descr', 'sprite', 'tags', 'link'],
  component: ['techn', 'descr', 'sprite', 'tags', 'link'],
};

/** The four boundary calls, with the `[type]` each one fixes (`null`: the call's own third argument). */
const BOUNDARY_TYPE: Readonly<Record<string, string | null>> = {
  Boundary: null,
  Enterprise_Boundary: 'ENTERPRISE',
  System_Boundary: 'SYSTEM',
  Container_Boundary: 'CONTAINER',
};

const DEPLOYMENT_CALLS = new Set(['Deployment_Node', 'Node', 'Node_L', 'Node_R']);

/** Not part of Mermaid's C4 grammar (C4-PlantUML only): recognized so the warning can say so. */
const TAG_CALLS = new Set(['AddElementTag', 'AddRelTag']);

const REL_CALLS = new Set([
  'Rel',
  'BiRel',
  'Rel_Back',
  'Rel_U',
  'Rel_Up',
  'Rel_D',
  'Rel_Down',
  'Rel_L',
  'Rel_Left',
  'Rel_R',
  'Rel_Right',
  'RelIndex',
]);

const LEVELS: Readonly<Record<string, C4Level>> = {
  c4context: 'context',
  c4container: 'container',
  c4component: 'component',
  c4dynamic: 'dynamic',
  c4deployment: 'deployment',
};

/** `UpdateElementStyle` arguments after the element name, in Mermaid's positional order. */
const ELEMENT_STYLE_POSITIONALS = ['bgColor', 'fontColor', 'borderColor', 'shadowing', 'shape', 'sprite', 'techn', 'legendText', 'legendSprite'];
const REL_STYLE_POSITIONALS = ['textColor', 'lineColor', 'offsetX', 'offsetY'];
const LAYOUT_POSITIONALS = ['c4ShapeInRow', 'c4BoundaryInRow'];

/** Rows wider than this are a typo, not a layout: capped so one value cannot stretch the drawing without bound. */
const MAX_PER_ROW = 50;

interface Call {
  name: string;
  args: string[];
  opensBlock: boolean;
}

const CALL_LINE = /^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*(\{)?\s*$/;

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

/** Display text: Mermaid's `<br/>` is a line break, `#name;` / `#123;` entities are decoded. */
function displayText(value: string): string {
  return decodeMermaidEntities(value.replace(/<br\s*\/?>/gi, '\n'))
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
}

/** Split a call's argument list on top-level commas, i.e. commas not inside
 * a `"..."` quoted string — a label like `"A customer of the bank, with
 * personal bank accounts."` contains a comma that must not split it. */
function splitArgs(argsStr: string): string[] {
  if (argsStr.trim().length === 0) return [];
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of argsStr) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  args.push(current.trim());
  return args;
}

function parseCall(line: string): Call | null {
  const match = line.match(CALL_LINE);
  if (!match) return null;
  return { name: match[1]!, args: splitArgs(match[2]!), opensBlock: match[3] === '{' };
}

/** Resolve a call's args against `positionals`, honoring `$name="value"`/`$name=value` named
 * overrides wherever they appear — C4-PlantUML allows named args out of positional order. */
function resolveNamedAndPositional(args: string[], positionals: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  let posIndex = 0;
  for (const arg of args) {
    const named = arg.match(/^\$([A-Za-z0-9]+)\s*=\s*(.+)$/);
    if (named) {
      values[named[1]!] = stripQuotes(named[2]!);
      continue;
    }
    const name = positionals[posIndex];
    posIndex++;
    if (name) values[name] = stripQuotes(arg);
  }
  return values;
}

/** A whole number as Mermaid's `parseInt` reads it (`"-40"`, `"5px"` -> 5), or `undefined`. */
function readInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = value.trim().match(/^[+-]?\d+/);
  if (!match) return undefined;
  const n = Number(match[0]);
  return Number.isSafeInteger(n) ? n : undefined;
}

export function parseC4Diagram(text: string): C4ParseResult {
  const warnings: string[] = [];
  const elements = new Map<string, C4Element>();
  const boundaries = new Map<string, C4Boundary>();
  const relationships: C4Relationship[] = [];
  /** Each relationship's endpoints as written, which is how `UpdateRelStyle` names it. */
  const writtenEnds: Array<{ from: string; to: string }> = [];
  const layout: C4LayoutConfig = {};
  let title: string | undefined;
  let level: C4Level | undefined;

  /** Open blocks; `null` for a block opened by something that cannot hold anything (kept to match its `}`). */
  const stack: Array<string | null> = [];
  let warnedTags = false;

  const currentParent = (): string | undefined => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i] !== null) return stack[i]!;
    return undefined;
  };

  /** A validated colour, or `undefined` with a warning. */
  function color(value: string | undefined, what: string, line: string): string | undefined {
    if (value === undefined || value.length === 0) return undefined;
    const hex = parseHexColor(value);
    if (hex === null) warnings.push(`${what} "${value}" is not a colour this converter reads (a #hex value or a CSS colour name), ignored: ${line}`);
    return hex ?? undefined;
  }

  function applyElementStyle(call: Call, line: string): void {
    const target = stripQuotes(call.args[0] ?? '');
    const values = resolveNamedAndPositional(call.args.slice(1), ELEMENT_STYLE_POSITIONALS);
    const owner = elements.get(target) ?? boundaries.get(target);
    if (!owner) {
      warnings.push(`UpdateElementStyle names "${target}", which is not declared above it, ignored: ${line}`);
      return;
    }
    const patch: C4ElementStyle = {};
    const fill = color(values.bgColor, '$bgColor', line);
    const text = color(values.fontColor, '$fontColor', line);
    const border = color(values.borderColor, '$borderColor', line);
    if (fill) patch.fill = fill;
    if (text) patch.text = text;
    if (border) patch.line = border;
    if (Object.keys(patch).length > 0) owner.style = { ...owner.style, ...patch };
    const notApplied = Object.keys(values).filter((key) => !['bgColor', 'fontColor', 'borderColor'].includes(key));
    if (notApplied.length > 0) warnings.push(`UpdateElementStyle ${notApplied.map((k) => `$${k}`).join(', ')} not applied: ${line}`);
  }

  function applyRelStyle(call: Call, line: string): void {
    const from = stripQuotes(call.args[0] ?? '');
    const to = stripQuotes(call.args[1] ?? '');
    const values = resolveNamedAndPositional(call.args.slice(2), REL_STYLE_POSITIONALS);
    const index = writtenEnds.findIndex((ends) => ends.from === from && ends.to === to);
    if (index < 0) {
      warnings.push(`UpdateRelStyle names a relationship ${from} -> ${to} that is not declared above it, ignored: ${line}`);
      return;
    }
    const rel = relationships[index]!;
    const patch: C4RelationshipStyle = {};
    const text = color(values.textColor, '$textColor', line);
    const lineColor = color(values.lineColor, '$lineColor', line);
    const offsetX = readInteger(values.offsetX);
    const offsetY = readInteger(values.offsetY);
    if (text) patch.text = text;
    if (lineColor) patch.line = lineColor;
    if (offsetX !== undefined) patch.offsetX = offsetX;
    if (offsetY !== undefined) patch.offsetY = offsetY;
    if (Object.keys(patch).length > 0) rel.style = { ...rel.style, ...patch };
  }

  function applyLayoutConfig(call: Call): void {
    const values = resolveNamedAndPositional(call.args, LAYOUT_POSITIONALS);
    const shapes = readInteger(values.c4ShapeInRow);
    const frames = readInteger(values.c4BoundaryInRow);
    // Mermaid keeps its current value for anything below 1.
    if (shapes !== undefined && shapes >= 1) layout.shapesPerRow = Math.min(shapes, MAX_PER_ROW);
    if (frames !== undefined && frames >= 1) layout.boundariesPerRow = Math.min(frames, MAX_PER_ROW);
  }

  function addBoundary(call: Call, line: string, kind: C4Boundary['kind'], fixedType: string | null): void {
    const alias = stripQuotes(call.args[0] ?? '');
    if (alias.length === 0) {
      warnings.push(`Unsupported line ignored (could not read a ${call.name} id): ${line}`);
      return;
    }
    const label = call.args[1] !== undefined ? displayText(stripQuotes(call.args[1])) : '';
    let type: string;
    let description: string | undefined;
    if (kind === 'deployment') {
      const values = resolveNamedAndPositional(call.args.slice(2), ['type', 'descr', 'sprite', 'tags', 'link']);
      type = values.type ?? 'node';
      description = values.descr;
    } else if (fixedType !== null) {
      type = fixedType;
    } else {
      const values = resolveNamedAndPositional(call.args.slice(2), ['type', 'tags', 'link']);
      type = values.type ?? 'system';
    }
    const parent = currentParent();
    boundaries.set(alias, {
      id: alias,
      label,
      kind,
      type: displayText(type),
      ...(description ? { description: displayText(description) } : {}),
      ...(parent !== undefined ? { parent } : {}),
    });
    if (call.opensBlock) stack.push(alias);
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    const header = line.match(/^(C4(?:Context|Container|Component|Dynamic|Deployment))\b/i);
    if (header) {
      level = LEVELS[header[1]!.toLowerCase()];
      continue;
    }

    if (line === '}') {
      if (stack.length > 0) stack.pop();
      else warnings.push(`Unexpected "}" without a matching block opener: ${line}`);
      continue;
    }

    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      title = titleMatch[1]!.trim();
      continue;
    }

    const call = parseCall(line);
    if (!call) {
      warnings.push(`Unsupported line ignored: ${line}`);
      continue;
    }

    if (call.name === 'UpdateElementStyle') {
      applyElementStyle(call, line);
      continue;
    }
    if (call.name === 'UpdateRelStyle') {
      applyRelStyle(call, line);
      continue;
    }
    if (call.name === 'UpdateLayoutConfig') {
      applyLayoutConfig(call);
      continue;
    }
    if (TAG_CALLS.has(call.name)) {
      if (!warnedTags) {
        warnedTags = true;
        warnings.push('AddElementTag/AddRelTag come from C4-PlantUML and are not part of Mermaid\'s C4 syntax; ignored.');
      }
      continue;
    }

    if (call.name in BOUNDARY_TYPE) {
      addBoundary(call, line, 'boundary', BOUNDARY_TYPE[call.name]!);
      continue;
    }
    if (DEPLOYMENT_CALLS.has(call.name)) {
      addBoundary(call, line, 'deployment', null);
      continue;
    }

    const kind = ELEMENT_KIND[call.name];
    if (kind) {
      const alias = stripQuotes(call.args[0] ?? '');
      if (alias.length === 0) {
        warnings.push(`Unsupported line ignored (could not read a ${call.name} id): ${line}`);
        continue;
      }
      const label = call.args[1] !== undefined ? displayText(stripQuotes(call.args[1])) : alias;
      const values = resolveNamedAndPositional(call.args.slice(2), ELEMENT_POSITIONALS[kind.category]);
      const parent = currentParent();
      elements.set(alias, {
        id: alias,
        category: kind.category,
        external: kind.external,
        ...(kind.variant ? { variant: kind.variant } : {}),
        label,
        ...(values.techn ? { techn: displayText(values.techn) } : {}),
        ...(values.descr ? { description: displayText(values.descr) } : {}),
        ...(parent !== undefined ? { parent } : {}),
      });
      if (call.opensBlock) {
        warnings.push(`A ${call.name} cannot hold other elements; what its "{" block declares belongs to the frame around it: ${line}`);
        stack.push(null);
      }
      continue;
    }

    if (REL_CALLS.has(call.name)) {
      // RelIndex(index, from, to, label, ...): the index is ignored, as in Mermaid ("Compatible with
      // C4-PlantUML syntax, but ignores the index parameter"); statement order numbers C4Dynamic.
      const args = call.name === 'RelIndex' ? call.args.slice(1) : call.args;
      const rawFrom = stripQuotes(args[0] ?? '');
      const rawTo = stripQuotes(args[1] ?? '');
      if (rawFrom.length === 0 || rawTo.length === 0) {
        warnings.push(`Unsupported line ignored (could not read relationship endpoints): ${line}`);
        continue;
      }
      const values = resolveNamedAndPositional(args.slice(2), ['label', 'techn', 'descr', 'sprite', 'tags', 'link']);
      if (values.label === undefined) {
        warnings.push(`A relationship needs a label (Mermaid does not draw one without), ignored: ${line}`);
        continue;
      }
      // Rel_Back(a, b, ...) reads as "a <- b": the arrow points at `a`.
      const [from, to] = call.name === 'Rel_Back' ? [rawTo, rawFrom] : [rawFrom, rawTo];
      const rel: C4Relationship = {
        from,
        to,
        label: displayText(values.label),
        ...(values.techn ? { techn: displayText(values.techn) } : {}),
        bidirectional: call.name === 'BiRel',
      };
      // As in Mermaid, a second relationship written between the same two ends replaces the first one
      // (in place, keeping its style and its number in a C4Dynamic).
      const existing = writtenEnds.findIndex((ends) => ends.from === rawFrom && ends.to === rawTo);
      if (existing >= 0) {
        const style = relationships[existing]!.style;
        relationships[existing] = { ...rel, ...(style ? { style } : {}) };
      } else {
        relationships.push(rel);
        writtenEnds.push({ from: rawFrom, to: rawTo });
      }
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  // An endpoint that names neither an element nor a frame becomes a plain top-level system, so the
  // relationship is drawn rather than dropped (Mermaid itself refuses the whole diagram).
  for (const rel of relationships) {
    for (const id of [rel.from, rel.to]) {
      if (!elements.has(id) && !boundaries.has(id)) elements.set(id, { id, category: 'system', external: false, label: id });
    }
  }

  return {
    ast: {
      ...(title ? { title } : {}),
      ...(level ? { level } : {}),
      elements: [...elements.values()],
      ...(boundaries.size > 0 ? { boundaries: [...boundaries.values()] } : {}),
      relationships,
      ...(layout.shapesPerRow !== undefined || layout.boundariesPerRow !== undefined ? { layout } : {}),
    },
    warnings,
  };
}
