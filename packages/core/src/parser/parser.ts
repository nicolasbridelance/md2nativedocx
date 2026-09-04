/**
 * Mermaid flowchart parser -> intermediate AST.
 *
 * V1 scope (spec §5.1): `graph`/`flowchart` with `TD`/`LR` direction only.
 * Supports node shapes from §6.1, edge types from §6.2, and `subgraph`
 * containers. `classDef`/`style` are intentionally ignored in V1 (§6.3).
 *
 * This module is a pure function from untrusted text to a typed AST. It never
 * emits XML itself — escaping happens in the translator.
 */

import type {
  EdgeType,
  FlowEdge,
  FlowNode,
  Flowchart,
  LabelRun,
  LabelToken,
  NodeShape,
  Subgraph,
} from '../types.js';

/** Shape of a node based on its bracket syntax (spec §6.1). */
const SHAPE_BY_SYNTAX: ReadonlyArray<{ open: string; close: string; shape: NodeShape }> = [
  // Longest/most specific patterns first, so e.g. `[[` matches subroutine
  // before `[` matches rect, and `(((` matches doubleCircle before `((`
  // matches ellipse.
  { open: '(((', close: ')))', shape: 'doubleCircle' },
  { open: '([', close: '])', shape: 'stadium' },
  { open: '[(', close: ')]', shape: 'cylinder' },
  { open: '((', close: '))', shape: 'ellipse' },
  { open: '[[', close: ']]', shape: 'subroutine' },
  { open: '[/', close: '\\]', shape: 'trapezoid' },
  { open: '[\\', close: '/]', shape: 'trapezoidAlt' },
  { open: '[/', close: '/]', shape: 'parallelogram' },
  { open: '[\\', close: '\\]', shape: 'parallelogramAlt' },
  { open: '{{', close: '}}', shape: 'hexagon' },
  { open: '[', close: ']', shape: 'rect' },
  { open: '(', close: ')', shape: 'roundRect' },
  { open: '{', close: '}', shape: 'diamond' },
  { open: '>', close: ']', shape: 'asymmetric' },
];

/**
 * Shape name (lowercased) -> {@link NodeShape} for the v11.3+ generic
 * `id@{ shape: name, label: "text" }` syntax (spec §6.1 addendum). Sourced
 * from Mermaid's own "Semantic Name" / "Shape Name Aliases" table
 * (https://mermaid.js.org/syntax/flowchart.html), keeping only the names
 * with a faithful single-preset DrawingML match — reused where an alias is
 * just another name for a shape the bracket syntax already supports (e.g.
 * `rounded` -> `roundRect`), and mapped to a new {@link NodeShape} where
 * Word's flowchart preset geometry family (`flowChart*`) or a basic shape
 * (`lightningBolt`, `leftBrace`/`rightBrace`/`bracePair`) has a direct
 * equivalent. Deliberately NOT covered — no single preset renders them
 * faithfully without compound shapes or custom vector paths (`bang`,
 * `browser`, `bucket`, `cloud`, `console`, `data-store`, `divided-process`,
 * `folder`, `fork`/`join`, `lined-document`, `lined-process`, `loop-limit`,
 * `multi-document`, `multi-process`, `person`, `tagged-document`,
 * `tagged-process`) — {@link normalizeShapeAlias} falls back to `rect` for
 * these rather than losing the node, per spec §10's never-lose-data-silently
 * rule (see the mid-chain-label and multi-line-label fixes in TODO.md for
 * the two prior bugs in that same class).
 */
const SHAPE_ALIAS_MAP: Readonly<Record<string, NodeShape>> = {
  proc: 'rect',
  process: 'rect',
  rect: 'rect',
  rectangle: 'rect',
  odd: 'rect',
  event: 'roundRect',
  rounded: 'roundRect',
  pill: 'stadium',
  stadium: 'stadium',
  terminal: 'stadium',
  'fr-rect': 'subroutine',
  'framed-rectangle': 'subroutine',
  subproc: 'subroutine',
  subprocess: 'subroutine',
  subroutine: 'subroutine',
  cyl: 'cylinder',
  cylinder: 'cylinder',
  database: 'cylinder',
  db: 'cylinder',
  decision: 'diamond',
  diamond: 'diamond',
  diam: 'diamond',
  question: 'diamond',
  hex: 'hexagon',
  hexagon: 'hexagon',
  prepare: 'hexagon',
  'in-out': 'parallelogram',
  'lean-r': 'parallelogram',
  'lean-right': 'parallelogram',
  'lean-l': 'parallelogramAlt',
  'lean-left': 'parallelogramAlt',
  'out-in': 'parallelogramAlt',
  priority: 'trapezoid',
  'trap-b': 'trapezoid',
  trapezoid: 'trapezoid',
  'trapezoid-bottom': 'trapezoid',
  'inv-trapezoid': 'trapezoidAlt',
  manual: 'trapezoidAlt',
  'trap-t': 'trapezoidAlt',
  'trapezoid-top': 'trapezoidAlt',
  circ: 'ellipse',
  circle: 'ellipse',
  'sm-circ': 'ellipse',
  'small-circle': 'ellipse',
  start: 'ellipse',
  'dbl-circ': 'doubleCircle',
  'double-circle': 'doubleCircle',
  'fr-circ': 'doubleCircle',
  'framed-circle': 'doubleCircle',
  stop: 'doubleCircle',
  doc: 'document',
  document: 'document',
  card: 'card',
  'notched-rectangle': 'card',
  delay: 'delay',
  'half-rounded-rectangle': 'delay',
  extract: 'triangle',
  tri: 'triangle',
  triangle: 'triangle',
  'flipped-triangle': 'triangleInverted',
  'manual-file': 'triangleInverted',
  'flip-tri': 'triangleInverted',
  'internal-storage': 'windowPane',
  'win-pane': 'windowPane',
  'window-pane': 'windowPane',
  collate: 'hourglass',
  hourglass: 'hourglass',
  'curved-trapezoid': 'curvedTrapezoid',
  'curv-trap': 'curvedTrapezoid',
  display: 'curvedTrapezoid',
  'com-link': 'bolt',
  'lightning-bolt': 'bolt',
  brace: 'braceLeft',
  'brace-l': 'braceLeft',
  comment: 'braceLeft',
  'brace-r': 'braceRight',
  braces: 'bracePair',
  'cross-circ': 'crossedCircle',
  'crossed-circle': 'crossedCircle',
  summary: 'crossedCircle',
  'f-circ': 'filledCircle',
  'filled-circle': 'filledCircle',
  junction: 'filledCircle',
  flag: 'paperTape',
  'paper-tape': 'paperTape',
  das: 'horizontalCylinder',
  'h-cyl': 'horizontalCylinder',
  'horizontal-cylinder': 'horizontalCylinder',
  disk: 'linedCylinder',
  'lin-cyl': 'linedCylinder',
  'lined-cylinder': 'linedCylinder',
  'manual-input': 'manualInput',
  'sl-rect': 'manualInput',
  'sloped-rectangle': 'manualInput',
};

