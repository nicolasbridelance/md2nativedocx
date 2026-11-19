/**
 * Parser for Mermaid `agentflow-beta` (a flow of AI agents: steps, tools, decisions, grouped by agent),
 * into the flowchart AST (`../../types.ts`) through flowchart text (see `../flowchart-source.ts`), so
 * layout, drawing, SmartArt and the `.odt`/`.pptx` outputs are the flowchart's own.
 *
 * - `flow id["Title"]` ... `end` is a subgraph (they nest); `global` ... `end` holds shared nodes, drawn at
 *   the top level; `connector id["Label"]` is a hexagon;
 * - `id["Label"]@{ shape: task|tool|decision|input|refdoc|action|... }` is a node, with the matching shape;
 * - `a --> b --> c`, `a -- yes --> b`, `a -.- b`, `a --x b` are arrows; an arrow to or from a `flow` is drawn
 *   to its first / from its last node;
 * - `id@{ ... }` on a line of its own (instructions, view, protocol, endpoint...) is not drawn.
 * Lenient like the other parsers: a line it does not understand is a warning, never a throw.
 */

import type { Flowchart, NodeShape } from '../../types.js';
import { buildFlowchart, FLOW_LIMITS, FlowSourceBuilder, isLabelOpener, isOperator, joinQuotedLines, mapOperator, tokenize, unquote } from '../flowchart-source.js';

export interface AgentflowParseResult {
  ast: Flowchart;
  warnings: string[];
}

/** Agentflow `shape:` names to flowchart shapes. Unknown names stay plain rectangles. */
const SHAPES: ReadonlyMap<string, NodeShape> = new Map([
  ['task', 'roundRect'],
  ['tool', 'subroutine'],
  ['decision', 'diamond'],
  ['input', 'parallelogram'],
  ['output', 'parallelogramAlt'],
  ['refdoc', 'document'],
  ['action', 'stadium'],
  ['connector', 'hexagon'],
  ['agent', 'roundRect'],
  ['memory', 'cylinder'],
  ['database', 'cylinder'],
]);

const ID = String.raw`[\p{L}_][\p{L}\p{N}_]*`;
const NODE = new RegExp(String.raw`^(${ID})\s*(?:\[\s*("(?:[^"]*)"|[^\]]*)\s*\])?\s*(?:@\{(.*)\})?\s*(?::::?(${ID}))?$`, 'u');
const FLOW = new RegExp(String.raw`^flow\s+(${ID})\s*(?:\[\s*("(?:[^"]*)"|[^\]]*)\s*\])?$`, 'u');
const CONNECTOR = new RegExp(String.raw`^connector\s+(${ID})\s*(?:\[\s*("(?:[^"]*)"|[^\]]*)\s*\])?$`, 'u');
const PROPS_ONLY = new RegExp(String.raw`^(${ID})\s*@\{.*\}$`, 'u');

/** The value of `key:` in the body of an `@{ ... }` property bag, unquoted. */
function prop(bag: string, key: string): string | undefined {
  const m = new RegExp(String.raw`(?:^|,)\s*${key}\s*:\s*("(?:[^"]*)"|[^,]*)`).exec(bag);
  return m ? unquote((m[1] as string).trim()) : undefined;
}

