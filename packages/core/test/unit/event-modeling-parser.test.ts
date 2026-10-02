import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEventModeling } from '../../src/diagrams/event-modeling/parser.js';

// Forms below were verified against the real @mermaid-js/parser 1.2.1 (eventmodeling grammar).
const src = `eventmodeling
tf 01 ui CartUI
tf 02 command Billing.AddItem ->> 01 [[D1]]
timeframe 03 evt ItemAdded ->> 02 ->> 01 {"id": 1}
rf 04 readmodel Items ->> 03
tf 5 pcr Pricer ->> 04 \`md\` 'x y'
entity Cart
// c
%% d
data D1 {
  a: 1
  b: 2
}
note 03 {
  hello
}
gwt 03 given evt ItemAdded evt Other when cmd AddItem then rmo Items`;

test('parses every statement form accepted by the real Mermaid parser', () => {
  const { ast, warnings } = parseEventModeling(src);
  assert.deepEqual(warnings, []);
  assert.deepEqual(ast.frames.map((f) => [f.id, f.kind, f.reset, f.name]), [
    ['01', 'ui', false, 'CartUI'],
    ['02', 'cmd', false, 'AddItem'],
    ['03', 'evt', false, 'ItemAdded'],
    ['04', 'rmo', true, 'Items'],
    ['5', 'pcr', false, 'Pricer'],
  ]);
  assert.equal(ast.frames[1]?.namespace, 'Billing');
  assert.equal(ast.frames[1]?.dataRef, 'D1');
  assert.deepEqual(ast.frames[2]?.sources, ['02', '01']);
  assert.equal(ast.frames[2]?.inlineData, '{"id": 1}');
  assert.equal(ast.frames[4]?.inlineData, "'x y'");
  assert.equal(ast.data.get('D1'), 'a: 1\nb: 2');
  assert.equal(ast.notes[0]?.text, 'hello');
  assert.deepEqual(ast.scenarios[0]?.given.map((x) => x.name), ['ItemAdded', 'Other']);
  assert.deepEqual(ast.scenarios[0]?.then, [{ kind: 'rmo', name: 'Items' }]);
});

test('warns where Mermaid errors, never throws', () => {
  const { ast, warnings } = parseEventModeling('eventmodeling\ntitle X\ntf 0001 ui A\ntf 01 ui\ntf 02 ui B ->> 99\nnote 02 "inline"\nnote 77 {\n x\n}\ntf 03 ui C [[Nope]]');
  assert.ok(warnings.some((w) => w.includes('title')));
  assert.equal(warnings.filter((w) => w.startsWith('Unsupported line')).length, 3);
  assert.ok(warnings.some((w) => w.includes('unknown frame(s) 99')));
  assert.ok(warnings.some((w) => w.includes('unknown frame 77')));
  assert.ok(warnings.some((w) => w.includes('unknown data "Nope"')));
  assert.deepEqual(ast.frames.map((f) => f.id), ['02', '03']);
});

test('caps frames and tolerates hostile names such as __proto__', () => {
  const many = ['eventmodeling', ...Array.from({ length: 150 }, (_, i) => `tf ${String(i % 1000).padStart(3, '0')} ui A${i}`)].join('\n');
  const r = parseEventModeling(many);
  assert.equal(r.ast.frames.length, 100);
  assert.ok(r.warnings.some((w) => w.includes('limited to 100 frames')));
  const p = parseEventModeling('eventmodeling\ndata __proto__ {\n x\n}\ntf 01 ui A [[__proto__]]');
  assert.equal(p.ast.data.get('__proto__'), 'x');
  assert.equal(({} as Record<string, unknown>)['x'], undefined);
});