/** Look up a `shape:` value from `SHAPE_ALIAS_MAP`, defaulting to `rect` for
 * an unrecognized or deliberately-unsupported name (see that map's doc
 * comment) rather than failing the whole node/edge statement. */
function normalizeShapeAlias(raw: string): NodeShape {
  return SHAPE_ALIAS_MAP[stripQuotedLabel(raw.trim()).toLowerCase()] ?? 'rect';
}

/**
 * Parse the body of an `@{ ... }` property bag (`shape: circle, label: "Hi, there"`)
 * into a lowercase-keyed map. A quoted value (`"..."`) is read verbatim up to
 * its closing quote — including any `,`/`:` inside — so a label containing
 * punctuation doesn't fragment the scan; an unquoted value runs to the next
 * top-level comma. Malformed tails (no `:` after a key) are dropped rather
 * than throwing, consistent with this parser's tolerant-degradation style.
 */
function parseAtShapeProps(inner: string): Map<string, string> {
  const props = new Map<string, string>();
  const n = inner.length;
  let i = 0;
  while (i < n) {
    while (i < n && (inner[i] === ',' || /\s/.test(inner[i]!))) i++;
    if (i >= n) break;
    const keyStart = i;
    while (i < n && inner[i] !== ':') i++;
    if (i >= n) break;
    const key = inner.slice(keyStart, i).trim().toLowerCase();
    i++; // skip ':'
    while (i < n && /\s/.test(inner[i]!)) i++;
    let value: string;
    if (inner[i] === '"') {
      i++;
      const valueStart = i;
      while (i < n && inner[i] !== '"') i++;
      value = inner.slice(valueStart, i);
      if (i < n) i++; // skip closing quote
    } else {
      const valueStart = i;
      while (i < n && inner[i] !== ',') i++;
      value = inner.slice(valueStart, i).trim();
    }
    if (key.length > 0) props.set(key, value);
  }
  return props;
}

/**
 * Recognize the v11.3+ generic shape syntax, `id@{ shape: name, label: "text" }`
 * — the id itself is consumed by the caller's existing id regex (`@` isn't an
 * id character), so `rest` here is just the `@{...}` tail. Returns `null` for
 * anything else (falls through to the bracket-syntax loop). A `label` prop is
 * optional (Mermaid defaults it to the node id, same as a bracket-less bare
 * node) — signaled here as `null` so the caller can apply that default.
 */
function parseAtShapeSyntax(
  rest: string,
): { shape: NodeShape; label: string | null; labelRuns: LabelToken[] | null } | null {
  if (!rest.startsWith('@{') || !rest.endsWith('}')) return null;
  const props = parseAtShapeProps(rest.slice(2, -1));
  const shape = props.has('shape') ? normalizeShapeAlias(props.get('shape')!) : 'rect';
  const parsed = props.has('label') ? parseLabel(stripQuotedLabel(props.get('label')!.trim())) : null;
  return { shape, label: parsed?.text ?? null, labelRuns: parsed?.runs ?? null };
}

/**
 * Edge operator token -> EdgeType (spec §6.2), extended to Mermaid's
 * documented "extra length" convention (flowchart.md's "Minimum length of a
 * link" table, verified 2026-09-04): repeating the line/dot/equals character
 * extends a link's rank distance without changing its type — `-->` (length
 * 1) / `--->` (length 2) / `---->` (length 3), same for the headless line
 * (`---`/`----`/`-----`), thick (`==>`/`===>`/`====>`, `===`/`====`/`=====`),
 * and dotted (`-.->`/`-..->`/`-...->`, `-.-`/`-..-`/`-...-` — note the
 * *dot* count grows, not the dash count) families. Mermaid's docs do not
 * extend this to `--o`/`--x`/`o--o`/`x--x`/`<-->`, so those stay fixed-width
 * tokens. The extra length itself has no representation in the AST/Dagre
 * (§5.4 of `docs/markdown-mermaid-compliance-table.md`) — this only stops
 * the whole node/edge from being lost, same as `normalizeShapeAlias`'s
 * fallback-to-`rect` for an unrecognized `@{shape}` name.
 *
 * `line`/`thickLine` require a minimum of 3 repeated characters — not 2 —
 * even though their arrow siblings need only 2 before the `>`. This isn't
 * arbitrary: it's what keeps the 2-character mid-label open marker
 * (`--`/`==`, {@link MID_LABEL_FAMILIES}) from being swallowed here as a
 * headless edge, since the scanner in {@link parseEdgeChain} tries this
 * table first at every position and only falls back to
 * {@link matchMidLabelEdge} when nothing here matches.
 */
interface EdgeOperatorMatcher {
  type: EdgeType;
  /** Returns the matched length at `line[at..]`, or `null` if it doesn't match here. */
  match(line: string, at: number): number | null;
}

function fixedOp(token: string, type: EdgeType): EdgeOperatorMatcher {
  return { type, match: (line, at) => (line.startsWith(token, at) ? token.length : null) };
}

function regexOp(regex: RegExp, type: EdgeType): EdgeOperatorMatcher {
  return {
    type,
    match: (line, at) => {
      const m = regex.exec(line.slice(at));
      return m ? m[0].length : null;
    },
  };
}

