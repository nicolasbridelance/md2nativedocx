/**
 * Parser for Mermaid's railroad diagrams, in its four dialects:
 *
 * - `railroad-beta`: the function form, `name = sequence(terminal("a"), nonterminal("b")) ;`;
 * - `railroad-ebnf-beta`: EBNF, `name = "a" | b , [ c ] { d } e? f* g+ h - i ;` (`::=` also accepted);
 * - `railroad-abnf-beta`: ABNF, `name = "a" / b 1*( c ) [ d ] %x41-5A ;`;
 * - `railroad-peg-beta`: PEG, `Name <- "a" / B &C !D E? F* G+ . ;`.
 *
 * The accepted syntax follows Mermaid's documentation (`docs/syntax/railroad.md`) and the usual notations
 * (ISO 14977 EBNF, RFC 5234 ABNF, Ford's PEG). This module is this project's own work (CC0): a hand-written
 * lexer and recursive-descent parser. The tree it builds: a group of one element is that element; an EBNF
 * exception `a - b` is `a` followed by a special "except b"; a PEG lookahead `&a` / `!a` is a special
 * "if a" / "not a"; the PEG `.` is a special "any character"; an ABNF `0*1x` is an optional.
 *
 * Syntax errors never throw, since the input is untrusted: a rule ends at its `;` or where the next rule
 * starts (`name =`, `name ::=`, `Name <-` on a later token), so a missing `;` loses nothing, and a rule with an
 * unexpected token keeps what was read before it, with a warning. Also accepted: a PEG character class
 * `[a-z]` (a terminal) and an ABNF `name =/ ...` (more alternatives for an earlier rule). Hostile input is
 * capped: {@link MAX_RULES} rules, {@link MAX_NODES} nodes, {@link MAX_DEPTH} levels of nesting.
 */

import type { RailroadDiagram, RailroadDialect, RailroadNode, RailroadRule } from './types.js';

/** What {@link parseRailroad} returns: the diagram and the problems it skipped over. */
export interface RailroadParseResult {
  ast: RailroadDiagram;
  warnings: string[];
}

/** Most rules read; later ones are dropped with a warning. */
export const MAX_RULES = 200;
/** Most nodes over all rules; rules past the cap are dropped with a warning. */
export const MAX_NODES = 3000;
/** Deepest nesting of groups/functions; deeper content is replaced by `…`. */
export const MAX_DEPTH = 40;
/** Most EBNF postfix operators read after one element. */
const MAX_POSTFIX = 4;

const HEADER = /^railroad(?:-(ebnf|abnf|peg))?-beta\b/i;

type TokKind = 'id' | 'str' | 'special' | 'numval' | 'repeat' | 'class' | 'p' | 'meta';
interface Tok {
  k: TokKind;
  v: string;
  /** For `meta`: which statement. */
  key?: 'title' | 'accTitle' | 'accDescr';
}

/** Decode `\n`, `\r`, `\t` and `\x` (any other character) inside a quoted string, quotes removed. */
function decodeString(quoted: string): string {
  const content = quoted.slice(1, -1);
  let out = '';
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '\\' && i + 1 < content.length) {
      i++;
      const e = content[i];
      out += e === 'n' ? '\n' : e === 'r' ? '\r' : e === 't' ? '\t' : e;
      continue;
    }
    out += ch;
  }
  return out;
}

function unquoteTitle(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t.endsWith(t[0])) return decodeString(t);
  return t;
}

