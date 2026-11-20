import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRailroad, MAX_DEPTH, MAX_RULES } from '../../src/diagrams/railroad/parser.js';
import { detectDiagramType } from '../../src/parser/diagram-type.js';
import type { RailroadNode } from '../../src/diagrams/railroad/types.js';

const T = (value: string): RailroadNode => ({ type: 'terminal', value });
const N = (name: string): RailroadNode => ({ type: 'nonterminal', name });

test('detects all four railroad headers', () => {
  for (const h of ['railroad-beta', 'railroad-ebnf-beta', 'railroad-abnf-beta', 'railroad-peg-beta']) {
    assert.equal(detectDiagramType(`${h}\nx = "a" ;`).type, 'railroad', h);
  }
});

test('EBNF: choice, sequence, groups, [optional], {repetition}, postfixes, exception, special, ::=', () => {
  const { ast, warnings } = parseRailroad(
    'railroad-ebnf-beta\ntitle "My \\"G\\""\na = "x" | b , c ;\nd ::= [ e ] { f } g? h* i+ ;\nj = k - "l" ;\nm = ? any char ? ;\n(* iso *) /* c */ %% c',
  );
  assert.deepEqual(warnings, []);
  assert.equal(ast.dialect, 'ebnf');
  assert.equal(ast.title, 'My "G"');
  assert.deepEqual(ast.rules.map((r) => r.name), ['a', 'd', 'j', 'm']);
  assert.deepEqual(ast.rules[0]?.definition, { type: 'choice', alternatives: [T('x'), { type: 'sequence', elements: [N('b'), N('c')] }] });
  assert.deepEqual(ast.rules[1]?.definition, {
    type: 'sequence',
    elements: [
      { type: 'optional', element: N('e') },
      { type: 'repeat', element: N('f'), min: 0, max: Infinity },
      { type: 'optional', element: N('g') },
      { type: 'repeat', element: N('h'), min: 0, max: Infinity },
      { type: 'repeat', element: N('i'), min: 1, max: Infinity },
    ],
  });
  assert.deepEqual(ast.rules[2]?.definition, { type: 'sequence', elements: [N('k'), { type: 'special', text: 'except "l"' }] });
  assert.deepEqual(ast.rules[3]?.definition, { type: 'special', text: 'any char' });
});

test('EBNF: `?` postfix is not mistaken for a special sequence', () => {
  const { ast } = parseRailroad('railroad-ebnf-beta\nnumber = sign? digit+ ;\nsign = "+" ;');
  assert.deepEqual(ast.rules[0]?.definition, {
    type: 'sequence',
    elements: [{ type: 'optional', element: N('sign') }, { type: 'repeat', element: N('digit'), min: 1, max: Infinity }],
  });
});

test('ABNF: `/` choice, repeats, numeric values, `;` comments, =/ incremental alternatives', () => {
  const { ast, warnings } = parseRailroad(
    'railroad-abnf-beta\nphone = [ "+" cc ] 1*( DIGIT / "-" ) ; a comment\ncc = 2*3DIGIT *1"x" 4%x41-5A ;\ncc =/ "0" ;',
  );
  assert.deepEqual(warnings, []);
  assert.deepEqual(ast.rules[0]?.definition, {
    type: 'sequence',
    elements: [
      { type: 'optional', element: { type: 'sequence', elements: [T('+'), N('cc')] } },
      { type: 'repeat', element: { type: 'choice', alternatives: [N('DIGIT'), T('-')] }, min: 1, max: Infinity },
    ],
  });
  assert.deepEqual(ast.rules[1]?.definition, {
    type: 'choice',
    alternatives: [
      {
        type: 'sequence',
        elements: [
          { type: 'repeat', element: N('DIGIT'), min: 2, max: 3 },
          { type: 'optional', element: T('x') },
          { type: 'repeat', element: T('%x41-5A'), min: 4, max: 4 },
        ],
      },
      T('0'),
    ],
  });
});