const EDGE_OPERATORS: ReadonlyArray<EdgeOperatorMatcher> = [
  fixedOp('<-->', 'bidirectional'),
  fixedOp('o--o', 'circleBoth'),
  fixedOp('x--x', 'crossBoth'),
  regexOp(/^-\.+->/, 'dotted'), // -.-> / -..-> / -...->
  regexOp(/^-\.+-(?![>ox])/, 'dottedLine'), // -.- / -..- / -...-
  regexOp(/^={2,}>/, 'thick'), // ==> / ===> / ====>
  regexOp(/^-{2,}>/, 'arrow'), // --> / ---> / ---->
  fixedOp('--o', 'circle'),
  fixedOp('--x', 'cross'),
  fixedOp('~~~', 'invisible'),
  regexOp(/^={3,}(?!>)/, 'thickLine'), // === / ==== / =====
  regexOp(/^-{3,}(?![>ox])/, 'line'), // --- / ---- / -----
];

/**
 * Mid-chain label syntax (`A-- text -->B`, the Mermaid-recommended alternative
 * to `A-->|text|B`): an opening marker shared by a whole operator family,
 * arbitrary label text, then a closing marker that picks the specific
 * {@link EdgeType} within that family. Only matched when no full token from
 * {@link EDGE_OPERATORS} already matched at the same position (checked first
 * in {@link parseEdgeChain}), so a plain `A-->B` is never reinterpreted here.
 * Each family's closings are ordered longest-token-first so e.g. `.-` doesn't
 * capture prematurely and strand the `>` of `.->`.
 */
const MID_LABEL_FAMILIES: ReadonlyArray<{
  open: string;
  closings: ReadonlyArray<{ token: string; type: EdgeType }>;
}> = [
  {
    open: '--',
    closings: [
      { token: '-->', type: 'arrow' },
      { token: '--o', type: 'circle' },
      { token: '--x', type: 'cross' },
      { token: '---', type: 'line' },
    ],
  },
  {
    open: '-.',
    closings: [
      { token: '.->', type: 'dotted' },
      { token: '.-', type: 'dottedLine' },
    ],
  },
  {
    open: '==',
    closings: [
      { token: '==>', type: 'thick' },
      { token: '===', type: 'thickLine' },
    ],
  },
];

/**
 * Node ids that collide with Object.prototype members. Dagre stores nodes in a
 * plain object, so an id like `__proto__`, `constructor`, or `length` would
 * resolve to the prototype instead of the node, breaking layout (and enabling
 * prototype pollution). These ids are rejected with a warning (non-fatal).
 */
const RESERVED_IDS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'length',
  'name',
  'toString',
  'hasOwnProperty',
  'valueOf',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
]);

/** True if an id is safe to use as a key in a plain object (Dagre-safe). */
function isSafeId(id: string): boolean {
  return !RESERVED_IDS.has(id);
}

/**
 * Strip a pair of surrounding double quotes from a node/edge label, the
 * syntax Mermaid itself recommends for Unicode/special characters
 * (`id["Hello, World"]`). Without this the quotes were kept literally in
 * the rendered text — found empirically while building
 * `docs/markdown-mermaid-compliance-table.md` (2026-09-03), logged in `TODO.md`.
 * Unquoted text (`id[Hello World]`) is returned unchanged.
 */
function stripQuotedLabel(text: string): string {
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1);
  }
  return text;
}

/** Mermaid's named HTML-derived entity codes (written without the leading
 * `&`, e.g. `#quot;`), the ones Mermaid's own docs call out explicitly. */
const NAMED_ENTITIES: ReadonlyArray<readonly [string, string]> = [
  ['quot', '"'],
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['nbsp', ' '],
  ['apos', "'"],
];

/**
 * Parse the small set of inline-text conveniences Mermaid supports (found via
 * `docs/markdown-mermaid-compliance-table.md` §5, logged in `TODO.md`) into
 * both a flattened plain-text fallback (`text`, used for box-name attributes
 * and `layout.ts`'s width/height estimation — neither needs to know about a
 * bold/italic span) and a structured rich-text body (`runs`, `types.ts`'s
 * `LabelToken[]` — what the translator actually renders):
 *  - Mermaid's entity codes (`#quot;`, `#9829;`, ...) are decoded to their
 *    character first — the numeric form via its Unicode code point, plus the
 *    handful of named entities Mermaid documents — regardless of the two
 *    cases below.
 *  - `<br/>` (and `<br>`, `<br />`, case-insensitive) becomes a real line
 *    break: a `{ break: true }` token in `runs` (`text` flattens it to a
 *    single space instead, same as before this function could produce real
 *    breaks — a fallback string has nowhere to put a second line).
 *  - A "Markdown string" (a label wrapped in backticks) has its delimiters
 *    stripped, and `**bold**`/`__bold__`/`*italic*`/`_italic_` spans become
 *    real `LabelRun.bold`/`.italic` tokens instead of literal asterisks or a
 *    stripped-to-plain-text approximation. Emphasis markers are only
 *    recognized inside a Markdown string — Mermaid's classic (non-backtick)
 *    label syntax never interprets them, so a literal `**` in an ordinary
 *    label stays literal, unchanged from before.
 */
function parseLabel(text: string): { text: string; runs: LabelToken[] } {
  let decoded = text.replace(/#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
  for (const [name, char] of NAMED_ENTITIES) {
    decoded = decoded.split(`#${name};`).join(char);
  }
  const isMarkdownString = decoded.length >= 2 && decoded.startsWith('`') && decoded.endsWith('`');
  if (isMarkdownString) decoded = decoded.slice(1, -1);

  const segments = decoded.split(/<br\s*\/?>/gi);
  const runs: LabelToken[] = [];
  const plainSegments: string[] = [];
  segments.forEach((segment, i) => {
    if (i > 0) runs.push({ break: true });
    const segmentRuns = isMarkdownString
      ? parseEmphasis(segment)
      : segment.length > 0
        ? [{ text: segment }]
        : [];
    runs.push(...segmentRuns);
    plainSegments.push(segmentRuns.map((r) => r.text).join(''));
  });
  return { text: plainSegments.join(' '), runs };
}

/**
 * Split a Markdown-string segment (no `<br/>` in it — {@link parseLabel}
 * already split those out) into plain/bold/italic {@link LabelRun}s.
 * Non-nested and non-overlapping — CommonMark's full emphasis-resolution
 * algorithm is out of scope here (V1 tolerance, same spirit as the rest of
 * this parser); `**`/`__` (bold) is tried before `*`/`_` (italic) at each
 * position so a bold span is never misread as two italic markers.
 */
function parseEmphasis(text: string): LabelRun[] {
  const runs: LabelRun[] = [];
  const re = /(\*\*|__)([\s\S]+?)\1|(\*|_)([\s\S]+?)\3/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) runs.push({ text: m[2]!, bold: true });
    else runs.push({ text: m[4]!, italic: true });
    last = re.lastIndex;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs;
}

