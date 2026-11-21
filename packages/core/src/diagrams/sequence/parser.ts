/**
 * Parser for Mermaid `sequenceDiagram`. Line-oriented and forgiving like the
 * other parsers: an unrecognized line is a warning, never a throw. Supported:
 * `participant`/`actor` (with `as` alias and an `@{...}` config whose `type`
 * and `alias` are read), `create`/`destroy`, the ten standard message arrows (`->`, `-->`,
 * `->>`, `-->>`, `<<->>`, `<<-->>`, `-x`, `--x`, `-)`, `--)`) with `+`/`-`
 * activation shorthand, `activate`/`deactivate`, `Note left of|right of|over`,
 * `loop`/`alt`/`opt`/`par`/`critical`/`break`/`rect` blocks with
 * `else`/`and`/`option` dividers, `box [colour] [title]` participant groups,
 * central connections `()` at either end of a message,
 * `autonumber [start [step]]`, `title`, `<br/>` line breaks and `#NN;` entity
 * codes. Half-arrows, actor menus (`link`/`links`) and `properties` are
 * recognized and warned about. Capped (hostile input) at 50 participants,
 * 500 items and 20 nested blocks.
 */

import { splitLines, splitStatements } from '../../parser/normalize-statements.js';
import { decodeMermaidEntities } from '../../parser/entities.js';
import { CSS_NAMED_COLORS } from '../../parser/css-named-colors.js';
import { participantKind } from './participant-kind.js';
import type { SequenceBlockKind, SequenceBox, SequenceDiagram, SequenceHead, SequenceItem, SequenceParticipant, SequenceParticipantKind } from './types.js';

export interface SequenceParseResult {
  ast: SequenceDiagram;
  warnings: string[];
}

const MAX_PARTICIPANTS = 50;
const MAX_ITEMS = 500;
const MAX_DEPTH = 20;
const MAX_TEXT = 300;

const BLOCKS: ReadonlySet<string> = new Set(['loop', 'alt', 'opt', 'par', 'critical', 'break', 'rect']);
const DIVIDERS: ReadonlySet<string> = new Set(['else', 'and', 'option']);

/** Message arrows, longest first so `-->>` wins over `->>`/`-->`. */
const ARROWS: ReadonlyArray<{ token: string; dashed: boolean; head: SequenceHead; both: boolean }> = [
  { token: '<<-->>', dashed: true, head: 'arrow', both: true },
  { token: '<<->>', dashed: false, head: 'arrow', both: true },
  { token: '-->>', dashed: true, head: 'arrow', both: false },
  { token: '->>', dashed: false, head: 'arrow', both: false },
  { token: '--x', dashed: true, head: 'cross', both: false },
  { token: '-x', dashed: false, head: 'cross', both: false },
  { token: '--)', dashed: true, head: 'open', both: false },
  { token: '-)', dashed: false, head: 'open', both: false },
  { token: '-->', dashed: true, head: 'none', both: false },
  { token: '->', dashed: false, head: 'none', both: false },
];

/** Decode `#59;` / `#infin;` style entity codes and `<br/>` breaks, and cap the length. */
export function cleanText(raw: string): string {
  return decodeMermaidEntities(raw.replace(/<br\s*\/?>/gi, '\n'))
    .trim()
    .slice(0, MAX_TEXT);
}

/** Find the first arrow in `head`, returning the text before it, the arrow and the text after. */
function splitArrow(head: string): { left: string; arrow: (typeof ARROWS)[number]; right: string } | undefined {
  for (let i = 1; i < head.length; i++) {
    for (const arrow of ARROWS) {
      if (head.startsWith(arrow.token, i)) return { left: head.slice(0, i), arrow, right: head.slice(i + arrow.token.length) };
    }
  }
  return undefined;
}

