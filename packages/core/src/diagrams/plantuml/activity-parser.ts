/**
 * Parser for PlantUML activity diagrams (the current syntax: `start`, `:action;`, `if`/`while`/`repeat`/
 * `fork`...), into the flowchart AST (`../../types.ts`), so layout, drawing and SmartArt (a straight sequence
 * of actions becomes a SmartArt process) are the flowchart's own. Line-oriented and forgiving like the other
 * parsers: an unrecognized line is a warning, never a throw.
 *
 * The control structures are turned into a graph as they are read. The parser keeps the "open ends" of the
 * flow (the nodes the next element connects from, each with an optional edge label):
 * - `:text;` (multi-line until `;`, or an SDL ending `|` `<` `>` `/` `]` `}`) is a node; `start` and `stop`
 *   are small black discs, `end` a crossed circle; `kill` / `detach` end the flow; `(A)` is a connector circle;
 * - `if (c) then (yes)` / `elseif` / `else` / `endif`, and `switch` / `case` / `endswitch`, make a diamond
 *   whose branches all continue to whatever follows; `is (x)` / `equals (x)` and `(no) elseif` labels kept;
 * - `while (c) is (x)` ... `endwhile (y)` and `repeat` ... `repeat while (c) is (x) not (y)` loop back to the
 *   diamond or the repeat start (`backward:` adds an action on the way back); `break` leaves the loop;
 * - `fork` / `fork again` / `end fork` (and `split`, `end merge`) run their branches side by side (the
 *   synchronisation bars are not drawn);
 * - `-> label;` labels the next arrow, `-[hidden]->` makes it invisible; `label` / `goto` jump;
 * - `partition` / `group` / `package` / `rectangle` / `card` `X { ... }` and swimlanes `|Lane|` become
 *   subgraphs.
 * Ignored with a warning: notes, `title` / `skinparam` / `<style>` / `!pragma`..., colours; `!include` is
 * never followed (it would read a file or a URL). Creole `**bold**` and `//italic//` are kept, other markup
 * is reduced to its text; `[[link label]]` keeps only the label (no link is ever emitted).
 * Capped (hostile input): 400 nodes, 800 edges, 30 nested blocks, 60 lines per action.
 */

import type { EdgeType, FlowEdge, FlowNode, Flowchart, LabelRun, LabelToken, NodeShape, Subgraph } from '../../types.js';

export interface PlantUmlActivityParseResult {
  ast: Flowchart;
  warnings: string[];
}

const MAX_NODES = 400;
const MAX_EDGES = 800;
const MAX_DEPTH = 30;
const MAX_ACTION_LINES = 60;
const MAX_LINE = 2000;

/** An open end of the flow: the node the next element connects from, and the label of that arrow. */
interface Tail {
  id: string;
  label?: string;
}

/** An open control structure. */
type Block =
  | { kind: 'if'; diamond: string; pending: Tail[]; ends: Tail[]; hasElse: boolean; elseLabel?: string }
  | { kind: 'switch'; diamond: string; ends: Tail[]; started: boolean }
  | { kind: 'while'; diamond: string; breaks: Tail[]; backward?: string }
  | { kind: 'repeat'; start?: string; startTails: Tail[]; breaks: Tail[]; backward?: string }
  | { kind: 'fork'; origin: Tail[]; ends: Tail[] }
  | { kind: 'group'; subgraph?: string };

/** SDL / UML stereotypes and endings of an action, to a flowchart shape. */
const STEREOTYPE_SHAPES: ReadonlyMap<string, NodeShape> = new Map([
  ['input', 'parallelogram'],
  ['output', 'parallelogramAlt'],
  ['procedure', 'subroutine'],
  ['load', 'trapezoid'],
  ['save', 'trapezoidAlt'],
  ['continuous', 'stadium'],
  ['task', 'rect'],
  ['object', 'rect'],
  ['objectsignal', 'asymmetric'],
  ['acceptevent', 'asymmetric'],
  ['sendsignal', 'asymmetric'],
  ['trigger', 'rect'],
  ['timeevent', 'hourglass'],
]);
const ENDING_SHAPES: ReadonlyMap<string, NodeShape> = new Map([
  ['|', 'subroutine'],
  ['<', 'asymmetric'],
  ['>', 'asymmetric'],
  ['/', 'parallelogram'],
  [']', 'rect'],
  ['}', 'rect'],
]);

