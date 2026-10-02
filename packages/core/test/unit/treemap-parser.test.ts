import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTreemap } from '../../src/diagrams/treemap/parser.js';

test('builds the hierarchy from indentation; leaves carry values', () => {
  const { ast, warnings } = parseTreemap('treemap-beta\n"A"\n    "A1": 10\n    "A2"\n      "A21": 5\n"B"\n    "B1": 2,500');
  assert.equal(ast.roots.length, 2);
  assert.deepEqual(ast.roots[0]?.children.map((c) => c.label), ['A1', 'A2']);
  assert.equal(ast.roots[0]?.children[1]?.children[0]?.value, 5);
  assert.equal(ast.roots[1]?.children[0]?.value, 2500);
  assert.deepEqual(warnings, []);
});

test('tabs count as indentation', () => {
  const { ast } = parseTreemap('treemap-beta\n"A"\n\t"A1": 1');
  assert.equal(ast.roots[0]?.children.length, 1);
});

test('parses :::class on sections and leaves, and classDef hex/named colors', () => {
  const { ast } = parseTreemap('treemap-beta\n"S":::c1\n  "L": 3:::c2\nclassDef c1 fill:red,color:#fff,stroke:#FFD600;\nclassDef c2 fill:#f96,stroke-width:2px');
  assert.equal(ast.roots[0]?.className, 'c1');
  assert.equal(ast.roots[0]?.children[0]?.className, 'c2');
  assert.deepEqual(ast.classDefs.c1, { fill: 'FF0000', color: 'FFFFFF', stroke: 'FFD600' });
  assert.deepEqual(ast.classDefs.c2, { fill: 'FF9966' });
});

test('bad lines and negative values warn; deep nesting is bounded', () => {
  const r = parseTreemap('treemap-beta\nnoquote\n"A": -1\n"B": abc');
  assert.equal(r.warnings.length, 3);
  const deep = ['treemap-beta', ...Array.from({ length: 40 }, (_, i) => `${' '.repeat(i)}"n${i}": 1`)].join('\n');
  assert.ok(parseTreemap(deep).warnings.some((w) => w.includes('deeper than')));
});

test('label keeps injection characters verbatim', () => {
  assert.equal(parseTreemap('treemap-beta\n"<a:t>&\'": 1').ast.roots[0]?.label, "<a:t>&'");
});