/** `rgb(r,g,b)` / `rgba(r,g,b,a)` -> hex, otherwise undefined. */
function parseColor(text: string): string | undefined {
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(text.trim());
  if (!m) return undefined;
  return [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** `hsl(h, s%, l%)` / `hsla(...)` -> hex (the CSS Color 4 conversion), otherwise undefined. */
function parseHsl(text: string): string | undefined {
  const inner = /^hsla?\(([^)]*)\)/.exec(text.trim())?.[1];
  const [hue, s, l] = (inner ?? '').trim().split(/[\s,/]+/);
  if (hue === undefined || !/^\d{1,3}(?:deg)?$/.test(hue) || !/^\d{1,3}%$/.test(s ?? '') || !/^\d{1,3}%$/.test(l ?? '')) return undefined;
  const h = parseInt(hue, 10) % 360;
  const sat = Math.min(100, parseInt(s as string, 10)) / 100;
  const light = Math.min(100, parseInt(l as string, 10)) / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number): number => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [channel(0), channel(8), channel(4)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * `box` header text -> title and fill, Mermaid's reading: a leading CSS colour (a name, `transparent`,
 * `rgb()`/`rgba()`/`hsl()`/`hsla()`) is the fill and the rest the title; anything else is all title, on a
 * transparent box. A `#hex` is not a colour here, as in Mermaid: it starts the title.
 */
function parseBoxHeader(rest: string): Omit<SequenceBox, 'participants'> {
  const text = rest.trim();
  const fn = /^((?:rgba?|hsla?)\s*\([^)]*\))\s*(.*)$/i.exec(text);
  if (fn) {
    const color = parseColor(fn[1] as string) ?? parseHsl(fn[1] as string);
    return color ? { label: cleanText(fn[2] as string), color } : { label: cleanText(text) };
  }
  const word = /^(\w+)\b\s*(.*)$/.exec(text);
  if (word) {
    const name = (word[1] as string).toLowerCase();
    if (name === 'transparent') return { label: cleanText(word[2] as string) };
    const color = CSS_NAMED_COLORS.get(name);
    if (color) return { label: cleanText(word[2] as string), color };
  }
  return { label: cleanText(text) };
}

