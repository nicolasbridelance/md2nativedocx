/**
 * Parser for Mermaid `usecase-beta` (UML use case diagram: actors, use cases, system boundaries,
 * associations, `include` / `extend`), into the flowchart AST (`../../types.ts`) through flowchart text
 * (see `../flowchart-source.ts`), so layout, drawing, SmartArt and the `.odt`/`.pptx` outputs are the
 * flowchart's own.
 *
 * - `actor Name`, `actor Name("Label")`, `actor Name@{ ... } <<Stereotype>>` is an actor, drawn as a
 *   stick figure; `Id`, `Id("Label")`, `Id[Label]`, `"Label"` is a use
 *   case, an ellipse, also created by an arrow that names it;
 * - `systemBoundary Name` / `systemBoundary id["Title"]` ... `end` is a frame around its use cases;
 * - `A --> B`, `A -- text --> B`, `A ..> : include B`, `A --|> B`, `A <-- B`, `A --o B`... are arrows; the
 *   text after `:` (`include`, `extend`) labels the dotted arrow; a hollow arrowhead is drawn as a plain one;
 * - `note for X "text"` is a note joined to X by a dotted line; `json Name@{ ... }` is a data card (its
 *   content is not drawn); `classDef`, `class` and `style` colours on nodes are applied.
 * Not drawn: icons, `business`/`type` actor looks, animations, `accTitle` / `accDescr`.
 * Lenient like the other parsers: a line it does not understand is a warning, never a throw.
 */

import type { Flowchart } from '../../types.js';
import { parseMermaid } from '../../parser/parser.js';
import { FLOW_LIMITS, FlowSourceBuilder, isLabelOpener, isOperator, mapOperator, joinQuotedLines, tokenize, unquote } from '../flowchart-source.js';

export interface UseCaseParseResult {
  ast: Flowchart;
  warnings: string[];
}

const ID = String.raw`[\p{L}_][\p{L}\p{N}_]*`;
/** `Name`, `Name("Label")`, `Name(Label)`, `Name[Label]`, then `@{ props }`, `<<Stereotype>>`, `:::class`. */
const DECL = new RegExp(
  String.raw`^(${ID}|"[^"]*")\s*(?:\(\s*("(?:[^"]*)"|[^)]*?)\s*\)|\[\s*("(?:[^"]*)"|[^\]]*?)\s*\])?\s*(?:@\{[^}]*\})?\s*(?:<<([^>]*)>>)?\s*(?::::?(${ID}))?$`,
  'u',
);
const BOUNDARY = new RegExp(String.raw`^systemBoundary\s+(?:(${ID})\s*(?:\[\s*("(?:[^"]*)"|[^\]]*?)\s*\])?|("[^"]*"))\s*(?:@\{[^}]*\})?\s*(?::::?${ID})?$`, 'u');
const PROPS_ONLY = new RegExp(String.raw`^${ID}\s*@\{.*\}$`, 'u');

/** A label with its stereotype (`<<Employee>>`) as a second line, kept in the label's own flavour. */
function withStereotype(label: string, stereotype: string | undefined): string {
  if (stereotype === undefined || stereotype.trim() === '') return label;
  const tag = `«${stereotype.trim()}»`;
  return label.startsWith('`') && label.endsWith('`') && label.length >= 2 ? `${label.slice(0, -1)}\n${tag}\`` : `${label}\n${tag}`;
}

