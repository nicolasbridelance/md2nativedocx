/**
 * Parser for Mermaid `stateDiagram`/`stateDiagram-v2` (grammar verified
 * against mermaid.js.org/syntax/stateDiagram.html, fetched 2026-09-09).
 * Line-oriented, same forgiving convention as `../../parser/parser.ts` and
 * `../class-diagram/parser.ts`.
 *
 * Supported:
 * - Transitions (`A --> B`, `A --> B : label`), start/end pseudostates (`[*]` as either endpoint: one start
 *   and one end per block, as in Mermaid, see {@link parseStateDiagram}), state naming (`state "Label" as
 *   id`), the alternate one-line description (`id : Description`), and choice/fork/join stereotypes
 *   (`state id <<choice|fork|join>>`).
 * - `direction TD|TB|LR|BT|RL` (same TB->TD normalization as flowchart); inside a composite state's block
 *   it is that composite's own direction ({@link StateNode.direction}), not the diagram's.
 * - Composite states (`state X { ... }`, nested to {@link MAX_DEPTH} levels): each state records the block
 *   it first appears in ({@link StateNode.parent}), as Mermaid does.
 * - Concurrency separators (a lone `--` inside a composite state): the block is split into
 *   {@link StateRegion}s.
 * - Notes, `note left|right of X` up to `end note` or `note left|right of X : text`, into
 *   {@link StateDiagram.notes}; as in Mermaid, a note names its state into existence.
 * - Styling: `classDef`, given through `class A, B name` or `A:::name`, and `style A props`, layered as
 *   Mermaid does (see the end of {@link parseStateDiagram}). Only `fill`, `stroke`, `color` (hex) and
 *   `font-weight` / `font-style` are kept (`../../parser/css-style.ts`).
 */

import { splitLines, splitStatements } from '../../parser/normalize-statements.js';
import { extractNodeStyle, parseCssStyleProps, type NodeStylePatch } from '../../parser/css-style.js';
import type { StateDiagram, StateNode, StateNodeKind, StateNote, StateRegion } from './types.js';

export interface StateDiagramParseResult {
  ast: StateDiagram;
  warnings: string[];
}

