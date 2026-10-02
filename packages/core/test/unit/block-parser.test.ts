import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlock } from '../../src/diagrams/block/parser.js';

const SAMPLE = `block-beta
  columns 3
  a["A label"] b:2 c
  d space:2
  block:grp:2
    columns 2
    e(("Round")) f{"Dia"}
  end
  g
  a --> b
  b-- "text" -->c
  c --- d
  style a fill:#f9F,stroke:#333,color:#fff`;

test('parses columns, spans, shapes, space, groups and links', () => {
  const { ast, warnings } = parseBlock(SAMPLE);
  assert.deepEqual(warnings, []);
  assert.equal(ast.root.columns, 3);
  const [a, b, c, d, space, grp, g] = ast.root.children;
  assert.equal(a?.label, 'A label');
  assert.equal(b?.span, 2);
  assert.equal(c?.id, 'c');
  assert.equal(d?.id, 'd');
  assert.equal(space?.kind, 'space');
  assert.equal(space?.span, 2);
  assert.equal(grp?.kind, 'group');
  assert.equal(grp?.columns, 2);
  assert.deepEqual(grp?.children.map((x) => [x.id, x.shape, x.label]), [['e', 'circle', 'Round'], ['f', 'diamond', 'Dia']]);
  assert.equal(g?.id, 'g');
  assert.equal(ast.links.length, 3);
  assert.equal(ast.links[1]?.label, 'text');
  assert.equal(ast.links[2]?.arrow, false);
  assert.deepEqual(a?.style, { fill: 'FF99FF', stroke: '333333', color: 'FFFFFF' });
});

test('classDef / class / ::: apply validated colors only', () => {
  const { ast } = parseBlock('block-beta\n  a:::hot b\n  classDef hot fill:#ff0000,stroke:red\n  class b hot');
  assert.deepEqual(ast.root.children[0]?.style, { fill: 'FF0000' });
  assert.deepEqual(ast.root.children[1]?.style, { fill: 'FF0000' });
});

test('edges create implicit blocks; exotic shapes keep their label', () => {
  const { ast } = parseBlock('block-beta\n  x --> y\n  z[("DB")] w[/"P"/]');
  assert.deepEqual(ast.root.children.map((c) => c.id), ['x', 'y', 'z', 'w']);
  assert.deepEqual(ast.root.children.slice(2).map((c) => [c.shape, c.label]), [['rect', 'DB'], ['rect', 'P']]);
});

test('hostile input: caps, unclosed groups and garbage never throw', () => {
  const many = `block-beta\n${Array.from({ length: 700 }, (_, i) => `n${i}`).join(' ')}`;
  const r = parseBlock(many);
  assert.equal(r.ast.root.children.length, 500);
  assert.ok(r.warnings.some((w) => w.includes('500')));
  assert.ok(parseBlock('block-beta\n  block:g\n  a').warnings.some((w) => w.includes('Unclosed')));
  assert.ok(parseBlock('block-beta\n  end\n  !!! ???').warnings.length >= 1);
  const deep = `block-beta\n${'block\n'.repeat(30)}a\n${'end\n'.repeat(30)}`;
  assert.ok(parseBlock(deep).warnings.some((w) => w.includes('nesting')));
});