/** Parse `usecase-beta` text into the flowchart AST. Never throws on malformed input. */
export function parseUseCase(source: string): UseCaseParseResult {
  const b = new FlowSourceBuilder();
  const names = new RegExp(`^(?:${ID}|"[^"]*")$`, 'u');
  /** Source name (or quoted text) to the name the builder knows, one namespace for actors and use cases. */
  const key = (token: string): string => unquote(token);
  let noteCount = 0;
  let sawHeader = false;
  const lines = joinQuotedLines(source.split(/\r?\n/));
  const pendingStyle: string[] = [];

  for (let n = 0; n < lines.length; n++) {
    const line = (lines[n] as string).trim().slice(0, FLOW_LIMITS.line);
    if (line === '' || line.startsWith('%%')) continue;
    if (!sawHeader) {
      sawHeader = true;
      if (/^usecase(?:-beta)?\b/i.test(line)) continue;
    }
    let m: RegExpExecArray | null;
    if (/^end$/i.test(line)) {
      if (!b.close()) b.warnings.push('`end` without an open `systemBoundary` ignored.');
    } else if ((m = /^direction\s+(TB|TD|BT|LR|RL)\b/i.exec(line))) {
      b.direction = (m[1] as string).toUpperCase();
    } else if (/^accTitle\b/i.test(line)) {
      // Accessibility title: nothing to draw.
    } else if (/^accDescr\b/i.test(line)) {
      // `accDescr { ... }` spans lines up to its closing brace.
      if (/\{\s*$/.test(line)) while (n + 1 < lines.length && !/^\s*\}/.test(lines[++n] as string));
    } else if (/^(?:classDef|class|style)\s/i.test(line)) {
      pendingStyle.push(line);
    } else if (/^(?:linkStyle|click|callback|link)\b/i.test(line)) {
      b.warnOnce('links', 'Link styling and interactive directives (`linkStyle`, `click`) are not applied.');
    } else if ((m = BOUNDARY.exec(line))) {
      const name = m[1] ?? unquote(m[3] as string);
      const title = m[2] !== undefined ? unquote(m[2]) : name;
      b.open(name, title === '' ? name : title);
    } else if (/^systemBoundary\b/i.test(line)) {
      b.warnings.push(`Unsupported line ignored: ${line}`);
    } else if ((m = /^note\s+for\s+(\S+)\s+("(?:[^"]*)"|`[^`]*`)\s*$/i.exec(line))) {
      const target = key(m[1] as string);
      const id = `note ${noteCount++}`;
      if (b.node(id, unquote(m[2] as string), 'card')) b.edge(id, target, '-.-');
      if (!b.has(target) && !b.isContainer(target)) b.node(target, target, 'ellipse');
    } else if (/^note\b/i.test(line)) {
      b.warnings.push(`Unsupported line ignored: ${line}`);
    } else if ((m = /^json\s+(\S+?)\s*@\{(.*)$/i.exec(line))) {
      // A JSON payload: a card named after it; its content (up to the closing `}`) is skipped.
      const tail = m[2] as string;
      let depth = 1 + (tail.match(/\{/g)?.length ?? 0) - (tail.match(/\}/g)?.length ?? 0);
      let last = tail;
      while (depth > 0 && n + 1 < lines.length) {
        last = lines[++n] as string;
        depth += (last.match(/\{/g)?.length ?? 0) - (last.match(/\}/g)?.length ?? 0);
      }
      const cls = /:::\s*(\w+)/.exec(last)?.[1];
      b.warnOnce('json', 'The content of `json` payload nodes is not drawn; only their name.');
      b.node(m[1] as string, m[1] as string, 'document', cls ? [cls] : []);
    } else if ((m = /^actor\s+(.+)$/i.exec(line))) {
      const d = DECL.exec(m[1] as string);
      if (!d) {
        b.warnings.push(`Unsupported line ignored: ${line}`);
        continue;
      }
      const name = key(d[1] as string);
      const label = d[2] ?? d[3];
      b.node(name, withStereotype(label === undefined ? name : unquote(label), d[4]), 'actor', d[5] ? [d[5]] : []);
      b.warnOnce('actor', 'Actor icons and `type` / `business` looks are not applied; actors are drawn as a stick figure.');
    } else if (PROPS_ONLY.test(line)) {
      b.warnOnce('props', 'Properties set with `id@{ ... }` on a line of their own (type, animation...) are not drawn.');
    } else if (readEdges(line, b, names, key)) {
      // Drawn as arrows.
    } else if ((m = DECL.exec(line))) {
      const name = key(m[1] as string);
      const label = m[2] ?? m[3];
      b.node(name, withStereotype(label === undefined ? name : unquote(label), m[4]), 'ellipse', m[5] ? [m[5]] : []);
    } else {
      b.warnings.push(`Unsupported line ignored: ${line}`);
    }
  }
  if (b.inContainer) b.warnings.push('A `systemBoundary` was never closed with `end`.');
  applyStyles(pendingStyle, b);
  const parsed = parseMermaid(b.toSource());
  return { ast: parsed.ast, warnings: [...b.warnings, ...parsed.warnings] };
}

/**
 * `classDef`, `class` and `style` lines, rewritten to the generated ids. Only nodes carry colours: a line
 * that names an arrow, a boundary or an unknown name is dropped. A class given by `class a,b name` is
 * written as `class` on the generated id.
 */
function applyStyles(lines: string[], b: FlowSourceBuilder): void {
  for (const line of lines) {
    let m: RegExpExecArray | null;
    if ((m = /^classDef\s+(\S+)\s+(.+)$/i.exec(line))) {
      for (const name of (m[1] as string).split(',')) if (/^[\w-]+$/.test(name)) b.styleLines.push(`classDef ${name} ${m[2] as string}`);
    } else if ((m = /^class\s+(\S+)\s+(\S+)$/i.exec(line))) {
      const ids = (m[1] as string).split(',').map((name) => b.idOf(name)).filter((id): id is string => id !== undefined);
      for (const name of (m[2] as string).split(',')) if (ids.length > 0 && /^[\w-]+$/.test(name)) b.styleLines.push(`class ${ids.join(',')} ${name}`);
    } else if ((m = /^style\s+(\S+)\s+(.+)$/i.exec(line))) {
      const id = b.idOf(m[1] as string);
      if (id !== undefined) b.styleLines.push(`style ${id} ${m[2] as string}`);
    }
  }
}

/** Read `A --> B`, `A -- text --> B`, `A ..> : include B`, `A id@-- ...`; false when `line` is not an arrow. */
function readEdges(line: string, b: FlowSourceBuilder, names: RegExp, key: (token: string) => string): boolean {
  if (!/--|==|-\.|\.\./.test(line)) return false;
  // Nodes declared inside the chain (`Customer("Buyer") --> Checkout[Pay]`) are declared, then named.
  const inline = new RegExp(String.raw`(${ID})\s*(?:\(\s*("[^"]*"|[^)]*?)\s*\)|\[\s*("[^"]*"|[^\]]*?)\s*\])`, 'gu');
  line = line.replace(inline, (_, name: string, round?: string, square?: string) => {
    const label = round ?? square;
    if (!b.has(name)) b.node(name, label === undefined ? name : unquote(label), 'ellipse');
    return name;
  });
  // An edge id (`opens@-->`) names the arrow for `class` / `style`; arrows are not styled here, so drop it.
  const tokens = tokenize(line.replace(/\s[\p{L}_][\p{L}\p{N}_]*@(?=-|\.|=)/u, ' '));
  if (tokens.length < 3 || !tokens.some(isOperator)) return false;
  const steps: Array<{ from: string; to: string; op: string; swap: boolean; label?: string; reduced: boolean }> = [];
  let i = 0;
  let from = tokens[i++] as string;
  if (!names.test(from)) return false;
  while (i < tokens.length) {
    let opToken = tokens[i++] as string;
    let label: string | undefined;
    if (isLabelOpener(opToken) && tokens.slice(i + 1).some(isOperator)) {
      const words: string[] = [];
      while (i < tokens.length && !isOperator(tokens[i] as string)) words.push(tokens[i++] as string);
      label = unquote(words.join(' '));
      opToken = tokens[i++] as string;
    }
    const mapped = mapOperator(opToken);
    if (!mapped) return false;
    let to: string | undefined;
    if (label === undefined && tokens[i]?.startsWith(':')) {
      // `..> : include Payment`: the text up to the last word labels the arrow, the last word is the target.
      const rest = tokens.slice(i);
      to = rest[rest.length - 1];
      const words = rest.slice(0, -1);
      if (words[0] === ':') words.shift();
      else if (words[0] !== undefined) words[0] = words[0].slice(1);
      label = unquote(words.join(' '));
      i = tokens.length;
    } else {
      to = tokens[i++];
    }
    if (to === undefined || !names.test(to)) return false;
    steps.push({ from, to, op: mapped.op, swap: mapped.swap, reduced: mapped.reduced, ...(label !== undefined ? { label } : {}) });
    from = to;
  }
  for (const s of steps) {
    const a = key(s.from);
    const z = key(s.to);
    for (const name of [a, z]) if (!b.has(name) && !b.isContainer(name)) b.node(name, name, 'ellipse');
    if (s.reduced) b.warnOnce('arrowhead', 'Hollow arrowheads (`--|>`) are drawn as plain arrows.');
    if (s.swap) b.edge(z, a, s.op, s.label);
    else b.edge(a, z, s.op, s.label);
  }
  return true;
}