/**
 * Parse a CSS-like `prop:value,prop:value` property list (`classDef`/`style`/
 * `linkStyle`, spec §6.3) into a lowercase-keyed map. Order-independent by
 * design — unlike the old `classDef` regex this replaces, which required
 * `fill:` to be the first (and only) property, silently failing the whole
 * line otherwise. Values that themselves contain a comma (e.g. a
 * `stroke-dasharray` list) will fragment here, but none of the properties
 * this parser actually reads (`fill`, `stroke`, `stroke-width`) are affected.
 */
function parseCssStyleProps(text: string): Map<string, string> {
  const props = new Map<string, string>();
  for (const part of text.split(',')) {
    const i = part.indexOf(':');
    if (i === -1) continue;
    const key = part.slice(0, i).trim().toLowerCase();
    const value = part.slice(i + 1).trim();
    if (key.length > 0 && value.length > 0) props.set(key, value);
  }
  return props;
}

/**
 * Normalize a CSS color value to a bare 6-digit uppercase hex string (what
 * the translator's `hexColor()` expects), expanding the 3-digit shorthand
 * (`#f9f` -> `FF99FF`). Returns `null` for anything else (a named color like
 * `red`, `transparent`, a `rgb(...)` call, ...) — deliberately out of scope,
 * same tolerant-degradation style as an unrecognized `@{shape: ...}` name:
 * the property is just dropped rather than failing the whole statement.
 */
