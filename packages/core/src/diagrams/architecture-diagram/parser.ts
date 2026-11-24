/**
 * Parser for Mermaid `architecture-beta`, on the grammar of Mermaid 12.3 (`architecture.langium`, read in
 * its published parser; the code here is this project's own). One statement per line:
 *
 * - `group <id>[(icon)][[title]] [in <group>]`
 * - `service <id>[(icon) | "text"][[title]] [in <group>]`
 * - `junction <id> [in <group>]`
 * - `<id>[{group}]:<side> [<](-- | -[label]-)[>] <side>:<id>[{group}]`
 * - `align row|column <id> <id> …` (two members or more)
 * - `title …`, `accTitle: …`, `accDescr: …` or `accDescr { … }`
 *
 * An id is `\w([-\w]*\w)?`; a title in `[…]` may be quoted (`["a [b]"]`). Spaces may separate any two
 * tokens, `%%` starts a comment. Each line is read by a small scanner, token by token, rather than by one
 * regex over the line (no backtracking on untrusted text, and a title may contain ` in `).
 *
 * Where Mermaid stops with an error (an undeclared id, a parent that is not a group, an `align` naming a
 * group), the line or the part at fault is dropped with a warning and the rest is drawn.
 */

import type {
  ArchitectureAlignment,
  ArchitectureDiagram,
  ArchitectureEdge,
  ArchitectureNode,
  ArchitectureNodeKind,
  ArchitectureSide,
} from './types.js';

export interface ArchitectureDiagramParseResult {
  ast: ArchitectureDiagram;
  warnings: string[];
}

const isWordChar = (c: string | undefined): boolean => c !== undefined && /[A-Za-z0-9_]/.test(c);
const isSide = (c: string | undefined): c is ArchitectureSide => c === 'L' || c === 'R' || c === 'T' || c === 'B';

/** Reads the tokens of one line. Every method returns `undefined` (and moves nothing) when the token is absent. */
class LineScanner {
  private pos = 0;

  constructor(private readonly text: string) {}

  /** Skip spaces; a `%%` comment ends the line. */
  private skip(): void {
    while (this.text[this.pos] === ' ' || this.text[this.pos] === '\t') this.pos++;
    if (this.text.startsWith('%%', this.pos)) this.pos = this.text.length;
  }

  atEnd(): boolean {
    this.skip();
    return this.pos >= this.text.length;
  }

  literal(token: string): boolean {
    this.skip();
    if (!this.text.startsWith(token, this.pos)) return false;
    this.pos += token.length;
    return true;
  }

  /** A keyword: the literal, not followed by an id character. */
  keyword(word: string): boolean {
    this.skip();
    if (!this.text.startsWith(word, this.pos) || isWordChar(this.text[this.pos + word.length])) return false;
    this.pos += word.length;
    return true;
  }

  /** `\w([-\w]*\w)?`: the longest run of id characters and dashes, less any trailing dashes. */
  id(): string | undefined {
    this.skip();
    if (!isWordChar(this.text[this.pos])) return undefined;
    let end = this.pos;
    while (isWordChar(this.text[end]) || this.text[end] === '-') end++;
    while (this.text[end - 1] === '-') end--;
    const value = this.text.slice(this.pos, end);
    this.pos = end;
    return value;
  }

  side(): ArchitectureSide | undefined {
    this.skip();
    const c = this.text[this.pos];
    if (!isSide(c) || isWordChar(this.text[this.pos + 1])) return undefined;
    this.pos++;
    return c;
  }

  /** `(name)`, name made of id characters, `-` and `:`. */
  icon(): string | undefined {
    this.skip();
    if (this.text[this.pos] !== '(') return undefined;
    const close = this.text.indexOf(')', this.pos + 1);
    if (close < 0) return undefined;
    const name = this.text.slice(this.pos + 1, close);
    if (!/^[\w:-]+$/.test(name)) return undefined;
    this.pos = close + 1;
    return name.trim();
  }

  /** A `"…"` or `'…'` string, backslash escapes resolved. */
  quoted(): string | undefined {
    this.skip();
    const q = this.text[this.pos];
    if (q !== '"' && q !== "'") return undefined;
    let out = '';
    for (let i = this.pos + 1; i < this.text.length; i++) {
      const c = this.text[i]!;
      if (c === '\\' && i + 1 < this.text.length) {
        out += this.text[++i];
      } else if (c === q) {
        this.pos = i + 1;
        return out;
      } else {
        out += c;
      }
    }
    return undefined;
  }