/**
 * Whether `line` closes an action: `;`, or an SDL ending `|` `<` `>` `/` `]` `}` that is not doubled (`//italic//`,
 * `>>`, `]]` are markup, not endings), optionally followed by a `<<stereotype>>`.
 */
function endsAction(line: string): boolean {
  const body = line.replace(/\s*<<[^>]*>>\s*$/, '').trimEnd();
  const last = body.charAt(body.length - 1);
  if (last === ';') return true;
  if (!'|<>/]}'.includes(last) || last === '') return false;
  if (body.charAt(body.length - 2) === last) return false;
  // A `>`, `]` or `}` that closes a `<tag>`, `[...]` or `{...}` opened on the same line is markup too.
  const opener = ({ '>': '<', ']': '[', '}': '{' } as Record<string, string>)[last];
  return opener === undefined || !body.slice(0, -1).includes(opener);
}

/** Creole text to label runs: lines, `**bold**`, `//italic//`; other markup reduced to its text. */
export function creoleRuns(raw: string): { text: string; runs: LabelToken[] } {
  const lines = raw
    .replace(/\\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .split('\n')
    .map((l) =>
      l
        .replace(/\\t/g, ' ')
        .replace(/\[\[([^\]]*)\]\]/g, (_, inner: string) => (inner.includes(' ') ? inner.slice(inner.indexOf(' ') + 1) : inner)) // [[url label]] -> label; never a link
        .replace(/<img:[^>]*>/gi, '') // an image reference (a file or a URL) is never fetched or kept
        .replace(/<&[\w-]+>/g, '')
        .replace(/<U\+([0-9A-F]{4,6})>/gi, (_, hex: string) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)))
        .replace(/<\/?(?:b|i|u|s|color|size|font|back|strike|w|plain)\b[^>]*>/gi, '')
        .replace(/""|__|~~|\^\^/g, '')
        .replace(/--([^-\s][^-]*?)--/g, '$1') // --stricken--
        .trim(),
    )
    .filter((l, i, all) => l !== '' || (i > 0 && i < all.length - 1));
  const runs: LabelToken[] = [];
  lines.forEach((line, i) => {
    if (i > 0) runs.push({ break: true });
    // Separator lines in a note-like action (`----`, `====`) carry no text.
    if (/^(?:-{3,}|={3,}|\.{3,})$/.test(line)) return;
    for (const part of line.split(/(\*\*[^*]+\*\*|\/\/[^/]+\/\/)/)) {
      if (part === '') continue;
      const run: LabelRun = part.startsWith('**') && part.endsWith('**') && part.length > 4
        ? { text: part.slice(2, -2), bold: true }
        : part.startsWith('//') && part.endsWith('//') && part.length > 4
          ? { text: part.slice(2, -2), italic: true }
          : { text: part };
      runs.push(run);
    }
  });
  const text = runs.map((r) => ('break' in r ? ' ' : r.text)).join('').replace(/\s+/g, ' ').trim();
  return { text, runs };
}

