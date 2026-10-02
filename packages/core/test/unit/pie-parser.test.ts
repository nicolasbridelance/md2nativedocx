import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePieChart } from '../../src/diagrams/pie/parser.js';

test('parses header title, showData and slices in order', () => {
  const { ast, warnings } = parsePieChart('pie showData title Pets\n  "Dogs" : 386\n  "Cats" : 85.5');
  assert.equal(ast.title, 'Pets');
  assert.equal(ast.showData, true);
  assert.deepEqual(ast.slices, [{ label: 'Dogs', value: 386 }, { label: 'Cats', value: 85.5 }]);
  assert.deepEqual(warnings, []);
});

test('accepts title and showData on their own lines', () => {
  const { ast } = parsePieChart('pie\n  showData\n  title T\n  "A" : 1');
  assert.equal(ast.title, 'T');
  assert.equal(ast.showData, true);
});

test('rejects zero and negative values with a warning', () => {
  const { ast, warnings } = parsePieChart('pie\n  "A" : 0\n  "B" : -3\n  "C" : 2');
  assert.deepEqual(ast.slices, [{ label: 'C', value: 2 }]);
  assert.equal(warnings.length, 2);
});

test('warns once on frontmatter and skips its content', () => {
  const { ast, warnings } = parsePieChart('---\nconfig:\n  pie:\n    donutHole: 0.2\n---\npie\n  "A" : 1');
  assert.equal(ast.slices.length, 1);
  assert.equal(warnings.length, 1);
});

test('unrecognized line is warned, not thrown; label keeps injection characters verbatim', () => {
  const { ast, warnings } = parsePieChart('pie\n  nonsense\n  "<a:t>&\'" : 1');
  assert.equal(warnings.length, 1);
  assert.equal(ast.slices[0]?.label, "<a:t>&'");
});