  /** `[title]` or `["title"]` / `['title']`; `undefined` when absent or never closed. */
  title(): string | undefined {
    this.skip();
    if (this.text[this.pos] !== '[') return undefined;
    const start = this.pos;
    this.pos++;
    const inner = this.quoted();
    if (inner !== undefined && this.literal(']')) return inner.trim();
    this.pos = start + 1;
    const close = this.text.indexOf(']', this.pos);
    const open = this.text.indexOf('[', this.pos);
    if (close < 0 || (open >= 0 && open < close) || close === this.pos) {
      this.pos = start;
      return undefined;
    }
    const value = this.text.slice(this.pos, close).trim();
    this.pos = close + 1;
    return value;
  }

  rest(): string {
    return this.text.slice(this.pos).trim();
  }
}

interface Declaration {
  id: string;
  icon?: string;
  iconText?: string;
  title?: string;
  parent?: string;
}

/** The tail of a `group` / `service` / `junction` line, after its keyword. */
function readDeclaration(kind: ArchitectureNodeKind, s: LineScanner): Declaration | undefined {
  const id = s.id();
  if (id === undefined) return undefined;
  const decl: Declaration = { id };
  if (kind !== 'junction') {
    const icon = s.icon();
    if (icon !== undefined) decl.icon = icon;
    else if (kind === 'service') {
      const text = s.quoted();
      if (text !== undefined) decl.iconText = text;
    }
    const title = s.title();
    if (title !== undefined) decl.title = title;
  }
  if (s.keyword('in')) {
    const parent = s.id();
    if (parent === undefined) return undefined;
    decl.parent = parent;
  }
  return s.atEnd() ? decl : undefined;
}

/** An edge line, or `undefined` when the line is not one. */
function readEdge(s: LineScanner): ArchitectureEdge | undefined {
  const from = s.id();
  if (from === undefined) return undefined;
  const fromGroup = s.literal('{group}');
  if (!s.literal(':')) return undefined;
  const fromSide = s.side();
  if (fromSide === undefined) return undefined;
  const arrowAtFrom = s.literal('<');
  let label: string | undefined;
  if (!s.literal('--')) {
    if (!s.literal('-')) return undefined;
    label = s.title();
    if (label === undefined || !s.literal('-')) return undefined;
  }
  const arrowAtTo = s.literal('>');
  const toSide = s.side();
  if (toSide === undefined || !s.literal(':')) return undefined;
  const to = s.id();
  if (to === undefined) return undefined;
  const toGroup = s.literal('{group}');
  if (!s.atEnd()) return undefined;
  return {
    from,
    fromSide,
    to,
    toSide,
    arrowAtFrom,
    arrowAtTo,
    ...(fromGroup ? { fromGroup } : {}),
    ...(toGroup ? { toGroup } : {}),
    ...(label ? { label } : {}),
  };
}

/** Text before a `%%` comment, trimmed (Mermaid stops a title at its first `%%`). */
function stripComment(text: string): string {
  const at = text.indexOf('%%');
  return (at < 0 ? text : text.slice(0, at)).trim();
}