const STATE_ALIAS = /^state\s+"([^"]*)"\s+as\s+(\S+?)\s*(\{)?\s*$/i;
const STATE_DECL = /^state\s+(\S+)\s*(?:<<(choice|fork|join)>>)?\s*(\{)?\s*$/i;
const DESCRIPTION = /^(\S+)\s*:\s*(.+)$/;
const BARE_STATE = /^[\p{L}\p{N}_][\p{L}\p{N}_-]*$/u;
const NOTE_START = /^note\s+(left|right)\s+of\s+/i;

/**
 * `note left|right of X` (a block up to `end note`, `text` undefined) or `note left|right of X : text`, or
 * `null`. The state and the text are split at the first `:` rather than by one regular expression
 * (untrusted input, `security/detect-unsafe-regex`).
 */
function parseNoteStart(line: string): { side: 'left' | 'right'; for: string; text?: string } | null {
  const start = NOTE_START.exec(line);
  if (!start) return null;
  const side = start[1]!.toLowerCase() as 'left' | 'right';
  const rest = line.slice(start[0].length);
  const colon = rest.indexOf(':');
  const target = (colon === -1 ? rest : rest.slice(0, colon)).trim();
  if (target.length === 0 || /\s/.test(target)) return null;
  return colon === -1 ? { side, for: target } : { side, for: target, text: rest.slice(colon + 1) };
}

/** A note's text as lines: `<br>` breaks a line, as in Mermaid; each line trimmed, empty ones dropped. */
function noteLines(text: string): string[] {
  return text
    .split(/<br\s*\/?>/i)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
/** `State:::className`: the state (anything up to the `:::`) and the class name. */
const CLASS_SUFFIX = /([^\s:]+):::([\w-]+)/g;
/** The kinds a style is drawn on (start/end dots and fork/join bars keep their black). */
const STYLED_KINDS: ReadonlySet<StateNodeKind> = new Set(['normal', 'choice']);

/**
 * `classDef a,b props`, `class A, B name` or `style A props`, or `null`. Read by splitting at spaces rather
 * than with one regular expression (untrusted input, `security/detect-unsafe-regex`).
 */
function parseStyleStatement(
  line: string,
):
  | { kind: 'classDef'; names: string[]; patch: NodeStylePatch }
  | { kind: 'class'; ids: string[]; name: string }
  | { kind: 'style'; id: string; patch: NodeStylePatch }
  | null {
  const keyword = /^(classDef|class|style)\s/i.exec(line)?.[1]?.toLowerCase();
  if (keyword === undefined) return null;
  const rest = line.slice(keyword.length).trim();
  if (keyword === 'class') {
    // The class name is the last word; the states before it, separated by commas (spaces allowed).
    const lastSpace = rest.search(/\s\S+$/);
    if (lastSpace === -1) return null;
    const ids = rest
      .slice(0, lastSpace)
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    return ids.length > 0 ? { kind: 'class', ids, name: rest.slice(lastSpace).trim() } : null;
  }
  const space = rest.search(/\s/);
  if (space === -1) return null;
  const target = rest.slice(0, space);
  const patch = extractNodeStyle(parseCssStyleProps(rest.slice(space + 1)));
  if (keyword === 'style') return { kind: 'style', id: target, patch };
  return { kind: 'classDef', names: target.split(',').map((n) => n.trim()).filter((n) => n.length > 0), patch };
}

/** Deepest nesting of composite states kept; a block deeper than this holds its states in the last one kept. */
export const MAX_DEPTH = 32;

/** An open composite state block. */
interface Block {
  /** The composite state. */
  state: string;
  /** Where the states read now go: the composite, or its current region once a `--` split it. */
  scope: string;
  /** Its regions, once the first `--` was read. */
  regions: StateRegion[];
}

/**
 * Parse Mermaid state-diagram text. Never throws on malformed input.
 *
 * `[*]` follows Mermaid: within one block (the diagram, a composite state or one of its regions), every `[*]`
 * used as a source is the same start node, and every `[*]` used as a target the same end node.
 */
export function parseStateDiagram(text: string): StateDiagramParseResult {
  const warnings: string[] = [];
  const states = new Map<string, StateNode>();
  const transitions: StateDiagram['transitions'] = [];
  const regions: StateRegion[] = [];
  let direction: StateDiagram['direction'] = 'TD';

  // Open composite blocks, outermost first. Blocks past MAX_DEPTH are only counted (`ignoredDepth`), so
  // their `}` closes nothing kept.
  const blocks: Block[] = [];
  let ignoredDepth = 0;
  const scope = (): string | undefined => blocks[blocks.length - 1]?.scope;

  function getOrCreateState(id: string, kind: StateNodeKind = 'normal'): StateNode {
    let node = states.get(id);
    if (!node) {
      const parent = scope();
      node = { id, label: id, kind, ...(parent !== undefined ? { parent } : {}) };
      states.set(id, node);
    }
    return node;
  }

  // The start and end node of each block, keyed by `role` + block id ('' for the diagram).
  const pseudoOf = new Map<string, string>();
  let pseudoCounter = 0;
  function resolveEndpoint(endpoint: string, role: 'from' | 'to'): string {
    if (endpoint !== '[*]') {
      getOrCreateState(endpoint);
      return endpoint;
    }
    const key = `${role}:${scope() ?? ''}`;
    const known = pseudoOf.get(key);
    if (known !== undefined) return known;
    const id = `__pseudo_${pseudoCounter++}`;
    getOrCreateState(id, role === 'from' ? 'start' : 'end');
    pseudoOf.set(key, id);
    return id;
  }

  function openBlock(id: string): void {
    if (blocks.length >= MAX_DEPTH) {
      if (ignoredDepth === 0) warnings.push(`Composite states nested deeper than ${MAX_DEPTH} levels are drawn inside the last level kept.`);
      ignoredDepth++;
      return;
    }
    blocks.push({ state: id, scope: id, regions: [] });
  }

  /** A `--` in a composite's block: what came before is its first region (made now), what follows a new one. */
  function splitRegion(): void {
    const block = blocks[blocks.length - 1];
    if (!block) {
      warnings.push('Concurrency separator "--" outside a composite state ignored.');
      return;
    }
    if (ignoredDepth > 0) return;
    const region = (): StateRegion => {
      const r = { id: `__region_${regions.length}`, parent: block.state };
      regions.push(r);
      block.regions.push(r);
      return r;
    };
    if (block.regions.length === 0) {
      const first = region();
      for (const node of states.values()) if (node.parent === block.state) node.parent = first.id;
      for (const role of ['from', 'to']) {
        const known = pseudoOf.get(`${role}:${block.state}`);
        if (known !== undefined) {
          pseudoOf.delete(`${role}:${block.state}`);
          pseudoOf.set(`${role}:${first.id}`, known);
        }
      }
    }
    block.scope = region().id;
  }

  const notes: StateNote[] = [];
  /** A `note … of X` block being read, up to `end note`. */
  let openNote: StateNote | undefined;

  let inFrontmatter = false;
  let inAccDescrBlock = false;
  let sawHeader = false;
  let warnedFrontmatter = false;
  // Styling, resolved once every line is read: a `classDef` may come after the state that uses it.
  const classDefs = new Map<string, NodeStylePatch>();
  /** `class` / `:::` assignments, in source order (the order Mermaid layers them in). */
  const classRefs: Array<{ id: string; name: string }> = [];
  const inlineStyles = new Map<string, NodeStylePatch>();

  for (const rawLine of splitLines(text).flatMap((l) => splitStatements(l))) {
    let line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;

    if (line === '---' && !sawHeader) {
      inFrontmatter = !inFrontmatter;
      if (!warnedFrontmatter) {
        warnings.push('State diagram frontmatter/config is not supported and was ignored.');
        warnedFrontmatter = true;
      }
      continue;
    }
    if (inFrontmatter) continue;
    if (/^stateDiagram(?:-v2)?\b/i.test(line)) {
      sawHeader = true;
      continue;
    }
    sawHeader = true;

    // Accessibility metadata (`accTitle: ...`, `accDescr: ...` or an `accDescr { ... }` block) is
    // not drawn; it must not reach the `id : description` rule and become a state.
    if (inAccDescrBlock) {
      if (line.includes('}')) inAccDescrBlock = false;
      continue;
    }
    if (/^accTitle\b/i.test(line)) continue;
    if (/^accDescr\b/i.test(line)) {
      if (line.includes('{') && !line.includes('}')) inAccDescrBlock = true;
      continue;
    }

    // A note's text is taken as written, before comments and `:::` suffixes are stripped from the line.
    if (openNote) {
      if (/^end\s+note$/i.test(line)) {
        notes.push(openNote);
        openNote = undefined;
      } else {
        openNote.lines.push(...noteLines(line));
      }
      continue;
    }
    const note = parseNoteStart(line);
    if (note) {
      getOrCreateState(note.for);
      if (note.text === undefined) openNote = { lines: [], for: note.for, side: note.side };
      else notes.push({ lines: noteLines(note.text), for: note.for, side: note.side });
      continue;
    }

    // A trailing `%% comment` is not part of a label, and a `:::className` suffix on a state (`A:::hot`)
    // gives it a class: both come off before the transition/description rules read the line.
    const commentAt = line.indexOf('%%');
    if (commentAt > 0) line = line.slice(0, commentAt).trim();
    if (line.includes(':::')) {
      for (const m of line.matchAll(CLASS_SUFFIX)) if (m[1] !== '[*]') classRefs.push({ id: m[1]!, name: m[2]! });
      line = line.replace(/:::[\w-]+/g, '').trim();
    }

    const styling = parseStyleStatement(line);
    if (styling) {
      if (styling.kind === 'classDef') for (const name of styling.names) classDefs.set(name, { ...classDefs.get(name), ...styling.patch });
      else if (styling.kind === 'class') for (const id of styling.ids) classRefs.push({ id, name: styling.name });
      else inlineStyles.set(styling.id, { ...inlineStyles.get(styling.id), ...styling.patch });
      continue;
    }
    if (/^(?:classDef|class|style)\s/i.test(line)) {
      warnings.push(`Malformed styling statement ignored: ${line}`);
      continue;
    }

    if (line === '}') {
      if (ignoredDepth > 0) ignoredDepth--;
      else if (blocks.length > 0) blocks.pop();
      else warnings.push(`Unexpected "}" without a matching block opener: ${line}`);
      continue;
    }

    if (line === '--') {
      splitRegion();
      continue;
    }

    const dirMatch = line.match(/^direction\s+(TD|TB|LR|BT|RL)\b/i);
    if (dirMatch) {
      const requested = dirMatch[1]!.toUpperCase();
      const value = requested === 'TB' ? 'TD' : (requested as StateDiagram['direction']);
      // In a block, the composite's own direction; at the top level, the diagram's.
      const block = blocks[blocks.length - 1];
      if (block && ignoredDepth === 0) states.get(block.state)!.direction = value;
      else if (!block) direction = value;
      continue;
    }

    const aliasMatch = line.match(STATE_ALIAS);
    if (aliasMatch) {
      const label = aliasMatch[1] ?? '';
      const id = aliasMatch[2] ?? '';
      const node = getOrCreateState(id);
      node.label = label;
      if (aliasMatch[3] === '{') openBlock(id);
      continue;
    }

    const declMatch = line.match(STATE_DECL);
    if (declMatch) {
      const id = declMatch[1] ?? '';
      const kindWord = declMatch[2] as 'choice' | 'fork' | 'join' | undefined;
      const node = getOrCreateState(id, kindWord ?? 'normal');
      if (kindWord) node.kind = kindWord;
      if (declMatch[3] === '{') openBlock(id);
      continue;
    }

    // Split on the literal `-->` (and, for the target side, the literal
    // `:` label separator) rather than one combined regex spanning both
    // endpoints — a combined form trips eslint-plugin-security's
    // detect-unsafe-regex heuristic (same false positive `../quadrant/
    // parser.ts`'s POINT_TAIL comment already documents), even though it has
    // no actual nested-quantifier backtracking hazard.
    const arrowIdx = line.indexOf('-->');
    if (arrowIdx !== -1) {
      const fromToken = line.slice(0, arrowIdx).trim();
      const right = line.slice(arrowIdx + 3).trim();
      const colonIdx = right.indexOf(':');
      const toToken = (colonIdx === -1 ? right : right.slice(0, colonIdx)).trim();
      const label = colonIdx === -1 ? undefined : right.slice(colonIdx + 1).trim();
      if (fromToken.length > 0 && toToken.length > 0) {
        const from = resolveEndpoint(fromToken, 'from');
        const to = resolveEndpoint(toToken, 'to');
        transitions.push({ from, to, ...(label ? { label } : {}) });
        continue;
      }
    }

    const descMatch = line.match(DESCRIPTION);
    if (descMatch) {
      const id = descMatch[1] ?? '';
      const node = getOrCreateState(id);
      node.label = (descMatch[2] ?? '').trim();
      continue;
    }

    // A state declared by its name alone (`stateId`), as Mermaid allows.
    if (BARE_STATE.test(line)) {
      getOrCreateState(line);
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  if (blocks.length > 0) {
    warnings.push('One or more composite state blocks were not closed with a matching "}".');
  }
  if (openNote) {
    warnings.push(`A note for "${openNote.for}" was not closed with "end note"; it is kept up to the end of the diagram.`);
    notes.push(openNote);
  }

  // Styles, layered as Mermaid does: each class in the order it was given, then `style`. A class or a
  // `style` naming no state does nothing (it does not create one), as in Mermaid. `classDef default` (which
  // Mermaid 12.3's state parser rejects) applies first to every state that can be styled, as it does in a
  // flowchart or a class diagram.
  const undefinedNames = new Set<string>();
  const patches = new Map<string, NodeStylePatch>();
  const defaults = classDefs.get('default');
  if (defaults) for (const node of states.values()) if (STYLED_KINDS.has(node.kind)) patches.set(node.id, { ...defaults });
  for (const { id, name } of classRefs) {
    if (!states.has(id)) continue;
    const def = classDefs.get(name);
    if (!def) {
      undefinedNames.add(name);
      continue;
    }
    patches.set(id, { ...patches.get(id), ...def });
  }
  for (const [id, patch] of inlineStyles) if (states.has(id)) patches.set(id, { ...patches.get(id), ...patch });
  for (const [id, patch] of patches) {
    const node = states.get(id)!;
    if (patch.fill !== undefined) node.fill = patch.fill;
    if (patch.stroke !== undefined) node.stroke = patch.stroke;
    if (patch.color !== undefined) node.textColor = patch.color;
    if (patch.bold !== undefined) node.bold = patch.bold;
    if (patch.italic !== undefined) node.italic = patch.italic;
  }
  for (const name of undefinedNames) warnings.push(`classDef "${name}" referenced but not defined.`);

  return {
    ast: {
      direction,
      states: [...states.values()],
      transitions,
      ...(regions.length > 0 ? { regions } : {}),
      ...(notes.length > 0 ? { notes } : {}),
    },
    warnings,
  };
}
