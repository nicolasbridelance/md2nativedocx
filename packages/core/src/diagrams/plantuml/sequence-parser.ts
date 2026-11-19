/**
 * Parser for PlantUML sequence diagrams (`@startuml` ... `@enduml`), into the same AST as Mermaid's
 * `sequenceDiagram` (`../sequence/types.ts`), so layout and translation are shared. Line-oriented and
 * forgiving like the other parsers: an unrecognized line is a warning, never a throw.
 *
 * Supported: participant kinds (`participant`, `actor`, `boundary`, `control`, `entity`, `database`,
 * `collections`, `queue`; all but `actor` drawn as boxes) with `as` aliases on either side, quoted names,
 * colours and `order` stripped; messages with `->`, `-->`, `->>` (async), `->x`, `->o`, `-\`, `-/`,
 * reversed `<-` / `<--`, two-way `<->`, an inline `[#colour]` (ignored), and the `++` / `--` / `**` / `!!`
 * shorthands; `return`; `activate` / `deactivate` / `create` / `destroy`; notes (`note left of|right of|over`,
 * `note left|right` on the last message, `note across`, `hnote` / `rnote`, single-line and `end note`
 * blocks); `ref over`; `alt` / `else` / `opt` / `loop` / `par` / `break` / `critical` / `group` ... `end`;
 * `== separators ==` (a note across the diagram); `title`; `autonumber`; `autoactivate on`; `partition`
 * (a group); multi-line participant names (`participant X [ ... ]`); an inline `A -> "Name" as B`; a colour
 * after the receiver (`B #red : text`, ignored). Drawn with a warning: slanted arrows `->(10)` (flat),
 * teoz parallel `&` messages (one after the other), `{anchor}` prefixes (kept, durations dropped), `/ note`
 * (as a plain note). Ignored with a warning: `box`, `skinparam`, `<style>`, `!theme`, `!include` (never
 * followed: it would read a file or a URL), other preprocessor lines, `newpage`, incoming / outgoing
 * messages (`[->`, `->]`, `?->`). Delays (`...`) and spaces (`|||`) are skipped. Capped like the Mermaid parser (hostile input): 50 participants, 500 items, 20 nested blocks.
 */

import { cleanText } from '../sequence/parser.js';
import type { SequenceBlockKind, SequenceDiagram, SequenceHead, SequenceItem, SequenceParticipant } from '../sequence/types.js';

export interface PlantUmlSequenceParseResult {
  ast: SequenceDiagram;
  warnings: string[];
}

const MAX_PARTICIPANTS = 50;
const MAX_ITEMS = 500;
const MAX_DEPTH = 20;
const MAX_LINE = 2000;

/** A declaration; not `Participant -> Bob`, a message from a participant that happens to be named like a keyword. */
const PARTICIPANT_KINDS = /^(participant|actor|boundary|control|entity|database|collections|queue)\s+(?![xo]?(?:<|\\|\/)*-)(.+)$/i;
const GROUPS: ReadonlyMap<string, SequenceBlockKind> = new Map([
  ['alt', 'alt'],
  ['opt', 'opt'],
  ['loop', 'loop'],
  ['par', 'par'],
  ['break', 'break'],
  ['critical', 'critical'],
  ['group', 'group'],
  ['partition', 'group'],
]);

