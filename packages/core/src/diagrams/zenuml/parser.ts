/**
 * Parser for Mermaid `zenuml` (the external `@mermaid-js/mermaid-zenuml` plugin,
 * a code-like syntax unrelated to `sequenceDiagram`'s). It produces the same AST
 * as `../sequence/parser.ts`, so `translateSequenceToOoxml` renders it unchanged.
 * Grammar transcribed from Mermaid's `docs/syntax/zenuml.md` (not verified
 * against the plugin's own ANTLR parser). Supported: `title`, participant
 * declarations (`Name`, `A as Alias`, `@Actor`/`@Database`/... annotators — only
 * `@Actor` changes the drawing), async messages `A->B: text`, sync calls
 * `A.method(args)` / `Client->A.method()` with `{ ... }` nesting (drawn with an
 * activation bar), `new A(args)`, replies (`a = A.m()`, `return x`, `@return`),
 * and the fragments `while|for|foreach|forEach|loop(...)`, `if(...)`/`else if`/
 * `else`, `opt`, `par`, `try`/`catch`/`finally`. A top-level call has no caller,
 * so it is drawn from an implicit leftmost `Starter` participant. `//` comments
 * are ignored. Capped (hostile input) at 50 participants, 500 items, 20 nested levels.
 */

import type { SequenceBlockKind, SequenceDiagram, SequenceItem, SequenceParticipant } from '../sequence/types.js';
import { cleanText } from '../sequence/parser.js';

export interface ZenumlParseResult {
  ast: SequenceDiagram;
  warnings: string[];
}

const MAX_PARTICIPANTS = 50;
const MAX_ITEMS = 500;
const MAX_DEPTH = 20;
const STARTER = '_starter';
const ID = String.raw`[A-Za-z_][\w]*`;

type Frame = { type: 'call'; target: string; caller: string } | { type: 'block' };

/** Split `a = A.m()` / `Type a = A.m()` into the variable name and the call; undefined when `line` is no assignment. */
function assignment(line: string): { variable: string; rest: string } | undefined {
  const eq = line.indexOf('=');
  if (eq === -1) return undefined;
  const words = line.slice(0, eq).trim().split(/\s+/);
  if (words.length > 2 || !words.every((w) => /^[\w<>[\]]+$/.test(w))) return undefined;
  const rest = line.slice(eq + 1).trim();
  return rest === '' ? undefined : { variable: words[words.length - 1] as string, rest };
}

