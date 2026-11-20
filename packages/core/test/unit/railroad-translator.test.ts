import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRailroad } from '../../src/diagrams/railroad/parser.js';
import { layoutRailroad } from '../../src/diagrams/railroad/layout.js';
import { translateRailroadToOoxml } from '../../src/diagrams/railroad/translator.js';
import { renderDiagram } from '../../src/render-diagram.js';

const tr = (t: string): string => translateRailroadToOoxml(parseRailroad(t).ast);
const json = 'railroad-ebnf-beta\ntitle "JSON"\nobject = "{" [ member ( "," member )* ] "}" ;\nmember = string ":" element ;\nx = ? any ? ;';

test('draws title, rule names, terminals, nonterminals, specials, tracks and dots inside the canvas', () => {
  const xml = tr(json);
  assert.ok(xml.includes('wpc:wpc'));
  for (const text of ['JSON', 'object', 'member', '{', '}', ',', ':', 'string', 'element', 'any']) assert.ok(xml.includes(`>${text}<`), text);
  assert.ok(xml.includes('prst="roundRect"'), 'terminal');
  assert.ok(xml.includes('<a:prstDash val="dash"/>'), 'special');
  assert.ok(xml.includes('prst="ellipse"'), 'markers');
  assert.ok(xml.includes('<a:cubicBezTo>'), 'arcs');
  assert.ok(!xml.includes('TargetMode'));
});

test('escapes XML metacharacters in rule names, terminals, specials and the title', () => {
  const xml = tr('railroad-beta\ntitle <t>&"\'\nr = sequence(terminal("<a>&"), nonterminal("<b>"), special("\'<c>\'")) ;');
  for (const raw of ['<t>', '<a>', '<b>', '<c>']) assert.ok(!xml.includes(raw), raw);
  assert.ok(xml.includes('&lt;a&gt;&amp;'));
});

test('control characters in strings never reach the XML', () => {
  const xml = tr('railroad-ebnf-beta\nr = "a\\u0001\u0002b\\nc" ;');
  // eslint-disable-next-line no-control-regex -- the point of the test
  assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(xml));
});

test('no rules: a note', () => {
  assert.ok(tr('railroad-ebnf-beta\ntitle Empty').includes('needs at least one rule'));
});

const one = (src: string) => layoutRailroad(parseRailroad(`railroad-ebnf-beta
a = ${src} ;`).ast).rules[0]!;
const trackY = (r: ReturnType<typeof one>): number => r.dots[0]!.cy;
/** How far the track lines reach above / below the rule's main track. */
const top = (r: ReturnType<typeof one>): number => Math.min(...r.path.map((p) => p.y)) - trackY(r);
const bottom = (r: ReturnType<typeof one>): number => Math.max(...r.path.map((p) => p.y)) - trackY(r);

test('choice: the first alternative stays on the track, the others hang below it', () => {
  const r = one('"x" | "y" | "z"');
  const ys = r.boxes.map((b) => b.y + b.h / 2);
  assert.equal(ys[0], trackY(r));
  assert.ok(ys[0]! < ys[1]! && ys[1]! < ys[2]!);
});

test('optional passes over the element, one-or-more loops under it, zero-or-more does both', () => {
  const plain = one('b');
  const opt = one('b?');
  const plus = one('b+');
  const star = one('b*');
  assert.ok(top(opt) < top(plain));
  assert.equal(bottom(opt), bottom(plain));
  assert.equal(top(plus), top(plain));
  assert.ok(bottom(plus) > bottom(plain));
  assert.ok(top(star) < top(plain) && bottom(star) > bottom(plain));
});

test('bounded repeats write their bounds under the loop (ABNF); plain one-or-more writes nothing', () => {
  const abnf = (src: string) => layoutRailroad(parseRailroad(`railroad-abnf-beta
a = ${src} ;`).ast).rules[0]!;
  assert.deepEqual(abnf('1*x').notes, []);
  assert.deepEqual(abnf('3x').notes.map((n) => n.text), ['3×']);
  assert.deepEqual(abnf('2*5x').notes.map((n) => n.text), ['2–5×']);
  assert.deepEqual(abnf('2*x').notes.map((n) => n.text), ['≥2×']);
  assert.deepEqual(abnf('*5x').notes.map((n) => n.text), ['1–5×']);
});

test('every quarter turn moves exactly one radius on each axis', () => {
  const layout = layoutRailroad(parseRailroad(json).ast);
  for (const rule of layout.rules) {
    let cur = { x: 0, y: 0 };
    for (const op of rule.path) {
      if (op.op === 'T') {
        assert.ok(Math.abs(Math.abs(op.x - cur.x) - layout.turnRadius) < 1e-9, `${rule.name} dx`);
        assert.ok(Math.abs(Math.abs(op.y - cur.y) - layout.turnRadius) < 1e-9, `${rule.name} dy`);
      }
      cur = op;
    }
  }
});

test('renderDiagram: all four dialects render as railroad shapes without warnings', () => {
  for (const src of [
    'railroad-beta\na = choice(terminal("x"), nonterminal("y")) ;',
    'railroad-ebnf-beta\na = "x" | y ;',
    'railroad-abnf-beta\na = "x" / y ;',
    'railroad-peg-beta\nA <- "x" / Y',
  ]) {
    const r = renderDiagram(src);
    assert.equal(r.metadata.diagramType, 'railroad', src);
    assert.deepEqual(r.metadata.warnings, [], src);
    assert.ok(r.fragment.includes('wpc:wpc'), src);
  }
});

test('frontmatter title becomes the diagram title', () => {
  const r = renderDiagram('---\ntitle: From FM\n---\nrailroad-ebnf-beta\na = "x" ;');
  assert.ok(r.fragment.includes('>From FM<'));
});