function parseHexColor(value: string): string | null {
  const v = value.trim();
  const hex6 = v.match(/^#?([0-9A-Fa-f]{6})$/);
  if (hex6) return hex6[1]!.toUpperCase();
  const hex3 = v.match(/^#?([0-9A-Fa-f]{3})$/);
  if (hex3) {
    const [r, g, b] = hex3[1]!;
    return `${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

/** The subset of `fill`/`stroke` CSS properties this parser maps to OOXML. */
interface NodeStylePatch {
  fill?: string;
  stroke?: string;
}

/** Extract `fill`/`stroke` from a parsed property map, dropping anything not
 * a recognized hex color (see {@link parseHexColor}). */
function extractNodeStyle(props: Map<string, string>): NodeStylePatch {
  const patch: NodeStylePatch = {};
  const fillValue = props.get('fill');
  if (fillValue) {
    const hex = parseHexColor(fillValue);
    if (hex) patch.fill = hex;
  }
  const strokeValue = props.get('stroke');
  if (strokeValue) {
    const hex = parseHexColor(strokeValue);
    if (hex) patch.stroke = hex;
  }
  return patch;
}

/**
 * Apply a `fill`/`stroke` patch to a node, or — if the node hasn't been
 * declared yet (a class/style referencing a node defined later in the
 * source) — remember it in `pendingStyles` for the end-of-parse sweep. Merges
 * onto whatever patch (if any) is already pending, so `style A stroke:#000`
 * followed later by `A:::crit` (a fill-only class) doesn't clobber the
 * stroke the first statement set.
 */
function applyNodeStyle(
  nodes: Map<string, FlowNode>,
  pendingStyles: Map<string, NodeStylePatch>,
  nodeId: string,
  patch: NodeStylePatch,
): void {
  if (patch.fill === undefined && patch.stroke === undefined) return;
  const existing = nodes.get(nodeId);
  if (existing) {
    if (patch.fill !== undefined) existing.fill = patch.fill;
    if (patch.stroke !== undefined) existing.stroke = patch.stroke;
    return;
  }
  const pending = pendingStyles.get(nodeId) ?? {};
  if (patch.fill !== undefined) pending.fill = patch.fill;
  if (patch.stroke !== undefined) pending.stroke = patch.stroke;
  pendingStyles.set(nodeId, pending);
}

/**
 * Merge physical lines that a bracketed node label wraps across, e.g.
 *   Lire --> Valider{Config
 *  valide?}:::gate
 * Mermaid treats a raw newline inside `[]`/`()`/`{}` as part of the label
 * text (rendered as a second line); this parser is otherwise line-based, so
 * it would see two broken statements, warn on both, and silently drop the
 * edge — disconnecting the diagram. Found via medium-realistic.mmd
 * (2026-09-04). Lines that are already bracket-balanced (the common case)
 * flush immediately and are unaffected.
 */
function joinBracketContinuations(lines: string[]): string[] {
  const result: string[] = [];
  let buffer: string[] = [];
  let depth = 0;
  for (const line of lines) {
    buffer.push(line.trim());
    depth += bracketDelta(line);
    if (depth <= 0) {
      result.push(buffer.join(' '));
      buffer = [];
      depth = 0;
    }
  }
  if (buffer.length > 0) {
    result.push(buffer.join(' '));
  }
  return result;
}

/**
 * Net count of `[`/`(`/`{` minus `]`/`)`/`}` in a line, ignoring anything
 * inside a double-quoted label (a literal bracket character in quoted text,
 * e.g. `n["["]`, must not be mistaken for an unterminated statement).
 */
function bracketDelta(line: string): number {
  let delta = 0;
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === '[' || ch === '(' || ch === '{') delta++;
    else if (ch === ']' || ch === ')' || ch === '}') delta--;
  }
  return delta;
}

export interface ParseResult {
  ast: Flowchart;
  /** Human-readable warnings for unsupported constructs (non-fatal). */
  warnings: string[];
}

/**
 * Parse a Mermaid flowchart block into an intermediate AST.
 * Throws {@link MermaidParseError} on structurally invalid input.
 */
export function parseMermaid(text: string): ParseResult {
  const warnings: string[] = [];
  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const subgraphs: Subgraph[] = [];
  const subgraphStack: Subgraph[] = [];
  // Node ids whose subgraph membership (or lack of one) has already been
  // decided, by the first line that mentions them — see attachToCurrentSubgraph.
  const subgraphAttached = new Set<string>();
  // class name -> style patch, from `classDef` (spec §6.3).
  const classDefs = new Map<string, NodeStylePatch>();
  // node id -> style patch, for nodes styled (via class/`:::`/`style`) before they are defined.
  const pendingStyles = new Map<string, NodeStylePatch>();
  // Deferred `class`/`:::` assignments whose `classDef` hadn't been seen yet
  // at the point the assignment was parsed — `classDef` conventionally comes
  // first in a diagram but nothing requires it to; resolved once the whole
  // document (and therefore every `classDef`) is known, mirroring how
  // `pendingStyles` above already handles the opposite ordering (a class
  // applied to a node declared later in the source).
  const pendingClassAssignments: Array<{ nodeIds: string[]; className: string }> = [];
  // Deferred `linkStyle` statements (spec §6.3): applied after the full edge
  // list is known, since an index can refer to an edge declared later in the
  // source (the common case — `linkStyle` conventionally comes last).
  const pendingLinkStyles: Array<{
    indices: number[] | 'default';
    patch: { stroke?: string; strokeWidth?: number };
  }> = [];

  let direction: 'TD' | 'LR' | 'BT' | 'RL' = 'TD';

  const lines = joinBracketContinuations(text.split(/\r?\n/));

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    // Header line: graph TD / flowchart LR/BT/RL. `TB` is Mermaid's own
    // documented alias for `TD` (top-to-bottom either way) and maps straight
    // through to it; the other three are distinct directions, all laid out by
    // Dagre (`layout.ts`) and by SmartArt's `linDir` param (`chain.ts`/`tree.ts`).
    const header = line.match(/^(?:graph|flowchart)\s+(TD|TB|LR|BT|RL)\b/i);
    if (header) {
      const requested = header[1]!.toUpperCase();
      direction = requested === 'TB' ? 'TD' : (requested as 'TD' | 'LR' | 'BT' | 'RL');
      continue;
    }
    // Allow a bare "graph"/"flowchart" with no direction.
    if (/^(?:graph|flowchart)\s*$/i.test(line)) continue;

    // Comments
    if (line.startsWith('%%')) continue;

    // classDef Name1,Name2 fill:#XXX,stroke:#XXX,... (spec §6.3). Properties
    // are order-independent and multiple class names may share one
    // definition — neither was true of the regex this replaced, which
    // required `fill:` first and exactly one class name (both fixed here as
    // a side effect of reusing the same generic property-list parser as
    // `style`/`linkStyle` below).
    const classDef = line.match(/^classDef\s+([A-Za-z0-9_,\s-]+)\s+(.+)$/i);
    if (classDef) {
      const patch = extractNodeStyle(parseCssStyleProps(classDef[2]!));
      for (const name of classDef[1]!.split(',')) {
        const trimmed = name.trim();
        if (trimmed.length > 0) classDefs.set(trimmed, patch);
      }
      continue;
    }
    // class A,B,C className — apply a defined class to nodes.
    const classAssign = line.match(/^class\s+([A-Za-z0-9_,\s-]+)\s+([A-Za-z0-9_-]+)\s*$/i);
    if (classAssign) {
      const className = classAssign[2]!;
      const ids = classAssign[1]!
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const patch = classDefs.get(className);
      if (patch) {
        for (const id of ids) applyNodeStyle(nodes, pendingStyles, id, patch);
      } else {
        pendingClassAssignments.push({ nodeIds: ids, className });
      }
      continue;
    }

    // style A fill:#XXX,stroke:#XXX,... (spec §6.3) — direct styling, no
    // classDef indirection. Same property parser as classDef/linkStyle.
    const styleStmt = line.match(/^style\s+([A-Za-z0-9_-]+)\s+(.+)$/i);
    if (styleStmt) {
      applyNodeStyle(nodes, pendingStyles, styleStmt[1]!, extractNodeStyle(parseCssStyleProps(styleStmt[2]!)));
      continue;
    }

    // linkStyle 0,2 stroke:#XXX,stroke-width:Npx / linkStyle default ...
    // (spec §6.3). Indices refer to edge declaration order; resolved against
    // the final edge list after the whole document is parsed (see
    // `pendingLinkStyles` below), since `linkStyle` conventionally comes
    // after the edges it targets.
    const linkStyleStmt = line.match(/^linkStyle\s+(default|[\d\s,]+?)\s+(.+)$/i);
    if (linkStyleStmt) {
      const target = linkStyleStmt[1]!.trim();
      const props = parseCssStyleProps(linkStyleStmt[2]!);
      const patch: { stroke?: string; strokeWidth?: number } = {};
      const strokeValue = props.get('stroke');
      if (strokeValue) {
        const hex = parseHexColor(strokeValue);
        if (hex) patch.stroke = hex;
      }
      const widthValue = props.get('stroke-width');
      if (widthValue) {
        const px = parseFloat(widthValue);
        if (Number.isFinite(px) && px > 0) patch.strokeWidth = px;
      }
      if (patch.stroke !== undefined || patch.strokeWidth !== undefined) {
        const indices =
          target.toLowerCase() === 'default'
            ? ('default' as const)
            : target
                .split(',')
                .map((s) => parseInt(s.trim(), 10))
                .filter((n) => Number.isInteger(n) && n >= 0);
        pendingLinkStyles.push({ indices, patch });
      }
      continue;
    }

    // subgraph ... end
    if (/^subgraph\b/i.test(line)) {
      const sg = parseSubgraphHeader(line);
      subgraphs.push(sg);
      subgraphStack.push(sg);
      continue;
    }
    if (/^end\s*$/i.test(line)) {
      if (subgraphStack.length > 0) {
        const closed = subgraphStack.pop()!;
        const parent = subgraphStack[subgraphStack.length - 1];
        if (parent && !parent.subgraphIds.includes(closed.id)) {
          parent.subgraphIds.push(closed.id);
        }
      } else {
        warnings.push('Unexpected `end` without matching `subgraph`.');
      }
      continue;
    }

    // Edge statement(s): A --> B, A -->|label| B, A --- B, chained
    // A --> B --> C, and fan-out/fan-in via `&` (A --> B & C, A & B --> C).
    const chainEdges = parseEdgeChain(line);
    if (chainEdges) {
      for (const edge of chainEdges) {
        edges.push({
          from: edge.from,
          to: edge.to,
          type: edge.type,
          label: edge.label,
          labelRuns: edge.labelRuns,
        });
        if (!registerNode(nodes, edge.from, edge.fromLabel, edge.fromLabelRuns, edge.fromShape)) {
          warnings.push(`Node id "${edge.from}" is reserved and was ignored.`);
        }
        if (!registerNode(nodes, edge.to, edge.toLabel, edge.toLabelRuns, edge.toShape)) {
          warnings.push(`Node id "${edge.to}" is reserved and was ignored.`);
        }
        // Apply inline class styles (`A:::crit`) to the edge endpoints.
        applyClassToNode(nodes, pendingStyles, classDefs, pendingClassAssignments, edge.from, edge.fromClass);
        applyClassToNode(nodes, pendingStyles, classDefs, pendingClassAssignments, edge.to, edge.toClass);
        attachToCurrentSubgraph(subgraphStack, edge.from, subgraphAttached);
        attachToCurrentSubgraph(subgraphStack, edge.to, subgraphAttached);
      }
      continue;
    }

    // Bare node definition: id[Text] or id
    const node = parseNodeStatement(line);
    if (node) {
      if (!registerNode(nodes, node.id, node.label, node.labelRuns, node.shape)) {
        warnings.push(`Node id "${node.id}" is reserved and was ignored.`);
      }
      applyClassToNode(nodes, pendingStyles, classDefs, pendingClassAssignments, node.id, node.className);
      attachToCurrentSubgraph(subgraphStack, node.id, subgraphAttached);
      continue;
    }

    // Unsupported construct — warn but keep going (V1 tolerance).
    warnings.push(`Unsupported line ignored: ${line}`);
  }

  // Resolve class/`:::` assignments whose `classDef` appeared later in the
  // source (or never at all) — a class name still undefined at this point,
  // once the whole document has been scanned, is a genuine typo/omission and
  // still warns, just later than before.
  for (const { nodeIds, className } of pendingClassAssignments) {
    const patch = classDefs.get(className);
    if (!patch) {
      warnings.push(`classDef "${className}" referenced but not defined.`);
      continue;
    }
    for (const id of nodeIds) {
      applyNodeStyle(nodes, pendingStyles, id, patch);
    }
  }

  // Apply any pending class/style patches (including ones just resolved
  // above) to nodes that were defined after the class/style statement that
  // targets them.
  for (const [id, patch] of pendingStyles) {
    const existing = nodes.get(id);
    if (existing) {
      if (patch.fill !== undefined) existing.fill = patch.fill;
      if (patch.stroke !== undefined) existing.stroke = patch.stroke;
    }
  }

  // Apply deferred `linkStyle` statements now that the edge list is final —
  // `default` covers every edge, otherwise each index picks one edge in
  // declaration order; an out-of-range index is silently skipped (V1
  // tolerance, consistent with the rest of the parser).
  for (const { indices, patch } of pendingLinkStyles) {
    const targets = indices === 'default' ? edges.map((_, i) => i) : indices;
    for (const i of targets) {
      const edge = edges[i];
      if (!edge) continue;
      if (patch.stroke !== undefined) edge.stroke = patch.stroke;
      if (patch.strokeWidth !== undefined) edge.strokeWidth = patch.strokeWidth;
    }
  }

  // A subgraph id must not also be a node: Mermaid allows edges between
  // subgraphs (e.g. `U1 --> Y2`), and our parser would otherwise register the
  // subgraph id as a plain node, which breaks Dagre (an id cannot be both a
  // node and a cluster). Drop such nodes and warn. Edges referencing subgraphs
  // as endpoints are dropped too (V1 does not support inter-subgraph edges).
  const subgraphIdSet = new Set(subgraphs.map((s) => s.id));
  for (const id of subgraphIdSet) {
    if (nodes.has(id)) {
      nodes.delete(id);
      warnings.push(`Subgraph "${id}" was also used as a node; node ignored.`);
    }
  }
  const edgesWithoutSubgraphs = edges.filter((e) => {
    if (subgraphIdSet.has(e.from) || subgraphIdSet.has(e.to)) {
      warnings.push(`Edge ${e.from} -> ${e.to} references a subgraph; ignored (V1).`);
      return false;
    }
    return true;
  });

  if (subgraphStack.length > 0) {
    warnings.push('Unclosed `subgraph` block.');
  }

  return {
    ast: {
      direction,
      nodes: [...nodes.values()],
      edges: edgesWithoutSubgraphs,
      subgraphs,
    },
    warnings,
  };
}

function parseSubgraphHeader(line: string): Subgraph {
  const rest = line.replace(/^subgraph\b/i, '').trim();
  // subgraph id["Title"] or subgraph id[Title] or subgraph "Title" or subgraph id
  const withTitle = rest.match(/^([A-Za-z0-9_-]+)\s*\[\s*"([^"]*)"\s*\]/);
  if (withTitle) {
    return { id: withTitle[1]!, title: withTitle[2]!, nodeIds: [], subgraphIds: [] };
  }
  const withTitleNoQuotes = rest.match(/^([A-Za-z0-9_-]+)\s*\[\s*([^\]]*)\s*\]/);
  if (withTitleNoQuotes) {
    return { id: withTitleNoQuotes[1]!, title: withTitleNoQuotes[2]!.trim(), nodeIds: [], subgraphIds: [] };
  }
  const quotedTitle = rest.match(/^"([^"]+)"\s*$/);
  if (quotedTitle) {
    return { id: quotedTitle[1]!, title: quotedTitle[1]!, nodeIds: [], subgraphIds: [] };
  }
  // Bare id (or id with spaces used as title).
  const bare = rest.match(/^([A-Za-z0-9_-]+)\s*$/);
  if (bare) {
    return { id: bare[1]!, title: bare[1]!, nodeIds: [], subgraphIds: [] };
  }
  // Fallback: treat whole rest as id.
  return { id: rest, title: rest, nodeIds: [], subgraphIds: [] };
}