/** Parse PlantUML activity-diagram text into the flowchart AST. Never throws on malformed input. */
export function parsePlantUmlActivity(source: string): PlantUmlActivityParseResult {
  const warnings: string[] = [];
  const warned = new Set<string>();
  const warnOnce = (key: string, message: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push(message);
  };
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const subgraphs: Subgraph[] = [];
  let counter = 0;

  /** The subgraph new nodes go into: the innermost open group, else the current swimlane. */
  const groupStack: string[] = [];
  let lane: string | undefined;
  const lanes = new Map<string, string>();
  const subgraphById = new Map<string, Subgraph>();
  const newSubgraph = (title: string, parent?: string): string => {
    const id = `__sg_${subgraphs.length}`;
    const sg: Subgraph = { id, title, nodeIds: [], subgraphIds: [] };
    subgraphs.push(sg);
    subgraphById.set(id, sg);
    if (parent) subgraphById.get(parent)?.subgraphIds.push(id);
    return id;
  };
  const container = (): string | undefined => groupStack[groupStack.length - 1] ?? lane;

  const addNode = (label: string, shape: NodeShape, runs?: LabelToken[]): string | undefined => {
    if (nodes.length >= MAX_NODES) {
      warnOnce('nodes', `Activity diagram limited to ${MAX_NODES} elements; the rest were ignored.`);
      return undefined;
    }
    const id = `__a${counter++}`;
    nodes.push({ id, label, labelRuns: runs ?? (label === '' ? [] : [{ text: label }]), shape });
    const sg = container();
    if (sg) subgraphById.get(sg)?.nodeIds.push(id);
    return id;
  };
  const addEdge = (from: string, to: string, label?: string, type: EdgeType = 'arrow'): void => {
    if (edges.length >= MAX_EDGES) return warnOnce('edges', `Activity diagram limited to ${MAX_EDGES} arrows; the rest were ignored.`);
    const clean = label ? creoleRuns(label) : undefined;
    edges.push(
      clean && clean.text !== ''
        ? { from, to, type, label: clean.text, labelRuns: clean.runs }
        : { from, to, type, label: null, labelRuns: null },
    );
  };

  let tails: Tail[] = [];
  /** Label and style for the next arrow out of the current tails (`-> label;`, `-[hidden]->`). */
  let nextLabel: string | undefined;
  let nextHidden = false;
  const blocks: Block[] = [];
  const labels = new Map<string, string>();
  let pendingLabels: string[] = [];
  const gotos: Array<{ from: Tail[]; target: string }> = [];

  /** Connect the open ends to a new node, which becomes the only open end. */
  const connect = (id: string | undefined): void => {
    if (id === undefined) return;
    for (const t of tails) addEdge(t.id, id, nextLabel ?? t.label, nextHidden ? 'invisible' : 'arrow');
    tails = [{ id }];
    nextLabel = undefined;
    nextHidden = false;
    for (const name of pendingLabels) labels.set(name, id);
    pendingLabels = [];
    // The first node of a repeat body is where `repeat while` loops back to.
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (b?.kind === 'repeat' && b.start === undefined) b.start = id;
      else break;
    }
  };
  const step = (label: string, shape: NodeShape, runs?: LabelToken[]): void => connect(addNode(label, shape, runs));
  /** A start or stop point: a small black disc. */
  const marker = (): void => {
    const id = addNode('', 'ellipse');
    const node = nodes.find((n) => n.id === id);
    if (node) {
      node.fill = '000000';
      node.stroke = '000000';
    }
    connect(id);
  };
  /** Tails carry their own label (a branch's `then (yes)`); `nextLabel` overrides it for the next arrow. */
  const labelled = (list: Tail[], label: string | undefined): Tail[] => list.map((t) => (label ? { id: t.id, label } : t));
  const open = (block: Block): boolean => {
    if (blocks.length >= MAX_DEPTH) {
      warnOnce('depth', `Activity blocks nested deeper than ${MAX_DEPTH} levels were ignored.`);
      return false;
    }
    blocks.push(block);
    return true;
  };
  const top = (kind: Block['kind']): Block | undefined => {
    for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i]?.kind === kind) return blocks[i];
    return undefined;
  };
  const closeTo = (kind: Block['kind']): Block | undefined => {
    const b = blocks[blocks.length - 1];
    if (b?.kind === kind) return blocks.pop();
    warnings.push(`\`end\` of a ${kind} without a matching opening ignored.`);
    return undefined;
  };
  const diamond = (text: string): string | undefined => {
    const { text: plain, runs } = creoleRuns(text);
    const id = addNode(plain, 'diamond', runs);
    connect(id);
    return id;
  };

  /** An action being read over several lines, up to its closing `;` (or SDL ending). */
  let action: { lines: string[]; color?: boolean } | undefined;
  /** A multi-line arrow label (`-> text` ... `;`). */
  let arrowText: string[] | undefined;
  let multi: RegExp | undefined;
  let inBlockComment = false;

  const finishAction = (body: string): void => {
    let text = body;
    let shape: NodeShape = 'roundRect';
    const stereo = /<<\s*([#\w]+)\s*>>\s*$/.exec(text);
    if (stereo) {
      const word = (stereo[1] as string).toLowerCase();
      if (!word.startsWith('#')) {
        const mapped = STEREOTYPE_SHAPES.get(word);
        if (mapped) shape = mapped;
        else warnOnce('stereo', `Action stereotypes like \`<<${stereo[1]}>>\` are drawn as plain actions.`);
      }
      text = text.slice(0, stereo.index).trim();
    }
    const ending = text.charAt(text.length - 1);
    if (ending === ';') {
      text = text.slice(0, -1);
    } else if (ENDING_SHAPES.has(ending) && endsAction(text)) {
      // An SDL ending picks the shape, unless a stereotype already did.
      if (shape === 'roundRect') shape = ENDING_SHAPES.get(ending) as NodeShape;
      text = text.slice(0, -1);
    }
    const { text: plain, runs } = creoleRuns(text);
    step(plain, shape, runs);
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim().slice(0, MAX_LINE);
    if (inBlockComment) {
      if (line.includes("'/")) inBlockComment = false;
      continue;
    }
    if (multi) {
      if (multi.test(line)) multi = undefined;
      continue;
    }
    if (action) {
      // Inside a multi-line action: the text runs to a line ending with `;` (or an SDL ending + stereotype).
      if (action.lines.length < MAX_ACTION_LINES) action.lines.push(rawLine.replace(/^\s+/, ''));
      if (endsAction(line)) {
        finishAction(action.lines.join('\n').trim());
        action = undefined;
      }
      continue;
    }
    if (arrowText) {
      arrowText.push(line);
      if (line.endsWith(';')) {
        nextLabel = arrowText.join('\n').replace(/;$/, '');
        arrowText = undefined;
      }
      continue;
    }
    if (line.length === 0 || line.startsWith("'")) continue;
    if (line.startsWith("/'")) {
      if (!line.includes("'/", 2)) inBlockComment = true;
      continue;
    }

    let m: RegExpMatchArray | null;
    const ctl = controlTokens(line);
    const words = ctl?.filter((t): t is { w: string } => 'w' in t).map((t) => t.w).join(' ') ?? '';
    if (/^@(start|end)uml\b/i.test(line)) {
      continue;
    } else if (actionBody(line) !== undefined) {
      // An action, possibly coloured (`#pink:text;`), on one line or several; `#blue:(B)` is a connector.
      if (line.startsWith('#')) warnOnce('color', 'Colours on actions and swimlanes are ignored.');
      const body = actionBody(line) as string;
      if (/^\([^()]*\)$/.test(body.trim())) step(body.trim().slice(1, -1), 'ellipse');
      else if (endsAction(body)) finishAction(body.trim());
      else action = { lines: [body] };
    } else if (arrowOf(line) !== undefined) {
      // An arrow: its label (possibly multi-line, up to `;`) goes on the next connection.
      const { style, text } = arrowOf(line) as { style: string; text: string };
      if (/hidden/i.test(style)) nextHidden = true;
      else if (style !== '') warnOnce('arrowstyle', 'Arrow colours and styles (`-[#red,dashed]->`) are ignored.');
      if (text === '' || text === ';') continue;
      if (text.endsWith(';')) nextLabel = text.slice(0, -1);
      else arrowText = [text];
    } else if (/^start$/i.test(line)) {
      // UML: a filled dot to start, the same dot ringed to stop. Drawn as filled circles (no ringed preset).
      marker();
    } else if (/^stop$/i.test(line)) {
      marker();
      tails = [];
    } else if (/^end$/i.test(line)) {
      step('', 'crossedCircle');
      tails = [];
    } else if (/^(?:kill|detach)$/i.test(line)) {
      tails = [];
    } else if (/^\([^()]*\)$/.test(line)) {
      // A connector: a small circle; the flow goes on from it.
      step(line.slice(1, -1), 'ellipse');
    } else if (ctl && /^(?:elseif|else if)$/.test(words.replace(/ then$/, '')) && parenCount(ctl) >= 1 && words.endsWith('then')) {
      const b = top('if');
      if (!b || b.kind !== 'if') {
        warnings.push(`\`elseif\` outside an \`if\` ignored: ${line}`);
        continue;
      }
      b.ends.push(...tails);
      // `(no) elseif (cond) then (yes)`: the leading label is the previous diamond's "no" side.
      const lead = 'p' in (ctl[0] as Tok) ? (ctl[0] as { p: string }).p : undefined;
      const parens = ctl.filter((t): t is { p: string } => 'p' in t).map((t) => t.p);
      const cond = lead !== undefined ? parens[1] : parens[0];
      const yes = lead !== undefined ? parens[2] : parens[1];
      if (cond === undefined) continue;
      tails = b.pending.map((t) => ({ id: t.id, ...(lead ? { label: lead } : {}) }));
      const d = diamond(cond);
      if (!d) continue;
      b.diamond = d;
      tails = [{ id: d, ...(yes ? { label: yes } : {}) }];
      b.pending = [{ id: d }];
    } else if (ctl && /^if( is| equals)? then$/.test(words) && 'w' in (ctl[0] as Tok)) {
      const parens = ctl.filter((t): t is { p: string } => 'p' in t).map((t) => t.p);
      const d = diamond(parens[0] ?? '');
      if (!d) continue;
      // `then (yes)` labels the "yes" side; without it, `is (x)` / `equals (x)` does.
      const yes = words === 'if then' ? parens[1] : (parens[2] ?? parens[1]);
      if (!open({ kind: 'if', diamond: d, pending: [{ id: d }], ends: [], hasElse: false })) continue;
      tails = [{ id: d, ...(yes ? { label: yes } : {}) }];
    } else if (ctl && words === 'else' && 'w' in (ctl[0] as Tok)) {
      const b = top('if');
      if (!b || b.kind !== 'if') {
        warnings.push(`\`else\` outside an \`if\` ignored: ${line}`);
        continue;
      }
      b.ends.push(...tails);
      b.hasElse = true;
      tails = labelled(b.pending, ctl.find((t): t is { p: string } => 'p' in t)?.p);
    } else if (/^end\s?if$/i.test(line)) {
      const b = closeTo('if');
      if (!b || b.kind !== 'if') continue;
      tails = [...b.ends, ...tails, ...(b.hasElse ? [] : b.pending)];
    } else if (ctl && (words === 'switch' || words === 'case') && parenCount(ctl) === 1) {
      const text = (ctl.find((t): t is { p: string } => 'p' in t) as { p: string }).p;
      if (words === 'switch') {
        const d = diamond(text);
        if (!d) continue;
        if (!open({ kind: 'switch', diamond: d, ends: [], started: false })) continue;
        tails = [];
      } else {
        const b = top('switch');
        if (!b || b.kind !== 'switch') {
          warnings.push(`\`case\` outside a \`switch\` ignored: ${line}`);
          continue;
        }
        b.ends.push(...tails);
        tails = [{ id: b.diamond, label: text.trim() }];
      }
    } else if (/^end\s?switch$/i.test(line)) {
      const b = closeTo('switch');
      if (!b || b.kind !== 'switch') continue;
      tails = [...b.ends, ...tails];
    } else if (ctl && /^while( is)?$/.test(words)) {
      const parens = ctl.filter((t): t is { p: string } => 'p' in t).map((t) => t.p);
      const d = diamond(parens[0] ?? '');
      if (!d) continue;
      if (!open({ kind: 'while', diamond: d, breaks: [] })) continue;
      tails = [{ id: d, ...(parens[1] ? { label: parens[1] } : {}) }];
    } else if (ctl && (words === 'endwhile' || words === 'end while')) {
      const b = closeTo('while');
      if (!b || b.kind !== 'while') continue;
      // Back to the condition, through the `backward` action if there is one.
      let back: string | undefined;
      if (b.backward !== undefined) {
        const { text, runs } = creoleRuns(b.backward);
        back = addNode(text, 'roundRect', runs);
      }
      for (const t of tails) addEdge(t.id, back ?? b.diamond, nextLabel ?? t.label);
      if (back) addEdge(back, b.diamond);
      nextLabel = undefined;
      const no = ctl.find((t): t is { p: string } => 'p' in t)?.p;
      tails = [{ id: b.diamond, ...(no ? { label: no } : {}) }, ...b.breaks];
    } else if (ctl && /^(?:repeat while|repeatwhile)( is)?( not)?$/.test(words)) {
      const b = closeTo('repeat');
      if (!b || b.kind !== 'repeat') continue;
      const parens = ctl.filter((t): t is { p: string } => 'p' in t).map((t) => t.p);
      const d = diamond(parens[0] ?? '');
      if (!d) continue;
      // `is (x)` labels the way back, `not (y)` the way out; with only `not`, the second paren is the way out.
      const isLabel = / is/.test(words) ? parens[1] : undefined;
      const notLabel = / not/.test(words) ? parens[/ is/.test(words) ? 2 : 1] : undefined;
      // Back to the first element of the body, through the `backward` action if there is one.
      let from = d;
      let label = isLabel;
      if (b.backward !== undefined) {
        const { text, runs } = creoleRuns(b.backward);
        const back = addNode(text, 'roundRect', runs);
        if (back) {
          addEdge(d, back, label);
          from = back;
          label = undefined;
        }
      }
      if (b.start) addEdge(from, b.start, label);
      tails = [{ id: d, ...(notLabel ? { label: notLabel } : {}) }, ...b.breaks];
    } else if (/^repeat\b/i.test(line)) {
      if (!open({ kind: 'repeat', startTails: tails, breaks: [] })) continue;
      const rest = line.slice('repeat'.length).trim();
      if (rest.startsWith(':')) {
        const { text, runs } = creoleRuns(rest.slice(1).replace(/;$/, ''));
        step(text, 'roundRect', runs);
      }
    } else if (/^backward\s*:/i.test(line)) {
      const loop = [...blocks].reverse().find((b) => b.kind === 'repeat' || b.kind === 'while');
      const text = line.slice(line.indexOf(':') + 1).replace(/;$/, '');
      if (loop && (loop.kind === 'repeat' || loop.kind === 'while')) loop.backward = text;
      else warnings.push(`\`backward\` outside a loop ignored: ${line}`);
    } else if (/^break$/i.test(line)) {
      const loop = [...blocks].reverse().find((b) => b.kind === 'repeat' || b.kind === 'while');
      if (loop && (loop.kind === 'repeat' || loop.kind === 'while')) loop.breaks.push(...tails);
      else warnings.push('`break` outside a loop ignored.');
      tails = [];
    } else if (/^(?:fork|split)$/i.test(line)) {
      warnOnce('fork', 'Fork and split bars are not drawn; their branches are side by side.');
      if (!open({ kind: 'fork', origin: tails, ends: [] })) continue;
    } else if (/^(?:fork|split)\s+again$/i.test(line)) {
      const b = top('fork');
      if (!b || b.kind !== 'fork') {
        warnings.push(`\`${line}\` outside a fork ignored.`);
        continue;
      }
      b.ends.push(...tails);
      tails = b.origin;
    } else if (/^end\s?(?:fork|split|merge)\b/i.test(line)) {
      const b = closeTo('fork');
      if (!b || b.kind !== 'fork') continue;
      tails = [...b.ends, ...tails];
    } else if ((m = line.match(/^label\s+(\S+)$/i))) {
      pendingLabels.push(m[1] as string);
    } else if ((m = line.match(/^goto\s+(\S+)$/i))) {
      gotos.push({ from: tails, target: m[1] as string });
      tails = [];
    } else if (line.startsWith('|') && swimlaneOf(line) !== undefined) {
      // A swimlane: `|Lane|`, `|#color|Lane|`, `|id| Title`.
      const { name, title } = swimlaneOf(line) as { name: string; title: string };
      if (!lanes.has(name)) lanes.set(name, newSubgraph(creoleRuns(title).text));
      lane = lanes.get(name);
    } else if ((m = line.match(/^(partition|group|package|rectangle|card)\s/i)) && line.endsWith('{')) {
      const raw = line.slice((m[1] as string).length, -1).trim().replace(/^#\S+\s+/, '');
      const title = creoleRuns(unquote(raw)).text;
      if (open({ kind: 'group', subgraph: newSubgraph(title, container()) })) groupStack.push(subgraphs[subgraphs.length - 1]?.id as string);
    } else if (line === '}') {
      const b = blocks[blocks.length - 1];
      if (b?.kind === 'group') {
        blocks.pop();
        groupStack.pop();
      } else {
        warnings.push('`}` without an open group ignored.');
      }
    } else if (/^note\b/i.test(line) || /^floating\s+note\b/i.test(line)) {
      warnOnce('note', 'Notes are not drawn in activity diagrams.');
      if (!/(?<!:):(?!:)/.test(line)) multi = /^end\s*note$/i;
    } else if (/^!include/i.test(line)) {
      warnOnce('include', '`!include` is not followed (it would read a file or a URL); its content is missing.');
    } else if (/^!/.test(line)) {
      warnOnce('preprocessor', 'PlantUML preprocessor lines (`!pragma`, `!theme`, variables...) are ignored.');
    } else if (/^skinparam\b/i.test(line)) {
      warnOnce('skinparam', '`skinparam` styling is ignored; the diagram uses the default look.');
      if (line.endsWith('{')) multi = /^\}$/;
    } else if (/^<style>/i.test(line)) {
      warnOnce('style', '`<style>` blocks are ignored; the diagram uses the default look.');
      if (!/<\/style>\s*$/i.test(line)) multi = /^<\/style>$/i;
    } else if (/^(?:title|caption|header|footer|legend|scale|hide|show|left to right direction|top to bottom direction|link|mainframe)\b/i.test(line)) {
      warnOnce('display', 'Display commands (`title`, `header`, `scale`, ...) are ignored.');
      if (/^legend\b/i.test(line)) multi = /^end\s*legend$/i;
    } else if ((m = line.match(/^-(?![->\s])(.+)$/))) {
      // `-text` (no arrowhead): a label for the next arrow.
      nextLabel = (m[1] as string).replace(/<<[^>]*>>\s*$/, '').replace(/;$/, '');
    } else if ((m = line.match(/^(?:[-*]+)\s+(.+)$/))) {
      // List-style actions (`- Action`, `* Action`, `** Sub-action`).
      const { text, runs } = creoleRuns(m[1] as string);
      step(text, 'roundRect', runs);
    } else {
      warnings.push(`Unsupported line ignored: ${line}`);
    }
  }

  if (action) warnings.push('An action was never closed with `;`; its text was dropped.');
  if (multi) warnings.push('A multi-line block (`note`, `legend`, `<style>`) was never closed; the rest was ignored.');
  if (blocks.some((b) => b.kind !== 'group')) warnings.push('One or more blocks (`if`, `while`, `repeat`, `fork`...) were never closed.');
  for (const g of gotos) {
    const target = labels.get(g.target);
    if (target === undefined) {
      warnings.push(`\`goto ${g.target}\` has no matching \`label\`; ignored.`);
      continue;
    }
    for (const t of g.from) addEdge(t.id, target, t.label);
  }

  // Empty subgraphs (a swimlane or a partition with nothing in it) are dropped.
  const used = subgraphs.filter((sg) => sg.nodeIds.length > 0 || sg.subgraphIds.length > 0);
  const usedIds = new Set(used.map((sg) => sg.id));
  for (const sg of used) sg.subgraphIds = sg.subgraphIds.filter((id) => usedIds.has(id));
  return { ast: { direction: 'TD', nodes, edges, subgraphs: used }, warnings };
}

/** A control line's keywords and parenthesised parts, in order (`if (a) is (b) then (c)`); read in one pass. */
type Tok = { w: string } | { p: string };
function controlTokens(line: string): Tok[] | undefined {
  const out: Tok[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line.charAt(i);
    if (c === ' ' || c === '\t') {
      i++;
    } else if (c === '(') {
      let depth = 1;
      let j = i + 1;
      for (; j < line.length && depth > 0; j++) {
        if (line.charAt(j) === '(') depth++;
        else if (line.charAt(j) === ')') depth--;
      }
      if (depth !== 0) return undefined;
      out.push({ p: line.slice(i + 1, j - 1).trim() });
      i = j;
    } else if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < line.length && /[A-Za-z]/.test(line.charAt(j))) j++;
      out.push({ w: line.slice(i, j).toLowerCase() });
      i = j;
    } else if (c === ';' && i === line.length - 1) {
      i++;
    } else {
      return undefined;
    }
  }
  return out;
}
const parenCount = (toks: Tok[]): number => toks.filter((t) => 'p' in t).length;

