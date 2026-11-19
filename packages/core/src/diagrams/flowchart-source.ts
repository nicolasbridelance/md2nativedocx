/**
 * Shared back end of the diagram types that are flowcharts under another name (`agentflow-beta`,
 * `usecase-beta`): their parsers collect nodes, edges and containers in a {@link FlowSourceBuilder}, which
 * writes them out as Mermaid flowchart text for `parseMermaid()`. The layout, the drawing, SmartArt and the
 * `.odt`/`.pptx` outputs are then the flowchart's own, and so are its guarantees on untrusted text:
 * - every id written out is generated (`n0`, `s1`...), never taken from the source, so a hostile name can
 *   neither collide with a Mermaid keyword nor inject a statement;
 * - every label is written inside double quotes with `"` replaced by `#quot;`, and a line break in it is
 *   a real one (a quoted label may span lines).
 * Capped (hostile input): see {@link FLOW_LIMITS}.
 */

import type { NodeShape } from '../types.js';

/** Limits on what one diagram may declare; the rest is ignored with a warning. */
export const FLOW_LIMITS = { nodes: 400, edges: 800, depth: 30, line: 2000 } as const;

/** A node as declared in the source, before it is written out. */
export interface SourceNode {
  /** Generated id, safe to write into flowchart text. */
  id: string;
  label: string;
  shape: NodeShape;
  /** `classDef` class names from `:::name`. */
  classes: string[];
}

interface SourceContainer {
  id: string;
  title: string;
  nodes: string[];
  subs: SourceContainer[];
  parent?: SourceContainer;
}

interface SourceEdge {
  from: string;
  to: string;
  op: string;
  label?: string;
}

/** Flowchart operator to write for one source operator, and whether its endpoints are swapped. */
export interface EdgeOperator {
  /** Operator text as written in flowchart text, without a label. */
  op: string;
  /** The arrow points at the source's left-hand side: write the edge the other way round. */
  swap: boolean;
  /** An arrowhead the flowchart has no equivalent for was reduced to a plain arrow. */
  reduced: boolean;
}

/**
 * Join the lines of a quoted label that spans several (`Name("`Line one` / `line two`")`): a line with
 * an odd number of `"` or backticks continues on the next, up to 20 lines.
 */
export function joinQuotedLines(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] as string;
    let extra = 0;
    const unbalanced = (text: string): boolean => (text.match(/"/g)?.length ?? 0) % 2 === 1 || (text.match(/`/g)?.length ?? 0) % 2 === 1;
    while (unbalanced(line) && i + 1 < lines.length && extra < 20) {
      line += `
${lines[++i] as string}`;
      extra++;
    }
    out.push(line);
  }
  return out;
}