/** A participant reference: a quoted name, or a run of characters that cannot start an arrow. */
const NAME = String.raw`"[^"]+"|[^\s"<>:\-\[\]?]+`;
/** Arrow: optional left head, a shaft of dashes with an optional `[#colour]`, optional right head. */
const ARROW = String.raw`([xo]?(?:<<?|\\\\?|\/\/?)?)(-+(?:\[[^\]]*\])?-*)((?:>>?|\\\\?|\/\/?)?[xo]?)`;
const MESSAGE = new RegExp(
  String.raw`^(?<from>${NAME}|\[|\?)?\s*${ARROW}\s*(?<to>${NAME}|\]|\?)?(?:\s+as\s+(?<alias>${NAME}))?\s*(?<color1>#\w+)?\s*(?<mods>(?:\+\+|--|\*\*|!!)(?:\s*(?:\+\+|--|\*\*|!!))*)?\s*(?<color2>#\w+)?\s*(?::(?<text>.*))?$`,
);
/** `participant Id [` opening a multi-line display name, closed by a lone `]`. */
const MULTILINE_PARTICIPANT = new RegExp(String.raw`^(participant|actor|boundary|control|entity|database|collections|queue)\s+(${NAME})\s*\[$`, 'i');

/** The `Id as Label` / `"Label" as Id` pair: which side is the id, which the label. */
function idAndLabel(first: string, second: string | undefined): [string, string | undefined] {
  if (second === undefined) return [unquote(first), undefined];
  return first.startsWith('"') && !second.startsWith('"') ? [second, unquote(first)] : [unquote(first), unquote(second)];
}

/** A multi-line participant name: `=Title` heading markers, `----` rules and `""monospace""` marks dropped. */
const multilineName = (body: string): string =>
  body
    .split('\n')
    .map((l) => l.trim().replace(/^=+\s*/, '').replace(/""/g, ''))
    .filter((l) => l !== '' && !/^[-=.]{2,}$/.test(l))
    .join('\\n');

const unquote = (s: string): string => s.trim().replace(/^"(.*)"$/, '$1');

/** `\n` in PlantUML text is a line break; the Mermaid cleaner handles `<br>` and entity codes. */
const text = (raw: string): string => cleanText(raw.replace(/\\n/g, '<br/>'));