test('PEG: ordered choice, lookaheads, suffixes, any, classes, rules without `;`', () => {
  const { ast, warnings } = parseRailroad('railroad-peg-beta\nId <- !Kw &"a" L L* . [a-z]+ # comment\nKw <- "if" / "else"');
  assert.deepEqual(warnings, []);
  assert.deepEqual(ast.rules.map((r) => r.name), ['Id', 'Kw']);
  assert.deepEqual(ast.rules[0]?.definition, {
    type: 'sequence',
    elements: [
      { type: 'special', text: 'not Kw' },
      { type: 'special', text: 'if "a"' },
      N('L'),
      { type: 'repeat', element: N('L'), min: 0, max: Infinity },
      { type: 'special', text: 'any character' },
      { type: 'repeat', element: T('[a-z]'), min: 1, max: Infinity },
    ],
  });
});

test('function form: nested calls, bare names and strings, accTitle/accDescr, unquoted title', () => {
  const { ast, warnings } = parseRailroad(
    'railroad-beta\ntitle Expression Grammar\naccTitle: Acc\naccDescr { Long\n description }\ne = sequence(nonterminal("t"), zeroOrMore(sequence(choice(terminal("+"), "-"), t)), optional(special("x"))) ;',
  );
  assert.deepEqual(warnings, []);
  assert.equal(ast.title, 'Expression Grammar');
  assert.equal(ast.accTitle, 'Acc');
  assert.equal(ast.accDescr, 'Long\n description');
  assert.deepEqual(ast.rules[0]?.definition, {
    type: 'sequence',
    elements: [
      N('t'),
      { type: 'repeat', element: { type: 'sequence', elements: [{ type: 'choice', alternatives: [T('+'), T('-')] }, N('t')] }, min: 0, max: Infinity },
      { type: 'optional', element: { type: 'special', text: 'x' } },
    ],
  });
});

test('a rule named `title` is a rule, not a title statement', () => {
  const { ast } = parseRailroad('railroad-ebnf-beta\ntitle = "t" ;');
  assert.equal(ast.title, undefined);
  assert.equal(ast.rules[0]?.name, 'title');
});

test('syntax errors warn and keep going; missing `;` loses nothing', () => {
  const { ast, warnings } = parseRailroad('railroad-ebnf-beta\na = "x" ) "y" ;\nb = c\nd = e ;\n= orphan ;\nf = "unterminated\ng = h ;');
  assert.deepEqual(ast.rules.map((r) => r.name), ['a', 'b', 'd', 'f', 'g']);
  assert.ok(warnings.some((w) => w.includes('rule "a"')));
  assert.ok(warnings.some((w) => w.includes('does not start a rule')));
  assert.ok(warnings.some((w) => w.includes('closing quote')));
});

test('hostile input is capped: depth, rules, postfix chains, nodes', () => {
  const deep = `railroad-ebnf-beta\na = ${'('.repeat(MAX_DEPTH + 50)}"x"${')'.repeat(MAX_DEPTH + 50)} ;\nb = "ok" ;`;
  const r1 = parseRailroad(deep);
  assert.ok(r1.warnings.some((w) => w.includes('nesting limited')));
  assert.equal(r1.ast.rules.at(-1)?.name, 'b');

  const many = 'railroad-peg-beta\n' + Array.from({ length: MAX_RULES + 5 }, (_, i) => `R${i} <- "x"`).join('\n');
  const r2 = parseRailroad(many);
  assert.equal(r2.ast.rules.length, MAX_RULES);
  assert.ok(r2.warnings.some((w) => w.includes(`${MAX_RULES} rules`)));

  const r3 = parseRailroad(`railroad-ebnf-beta\na = "x"${'?'.repeat(5000)} ;`);
  let depth = 0;
  let n: RailroadNode | undefined = r3.ast.rules[0]?.definition;
  while (n?.type === 'optional') {
    depth++;
    n = n.element;
  }
  assert.ok(depth <= 4, `postfix depth ${depth}`);

  const r4 = parseRailroad(`railroad-ebnf-beta\na = ${'"x" '.repeat(10000)};\nb = "y" ;`);
  assert.ok(r4.warnings.some((w) => w.includes('elements')));
});

test('frontmatter is skipped with a warning', () => {
  const { ast, warnings } = parseRailroad('---\nconfig:\n  theme: dark\n---\nrailroad-peg-beta\nA <- "a" ;');
  assert.equal(ast.dialect, 'peg');
  assert.equal(ast.rules.length, 1);
  assert.ok(warnings.some((w) => w.includes('frontmatter')));
});
