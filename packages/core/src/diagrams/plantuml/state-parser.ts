/**
 * Parser for PlantUML state diagrams (`@startuml` ... `@enduml`), into the same AST as Mermaid's
 * `stateDiagram` (`../state-diagram/types.ts`), so layout and drawing are shared. Line-oriented and forgiving
 * like the other parsers: an unrecognized line is a warning, never a throw.
 *
 * Supported: transitions with `->`, `-->`, longer shafts, direction hints (`-up->`, `-left[#red]->`), styles
 * (`-[dashed]->`, ignored), heads `x->` / `->o` (drawn as plain arrows) and `: label`; `[*]` as a start or end
 * pseudo-state (one per occurrence, like Mermaid); history `[H]` / `[H*]` and `State[H*]` (drawn as small
 * states named H / H*); `state X`, `state "Label" as X`, `state X as "Label"`; stereotypes `<<choice>>`,
 * `<<fork>>`, `<<join>>`, `<<start>>`, `<<end>>` (other ones drawn as ordinary states); `X : text` and
 * `state X : text` as description lines under the name; composite states `state X { ... }` (nested boxes,
 * laid out in the diagram's direction as PlantUML does) and their concurrent regions `--` / `||`; one `[*]`
 * start and one end per block, as in PlantUML; `left to right direction`; notes `note left|right|top|bottom
 * of X` (one line after `:`, or a block up to `end note`). Ignored with a warning: floating notes and
 * `note on link`, hidden transitions, colours and inline styles,
 * `skinparam`, `<style>`, `hide` / `scale` / `title`..., preprocessor lines, `!include` (never followed).
 * Capped (hostile input): 300 states, 600 transitions, 20 description lines per state.
 */

import type { StateDiagram, StateNode, StateNodeKind, StateNote, StateRegion } from '../state-diagram/types.js';

export interface PlantUmlStateParseResult {
  ast: StateDiagram;
  warnings: string[];
}

const MAX_STATES = 300;
const MAX_TRANSITIONS = 600;
const MAX_DESCRIPTION = 20;
const MAX_LINE = 2000;
const MAX_NOTES = 100;
const MAX_NOTE_LINES = 50;
/** Deepest nesting of composite states kept; deeper blocks hold their states in the last one kept. */
const MAX_DEPTH = 32;

/** A state reference: `[*]`, `[H]`, `[H*]`, a quoted name, or a name (dots allowed: `A.X`), optionally `Name[H*]`. */
const NAME = String.raw`\[\*\]|\[H\*?\]|"[^"]+"|[\w.$À-￿]+(?:\[H\*?\])?`;
/** Shaft with an optional direction word and `[...]` style, and optional `x` / `o` heads. */
const TRANSITION = new RegExp(
  String.raw`^(?<a>${NAME})\s*x?-+(?<dir>up|down|left|right|u|d|l|r|le|ri|do)?(?<style>\[[^\]]*\])?-*>o?\s*(?<b>${NAME})\s*(?::(?<label>.*))?$`,
  'i',
);
/** The same, written right to left (`B <-- A`): the transition goes from the right-hand state. */
const REVERSED = new RegExp(
  String.raw`^(?<b>${NAME})\s*o?<-*(?<style>\[[^\]]*\])?(?<dir>up|down|left|right|u|d|l|r|le|ri|do)?-+x?\s*(?<a>${NAME})\s*(?::(?<label>.*))?$`,
  'i',
);
const PSEUDO: ReadonlyMap<string, StateNodeKind> = new Map([
  ['choice', 'choice'],
  ['fork', 'fork'],
  ['join', 'join'],
  ['start', 'start'],
  ['end', 'end'],
]);

const unquote = (s: string): string => s.trim().replace(/^"(.*)"$/, '$1');
/** `\n` in PlantUML text is a line break; a transition label or a state name is drawn on one line here. */
const oneLine = (s: string): string => s.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();