/**
 * Attach a node to the innermost currently-open subgraph, but only the FIRST
 * time that node id is seen — matching Mermaid's own semantics, where a
 * node's subgraph membership is decided by where it's first declared, not by
 * every later line that happens to mention it. Without this, a node declared
 * inside a nested subgraph gets re-attached to an ENCLOSING subgraph the next
 * time an edge outside the nested block references it (e.g. `B --> C` after
 * `C`'s subgraph already closed), leaking it into the wrong cluster.
 */
function attachToCurrentSubgraph(stack: Subgraph[], nodeId: string, attached: Set<string>): void {
  if (attached.has(nodeId)) return;
  attached.add(nodeId);
  const top = stack[stack.length - 1];
  if (top) top.nodeIds.push(nodeId);
}

function registerNode(
  nodes: Map<string, FlowNode>,
  id: string,
  label: string,
  labelRuns: LabelToken[],
  shape: NodeShape = 'rect',
): boolean {
  // Reject ids that collide with Object.prototype (Dagre breaks on them).
  if (!isSafeId(id)) return false;
  const existing = nodes.get(id);
  if (existing) {
    // Keep first-seen shape/label; later bare references don't override.
    return true;
  }
  nodes.set(id, { id, label, labelRuns, shape });
  return true;
}

/**
 * Apply a class's style patch to a node (from `:::class` inline or `class`).
 * If the node is not yet defined, the patch is remembered in `pendingStyles`
 * (via {@link applyNodeStyle}). If the class itself isn't defined *yet* (its
 * `classDef` may still come later in the source), the assignment is queued in
 * `pendingClassAssignments` for the end-of-parse sweep instead of warning
 * immediately — see that array's doc comment in {@link parseMermaid}.
 */