export function parseArchitectureDiagram(text: string): ArchitectureDiagramParseResult {
  const warnings: string[] = [];
  const ast: ArchitectureDiagram = { nodes: [], edges: [] };
  const nodes = new Map<string, ArchitectureNode>();
  const alignments: ArchitectureAlignment[] = [];
  const lines = text.split(/\r?\n/);
  let headerSeen = false;

  const declare = (kind: ArchitectureNodeKind, decl: Declaration, line: string): void => {
    if (nodes.has(decl.id)) {
      warnings.push(`"${decl.id}" is declared twice; the second declaration is ignored: ${line}`);
      return;
    }
    const node: ArchitectureNode = { ...decl, kind };
    if (decl.parent !== undefined) {
      const parent = nodes.get(decl.parent);
      if (decl.parent === decl.id || parent?.kind !== 'group') {
        warnings.push(`"${decl.id}" is placed in "${decl.parent}", which is not a group declared before it; drawn outside any group.`);
        delete node.parent;
      }
    }
    nodes.set(decl.id, node);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (line === '' || line.startsWith('%%')) continue;
    if (!headerSeen && /^architecture-beta\b/i.test(line)) {
      headerSeen = true;
      continue;
    }

    let m: RegExpExecArray | null;
    if (line === 'title' || /^title[\t ]/.test(line)) {
      const title = stripComment(line.slice('title'.length));
      if (title) ast.title = title;
      continue;
    }
    if ((m = /^accTitle[\t ]*:(.*)$/.exec(line))) {
      const accTitle = stripComment(m[1] ?? '');
      if (accTitle) ast.accTitle = accTitle;
      continue;
    }
    if ((m = /^accDescr[\t ]*:(.*)$/.exec(line))) {
      const accDescr = stripComment(m[1] ?? '');
      if (accDescr) ast.accDescr = accDescr;
      continue;
    }
    if (/^accDescr[\t ]*\{/.test(line)) {
      const parts: string[] = [];
      let rest = line.slice(line.indexOf('{') + 1);
      while (!rest.includes('}') && i + 1 < lines.length) {
        parts.push(rest);
        rest = lines[++i] ?? '';
      }
      if (!rest.includes('}')) warnings.push('accDescr { … } is never closed; read to the end of the diagram.');
      parts.push(rest.includes('}') ? rest.slice(0, rest.indexOf('}')) : rest);
      const accDescr = parts.map((p) => p.trim()).filter((p) => p !== '').join('\n');
      if (accDescr) ast.accDescr = accDescr;
      continue;
    }

    const s = new LineScanner(line);
    const kind: ArchitectureNodeKind | undefined = s.keyword('group') ? 'group' : s.keyword('service') ? 'service' : s.keyword('junction') ? 'junction' : undefined;
    if (kind) {
      const decl = readDeclaration(kind, s);
      if (decl) declare(kind, decl, line);
      else warnings.push(`Unsupported line ignored (not a valid ${kind} declaration): ${line}`);
      continue;
    }

    if (s.keyword('align')) {
      const direction = s.keyword('row') ? 'row' : s.keyword('column') ? 'column' : undefined;
      const members: string[] = [];
      for (let id = s.id(); id !== undefined; id = s.id()) members.push(id);
      if (!direction || members.length < 2 || !s.atEnd()) {
        warnings.push(`Unsupported line ignored (align takes row or column and two ids or more): ${line}`);
      } else {
        alignments.push({ direction, members });
      }
      continue;
    }

    const edge = readEdge(new LineScanner(line));
    if (edge) {
      ast.edges.push(edge);
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  // Edges and alignments may name only services and junctions; Mermaid refuses anything else.
  const isNode = (id: string): boolean => {
    const node = nodes.get(id);
    return node !== undefined && node.kind !== 'group';
  };
  ast.edges = ast.edges.filter((edge) => {
    for (const id of [edge.from, edge.to]) {
      const node = nodes.get(id);
      if (node?.kind === 'group') {
        warnings.push(`Edge ${edge.from} -- ${edge.to} ignored: "${id}" is a group; join one of its services with {group} instead.`);
        return false;
      }
      if (!node) {
        warnings.push(`"${id}" is used by an edge but never declared; drawn as a service without an icon.`);
        nodes.set(id, { id, kind: 'service' });
      }
    }
    for (const [end, id] of [[edge.fromGroup, edge.from], [edge.toGroup, edge.to]] as const) {
      if (end && nodes.get(id)?.parent === undefined) {
        warnings.push(`Edge ${edge.from} -- ${edge.to}: "${id}{group}" names a node outside any group; the edge starts at the node.`);
      }
    }
    return true;
  });
  for (const alignment of alignments) {
    const seen = new Set<string>();
    const members = alignment.members.filter((id) => {
      if (!isNode(id) || seen.has(id)) {
        warnings.push(`align ${alignment.direction}: "${id}" is not a service or junction declared once here; left out.`);
        return false;
      }
      seen.add(id);
      return true;
    });
    if (members.length >= 2) (ast.alignments ??= []).push({ direction: alignment.direction, members });
  }

  ast.nodes = [...nodes.values()];
  return { ast, warnings };
}