/** Split the body (the text after the header) into tokens for `dialect`. */
function tokenize(body: string, dialect: RailroadDialect, warnings: string[]): Tok[] {
  const toks: Tok[] = [];
  const idRe = dialect === 'abnf' ? /[A-Za-z][A-Za-z0-9-]*/y : /[A-Za-z_][\w-]*/y;
  let i = 0;
  let lineStart = true;
  let warnedChar = false;
  const at = (re: RegExp): RegExpExecArray | null => {
    re.lastIndex = i;
    return re.exec(body);
  };

  while (i < body.length) {
    const ch = body[i] ?? '';
    if (ch === '\n') {
      lineStart = true;
      i++;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }
    // Comments.
    if (body.startsWith('%%', i) || (dialect === 'peg' && ch === '#')) {
      while (i < body.length && body[i] !== '\n') i++;
      continue;
    }
    if ((dialect === 'ir' || dialect === 'ebnf') && body.startsWith('/*', i)) {
      const end = body.indexOf('*/', i + 2);
      i = end < 0 ? body.length : end + 2;
      continue;
    }
    if (dialect === 'ebnf' && body.startsWith('(*', i)) {
      const end = body.indexOf('*)', i + 2);
      i = end < 0 ? body.length : end + 2;
      continue;
    }

    // `title`, `accTitle:`, `accDescr` at the start of a line (and not a rule named `title`).
    if (lineStart) {
      const rest = body.slice(i, body.indexOf('\n', i) < 0 ? body.length : body.indexOf('\n', i));
      const title = /^title(?:[\t ]+(.*)|)$/.exec(rest);
      if (title && !/^title\s*(?:=|::=|<-)/.test(rest)) {
        toks.push({ k: 'meta', key: 'title', v: unquoteTitle((title[1] ?? '').replace(/%%.*$/, '')) });
        i += rest.length;
        continue;
      }
      const accTitle = /^accTitle[\t ]*:(.*)$/.exec(rest);
      if (accTitle) {
        toks.push({ k: 'meta', key: 'accTitle', v: (accTitle[1] ?? '').replace(/%%.*$/, '').trim() });
        i += rest.length;
        continue;
      }
      const accBlock = at(/accDescr\s*\{([^}]*)\}/y);
      if (accBlock) {
        toks.push({ k: 'meta', key: 'accDescr', v: (accBlock[1] ?? '').trim() });
        i += accBlock[0].length;
        continue;
      }
      const accDescr = /^accDescr[\t ]*:(.*)$/.exec(rest);
      if (accDescr) {
        toks.push({ k: 'meta', key: 'accDescr', v: (accDescr[1] ?? '').replace(/%%.*$/, '').trim() });
        i += rest.length;
        continue;
      }
    }
    lineStart = false;

    // ABNF: `;` ends the rule and starts a comment to the end of the line.
    if (dialect === 'abnf' && ch === ';') {
      toks.push({ k: 'p', v: ';' });
      while (i < body.length && body[i] !== '\n') i++;
      continue;
    }

    // Strings.
    if (ch === '"' || (ch === "'" && dialect !== 'abnf')) {
      const m = dialect === 'abnf' ? at(/"[^"\n]*"/y) : at(ch === '"' ? /"(?:[^"\\\n]|\\.)*"/y : /'(?:[^'\\\n]|\\.)*'/y);
      if (m) {
        toks.push({ k: 'str', v: dialect === 'abnf' ? m[0].slice(1, -1) : decodeString(m[0]) });
        i += m[0].length;
      } else {
        // Unterminated: the rest of the line is the string.
        const end = body.indexOf('\n', i);
        const raw = body.slice(i + 1, end < 0 ? body.length : end);
        warnings.push('Railroad: a string has no closing quote; it runs to the end of its line.');
        toks.push({ k: 'str', v: raw });
        i = end < 0 ? body.length : end;
      }
      continue;
    }

    if (dialect === 'ebnf' && ch === '?') {
      // `? text ?` is a special sequence when a second `?` closes it within the rule (before any `;`) and
      // something other than blanks sits in between; otherwise this `?` is the "optional" postfix.
      let close = i + 1;
      while (close < body.length && body[close] !== '?' && body[close] !== ';') close++;
      const inner = body.slice(i + 1, close);
      if (body[close] === '?' && inner.trim().length > 0) {
        toks.push({ k: 'special', v: inner.trim() });
        i = close + 1;
        continue;
      }
    }

    if (dialect === 'abnf') {
      // `%x41`, `%x41-5A`, `%d13.10` (flat character class: no nested quantifier).
      const num = at(/%[xXdDbB][0-9A-Fa-f][0-9A-Fa-f.-]*/y);
      if (num) {
        toks.push({ k: 'numval', v: num[0] });
        i += num[0].length;
        continue;
      }
      const rep = at(/[0-9]*\*[0-9]*|[0-9]+/y);
      if (rep) {
        toks.push({ k: 'repeat', v: rep[0] });
        i += rep[0].length;
        continue;
      }
    }

    if (dialect === 'peg' && ch === '[') {
      const m = at(/\[(?:[^\]\\\n]|\\.)*\]/y);
      if (m) {
        toks.push({ k: 'class', v: m[0] });
        i += m[0].length;
        continue;
      }
    }

    const id = at(idRe);
    if (id) {
      toks.push({ k: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }

    const punct = at(dialect === 'abnf' ? /=\/|[=;/()[\]-]/y : /::=|<-|[=;|/,()[\]{}?*+\-&!.]/y);
    if (punct) {
      toks.push({ k: 'p', v: punct[0] });
      i += punct[0].length;
      continue;
    }

    if (!warnedChar) warnings.push(`Railroad: unexpected character "${ch}" ignored.`);
    warnedChar = true;
    i++;
  }
  return toks;
}

const DEFINE: Record<RailroadDialect, ReadonlySet<string>> = {
  ir: new Set(['=']),
  ebnf: new Set(['=', '::=']),
  abnf: new Set(['=', '=/']),
  peg: new Set(['<-']),
};

const seqOf = (elements: RailroadNode[]): RailroadNode =>
  elements.length === 1 && elements[0] ? elements[0] : { type: 'sequence', elements };
const choiceOf = (alternatives: RailroadNode[]): RailroadNode =>
  alternatives.length === 1 && alternatives[0] ? alternatives[0] : { type: 'choice', alternatives };
const ELLIPSIS: RailroadNode = { type: 'special', text: '…' };

/** Recursive-descent parser over the tokens of one dialect. */
class RuleParser {
  pos = 0;
  depth = 0;
  nodes = 0;
  warnedDepth = false;

  constructor(
    private readonly toks: Tok[],
    private readonly dialect: RailroadDialect,
    private readonly warnings: string[],
  ) {}

  peek(offset = 0): Tok | undefined {
    return this.toks[this.pos + offset];
  }

  isP(v: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t?.k === 'p' && t.v === v;
  }

  /** Whether the next tokens start a new rule (`name =`). */
  atRuleStart(): boolean {
    const a = this.peek();
    const b = this.peek(1);
    return a?.k === 'id' && b?.k === 'p' && DEFINE[this.dialect].has(b.v);
  }

  node<T extends RailroadNode>(n: T): T {
    this.nodes++;
    return n;
  }

  /** Enter one nesting level; `false` (with one warning) past {@link MAX_DEPTH}. */
  enter(): boolean {
    if (this.depth >= MAX_DEPTH) {
      if (!this.warnedDepth) this.warnings.push(`Railroad nesting limited to ${MAX_DEPTH} levels; deeper parts are shown as "…".`);
      this.warnedDepth = true;
      return false;
    }
    this.depth++;
    return true;
  }

  expect(v: string): void {
    if (this.isP(v)) this.pos++;
    else this.warnings.push(`Railroad: expected "${v}".`);
  }

  /** The definition after `=`, per dialect. */
  definition(): RailroadNode {
    return this.dialect === 'ir' ? (this.irExpression() ?? this.node({ type: 'sequence', elements: [] })) : this.choice();
  }

  // ---- EBNF / ABNF / PEG ----

  choice(): RailroadNode {
    const sep = this.dialect === 'ebnf' ? '|' : '/';
    const alternatives = [this.sequence()];
    while (this.isP(sep)) {
      this.pos++;
      alternatives.push(this.sequence());
    }
    return alternatives.length === 1 && alternatives[0] ? alternatives[0] : this.node({ type: 'choice', alternatives });
  }

  sequence(): RailroadNode {
    const elements: RailroadNode[] = [];
    for (;;) {
      if (this.atRuleStart()) break;
      if (this.dialect === 'ebnf' && elements.length > 0 && this.isP(',')) this.pos++;
      const term = this.term();
      if (!term) break;
      elements.push(term);
    }
    return elements.length === 1 && elements[0] ? elements[0] : this.node({ type: 'sequence', elements });
  }

  /** One element with its prefix/postfix operators, or `undefined` when the next token starts none. */
  term(): RailroadNode | undefined {
    if (this.dialect === 'abnf') {
      const rep = this.peek();
      if (rep?.k === 'repeat') {
        this.pos++;
        const inner = this.primary();
        if (!inner) return this.node({ type: 'terminal', value: rep.v });
        const { min, max } = abnfRepeat(rep.v);
        if (min === 0 && max === 1) return this.node({ type: 'optional', element: inner });
        return this.node({ type: 'repeat', element: inner, min, max });
      }
      return this.primary();
    }
    if (this.dialect === 'peg' && (this.isP('&') || this.isP('!'))) {
      const op = this.peek()?.v ?? '!';
      this.pos++;
      const inner = this.pegSuffix();
      const word = op === '&' ? 'if' : 'not';
      return this.node({ type: 'special', text: inner ? `${word} ${summary(inner)}` : word });
    }
    if (this.dialect === 'peg') return this.pegSuffix();

    // EBNF: primary followed by `?`, `*`, `+`, `- primary` (at most MAX_POSTFIX of them, which keeps the
    // tree shallow on hostile input such as a thousand `?`; more add nothing to the drawing).
    let node = this.primary();
    if (!node) return undefined;
    for (let ops = 0; ops < MAX_POSTFIX; ops++) {
      if (this.isP('?')) node = this.node({ type: 'optional', element: node });
      else if (this.isP('*')) node = this.node({ type: 'repeat', element: node, min: 0, max: Infinity });
      else if (this.isP('+')) node = this.node({ type: 'repeat', element: node, min: 1, max: Infinity });
      else if (this.isP('-')) {
        this.pos++;
        const except = this.primary();
        if (!except) {
          this.warnings.push('Railroad: an EBNF exception "-" has nothing after it.');
          return node;
        }
        node = this.node({ type: 'sequence', elements: [node, this.node({ type: 'special', text: `except ${summary(except)}` })] });
        continue;
      } else break;
      this.pos++;
    }
    return node;
  }

  pegSuffix(): RailroadNode | undefined {
    const inner = this.primary();
    if (!inner) return undefined;
    if (this.isP('?')) {
      this.pos++;
      return this.node({ type: 'optional', element: inner });
    }
    if (this.isP('*') || this.isP('+')) {
      const min = this.isP('+') ? 1 : 0;
      this.pos++;
      return this.node({ type: 'repeat', element: inner, min, max: Infinity });
    }
    return inner;
  }

  primary(): RailroadNode | undefined {
    const t = this.peek();
    // Past the node cap, stop reading: the rule-level loop skips the rest of the rule.
    if (!t || this.atRuleStart() || this.nodes > MAX_NODES) return undefined;
    switch (t.k) {
      case 'str':
      case 'numval':
      case 'class':
        this.pos++;
        return this.node({ type: 'terminal', value: t.v });
      case 'special':
        this.pos++;
        return this.node({ type: 'special', text: t.v });
      case 'id':
        this.pos++;
        return this.node({ type: 'nonterminal', name: t.v });
      case 'p':
        break;
      default:
        return undefined;
    }
    if (this.dialect === 'peg' && t.v === '.') {
      this.pos++;
      return this.node({ type: 'special', text: 'any character' });
    }
    const close: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const closer = close[t.v];
    if (!closer || (t.v === '{' && this.dialect !== 'ebnf') || (t.v === '[' && this.dialect === 'peg')) return undefined;
    this.pos++;
    if (!this.enter()) {
      this.skipGroup(t.v, closer);
      return ELLIPSIS;
    }
    const inner = this.choice();
    this.depth--;
    this.expect(closer);
    if (t.v === '[') return this.node({ type: 'optional', element: inner });
    if (t.v === '{') return this.node({ type: 'repeat', element: inner, min: 0, max: Infinity });
    return inner;
  }

  /** Skip to the matching closer of a group that is too deep (or to the end of the rule). */
  skipGroup(open: string, closer: string): void {
    let level = 1;
    while (this.pos < this.toks.length && !this.isP(';')) {
      if (this.isP(open)) level++;
      else if (this.isP(closer) && --level === 0) {
        this.pos++;
        return;
      }
      this.pos++;
    }
  }

  // ---- railroad-beta (function form) ----

  irExpression(): RailroadNode | undefined {
    const t = this.peek();
    if (!t || this.nodes > MAX_NODES) return undefined;
    if (t.k === 'str') {
      this.pos++;
      return this.node({ type: 'terminal', value: t.v });
    }
    if (t.k !== 'id' || this.atRuleStart()) return undefined;
    const fn = t.v;
    if (!this.isP('(', 1)) {
      // A bare name: a reference to a rule.
      this.pos++;
      return this.node({ type: 'nonterminal', name: fn });
    }
    this.pos += 2;
    if (!this.enter()) {
      this.skipGroup('(', ')');
      return ELLIPSIS;
    }
    const args: RailroadNode[] = [];
    const strings: string[] = [];
    while (this.pos < this.toks.length && !this.isP(')') && !this.isP(';')) {
      const s = this.peek();
      if (s?.k === 'str' && (this.isP(',', 1) || this.isP(')', 1))) strings.push(s.v);
      const arg = this.irExpression();
      if (!arg) break;
      args.push(arg);
      if (this.isP(',')) this.pos++;
      else break;
    }
    this.depth--;
    this.expect(')');
    const text = strings[0] ?? (args[0] ? summary(args[0]) : '');
    switch (fn) {
      case 'terminal':
        return this.node({ type: 'terminal', value: text });
      case 'nonterminal':
        return this.node({ type: 'nonterminal', name: text });
      case 'special':
        return this.node({ type: 'special', text });
      case 'sequence':
        return seqOf(args);
      case 'choice':
        return choiceOf(args);
      case 'optional':
        return this.node({ type: 'optional', element: seqOf(args) });
      case 'oneOrMore':
        return this.node({ type: 'repeat', element: seqOf(args), min: 1, max: Infinity });
      case 'zeroOrMore':
        return this.node({ type: 'repeat', element: seqOf(args), min: 0, max: Infinity });
      default:
        this.warnings.push(`Railroad: unknown function "${fn}()" drawn as a sequence of its arguments.`);
        return seqOf(args);
    }
  }
}

/** An ABNF repeat prefix (RFC 5234 §3.6–3.7): `*` = 0..∞, `1*` = 1..∞, `2*5` = 2..5, `3` = exactly 3. */
function abnfRepeat(repeat: string): { min: number; max: number } {
  if (repeat.includes('*')) {
    const [a = '', b = ''] = repeat.split('*');
    return { min: a ? parseInt(a, 10) : 0, max: b ? parseInt(b, 10) : Infinity };
  }
  const exact = parseInt(repeat, 10);
  return { min: exact, max: exact };
}

/** Longest text {@link summary} returns before it shortens with `…`. */
const SUMMARY_MAX = 40;

/**
 * A one-line text for a whole subtree, used where a node is shown as text inside one box (a PEG lookahead,
 * an EBNF exception): `"a"`, `name`, `a b`, `a | b`, `[a]`, `{a}`, `a+`. Shortened past {@link SUMMARY_MAX}.
 */
function summary(node: RailroadNode): string {
  const walk = (n: RailroadNode): string => {
    switch (n.type) {
      case 'terminal':
        return `"${n.value}"`;
      case 'nonterminal':
        return n.name;
      case 'special':
        return n.text;
      case 'sequence':
        return n.elements.map((e) => (e.type === 'choice' ? `(${walk(e)})` : walk(e))).join(' ');
      case 'choice':
        return n.alternatives.map(walk).join(' | ');
      case 'optional':
        return `[${walk(n.element)}]`;
      case 'repeat':
        return n.min === 0 ? `{${walk(n.element)}}` : `(${walk(n.element)})+`;
    }
  };
  const text = walk(node);
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;
}

/**
 * Parse a railroad diagram in any of its four dialects (the header decides). Never throws: syntax errors and
 * the caps become warnings, see the module comment.
 */
export function parseRailroad(text: string): RailroadParseResult {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/);
  let dialect: RailroadDialect = 'ir';
  let bodyStart = lines.length;
  let inFrontmatter = false;
  let sawFrontmatter = false;
  for (let n = 0; n < lines.length; n++) {
    const line = (lines[n] ?? '').trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      sawFrontmatter = true;
      continue;
    }
    if (inFrontmatter) continue;
    const m = HEADER.exec(line);
    if (m) {
      dialect = (m[1]?.toLowerCase() as RailroadDialect | undefined) ?? 'ir';
      lines[n] = line.slice(m[0].length);
    }
    bodyStart = n;
    break;
  }
  if (sawFrontmatter) warnings.push('Railroad frontmatter/config is not supported and was ignored.');

  const toks = tokenize(lines.slice(bodyStart).join('\n'), dialect, warnings);
  const p = new RuleParser(toks, dialect, warnings);
  const ast: RailroadDiagram = { dialect, rules: [] };
  const byName = new Map<string, RailroadRule>();

  while (p.pos < toks.length) {
    const t = p.peek();
    if (!t) break;
    if (t.k === 'meta') {
      p.pos++;
      if (t.key === 'title') ast.title = t.v;
      else if (t.key === 'accTitle') ast.accTitle = t.v;
      else ast.accDescr = t.v;
      continue;
    }
    if (!p.atRuleStart()) {
      warnings.push(`Railroad: "${t.v}" does not start a rule (expected \`name ${dialect === 'peg' ? '<-' : '='} ...\`); skipped to the next rule.`);
      p.pos++;
      while (p.pos < toks.length && !p.atRuleStart() && p.peek()?.k !== 'meta') {
        const skipped = p.peek();
        p.pos++;
        if (skipped?.k === 'p' && skipped.v === ';') break;
      }
      continue;
    }
    if (ast.rules.length >= MAX_RULES || p.nodes > MAX_NODES) {
      warnings.push(
        ast.rules.length >= MAX_RULES
          ? `Railroad limited to ${MAX_RULES} rules; the rest were ignored.`
          : `Railroad limited to ${MAX_NODES} elements; the rest was ignored.`,
      );
      break;
    }
    const name = t.v;
    const op = p.peek(1)?.v;
    p.pos += 2;
    const definition = p.definition();
    if (p.nodes > MAX_NODES) {
      warnings.push(`Railroad limited to ${MAX_NODES} elements; the rest was ignored.`);
      if (definition.type !== 'sequence' || definition.elements.length > 0) ast.rules.push({ name, definition });
      break;
    }
    if (!p.isP(';') && !p.atRuleStart() && p.pos < toks.length && p.peek()?.k !== 'meta') {
      warnings.push(`Railroad rule "${name}": unexpected "${p.peek()?.v ?? ''}"; the rest of the rule was skipped.`);
      while (p.pos < toks.length && !p.isP(';') && !p.atRuleStart()) p.pos++;
    }
    if (p.isP(';')) p.pos++;

    const earlier = byName.get(name);
    if (op === '=/' && earlier) {
      // ABNF incremental alternatives: `a =/ b` adds `b` to the choice of `a`.
      const prev = earlier.definition;
      earlier.definition = { type: 'choice', alternatives: [...(prev.type === 'choice' ? prev.alternatives : [prev]), definition] };
      continue;
    }
    const rule: RailroadRule = { name, definition };
    ast.rules.push(rule);
    byName.set(name, rule);
  }
  return { ast, warnings };
}