function applyClassToNode(
  nodes: Map<string, FlowNode>,
  pendingStyles: Map<string, NodeStylePatch>,
  classDefs: Map<string, NodeStylePatch>,
  pendingClassAssignments: Array<{ nodeIds: string[]; className: string }>,
  nodeId: string,
  className: string | null,
): void {
  if (!className) return;
  const patch = classDefs.get(className);
  if (!patch) {
    pendingClassAssignments.push({ nodeIds: [nodeId], className });
    return;
  }
  applyNodeStyle(nodes, pendingStyles, nodeId, patch);
}

/**
 * Parse a node statement like `A[Text]`, `B{Decision}`, or bare `C` —
 * including an optional inline class shorthand (`A[Text]:::crit` or bare
 * `A:::crit`), which {@link parseNodeRef} already handled at edge endpoints
 * but this standalone-declaration path did not (found via
 * `docs/markdown-mermaid-compliance-table.md` §5, logged in `TODO.md`).
 */
function parseNodeStatement(
  line: string,
): { id: string; label: string; labelRuns: LabelToken[]; shape: NodeShape; className: string | null } | null {
  const idMatch = line.match(/^([A-Za-z0-9_-]+)\s*(.*)$/);
  if (!idMatch) return null;
  const id = idMatch[1]!;
  let rest = idMatch[2]!.trim();

  // Optional inline class: `A[Text]:::crit` or `A:::crit`.
  let className: string | null = null;
  const classMatch = rest.match(/^(.*?):::\s*([A-Za-z0-9_-]+)\s*$/);
  if (classMatch) {
    className = classMatch[2]!;
    rest = classMatch[1]!.trim();
  }

  if (rest.length === 0) {
    return { id, label: id, labelRuns: [{ text: id }], shape: 'rect', className };
  }

  const atShape = parseAtShapeSyntax(rest);
  if (atShape) {
    return {
      id,
      label: atShape.label ?? id,
      labelRuns: atShape.labelRuns ?? [{ text: id }],
      shape: atShape.shape,
      className,
    };
  }

  for (const { open, close, shape } of SHAPE_BY_SYNTAX) {
    // Longest patterns first to avoid `(` matching `((`.
    if (rest.startsWith(open) && rest.endsWith(close)) {
      const inner = rest.slice(open.length, rest.length - close.length).trim();
      const parsed = parseLabel(stripQuotedLabel(inner));
      return { id, label: parsed.text, labelRuns: parsed.runs, shape, className };
    }
  }

  return null;
}

/** Parse a node reference at an edge endpoint: bare id or id with shape. */
function parseNodeRef(
  ref: string,
): { id: string; label: string; labelRuns: LabelToken[]; shape: NodeShape; className: string | null } | null {
  const trimmed = ref.trim();
  const idMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*(.*)$/);
  if (!idMatch) return null;
  const id = idMatch[1]!;
  let rest = idMatch[2]!.trim();

  // Optional inline class: `A[Text]:::crit` or `A:::crit`.
  let className: string | null = null;
  const classMatch = rest.match(/^(.*?):::\s*([A-Za-z0-9_-]+)\s*$/);
  if (classMatch) {
    className = classMatch[2]!;
    rest = classMatch[1]!.trim();
  }

  if (rest.length === 0) return { id, label: id, labelRuns: [{ text: id }], shape: 'rect', className };

  const atShape = parseAtShapeSyntax(rest);
  if (atShape) {
    return {
      id,
      label: atShape.label ?? id,
      labelRuns: atShape.labelRuns ?? [{ text: id }],
      shape: atShape.shape,
      className,
    };
  }

  for (const { open, close, shape } of SHAPE_BY_SYNTAX) {
    if (rest.startsWith(open) && rest.endsWith(close)) {
      const inner = rest.slice(open.length, rest.length - close.length).trim();
      const parsed = parseLabel(stripQuotedLabel(inner));
      return { id, label: parsed.text, labelRuns: parsed.runs, shape, className };
    }
  }
  return null;
}

