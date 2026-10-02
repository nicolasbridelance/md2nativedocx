/**
 * Parser for Mermaid `sequenceDiagram`. Line-oriented and forgiving like the
 * other parsers: an unrecognized line is a warning, never a throw. Supported:
 * `participant`/`actor` (with `as` alias and an `@{...}` config that is
 * stripped), `create`/`destroy`, the ten standard message arrows (`->`, `-->`,
 * `->>`, `-->>`, `<<->>`, `<<-->>`, `-x`, `--x`, `-)`, `--)`) with `+`/`-`
 * activation shorthand, `activate`/`deactivate`, `Note left of|right of|over`,
 * `loop`/`alt`/`opt`/`par`/`critical`/`break`/`rect` blocks with
 * `else`/`and`/`option` dividers, `box` groups (parsed, not drawn),
 * `autonumber [start [step]]`, `title`, `<br/>` line breaks and `#NN;` entity
 * codes. Half-arrows, central connections `()`, actor menus (`link`/`links`)
 * and `properties` are recognized and warned about. Capped (hostile input) at
 * 50 participants, 500 items and 20 nested blocks.
 */

import type { SequenceBlockKind, SequenceDiagram, SequenceHead, SequenceItem, SequenceParticipant } from './types.js';

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

/** Decode `#59;` style entity codes and `<br/>` breaks, and cap the length. */
export function cleanText(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/#(\d{1,6});/g, (whole, code: string) => {
      const n = Number(code);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : whole;
    })
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

export function parseSequence(text: string): SequenceParseResult {
  const warnings: string[] = [];
  const ast: SequenceDiagram = { participants: [], items: [] };
  const warned = new Set<string>();
  let sawHeader = false;
  let inFrontmatter = false;
  // 'box' groups share `end` with blocks; only blocks produce items.
  const stack: Array<'box' | 'block'> = [];
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
  const declare = (id: string, label: string | undefined, actor: boolean): void => {
    const existing = find(id);
    if (existing) {
      if (label !== undefined) existing.label = label;
      if (actor) existing.actor = true;
      return;
    }
    if (ast.participants.length >= MAX_PARTICIPANTS) return warnOnce('participants', `Sequence diagram limited to ${MAX_PARTICIPANTS} participants; the rest were ignored.`);
    ast.participants.push({ id, label: label ?? id, actor });
  };
  const known = (id: string): boolean => find(id) !== undefined;

  /** Parse `Name [as Alias] [@{...}]`. */
  const declareFrom = (rest: string, actor: boolean): void => {
    let body = rest.trim();
    const cfg = /@\{.*\}\s*$/.exec(body);
    let isActor = actor;
    if (cfg) {
      body = body.slice(0, cfg.index).trim();
      if (/"type"\s*:\s*"actor"/.test(cfg[0])) isActor = true;
      else warnOnce('ptype', 'Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.');
    }
    const as = /\s+as\s+/.exec(body);
    const id = (as ? body.slice(0, as.index) : body).trim();
    if (id === '') {
      warnings.push(`Participant without a name ignored: ${rest}`);
      return;
    }
    declare(id, as ? cleanText(body.slice(as.index + as[0].length)) : undefined, isActor);
  };

  for (const rawLine of text.split(/\r?\n/)) {
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
    } else if (/^box\b/.test(line)) {
      stack.push('box');
      warnOnce('box', 'Participant `box` groups are not drawn; their participants are kept.');
    } else if (/^end$/.test(line)) {
      const top = stack.pop();
      if (top === 'block') {
        blockDepth--;
        push({ type: 'blockEnd' });
      } else if (top === undefined) {
        warnings.push('`end` without an open block ignored.');
      }
    } else if ((m = line.match(/^(\w+)\b\s*(.*)$/)) && BLOCKS.has(m[1] as string) && !splitArrow(line.split(':')[0] as string)) {
      if (blockDepth >= MAX_DEPTH) {
        warnOnce('depth', `Sequence blocks nested deeper than ${MAX_DEPTH} levels were ignored.`);
        stack.push('box');
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
      if (from.endsWith('()') || to.startsWith('()')) {
        warnOnce('central', 'Central connections `()` are not supported; the message is drawn lifeline to lifeline.');
        from = from.replace(/\(\)$/, '').trim();
        to = to.replace(/^\(\)/, '').trim();
      }
      const activate = to.startsWith('+');
      const deactivate = to.startsWith('-');
      if (activate || deactivate) to = to.slice(1).trim();
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