/** The text of an action line (`:text...`, `#color:text...`), or undefined when `line` is not one. */
function actionBody(line: string): string | undefined {
  if (line.startsWith(':')) return line.slice(1);
  if (!line.startsWith('#')) return undefined;
  const colon = line.indexOf(':');
  if (colon < 2 || /\s/.test(line.slice(0, colon))) return undefined;
  return line.slice(colon + 1);
}

/** An arrow line `-> text`, `-[#red,dashed]-> text`, `--> text`: its style and text, or undefined. */
function arrowOf(line: string): { style: string; text: string } | undefined {
  let i = 0;
  while (line.charAt(i) === '-') i++;
  if (i === 0) return undefined;
  let style = '';
  if (line.charAt(i) === '[') {
    const close = line.indexOf(']', i);
    if (close === -1) return undefined;
    style = line.slice(i, close + 1);
    i = close + 1;
  }
  while (line.charAt(i) === '-') i++;
  if (line.charAt(i) !== '>') return undefined;
  return { style, text: line.slice(i + 1).trim() };
}

/** A swimlane line `|Lane|`, `|#color|Lane|`, `|id| Title`: its name and title, or undefined. */
function swimlaneOf(line: string): { name: string; title: string } | undefined {
  const parts = line.split('|');
  // parts[0] is empty (the line starts with `|`); a colour part comes first when present.
  let k = 1;
  if ((parts[k] ?? '').startsWith('#') && parts.length > 3) k++;
  const name = (parts[k] ?? '').trim();
  if (name === '' || parts.length < k + 2) return undefined;
  const title = parts.slice(k + 1).join('|').trim() || name;
  return { name, title };
}

const unquote = (s: string): string => s.trim().replace(/^"(.*)"$/, '$1');