/** Parse PlantUML sequence-diagram text into the shared sequence AST. Never throws on malformed input. */
export function parsePlantUmlSequence(source: string): PlantUmlSequenceParseResult {
  const warnings: string[] = [];
  const ast: SequenceDiagram = { participants: [], items: [] };
  const warned = new Set<string>();
  const stack: Array<'group' | 'box'> = [];
  let groupDepth = 0;
  let auto: { next: number; step: number } | undefined;
  let lastMessage: Extract<SequenceItem, { type: 'message' }> | undefined;
  /** Who called whom, for `return` and `--`: pushed when a message activates its receiver. */
  const calls: Array<{ caller: string; callee: string }> = [];
  /** An open multi-line block (`note ... end note`, `ref ... end ref`, `legend ... endlegend`, skinparam `{}`). */
  let multi: { end: RegExp; lines: string[]; emit?: (body: string) => void } | undefined;
  let inBlockComment = false;
  /** `autoactivate on`: a solid message activates its receiver, a dashed reply from the callee ends it. */
  let autoActivate = false;

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
  const declare = (id: string, label?: string, actor = false): boolean => {
    const existing = find(id);
    if (existing) {
      if (label !== undefined) existing.label = label;
      if (actor) existing.actor = true;
      return true;
    }
    if (ast.participants.length >= MAX_PARTICIPANTS) {
      warnOnce('participants', `Sequence diagram limited to ${MAX_PARTICIPANTS} participants; the rest were ignored.`);
      return false;
    }
    ast.participants.push({ id, label: label ?? id, actor });
    return true;
  };

  /** `Name`, `"Long name" as Id`, `Id as "Long name"`, then `#colour`, `<<stereotype>>`, `order N`. */
  const declareFrom = (kind: string, rest: string): string | undefined => {
    const body = rest
      .replace(/<<.*?>>/g, '')
      .replace(/\s+order\s+-?\d+\s*$/i, '')
      .replace(/\s+#\S+\s*$/, '')
      .trim();
    if (!/^(participant|actor)$/i.test(kind)) {
      warnOnce('ptype', 'Participant kinds (boundary, control, entity, database, collections, queue) are drawn as plain participant boxes.');
    }
    const m = new RegExp(String.raw`^(${NAME})(?:\s+as\s+(${NAME}))?$`).exec(body);
    if (!m) {
      warnings.push(`Participant ignored: ${rest}`);
      return undefined;
    }
    // `"Long name" as Id`: the quoted side is the label. `Id as "Long name"` / `Id as Label`: the first is the id.
    const [id, label] = idAndLabel(m[1] as string, m[2]);
    return declare(id, label === undefined ? undefined : text(label), kind.toLowerCase() === 'actor') ? id : undefined;
  };

  const message = (from: string, to: string, msgText: string, dashed: boolean, head: SequenceHead, both: boolean, activate: boolean, deactivate: boolean): void => {
    if (!declare(from) || !declare(to)) return;
    const item: Extract<SequenceItem, { type: 'message' }> = { type: 'message', from, to, text: text(msgText), dashed, head, both, activate, deactivate };
    if (auto) {
      item.number = auto.next;
      auto.next += auto.step;
    }
    push(item);
    lastMessage = item;
  };

  const noteOver = (actors: string[], body: string): void => {
    const known = actors.filter((a) => declare(a));
    if (known.length > 0) push({ type: 'note', placement: 'over', actors: known.slice(0, 2), text: text(body) });
  };
  /** Over the whole diagram: resolved after parsing, once every participant is known. */
  const ACROSS = '\u0000across';
  const noteAcross = (body: string): void => push({ type: 'note', placement: 'over', actors: [ACROSS], text: text(body) });

  const notePlaced = (spec: string, body: string): boolean => {
    let m: RegExpExecArray | null;
    if ((m = /^(left|right)\s+(.+)$/i.exec(spec))) {
      // `note left of A` and the shorter `note left A`.
      const id = unquote(((m[2] as string).replace(/^of\s+/i, '').split(',')[0] as string));
      if (declare(id)) push({ type: 'note', placement: (m[1] as string).toLowerCase() as 'left' | 'right', actors: [id], text: text(body) });
    } else if ((m = /^over\s+(.+)$/i.exec(spec))) {
      noteOver((m[1] as string).split(',').map(unquote), body);
    } else if (/^across$/i.test(spec)) {
      noteAcross(body);
    } else if ((m = /^(left|right)$/i.exec(spec)) && lastMessage) {
      const side = (m[1] as string).toLowerCase() as 'left' | 'right';
      const anchor = side === 'left' ? lastMessage.from : lastMessage.to;
      push({ type: 'note', placement: side, actors: [anchor], text: text(body) });
    } else {
      return false;
    }
    return true;
  };

  for (const rawLine of source.split(/\r?\n/)) {
    let line = rawLine.trim().slice(0, MAX_LINE);

    if (inBlockComment) {
      if (line.includes("'/")) inBlockComment = false;
      continue;
    }
    if (multi) {
      if (multi.end.test(line)) {
        multi.emit?.(multi.lines.join('\n'));
        multi = undefined;
      } else if (multi.lines.length < 50) {
        multi.lines.push(line);
      }
      continue;
    }
    if (line.length === 0 || line.startsWith("'")) continue;
    if (line.startsWith("/'")) {
      if (!line.includes("'/", 2)) inBlockComment = true;
      continue;
    }

    // Prefixes that only change placement in PlantUML's own renderer; the line itself is kept.
    if (line.startsWith('&')) {
      // teoz: this message runs at the same time as the previous one.
      warnOnce('parallel', 'Parallel messages (`&`) are drawn one after the other.');
      line = line.slice(1).trim();
    }
    if (/^\/\s*[hr]?note\b/i.test(line)) line = line.slice(1).trim(); // a note aligned with the previous one
    let m: RegExpMatchArray | null;
    if (/^\{[^}]*\}\s*<?-+>?\s*\{[^}]*\}/.test(line)) {
      warnOnce('anchor', 'Duration anchors (`{start}` ... `{end}`) are not drawn.');
      continue;
    }
    if ((m = /^\{[^}]*\}\s*/.exec(line))) {
      warnOnce('anchor', 'Duration anchors (`{start}` ... `{end}`) are not drawn.');
      line = line.slice(m[0].length);
    }
    {
      // Slanted arrows `->(10)` / `(10)<-`: drawn flat. Only the part before the message text is touched.
      const colon = line.indexOf(':');
      const head = colon === -1 ? line : line.slice(0, colon);
      const flat = head.replace(/(-+>{1,2})\(\d+\)/, '$1').replace(/\(\d+\)(<{1,2}-+)/, '$1');
      if (flat !== head) {
        warnOnce('slanted', 'Slanted arrows (`->(10)`) are drawn flat.');
        line = flat + (colon === -1 ? '' : line.slice(colon));
      }
    }

    if (/^@(start|end)uml\b/i.test(line)) {
      continue;
    } else if (/^!include/i.test(line)) {
      warnOnce('include', '`!include` is not followed (it would read a file or a URL); its content is missing.');
    } else if (/^!/.test(line)) {
      warnOnce('preprocessor', 'PlantUML preprocessor lines (`!theme`, `!define`, variables...) are ignored.');
    } else if (/^skinparam\b/i.test(line)) {
      warnOnce('skinparam', '`skinparam` styling is ignored; the diagram uses the default look.');
      if (line.endsWith('{')) multi = { end: /^\}$/, lines: [] };
    } else if (/^<style>/i.test(line)) {
      warnOnce('style', '`<style>` blocks are ignored; the diagram uses the default look.');
      if (!/<\/style>\s*$/i.test(line)) multi = { end: /^<\/style>$/i, lines: [] };
    } else if ((m = line.match(/^autoactivate\s+(on|off)$/i))) {
      autoActivate = (m[1] as string).toLowerCase() === 'on';
    } else if (/^(hide|show|scale|mainframe|header|footer|caption|newpage|ignore\s+newpage|left to right|top to bottom)\b/i.test(line)) {
      warnOnce('display', 'Page and display commands (`hide`, `header`, `footer`, `newpage`, ...) are ignored.');
    } else if (/^legend\b/i.test(line)) {
      warnOnce('legend', '`legend` blocks are ignored.');
      multi = { end: /^end\s*legend$/i, lines: [] };
    } else if ((m = line.match(/^title\s*:?\s*(.*)$/i))) {
      if ((m[1] as string).trim() === '') multi = { end: /^end\s*title$/i, lines: [], emit: (b) => (ast.title = text(b)) };
      else ast.title = text(m[1] as string);
    } else if ((m = line.match(/^autonumber\b\s*(.*)$/i))) {
      const arg = (m[1] as string).trim().toLowerCase();
      if (arg === 'stop') auto = undefined;
      else if (arg.startsWith('resume')) auto = auto ?? { next: 1, step: 1 };
      else {
        const nums = arg.split(/\s+/).filter((t) => /^\d+$/.test(t)).map(Number);
        auto = { next: nums[0] ?? 1, step: nums[1] ?? 1 };
      }
    } else if ((m = line.match(MULTILINE_PARTICIPANT))) {
      const id = declareFrom(m[1] as string, m[2] as string);
      multi = { end: /^\]$/, lines: [], emit: (b) => id !== undefined && declare(id, text(multilineName(b))) };
    } else if ((m = line.match(PARTICIPANT_KINDS))) {
      declareFrom(m[1] as string, m[2] as string);
    } else if ((m = line.match(/^create\s+(.+)$/i))) {
      const typed = PARTICIPANT_KINDS.exec(m[1] as string);
      const id = typed ? declareFrom(typed[1] as string, typed[2] as string) : declareFrom('participant', m[1] as string);
      if (id) push({ type: 'create', actor: id });
    } else if ((m = line.match(/^(activate|deactivate|destroy)\s+(\S+)/i))) {
      const id = unquote(m[2] as string);
      if (!declare(id)) continue;
      const verb = (m[1] as string).toLowerCase();
      if (verb === 'destroy') push({ type: 'destroy', actor: id });
      else push({ type: verb as 'activate' | 'deactivate', actor: id });
      if (verb === 'activate' && lastMessage && lastMessage.to === id) calls.push({ caller: lastMessage.from, callee: id });
      if (verb !== 'activate') {
        const i = calls.map((c) => c.callee).lastIndexOf(id);
        if (i !== -1) calls.splice(i, 1);
      }
    } else if ((m = line.match(/^return\b\s*(.*)$/i))) {
      const call = calls.pop();
      if (call) message(call.callee, call.caller, m[1] as string, true, 'arrow', false, false, true);
      else warnings.push(`\`return\` without an active call ignored: ${line}`);
    } else if ((m = line.match(/^[hr]?note\s+(.+?)\s*:(.*)$/i))) {
      if (!notePlaced((m[1] as string).replace(/\s+#\S+$/, '').trim(), m[2] as string)) warnings.push(`Unsupported note ignored: ${line}`);
    } else if ((m = line.match(/^[hr]?note\s+(.+)$/i))) {
      const spec = (m[1] as string).replace(/\s+#\S+$/, '').trim();
      multi = {
        end: /^end\s*[hr]?note$/i,
        lines: [],
        emit: (b) => {
          if (!notePlaced(spec, b)) warnings.push(`Unsupported note ignored: note ${spec}`);
        },
      };
    } else if ((m = line.match(/^ref\s+over\s+(.+?)\s*:(.*)$/i))) {
      noteOver((m[1] as string).split(',').map(unquote), `ref: ${(m[2] as string).trim()}`);
    } else if ((m = line.match(/^ref\s+over\s+(.+)$/i))) {
      const actors = (m[1] as string).split(',').map(unquote);
      multi = { end: /^end\s*ref$/i, lines: [], emit: (b) => noteOver(actors, `ref: ${b}`) };
    } else if ((m = line.match(/^==+\s*(.*?)\s*==+$/))) {
      noteAcross(m[1] as string);
    } else if (/^\.\.\./.test(line) || /^\|\|\d*\|*$/.test(line)) {
      // A delay or extra space: no vertical gap of its own here, the diagram just goes on.
    } else if (/^box\b/i.test(line)) {
      stack.push('box');
      warnOnce('box', 'Participant `box` groups are not drawn; their participants are kept.');
    } else if (/^end\s*box$/i.test(line)) {
      if (stack[stack.length - 1] === 'box') stack.pop();
    } else if (/^end$/i.test(line)) {
      const top = stack.pop();
      if (top === 'group') {
        groupDepth--;
        push({ type: 'blockEnd' });
      } else if (top === undefined) {
        warnings.push('`end` without an open group ignored.');
      }
    } else if ((m = line.match(/^(\w+)\b\s*(.*)$/)) && GROUPS.has((m[1] as string).toLowerCase()) && !/^\w+\s*-/.test(line)) {
      if (groupDepth >= MAX_DEPTH) {
        warnOnce('depth', `Sequence groups nested deeper than ${MAX_DEPTH} levels were ignored.`);
        stack.push('box');
        continue;
      }
      stack.push('group');
      groupDepth++;
      push({ type: 'blockStart', kind: GROUPS.get((m[1] as string).toLowerCase()) as SequenceBlockKind, label: text((m[2] as string).replace(/^#\S+\s*/, '')) });
    } else if ((m = line.match(/^else\b\s*(.*)$/i)) && groupDepth > 0) {
      push({ type: 'blockElse', label: text((m[1] as string).replace(/^#\S+\s*/, '')) });
    } else if ((m = line.match(MESSAGE)) && ((m[2] ?? '') !== '' || (m[4] ?? '') !== '')) {
      const fromRaw = m.groups?.from;
      const toRaw = m.groups?.to;
      if (fromRaw === undefined || toRaw === undefined || /^[[\]?]$/.test(fromRaw) || /^[[\]?]$/.test(toRaw)) {
        warnOnce('boundary', 'Incoming and outgoing messages (`[->`, `->]`, `?->`) are not drawn.');
        continue;
      }
      const leftHead = m[2] ?? '';
      const shaft = m[3] as string;
      const rightHead = m[4] ?? '';
      if (/\[/.test(shaft) || m.groups?.color1 !== undefined || m.groups?.color2 !== undefined) {
        warnOnce('arrowcolor', 'Arrow colours and styles (`-[#red]>`, `#red`) are ignored.');
      }
      // The receiving end is the side with a head; with heads on both sides (`<->`) the message goes left
      // to right and is drawn two-way.
      const reversed = leftHead !== '' && rightHead === '';
      const both = /[<\\/]/.test(leftHead) && /[>\\/]/.test(rightHead);
      const receivingHead = reversed ? leftHead : rightHead;
      if (/o/.test(leftHead + rightHead)) warnOnce('circle', 'Circle arrow ends (`->o`, `o->`) are drawn as plain arrows.');
      const head: SequenceHead = /x/.test(receivingHead) ? 'cross' : /<<|>>|[\\/]/.test(receivingHead) ? 'open' : 'arrow';
      const a = unquote(fromRaw);
      // `A -> "Long name" as L` declares the receiver inline, like `participant "Long name" as L`.
      const [b, bLabel] = idAndLabel(toRaw, m.groups?.alias);
      // Left-hand name first, so the columns keep source order.
      if (bLabel !== undefined && (!declare(a) || !declare(b, text(bLabel)))) continue;
      const from = reversed ? b : a;
      const to = reversed ? a : b;
      const mods = m.groups?.mods ?? '';
      const dashed = /--/.test(shaft.replace(/\[[^\]]*\]/g, ''));
      if (mods.includes('**')) {
        if (declare(to)) push({ type: 'create', actor: to });
      }
      const top = calls[calls.length - 1];
      const autoReply = autoActivate && mods === '' && dashed && top?.callee === from && top.caller === to;
      // `**` (create) still activates under autoactivate; `!!` (destroy) does not.
      const activate = mods.includes('++') || (autoActivate && !/\+\+|--|!!/.test(mods) && !dashed && from !== to);
      const deactivate = mods.includes('--') || autoReply;
      message(from, to, m.groups?.text ?? '', dashed, head, both, activate, deactivate);
      if (activate) calls.push({ caller: from, callee: to });
      if (deactivate) {
        const i = calls.map((c) => c.callee).lastIndexOf(from);
        if (i !== -1) calls.splice(i, 1);
      }
      if (mods.includes('!!')) push({ type: 'destroy', actor: to });
    } else {
      warnings.push(`Unsupported line ignored: ${line}`);
    }
  }

  if (multi) warnings.push('A multi-line block (`note`, `ref`, `legend`, ...) was never closed; its text was dropped.');
  const open = stack.filter((s) => s === 'group').length;
  if (open > 0) {
    warnings.push(`${open} group(s) were never closed with \`end\`; closed automatically.`);
    for (let i = 0; i < open; i++) push({ type: 'blockEnd' });
  }

  // Notes across the diagram (`note across`, `== separator ==`) span the first to the last participant.
  const first = ast.participants[0]?.id;
  const last = ast.participants[ast.participants.length - 1]?.id;
  ast.items = ast.items.flatMap((item): SequenceItem[] => {
    if (item.type !== 'note' || item.actors[0] !== ACROSS) return [item];
    if (first === undefined || last === undefined) return [];
    return [{ ...item, actors: first === last ? [first] : [first, last] }];
  });
  return { ast, warnings };
}