/** Parse `agentflow-beta` text into the flowchart AST. Never throws on malformed input. */
export function parseAgentflow(source: string): AgentflowParseResult {
  const b = new FlowSourceBuilder();
  const bodyLines = joinQuotedLines(source.split(/\r?\n/));
  let sawHeader = false;
  /** Open blocks, innermost last: whether each one is a drawn container (`flow`) or not (`global`). */
  const blocks: boolean[] = [];

  /** A node declared by name, label and `@{ ... }` property bag. */
  const declare = (name: string, label: string | undefined, bag: string | undefined): void => {
    const kind = bag === undefined ? undefined : prop(bag, 'shape')?.toLowerCase();
    if (kind !== undefined && !SHAPES.has(kind)) b.warnOnce(`shape:${kind}`, `Node shape \`${kind}\` is drawn as a plain rectangle.`);
    b.node(name, label === undefined ? name : unquote(label), (kind !== undefined ? SHAPES.get(kind) : undefined) ?? 'rect');
  };

  for (const raw of bodyLines) {
    const line = raw.trim().slice(0, FLOW_LIMITS.line);
    if (line === '' || line.startsWith('%%')) continue;
    if (!sawHeader) {
      sawHeader = true;
      const header = /^agentflow(?:-beta)?\s*(TB|TD|BT|LR|RL)?\b/i.exec(line);
      if (header) {
        b.direction = (header[1] ?? 'TB').toUpperCase();
        continue;
      }
    }
    let m: RegExpExecArray | null;
    if (/^end$/i.test(line)) {
      const drawn = blocks.pop();
      if (drawn === undefined) b.warnings.push('`end` without an open `flow` ignored.');
      else if (drawn) b.close();
    } else if (/^global$/i.test(line)) {
      // Shared nodes: no frame, they sit at the top level.
      blocks.push(false);
    } else if ((m = FLOW.exec(line))) {
      const name = m[1] as string;
      const title = m[2] === undefined ? name : unquote(m[2]);
      blocks.push(b.open(name, title === '' ? name : title));
    } else if ((m = CONNECTOR.exec(line))) {
      const name = m[1] as string;
      b.node(name, m[2] === undefined ? name : unquote(m[2]), 'hexagon');
    } else if (/^direction\s/i.test(line)) {
      const d = /^direction\s+(TB|TD|BT|LR|RL)\b/i.exec(line);
      if (d) b.direction = (d[1] as string).toUpperCase();
    } else if (/^(?:classDef|class|style|linkStyle|click)\b/i.test(line)) {
      b.warnOnce('style', 'Styling and links (`classDef`, `style`, `click`...) are not applied to agent flows.');
    } else if (PROPS_ONLY.test(line)) {
      b.warnOnce('props', 'Properties set with `id@{ ... }` on a line of their own (instruction, view, protocol...) are not drawn.');
    } else if (readEdges(line, b, declare)) {
      // Drawn as arrows.
    } else if ((m = NODE.exec(line))) {
      declare(m[1] as string, m[2], m[3]);
    } else {
      b.warnings.push(`Unsupported line ignored: ${line}`);
    }
  }
  if (blocks.length > 0) b.warnings.push('One or more `flow` blocks were never closed with `end`.');
  return buildFlowchart(b);
}

/** Read `a --> b -- text --> c ...`; false (nothing consumed) when `line` is not an arrow chain. */
function readEdges(line: string, b: FlowSourceBuilder, declare: (name: string, label: string | undefined, bag: string | undefined) => void): boolean {
  if (!/--|==|-\./.test(line)) return false;
  // Nodes declared inside the chain (`a["A"] --> b["B"]@{ shape: tool }`) are declared, then named.
  const inline = new RegExp(String.raw`(${ID})\s*\[\s*("[^"]*"|[^\]]*?)\s*\](?:@\{([^}]*)\})?`, 'gu');
  const tokens = tokenize(line.replace(inline, (_, name: string, label: string, bag?: string) => (declare(name, label, bag), name)));
  if (tokens.length < 3 || !tokens.some(isOperator)) return false;
  const names = new RegExp(`^${ID}$`, 'u');
  const steps: Array<{ from: string; to: string; op: string; swap: boolean; label?: string; hollow?: 'generalization' | 'realization' }> = [];
  let i = 0;
  let from = tokens[i++] as string;
  if (!names.test(from)) return false;
  while (i < tokens.length) {
    let opToken = tokens[i++] as string;
    let label: string | undefined;
    if (isLabelOpener(opToken) && tokens.slice(i + 1).some(isOperator)) {
      // `-- text -->`: the text runs to the closing operator.
      const words: string[] = [];
      while (i < tokens.length && !isOperator(tokens[i] as string)) words.push(tokens[i++] as string);
      label = unquote(words.join(' '));
      opToken = tokens[i++] as string;
    }
    const mapped = mapOperator(opToken);
    const to = tokens[i++];
    if (!mapped || to === undefined || !names.test(to)) return false;
    steps.push({ from, to, op: mapped.op, swap: mapped.swap, ...(mapped.hollow ? { hollow: mapped.hollow } : {}), ...(label !== undefined ? { label } : {}) });
    from = to;
  }
  for (const s of steps) {
    for (const name of [s.from, s.to]) if (!b.has(name) && !b.isContainer(name)) b.node(name, name, 'rect');
    if (s.swap) b.edge(s.to, s.from, s.op, s.label, s.hollow);
    else b.edge(s.from, s.to, s.op, s.label, s.hollow);
  }
  return true;
}
