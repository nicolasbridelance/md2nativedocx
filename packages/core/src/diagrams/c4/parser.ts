/**
 * Parser for Mermaid C4 diagrams (grammar verified against
 * `mermaid-js/mermaid`'s own docs source, see `types.ts`'s doc comment for
 * the fetch note and the full v1 scope).
 *
 * Unlike every other diagram module in this project, C4's grammar is a
 * PlantUML-style function-call syntax (`Type(alias, "label", ...)`), not a
 * bespoke line grammar — so this parser is built around one generic
 * `parseCall()` (name + comma-split args, respecting quotes, plus a
 * trailing `{` for a block opener) rather than per-construct regexes. Every
 * example in the source docs writes one call per line with the opening
 * `{` (if any) on that same line, so — like every other module here — this
 * is a line-oriented parser with no support for a call's arguments spanning
 * multiple lines.
 *
 * Boundary/Deployment_Node nesting uses the same generic brace-stack
 * convention as `../class-diagram/parser.ts`'s `namespace` handling: a
 * frame is pushed whenever a boundary-shaped call or a block-opening
 * `Deployment_Node`/`Node*` ends in `{`, and every element declared while
 * that frame is on top gets its `parent` set to the frame's id — dropped
 * from rendering (see `translator.ts`) but never silently: the first time
 * this happens, a warning fires.
 */

import type { C4Category, C4Diagram, C4Element, C4Relationship, C4Variant } from './types.js';

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
  Deployment_Node: { category: 'node', external: false },
  Node: { category: 'node', external: false },
  Node_L: { category: 'node', external: false },
  Node_R: { category: 'node', external: false },
};

// Positional slots after (alias, label) for each category — see types.ts's
// doc comment for why Deployment_Node's "?type" and Container/Component's
// "?techn" share one AST field.
const ELEMENT_POSITIONALS: Readonly<Record<C4Category, string[]>> = {
  person: ['descr', 'sprite', 'tags'],
  system: ['descr', 'sprite', 'tags'],
  container: ['techn', 'descr', 'sprite', 'tags'],
  component: ['techn', 'descr', 'sprite', 'tags'],
  node: ['techn', 'descr', 'sprite', 'tags'],
};

const BOUNDARY_CALLS = new Set(['Boundary', 'Enterprise_Boundary', 'System_Boundary', 'Container_Boundary']);

const STYLE_DIRECTIVE_CALLS = new Set(['UpdateElementStyle', 'UpdateRelStyle', 'UpdateLayoutConfig', 'AddElementTag', 'AddRelTag']);

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

/** Resolve a call's args (after the alias, already consumed by the caller)
 * against `positionals`, honoring `$name="value"`/`$name=value` named
 * overrides wherever they appear — real C4-PlantUML allows named args out
 * of positional order (see `types.ts`'s doc comment for the source example
 * demonstrating this). */
function resolveNamedAndPositional(args: string[], positionals: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  let posIndex = 0;
  for (const arg of args) {
    const named = arg.match(/^\$([A-Za-z]+)\s*=\s*(.+)$/);
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

export function parseC4Diagram(text: string): C4ParseResult {
  const warnings: string[] = [];
  const elements = new Map<string, C4Element>();
  const relationships: C4Relationship[] = [];
  let title: string | undefined;

  type Frame = { id: string };
  const stack: Frame[] = [];
  let warnedContainment = false;
  let warnedStyleDirective = false;

  function currentParent(): string | undefined {
    return stack.length > 0 ? stack[stack.length - 1]!.id : undefined;
  }

  function warnContainmentOnce(): void {
    if (warnedContainment) return;
    warnedContainment = true;
    warnings.push(
      'Boundary/Deployment_Node nesting is not yet rendered as nested boxes; contained elements still render as standalone boxes at the top level.',
    );
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (/^C4(?:Context|Container|Component|Dynamic|Deployment)\b/i.test(line)) continue;

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

    if (STYLE_DIRECTIVE_CALLS.has(call.name)) {
      if (!warnedStyleDirective) {
        warnedStyleDirective = true;
        warnings.push('UpdateElementStyle/UpdateRelStyle/UpdateLayoutConfig/AddElementTag/AddRelTag are styling/layout-density directives, not yet applied to the rendered diagram.');
      }
      continue;
    }

    if (BOUNDARY_CALLS.has(call.name)) {
      const alias = stripQuotes(call.args[0] ?? '');
      if (alias.length === 0) {
        warnings.push(`Unsupported line ignored (could not read a boundary id): ${line}`);
        continue;
      }
      if (call.opensBlock) {
        warnContainmentOnce();
        stack.push({ id: alias });
      }
      continue;
    }

    const kind = ELEMENT_KIND[call.name];
    if (kind) {
      const alias = stripQuotes(call.args[0] ?? '');
      if (alias.length === 0) {
        warnings.push(`Unsupported line ignored (could not read a ${call.name} id): ${line}`);
        continue;
      }
      const label = call.args[1] !== undefined ? stripQuotes(call.args[1]) : alias;
      const values = resolveNamedAndPositional(call.args.slice(2), ELEMENT_POSITIONALS[kind.category]);
      const parent = currentParent();
      if (parent !== undefined) warnContainmentOnce();
      elements.set(alias, {
        id: alias,
        category: kind.category,
        external: kind.external,
        ...(kind.variant ? { variant: kind.variant } : {}),
        label,
        ...(values.techn ? { techn: values.techn } : {}),
        ...(values.descr ? { description: values.descr } : {}),
        ...(parent !== undefined ? { parent } : {}),
      });
      if (call.opensBlock) stack.push({ id: alias });
      continue;
    }

    if (REL_CALLS.has(call.name)) {
      // RelIndex(index, from, to, label, ...) has one extra leading
      // argument (the sequence index, ignored per Mermaid's own docs: "*
      // Compatible with C4-PlantUML syntax, but ignores the index
      // parameter" — the sequence order is the statement order instead).
      const args = call.name === 'RelIndex' ? call.args.slice(1) : call.args;
      const rawFrom = stripQuotes(args[0] ?? '');
      const rawTo = stripQuotes(args[1] ?? '');
      if (rawFrom.length === 0 || rawTo.length === 0) {
        warnings.push(`Unsupported line ignored (could not read relationship endpoints): ${line}`);
        continue;
      }
      const values = resolveNamedAndPositional(args.slice(2), ['label', 'techn', 'descr', 'sprite', 'tags']);
      // Rel_Back(a, b, ...) reads as "a <- b" — the same relationship a
      // normal Rel(b, a, ...) would describe, just written from the
      // opposite element's point of view (PlantUML/C4 convention, kept for
      // statement-order-driven manual layout that this project's own
      // Dagre-based layout doesn't need but still honors for arrow
      // direction).
      const [from, to] = call.name === 'Rel_Back' ? [rawTo, rawFrom] : [rawFrom, rawTo];
      relationships.push({
        from,
        to,
        label: values.label ?? '',
        ...(values.techn ? { techn: values.techn } : {}),
        bidirectional: call.name === 'BiRel',
      });
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  for (const rel of relationships) {
    if (!elements.has(rel.from)) {
      elements.set(rel.from, { id: rel.from, category: 'system', external: false, label: rel.from });
    }
    if (!elements.has(rel.to)) {
      elements.set(rel.to, { id: rel.to, category: 'system', external: false, label: rel.to });
    }
  }

  return {
    ast: { ...(title ? { title } : {}), elements: [...elements.values()], relationships },
    warnings,
  };
}