interface ChainEdge {
  from: string;
  to: string;
  fromLabel: string;
  fromLabelRuns: LabelToken[];
  toLabel: string;
  toLabelRuns: LabelToken[];
  fromShape: NodeShape;
  toShape: NodeShape;
  fromClass: string | null;
  toClass: string | null;
  type: EdgeType;
  label: string | null;
  labelRuns: LabelToken[] | null;
}

/**
 * Try to match a mid-chain-label edge (`A-- text -->B`) starting at `start`,
 * where `line[start]` begins one of {@link MID_LABEL_FAMILIES}'s open
 * markers. Scans forward for that family's closing marker, itself only at
 * bracket depth 0 so a label can't swallow an unrelated later operator
 * through a stray bracket. Returns `null` if no closing marker follows
 * (e.g. a bare trailing `--` that isn't actually an edge).
 */
function matchMidLabelEdge(
  line: string,
  start: number,
): { type: EdgeType; end: number; label: string; labelRuns: LabelToken[] } | null {
  const family = MID_LABEL_FAMILIES.find((f) => line.startsWith(f.open, start));
  if (!family) return null;
  let depth = 0;
  let j = start + family.open.length;
  while (j < line.length) {
    if (depth === 0) {
      const closing = family.closings.find((c) => line.startsWith(c.token, j));
      if (closing) {
        const parsed = parseLabel(stripQuotedLabel(line.slice(start + family.open.length, j).trim()));
        return { type: closing.type, end: j + closing.token.length, label: parsed.text, labelRuns: parsed.runs };
      }
    }
    const ch = line[j]!;
    if (ch === '[' || ch === '(' || ch === '{') depth++;
    else if (ch === ']' || ch === ')' || ch === '}') depth = Math.max(0, depth - 1);
    j++;
  }
  return null;
}

/**
 * Parse a line as one or more edge statements: a plain `A --> B`, a labeled
 * `A -->|Yes| B` or `A-- Yes -->B`, a same-line chain (`A --> B --> C`),
 * and/or fan-out/fan-in via `&` (`A --> B & C`, `A & B --> C`). Returns
 * `null` if the line has no recognizable edge operator at all (so the caller
 * can fall back to treating it as a bare node declaration).
 *
 * Operators are only matched at bracket depth 0, so a node label containing
 * a literal `---`-like sequence (`A[Step 1 --- Step 2]`) is never mistaken
 * for an edge operator — the scanner tracks `[`/`(`/`{` nesting the same way
 * {@link joinBracketContinuations} does.
 */
function parseEdgeChain(line: string): ChainEdge[] | null {
  const matches: Array<{
    type: EdgeType;
    start: number;
    end: number;
    label: string | null;
    labelRuns: LabelToken[] | null;
  }> = [];
  let depth = 0;
  let i = 0;
  while (i < line.length) {
    if (depth === 0) {
      let op: { type: EdgeType; length: number } | null = null;
      for (const matcher of EDGE_OPERATORS) {
        const length = matcher.match(line, i);
        if (length !== null) {
          op = { type: matcher.type, length };
          break;
        }
      }
      if (op) {
        let end = i + op.length;
        let label: string | null = null;
        let labelRuns: LabelToken[] | null = null;
        const labelMatch = line.slice(end).match(/^\|([^|]*)\|/);
        if (labelMatch) {
          const parsed = parseLabel(stripQuotedLabel(labelMatch[1]!.trim()));
          label = parsed.text;
          labelRuns = parsed.runs;
          end += labelMatch[0].length;
        }
        matches.push({ type: op.type, start: i, end, label, labelRuns });
        i = end;
        continue;
      }
      const mid = matchMidLabelEdge(line, i);
      if (mid) {
        matches.push({ type: mid.type, start: i, end: mid.end, label: mid.label, labelRuns: mid.labelRuns });
        i = mid.end;
        continue;
      }
    }
    const ch = line[i]!;
    if (ch === '[' || ch === '(' || ch === '{') depth++;
    else if (ch === ']' || ch === ')' || ch === '}') depth = Math.max(0, depth - 1);
    i++;
  }
  if (matches.length === 0) return null;

  const segments: string[] = [];
  let cursor = 0;
  for (const m of matches) {
    segments.push(line.slice(cursor, m.start));
    cursor = m.end;
  }
  segments.push(line.slice(cursor));

  const nodeLists = segments.map((seg) => parseNodeList(seg));
  if (nodeLists.some((list) => list === null)) return null;

  const edges: ChainEdge[] = [];
  for (let k = 0; k < matches.length; k++) {
    const leftList = nodeLists[k]!;
    const rightList = nodeLists[k + 1]!;
    const { type, label, labelRuns } = matches[k]!;
    for (const left of leftList) {
      for (const right of rightList) {
        edges.push({
          from: left.id,
          to: right.id,
          fromLabel: left.label,
          fromLabelRuns: left.labelRuns,
          toLabel: right.label,
          toLabelRuns: right.labelRuns,
          fromShape: left.shape,
          toShape: right.shape,
          fromClass: left.className,
          toClass: right.className,
          type,
          label,
          labelRuns,
        });
      }
    }
  }
  return edges;
}

/** Split a node-list segment (`A & B & C`) into individual node references. */
function parseNodeList(
  segment: string,
): Array<{ id: string; label: string; labelRuns: LabelToken[]; shape: NodeShape; className: string | null }> | null {
  const parts = splitTopLevelAmpersand(segment);
  if (parts.length === 0) return null;
  const refs: Array<{ id: string; label: string; labelRuns: LabelToken[]; shape: NodeShape; className: string | null }> =
    [];
  for (const part of parts) {
    const ref = parseNodeRef(part);
    if (!ref) return null;
    refs.push(ref);
  }
  return refs;
}

/**
 * Split on `&` outside bracket nesting, so `&` inside a node's label text
 * (`A["Tom & Jerry"]`) isn't mistaken for the fan-out/fan-in list separator.
 */
function splitTopLevelAmpersand(segment: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of segment) {
    if (ch === '[' || ch === '(' || ch === '{') depth++;
    else if (ch === ']' || ch === ')' || ch === '}') depth = Math.max(0, depth - 1);
    if (ch === '&' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Error thrown for structurally invalid Mermaid input. */
export class MermaidParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MermaidParseError';
  }
}