export function parseZenuml(text: string): ZenumlParseResult {
  const warnings: string[] = [];
  const ast: SequenceDiagram = { participants: [], items: [] };
  const warned = new Set<string>();
  const stack: Frame[] = [];
  let sawHeader = false;
  let pendingReply = false;

  const warnOnce = (key: string, message: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push(message);
  };
  const push = (item: SequenceItem): void => {
    if (ast.items.length >= MAX_ITEMS) return warnOnce('items', `ZenUML diagram limited to ${MAX_ITEMS} items; the rest were ignored.`);
    ast.items.push(item);
  };
  const declare = (id: string, label?: string, actor = false): boolean => {
    const existing = ast.participants.find((p) => p.id === id);
    if (existing) {
      if (label !== undefined) existing.label = label;
      if (actor) existing.actor = true;
      return true;
    }
    if (ast.participants.length >= MAX_PARTICIPANTS) {
      warnOnce('participants', `ZenUML diagram limited to ${MAX_PARTICIPANTS} participants; the rest were ignored.`);
      return false;
    }
    const p: SequenceParticipant = { id, label: label ?? id, actor };
    if (id === STARTER) ast.participants.unshift(p);
    else ast.participants.push(p);
    return true;
  };
  const context = (): string => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const f = stack[i] as Frame;
      if (f.type === 'call') return f.target;
    }
    declare(STARTER, 'Starter');
    return STARTER;
  };
  const message = (from: string, to: string, label: string, dashed: boolean, activate: boolean): boolean => {
    if (!declare(from) || !declare(to)) return false;
    push({ type: 'message', from, to, text: cleanText(label), dashed, head: 'arrow', both: false, activate, deactivate: false });
    return true;
  };
  const open = (frame: Frame): boolean => {
    if (stack.length >= MAX_DEPTH) {
      warnOnce('depth', `ZenUML blocks nested deeper than ${MAX_DEPTH} levels were flattened.`);
      return false;
    }
    stack.push(frame);
    return true;
  };
  const block = (kind: SequenceBlockKind, label: string): void => {
    if (open({ type: 'block' })) push({ type: 'blockStart', kind, label: cleanText(label) });
  };

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (line.length === 0 || line.startsWith('//')) continue;
    if (!sawHeader) {
      sawHeader = true;
      if (/^zenuml\b/i.test(line)) continue;
    }

    let m: RegExpMatchArray | null;
    if ((m = line.match(/^title\s*:?\s*(.*)$/))) {
      ast.title = cleanText(m[1] as string);
      continue;
    }
    // `}` forms: plain close, or a close that continues with else / catch / finally.
    if (line.startsWith('}')) {
      if ((m = line.match(/^\}\s*else\s+if\s*\((.*)\)\s*\{$/))) push({ type: 'blockElse', label: cleanText(m[1] as string) });
      else if (/^\}\s*else\s*\{$/.test(line)) push({ type: 'blockElse', label: 'else' });
      else if ((m = line.match(/^\}\s*(catch|finally)\b.*\{$/))) push({ type: 'blockElse', label: m[1] as string });
      else if (line === '}') {
        const top = stack.pop();
        if (!top) warnings.push('`}` without an open block ignored.');
        else if (top.type === 'call') push({ type: 'deactivate', actor: top.target });
        else push({ type: 'blockEnd' });
      } else warnings.push(`Unsupported line ignored: ${line}`);
      continue;
    }

    const opens = line.endsWith('{');
    if (opens) line = line.slice(0, -1).trim();

    if (opens && (m = line.match(/^(?:while|for|foreach|forEach|loop)\s*\((.*)\)$/))) block('loop', m[1] as string);
    else if (opens && (m = line.match(/^if\s*\((.*)\)$/))) block('alt', m[1] as string);
    else if (opens && /^(?:opt|par|try)$/.test(line)) block(line === 'opt' ? 'opt' : line === 'par' ? 'par' : 'break', line === 'try' ? 'try' : '');
    else if ((m = line.match(/^return\b\s*(.*)$/))) {
      const call = [...stack].reverse().find((f): f is Extract<Frame, { type: 'call' }> => f.type === 'call');
      if (!call) warnings.push(`\`return\` outside a call ignored: ${line}`);
      else message(call.target, call.caller, m[1] as string, true, false);
    } else if (/^@(?:return|reply)$/.test(line)) {
      pendingReply = true;
    } else if ((m = line.match(new RegExp(String.raw`^@(\w+)\s+(${ID})(?:\s+as\s+(.+))?$`)))) {
      if (m[1]?.toLowerCase() !== 'actor') warnOnce('annotator', 'ZenUML participant annotators other than @Actor are drawn as plain participant boxes.');
      declare(m[2] as string, m[3] === undefined ? undefined : cleanText(m[3]), m[1]?.toLowerCase() === 'actor');
    } else if ((m = line.match(new RegExp(String.raw`^new\s+(${ID})\s*(\(.*\))?$`)))) {
      const from = context();
      if (declare(m[1] as string)) {
        push({ type: 'create', actor: m[1] as string });
        message(from, m[1] as string, `new ${m[1]}${m[2] ?? ''}`, false, false);
        if (opens) open({ type: 'call', target: m[1] as string, caller: from });
      }
    } else if (line.includes('->') || assignment(line) !== undefined || new RegExp(String.raw`^${ID}\.`).test(line)) {
      // Message forms; an assignment prefix (`a = ` / `Type a = `) adds a reply.
      let variable: string | undefined;
      const assign = assignment(line);
      if (assign) {
        variable = assign.variable;
        line = assign.rest;
      }
      const arrow = line.indexOf('->');
      const dashed = pendingReply;
      pendingReply = false;
      let from: string;
      let rest: string;
      if (arrow !== -1) {
        from = line.slice(0, arrow).trim();
        rest = line.slice(arrow + 2).trim();
      } else {
        from = context();
        rest = line;
      }
      const colon = rest.indexOf(':');
      const paren = rest.indexOf('(');
      let target: string;
      let label: string;
      if (colon !== -1 && (paren === -1 || colon < paren)) {
        target = rest.slice(0, colon).trim();
        label = rest.slice(colon + 1);
      } else {
        const dot = rest.indexOf('.');
        target = (dot === -1 ? rest : rest.slice(0, dot)).trim();
        label = dot === -1 ? '' : rest.slice(dot + 1);
      }
      if (!new RegExp(`^${ID}$`).test(from) || !new RegExp(`^${ID}$`).test(target)) {
        warnings.push(`Unsupported line ignored: ${line}`);
        continue;
      }
      const hasBody = opens;
      if (message(from, target, label, dashed, hasBody) && hasBody) open({ type: 'call', target, caller: from });
      else if (hasBody) open({ type: 'block' });
      if (variable !== undefined && !hasBody) message(target, from, variable, true, false);
    } else if ((m = line.match(new RegExp(String.raw`^(${ID})(?:\s+as\s+(.+))?$`))) && !opens) {
      declare(m[1] as string, m[2] === undefined ? undefined : cleanText(m[2]));
    } else {
      warnings.push(`Unsupported line ignored: ${rawLine.trim()}`);
      if (opens) open({ type: 'block' });
    }
  }

  while (stack.length > 0) {
    const f = stack.pop() as Frame;
    warnOnce('unclosed', 'Some blocks were never closed with `}`; closed automatically.');
    push(f.type === 'call' ? { type: 'deactivate', actor: f.target } : { type: 'blockEnd' });
  }
  return { ast, warnings };
}