export function parseSequence(text: string): SequenceParseResult {
  const warnings: string[] = [];
  const ast: SequenceDiagram = { participants: [], items: [] };
  const warned = new Set<string>();
  let sawHeader = false;
  let inFrontmatter = false;
  // `box` groups and blocks share `end`; only blocks produce items. 'skipped' is a block past MAX_DEPTH.
  const stack: Array<'box' | 'block' | 'skipped'> = [];
  /** The open `box`: participants first declared while it is open belong to it. */
  let openBox: SequenceBox | undefined;
  let blockDepth = 0;
  let auto: { next: number; step: number } | undefined;

  const warnOnce = (key: string, message: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push(message);
  };
  const push = (item: SequenceItem): void => {
    if (ast.items.length >= MAX_ITEMS) return warnOnce('items', `Sequence diagram limited to ${MAX_ITEMS} items; the rest were ignored.`);
    ast.items.push(item);
  };
  const find = (id: string): SequenceParticipant | undefined => ast.participants.find((p) => p.id === id);
  const declare = (id: string, label: string | undefined, actor: boolean, kind?: SequenceParticipantKind): void => {
    const existing = find(id);
    if (existing) {
      if (label !== undefined) existing.label = label;
      if (actor) existing.actor = true;
      if (kind !== undefined) existing.kind = kind;
      return;
    }
    if (ast.participants.length >= MAX_PARTICIPANTS) return warnOnce('participants', `Sequence diagram limited to ${MAX_PARTICIPANTS} participants; the rest were ignored.`);
    ast.participants.push({ id, label: label ?? id, actor, ...(kind ? { kind } : {}) });
    openBox?.participants.push(id);
  };
  const known = (id: string): boolean => find(id) !== undefined;

  /**
   * Parse `Name[@{...}] [as Alias]` (the `@{...}` config right after the name, as Mermaid writes it, or at the
   * end of the line). The label is the `as` text, else the config's `"alias"`, else the name: Mermaid's order.
   */
  const declareFrom = (rest: string, actor: boolean): void => {
    let body = rest.trim();
    const cfg = /@\{[^}]*\}/.exec(body);
    let isActor = actor;
    let configAlias: string | undefined;
    let kind: SequenceParticipantKind | undefined;
    if (cfg) {
      body = `${body.slice(0, cfg.index)} ${body.slice(cfg.index + cfg[0].length)}`.trim();
      configAlias = /"alias"\s*:\s*"([^"]*)"/.exec(cfg[0])?.[1];
      const type = /"type"\s*:\s*"([^"]*)"/.exec(cfg[0])?.[1];
      // The config's type wins over the keyword, as in Mermaid: `actor X@{ "type": "database" }` is a database.
      if (type === 'actor') isActor = true;
      else if (type !== undefined && type !== 'participant') {
        kind = participantKind(type);
        if (kind) isActor = false;
        else warnings.push(`Unknown participant type \`${type}\` drawn as a plain participant box.`);
      }
    }
    const as = /\s+as\s+/.exec(body);
    const id = (as ? body.slice(0, as.index) : body).trim();
    if (id === '') {
      warnings.push(`Participant without a name ignored: ${rest}`);
      return;
    }
    const label = as ? body.slice(as.index + as[0].length) : configAlias;
    declare(id, label !== undefined ? cleanText(label) : undefined, isActor, kind);
  };

  for (const rawLine of sequenceStatements(text)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (line === '---' && !sawHeader) {
      inFrontmatter = !inFrontmatter;
      warnOnce('frontmatter', 'Sequence diagram frontmatter/config is not supported and was ignored.');
      continue;
    }
    if (inFrontmatter) continue;
    if (!sawHeader) {
      sawHeader = true;
      if (/^sequenceDiagram\b/i.test(line)) continue;
    }

    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(participant|actor)\s+(.+)$/))) {
      declareFrom(m[2] as string, m[1] === 'actor');
    } else if ((m = line.match(/^(create|destroy)\s+(.+)$/))) {
      const kind = m[1] as 'create' | 'destroy';
      const typed = /^(participant|actor)\s+(.+)$/.exec(m[2] as string);
      const target = typed ? (typed[2] as string) : (m[2] as string);
      if (kind === 'create') declareFrom(target, typed?.[1] === 'actor');
      const id = (target.replace(/@\{.*\}\s*$/, '').split(/\s+as\s+/)[0] as string).trim();
      push({ type: kind, actor: id });
    } else if ((m = line.match(/^title\s*:?\s*(.*)$/))) {
      ast.title = cleanText(m[1] as string);
    } else if (/^acc(?:Title|Descr)\b/.test(line)) {
      // Accessibility metadata has no visual of its own in Mermaid either.
    } else if ((m = line.match(/^autonumber\b\s*(.*)$/))) {
      const nums = (m[1] as string).split(/\s+/).filter((t) => /^\d+$/.test(t)).map(Number);
      auto = (m[1] as string).trim() === 'off' ? undefined : { next: nums[0] ?? 1, step: nums[1] ?? 1 };
    } else if ((m = line.match(/^(activate|deactivate)\s+(.+)$/))) {
      const id = (m[2] as string).trim();
      declare(id, undefined, false);
      push({ type: m[1] as 'activate' | 'deactivate', actor: id });
    } else if ((m = line.match(/^note\s+(left of|right of|over)\s+([^:]+):(.*)$/i))) {
      const placement = (m[1] as string).toLowerCase().startsWith('left') ? 'left' : (m[1] as string).toLowerCase().startsWith('right') ? 'right' : 'over';
      const actors = (m[2] as string).split(',').map((a) => a.trim()).filter((a) => a.length > 0);
      for (const a of actors) declare(a, undefined, false);
      push({ type: 'note', placement, actors: placement === 'over' ? actors.slice(0, 2) : actors.slice(0, 1), text: cleanText(m[3] as string) });
    } else if ((m = line.match(/^box\b\s*(.*)$/)) && !splitArrow(line.split(':')[0] as string)) {
      // A box holds participant declarations only; one opened inside another simply takes over.
      openBox = { ...parseBoxHeader(m[1] as string), participants: [] };
      (ast.boxes ??= []).push(openBox);
      stack.push('box');
    } else if (/^end$/.test(line)) {
      const top = stack.pop();
      if (top === 'block') {
        blockDepth--;
        push({ type: 'blockEnd' });
      } else if (top === 'box') {
        openBox = undefined;
      } else if (top === undefined) {
        warnings.push('`end` without an open block ignored.');
      }
    } else if ((m = line.match(/^(\w+)\b\s*(.*)$/)) && BLOCKS.has(m[1] as string) && !splitArrow(line.split(':')[0] as string)) {
      if (blockDepth >= MAX_DEPTH) {
        warnOnce('depth', `Sequence blocks nested deeper than ${MAX_DEPTH} levels were ignored.`);
        stack.push('skipped');
        continue;
      }
      const kind = m[1] as SequenceBlockKind;
      const rest = m[2] as string;
      stack.push('block');
      blockDepth++;
      const color = kind === 'rect' ? parseColor(rest) : undefined;
      push({ type: 'blockStart', kind, label: kind === 'rect' ? '' : cleanText(rest), ...(color ? { color } : {}) });
    } else if ((m = line.match(/^(\w+)\b\s*(.*)$/)) && DIVIDERS.has(m[1] as string) && blockDepth > 0) {
      push({ type: 'blockElse', label: cleanText(m[2] as string) });
    } else if (/^(?:links?|properties|details)\b/.test(line)) {
      warnOnce('menu', 'Actor menus (`link`, `links`, `properties`) are not supported and were ignored.');
    } else if (line.includes(':') && splitArrow(line.slice(0, line.indexOf(':')))) {
      const colon = line.indexOf(':');
      const found = splitArrow(line.slice(0, colon)) as NonNullable<ReturnType<typeof splitArrow>>;
      let from = found.left.trim();
      let to = found.right.trim();
      // `()` right after the sender or right before the receiver (either side of a `+`/`-`): a central connection.
      const centralFrom = from.endsWith('()');
      if (centralFrom) from = from.slice(0, -2).trim();
      let centralTo = to.startsWith('()');
      if (centralTo) to = to.slice(2).trim();
      const activate = to.startsWith('+');
      const deactivate = to.startsWith('-');
      if (activate || deactivate) to = to.slice(1).trim();
      if (!centralTo && to.startsWith('()')) {
        centralTo = true;
        to = to.slice(2).trim();
      }
      if (from === '' || to === '') {
        warnings.push(`Unsupported line ignored: ${line}`);
        continue;
      }
      declare(from, undefined, false);
      declare(to, undefined, false);
      if (!known(from) || !known(to)) continue;
      const message: SequenceItem = {
        type: 'message',
        from,
        to,
        text: cleanText(line.slice(colon + 1)),
        dashed: found.arrow.dashed,
        head: found.arrow.head,
        both: found.arrow.both,
        activate,
        deactivate,
        ...(centralFrom || centralTo ? { central: centralFrom && centralTo ? 'both' : centralFrom ? 'from' : 'to' } : {}),
      };
      if (auto) {
        message.number = auto.next;
        auto.next += auto.step;
      }
      push(message);
    } else if (/[|\\/]-|-[|\\/]/.test(line) && line.includes(':')) {
      warnOnce('half', 'Half-arrow message types are not supported; those messages were ignored.');
    } else {
      warnings.push(`Unsupported line ignored: ${line}`);
    }
  }

  const open = stack.filter((s) => s === 'block').length;
  if (open > 0) {
    warnings.push(`${open} block(s) were never closed with \`end\`; closed automatically.`);
    for (let i = 0; i < open; i++) push({ type: 'blockEnd' });
  }
  return { ast, warnings };
}

/**
 * The diagram's statements, one per entry: physical lines (CRLF, CR, BOM handled) split on `;` the way
 * Mermaid's sequence grammar ends a statement (TODO R2.1), so `participant A;` declares `A` and
 * `A->>B: hi; B->>A: ho` is two messages. The YAML frontmatter before the header is passed through whole,
 * since its values are not statements.
 */
function sequenceStatements(text: string): string[] {
  const statements: string[] = [];
  let inFrontmatter = false;
  let started = false;
  for (const physical of splitLines(text)) {
    const trimmed = physical.trim();
    if (!started && trimmed === '---') {
      inFrontmatter = !inFrontmatter;
      statements.push(trimmed);
      continue;
    }
    if (inFrontmatter) {
      statements.push(trimmed);
      continue;
    }
    if (trimmed.length > 0 && !trimmed.startsWith('%%')) started = true;
    statements.push(...splitStatements(physical, { brackets: false, quotes: false, comments: false, entities: true }));
  }
  return statements;
}