/** Apply `replace` to the parts of `line` that are outside `"…"` and `` `…` `` quotes. */
export function outsideQuotes(line: string, replace: (part: string) => string): string {
  return line
    .split(/("[^"]*"|`[^`]*`)/)
    .map((part, i) => (i % 2 === 1 ? part : replace(part)))
    .join('');
}

/** `"…"` / `` `…` `` quotes kept whole, everything else split on whitespace. */
export function tokenize(line: string): string[] {
  return line.match(/"[^"]*"|`[^`]*`|\S+/g) ?? [];
}

const OPERATOR = /^(<|o|x)?(-{2,}|={2,}|-\.+-?|\.\.+)(\|>|>|o|x)?$/;

/** Whether `token` is an edge operator (`-->`, `-.->`, `..>`, `--x`, `o--`, `--|>`, `==>`...). */
export function isOperator(token: string): boolean {
  return OPERATOR.test(token);
}

/** The bare `--` that opens a labelled edge (`a -- text --> b`). */
export const isLabelOpener = (token: string): boolean => token === '--' || token === '-.' || token === '==';

/** Map a source operator (see {@link isOperator}) to its flowchart equivalent. */
export function mapOperator(token: string): EdgeOperator | undefined {
  const m = OPERATOR.exec(token);
  if (!m) return undefined;
  const left = m[1] ?? '';
  const body = m[2] as string;
  let right = m[3] ?? '';
  let reduced = false;
  if (right === '|>') {
    right = '>';
    reduced = true;
  }
  const dotted = body.includes('.');
  const thick = body.startsWith('=');
  const line = dotted ? '-.-' : thick ? '===' : '---';
  const arrow = dotted ? '-.->' : thick ? '==>' : '-->';
  if (left === '' && right === '') return { op: line, swap: false, reduced };
  if (left === '' && right === '>') return { op: arrow, swap: false, reduced };
  if (left === '' && (right === 'o' || right === 'x')) return { op: `--${right}`, swap: false, reduced };
  if (right === '' && left === '<') return { op: arrow, swap: true, reduced };
  if (right === '' && (left === 'o' || left === 'x')) return { op: `--${left}`, swap: true, reduced };
  if (left === '<' && right === '>') return { op: dotted || thick ? arrow : '<-->', swap: false, reduced };
  if (left === right && (left === 'o' || left === 'x')) return { op: `${left}--${left}`, swap: false, reduced };
  return { op: right === '>' ? arrow : line, swap: false, reduced: true };
}

/** `"text"` or `` `text` `` unwrapped to `text` (a markdown string keeps its backticks, see {@link quoteLabel}). */
export function unquote(text: string): string {
  const t = text.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

/** `text` as a flowchart label: double-quoted, `"` as `#quot;`. */
export function quoteLabel(text: string): string {
  return `"${text.replace(/"/g, '#quot;')}"`;
}

/** Collects a diagram and writes it out as flowchart text. */
export class FlowSourceBuilder {
  readonly nodes = new Map<string, SourceNode>();
  private readonly edges: SourceEdge[] = [];
  private readonly roots: SourceContainer[] = [];
  private readonly containerByName = new Map<string, SourceContainer>();
  private readonly nodeContainer = new Map<string, SourceContainer>();
  private current: SourceContainer | undefined;
  private containerCount = 0;
  /** `classDef` / `style` lines to write after the graph, already rewritten to generated ids. */
  readonly styleLines: string[] = [];
  readonly warnings: string[] = [];
  private readonly warned = new Set<string>();
  direction = 'TB';

  /** Add a warning once per `key`. */
  warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warnings.push(message);
  }

  /** Whether a node called `name` was declared. */
  has(name: string): boolean {
    return this.nodes.has(name);
  }

  /** Declare (or update) a node; goes into the open container when new. Returns it, or undefined over the cap. */
  node(name: string, label: string, shape: NodeShape, classes: string[] = []): SourceNode | undefined {
    const existing = this.nodes.get(name);
    if (existing) {
      existing.label = label;
      existing.shape = shape;
      existing.classes.push(...classes);
      return existing;
    }
    if (this.nodes.size >= FLOW_LIMITS.nodes) {
      this.warnOnce('nodes', `Diagram limited to ${FLOW_LIMITS.nodes} nodes; the rest were ignored.`);
      return undefined;
    }
    const created: SourceNode = { id: `n${this.nodes.size}`, label, shape, classes: [...classes] };
    this.nodes.set(name, created);
    if (this.current) {
      this.current.nodes.push(name);
      this.nodeContainer.set(name, this.current);
    }
    return created;
  }

  /** Open a container (a `flow`, a `systemBoundary`); `false` when nested too deep. */
  open(name: string, title: string): boolean {
    let depth = 0;
    for (let c = this.current; c; c = c.parent) depth++;
    if (depth >= FLOW_LIMITS.depth) {
      this.warnOnce('depth', `Containers nested deeper than ${FLOW_LIMITS.depth} levels were ignored.`);
      return false;
    }
    const container: SourceContainer = { id: `s${this.containerCount++}`, title, nodes: [], subs: [], ...(this.current ? { parent: this.current } : {}) };
    (this.current ? this.current.subs : this.roots).push(container);
    this.containerByName.set(name, container);
    this.current = container;
    return true;
  }

  /** Close the innermost open container; `false` when none is open. */
  close(): boolean {
    if (!this.current) return false;
    this.current = this.current.parent;
    return true;
  }

  /** Whether a container is open. */
  get inContainer(): boolean {
    return this.current !== undefined;
  }

  /** Whether `name` is a container's name. */
  isContainer(name: string): boolean {
    return this.containerByName.has(name);
  }

  /** Connect two names (nodes or containers; a container stands for its first / last node). */
  edge(from: string, to: string, op: string, label?: string): void {
    if (this.edges.length >= FLOW_LIMITS.edges) {
      this.warnOnce('edges', `Diagram limited to ${FLOW_LIMITS.edges} arrows; the rest were ignored.`);
      return;
    }
    this.edges.push({ from, to, op, ...(label !== undefined && label !== '' ? { label } : {}) });
  }

  /** Generated id of node `name`, for `class` / `style` lines. */
  idOf(name: string): string | undefined {
    return this.nodes.get(name)?.id;
  }

  /** All node names of a container, depth first, in declaration order. */
  private members(c: SourceContainer): string[] {
    return [...c.nodes, ...c.subs.flatMap((s) => this.members(s))];
  }

  /** Node ids an edge endpoint stands for: the node itself, or a container's first / last node. */
  private endpoint(name: string, end: 'first' | 'last'): string | undefined {
    const direct = this.nodes.get(name);
    if (direct) return direct.id;
    const container = this.containerByName.get(name);
    if (!container) return undefined;
    const names = this.members(container);
    const pick = end === 'first' ? names[0] : names[names.length - 1];
    return pick === undefined ? undefined : this.nodes.get(pick)?.id;
  }

  /** Flowchart text for everything collected. */
  toSource(): string {
    const lines: string[] = [`flowchart ${this.direction}`];
    const classOf = (n: SourceNode): string => (n.classes.length > 0 ? `:::${n.classes[n.classes.length - 1]}` : '');
    const writeNode = (name: string): void => {
      const n = this.nodes.get(name);
      if (n) lines.push(`${n.id}@{ shape: ${shapeKeyword(n.shape)}, label: ${quoteLabel(n.label)} }${classOf(n)}`);
    };
    const writeContainer = (c: SourceContainer): void => {
      lines.push(`subgraph ${c.id}[${quoteLabel(c.title)}]`);
      c.nodes.forEach(writeNode);
      c.subs.forEach(writeContainer);
      lines.push('end');
    };
    const rootNodes = [...this.nodes.keys()].filter((name) => !this.nodeContainer.has(name));
    rootNodes.forEach(writeNode);
    this.roots.forEach(writeContainer);
    for (const e of this.edges) {
      const from = this.endpoint(e.from, 'last');
      const to = this.endpoint(e.to, 'first');
      if (from === undefined || to === undefined) {
        this.warnOnce('emptyEdge', 'An arrow to or from an empty container was ignored.');
        continue;
      }
      lines.push(e.label === undefined ? `${from} ${e.op} ${to}` : `${from} ${e.op}|${quoteLabel(e.label)}| ${to}`);
    }
    lines.push(...this.styleLines);
    return lines.join('\n');
  }
}

/** `@{ shape: … }` keyword of the flowchart parser for a node shape. */
function shapeKeyword(shape: NodeShape): string {
  switch (shape) {
    case 'rect': return 'rect';
    case 'roundRect': return 'rounded';
    case 'stadium': return 'stadium';
    case 'diamond': return 'diamond';
    case 'ellipse': return 'circle';
    case 'hexagon': return 'hexagon';
    case 'parallelogram': return 'lean-r';
    case 'parallelogramAlt': return 'lean-l';
    case 'subroutine': return 'subroutine';
    case 'document': return 'doc';
    case 'cylinder': return 'cylinder';
    case 'card': return 'card';
    default: return 'rect';
  }
}