/** Parse PlantUML state-diagram text into the shared state AST. Never throws on malformed input. */
export function parsePlantUmlState(source: string): PlantUmlStateParseResult {
  const warnings: string[] = [];
  const warned = new Set<string>();
  const warnOnce = (key: string, message: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push(message);
  };
  const states = new Map<string, StateNode>();
  const transitions: StateDiagram['transitions'] = [];
  const regions: StateRegion[] = [];
  let direction: StateDiagram['direction'] = 'TD';

  /**
   * Open `{` blocks: a composite state (`scope` is where its states go: the state, or its current region
   * once `--` split it), a group whose states stay at its parent's level (`frame`, `package`...), or ignored
   * content (`skinparam`...).
   */
  type Block = { kind: 'state'; state: string; scope: string; regions: StateRegion[] } | { kind: 'group' } | { kind: 'skip' };
  const blocks: Block[] = [];
  const scope = (): string | undefined => {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i]!;
      if (block.kind === 'state') return block.scope;
    }
    return undefined;
  };
  const depth = (): number => blocks.filter((b) => b.kind === 'state').length;

  const state = (id: string, kind: StateNodeKind = 'normal'): StateNode | undefined => {
    const existing = states.get(id);
    if (existing) return existing;
    if (states.size >= MAX_STATES) {
      warnOnce('states', `State diagram limited to ${MAX_STATES} states; the rest were ignored.`);
      return undefined;
    }
    const parent = scope();
    const node: StateNode = { id, label: id, kind, ...(parent !== undefined ? { parent } : {}) };
    states.set(id, node);
    return node;
  };

  /** The innermost composite block, if the innermost open block is one. */
  const compositeBlock = (): Extract<Block, { kind: 'state' }> | undefined => {
    const block = blocks[blocks.length - 1];
    return block?.kind === 'state' ? block : undefined;
  };
  /** A `--` or `||`: what came before in the composite is its first region (made now), what follows a new one. */
  const splitRegion = (): void => {
    const block = compositeBlock();
    if (!block) {
      warnOnce('concurrent', 'Concurrent separators (`--`, `||`) outside a composite state are ignored.');
      return;
    }
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
  };
  const describe = (node: StateNode, text: string): void => {
    const lines = text.split(/\\n/).map((l) => l.trim()).filter((l) => l !== '');
    node.description = [...(node.description ?? []), ...lines].slice(0, MAX_DESCRIPTION);
  };

  let pseudo = 0;
  /** The start and end node of each block, keyed by `role` + block id ('' for the diagram). */
  const pseudoOf = new Map<string, string>();
  /** The node a transition end names: `[*]` the block's start (from) or end (to); `[H]` a new history state. */
  const endpoint = (raw: string, role: 'from' | 'to'): string | undefined => {
    const name = raw.trim();
    if (name === '[*]') {
      const key = `${role}:${scope() ?? ''}`;
      const known = pseudoOf.get(key);
      if (known !== undefined) return known;
      const id = `__pseudo_${pseudo++}`;
      if (!state(id, role === 'from' ? 'start' : 'end')) return undefined;
      pseudoOf.set(key, id);
      return id;
    }
    const history = /^(.*?)\[(H\*?)\]$/i.exec(name);
    if (history) {
      warnOnce('history', 'History states (`[H]`, `[H*]`) are drawn as small states named H / H*.');
      const id = `__history_${pseudo++}`;
      const node = state(id);
      if (!node) return undefined;
      node.label = (history[2] as string).toUpperCase();
      return id;
    }
    const id = unquote(name);
    return state(id) ? id : undefined;
  };

  /** Strip colours and inline styles (`#pink`, `#red-green;line:00FFFF`, `##[dashed]blue`). */
  const stripStyle = (s: string): string => s.replace(/##\[[^\]]*\][^\s{:]*/g, '').replace(/#[^\s{:]*/g, '').trim();

  let multi: RegExp | undefined;
  let inBlockComment = false;
  const notes: StateNote[] = [];
  /** A `note … of X` block being read, up to `end note`. */
  let openNote: StateNote | undefined;
  const addNote = (note: StateNote): void => {
    if (notes.length >= MAX_NOTES) {
      warnOnce('notes', `State diagram limited to ${MAX_NOTES} notes; the rest were ignored.`);
      return;
    }
    if (note.lines.length > MAX_NOTE_LINES) {
      warnOnce('noteLines', `Notes are limited to ${MAX_NOTE_LINES} lines; the rest were ignored.`);
      note.lines = note.lines.slice(0, MAX_NOTE_LINES);
    }
    notes.push(note);
  };
  /** A note's text as lines: PlantUML's `\n` breaks a line too. */
  const noteLines = (text: string): string[] =>
    text
      .split(/\\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '');

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim().slice(0, MAX_LINE);
    if (inBlockComment) {
      if (line.includes("'/")) inBlockComment = false;
      continue;
    }
    if (openNote) {
      if (/^end\s*note$/i.test(line)) {
        addNote(openNote);
        openNote = undefined;
      } else if (openNote.lines.length <= MAX_NOTE_LINES) {
        openNote.lines.push(...noteLines(line));
      }
      continue;
    }
    if (multi) {
      if (multi.test(line)) multi = undefined;
      continue;
    }
    if (line.length === 0 || line.startsWith("'")) continue;
    if (line.startsWith("/'")) {
      if (!line.includes("'/", 2)) inBlockComment = true;
      continue;
    }
    if (blocks[blocks.length - 1]?.kind === 'skip') {
      if (line.startsWith('}')) blocks.pop();
      else if (line.endsWith('{')) blocks.push({ kind: 'skip' });
      continue;
    }

    let m: RegExpMatchArray | null;
    if (/^@(start|end)uml\b/i.test(line)) {
      continue;
    } else if (line === '}') {
      if (blocks.length > 0) blocks.pop();
      else warnings.push('`}` without an open block ignored.');
    } else if (line === '--' || line === '||') {
      splitRegion();
    } else if (/^!include/i.test(line)) {
      warnOnce('include', '`!include` is not followed (it would read a file or a URL); its content is missing.');
    } else if (/^!/.test(line)) {
      warnOnce('preprocessor', 'PlantUML preprocessor lines (`!theme`, `!define`, variables...) are ignored.');
    } else if (/^skinparam\b/i.test(line)) {
      warnOnce('skinparam', '`skinparam` styling is ignored; the diagram uses the default look.');
      if (line.endsWith('{')) blocks.push({ kind: 'skip' });
    } else if (/^<style>/i.test(line)) {
      warnOnce('style', '`<style>` blocks are ignored; the diagram uses the default look.');
      if (!/<\/style>\s*$/i.test(line)) multi = /^<\/style>$/i;
    } else if (/^left\s+to\s+right\s+direction$/i.test(line)) {
      direction = 'LR';
    } else if (/^top\s+to\s+bottom\s+direction$/i.test(line)) {
      direction = 'TD';
    } else if (/^(?:hide|show|remove|scale|title|caption|header|footer|mainframe|set)\b/i.test(line)) {
      warnOnce('display', 'Display commands (`hide`, `scale`, `title`, ...) are ignored.');
    } else if (/^legend\b/i.test(line)) {
      warnOnce('legend', '`legend` blocks are ignored.');
      multi = /^end\s*legend$/i;
    } else if ((m = line.match(new RegExp(String.raw`^note\s+(left|right|top|bottom)\s+of\s+(${NAME})(.*)$`, 'i')))) {
      const side = (m[1] as string).toLowerCase() as StateNote['side'];
      const target = endpoint(m[2] as string, 'to');
      // A colour right after the state (`note left of A #pink`) is not drawn.
      const rest = (m[3] as string).replace(/^\s*#\S*/, '').trim();
      if (target === undefined) continue;
      if (rest.startsWith(':')) addNote({ lines: noteLines(rest.slice(1)), for: target, side });
      else if (rest === '') openNote = { lines: [], for: target, side };
      else warnings.push(`Unsupported part of a note ignored: ${line}`);
    } else if (/^[hr]?note\b/i.test(line)) {
      warnOnce('note', 'Floating notes and notes on links are not drawn in state diagrams.');
      // One-line notes have a `:` or a quoted text; the others run to `end note`.
      if (!/(?<!:):(?!:)/.test(line) && !/^[hr]?note\s+"[^"]*"/i.test(line)) multi = /^end\s*[hr]?note$/i;
    } else if ((m = line.match(new RegExp(String.raw`^state\s+(${NAME})(.*)$`, 'i')))) {
      let rest = (m[2] as string).trim();
      let id = unquote(m[1] as string);
      let label: string | undefined;
      const alias = new RegExp(String.raw`^as\s+(${NAME})\s*`, 'i').exec(rest);
      if (alias) {
        // `state "Long name" as L` / `state L as "Long name"`: the quoted side is the label.
        const other = alias[1] as string;
        if ((m[1] as string).startsWith('"')) [id, label] = [unquote(other), id];
        else label = unquote(other);
        rest = rest.slice(alias[0].length);
      }
      let kind: StateNodeKind = 'normal';
      const stereo = /<<\s*([\w*]+)\s*>>/.exec(rest);
      if (stereo) {
        const word = (stereo[1] as string).toLowerCase();
        const pseudoKind = PSEUDO.get(word);
        if (pseudoKind) kind = pseudoKind;
        else warnOnce('stereotype', `State stereotypes other than choice, fork, join, start and end (\`<<${stereo[1]}>>\`, ...) are drawn as ordinary states.`);
        rest = rest.replace(/<<.*?>>/g, '').trim();
      }
      rest = stripStyle(rest);
      const node = state(id, kind);
      if (!node) continue;
      if (kind !== 'normal') node.kind = kind;
      if (label !== undefined) node.label = oneLine(label);
      if (rest.startsWith(':')) {
        describe(node, rest.slice(1));
      } else if (rest.startsWith('{')) {
        if (/\}\s*$/.test(rest)) continue;
        if (depth() < MAX_DEPTH) blocks.push({ kind: 'state', state: id, scope: id, regions: [] });
        else {
          warnOnce('depth', `Composite states nested deeper than ${MAX_DEPTH} levels are drawn inside the last level kept.`);
          blocks.push({ kind: 'group' });
        }
      } else if (rest !== '') {
        warnings.push(`Unsupported part of a state declaration ignored: ${line}`);
      }
    } else if (/^(?:json|map|object)\s+\S+.*\{$/i.test(line)) {
      warnOnce('objects', 'JSON, map and object blocks in a state diagram are not drawn.');
      blocks.push({ kind: 'skip' });
    } else if ((m = line.match(/^(frame|folder|rectangle|package|node|cloud|together)\b.*\{$/i))) {
      warnOnce('group', `\`${(m[1] as string).toLowerCase()}\` groups are not drawn; their states are kept.`);
      blocks.push({ kind: 'group' });
    } else if ((m = line.match(TRANSITION) ?? line.match(REVERSED)) && m.groups) {
      const style = m.groups.style ?? '';
      if (/hidden/i.test(style)) {
        warnOnce('hidden', 'Hidden transitions (`-[hidden]->`) only steer PlantUML\'s layout; they are ignored.');
        continue;
      }
      if (style !== '') warnOnce('arrowstyle', 'Transition colours and styles (`-[#red,dashed]->`) are ignored.');
      if (/x-|>o/.test(line.replace(/:.*$/, ''))) warnOnce('heads', 'Transition ends `x` and `o` are drawn as plain arrows.');
      if (transitions.length >= MAX_TRANSITIONS) {
        warnOnce('transitions', `State diagram limited to ${MAX_TRANSITIONS} transitions; the rest were ignored.`);
        continue;
      }
      const from = endpoint(m.groups.a as string, 'from');
      const to = endpoint(m.groups.b as string, 'to');
      if (from === undefined || to === undefined) continue;
      const label = oneLine(m.groups.label ?? '');
      transitions.push(label === '' ? { from, to } : { from, to, label });
    } else if ((m = line.match(new RegExp(String.raw`^(${NAME})\s*:\s*(.*)$`)))) {
      const node = state(unquote(m[1] as string));
      if (node) describe(node, m[2] as string);
    } else {
      warnings.push(`Unsupported line ignored: ${line}`);
    }
  }

  if (openNote) {
    warnings.push(`A note for "${openNote.for}" was never closed with \`end note\`; it is kept up to the end of the diagram.`);
    addNote(openNote);
  }
  if (multi) warnings.push('A multi-line block (`note`, `legend`, `<style>`) was never closed; the rest was ignored.');
  if (blocks.length > 0) warnings.push('One or more `{` blocks were never closed; closed automatically.');
  // PlantUML lays a composite's content out in the diagram's direction (Mermaid, whose default the AST
  // follows, lays it top to bottom): say so on each composite.
  for (const node of states.values()) {
    if (node.parent === undefined) continue;
    const holder = states.get(node.parent) ?? states.get(regions.find((r) => r.id === node.parent)?.parent ?? '');
    if (holder) holder.direction = direction;
  }
  return {
    ast: { direction, states: [...states.values()], transitions, ...(regions.length > 0 ? { regions } : {}), ...(notes.length > 0 ? { notes } : {}) },
    warnings,
  };
}
