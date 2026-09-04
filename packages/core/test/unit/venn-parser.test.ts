import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVennChart } from '../../src/diagrams/venn/parser.js';

const TWO_SET = `venn-beta
  set A
  set B
  union A,B
    text ["Overlap"]`;

const THREE_SET = `venn-beta
  set A
  set B
  set C
  union A,B
  union B,C
  union A,C
  union A,B,C
    text ["All three"]`;

test('parses two sets and their union, with an attached text label', () => {
  const { ast, warnings } = parseVennChart(TWO_SET);
  assert.equal(ast.sets.length, 2);
  assert.deepEqual(ast.sets.map((s) => s.id), ['A', 'B']);
  assert.equal(ast.unions.length, 1);
  assert.deepEqual(ast.unions[0]?.setIds, ['A', 'B']);
  assert.equal(ast.unions[0]?.label, 'Overlap');
  assert.equal(warnings.length, 0);
});

test('parses three sets, three pairwise unions, and one triple union', () => {
  const { ast, warnings } = parseVennChart(THREE_SET);
  assert.equal(ast.sets.length, 3);
  assert.equal(ast.unions.length, 4);
  assert.deepEqual(ast.unions[3]?.setIds, ['A', 'B', 'C']);
  assert.equal(ast.unions[3]?.label, 'All three');
  assert.equal(warnings.length, 0);
});

test('a bracket label on `set` becomes the display label; id stays the reference', () => {
  const { ast } = parseVennChart('venn-beta\n  set A ["Display Label"]');
  assert.equal(ast.sets[0]?.id, 'A');
  assert.equal(ast.sets[0]?.label, 'Display Label');
});

test('a quoted set id has its quotes stripped', () => {
  const { ast } = parseVennChart('venn-beta\n  set "Foo Bar"');
  assert.equal(ast.sets[0]?.id, 'Foo Bar');
});

test('a :N size suffix is recognized and ignored, not parsed into the id/label', () => {
  const { ast, warnings } = parseVennChart('venn-beta\n  set A:5\n  set B ["B label"]:3');
  assert.equal(ast.sets[0]?.id, 'A');
  assert.equal(ast.sets[1]?.id, 'B');
  assert.equal(ast.sets[1]?.label, 'B label');
  assert.equal(warnings.length, 0);
});

test('style with a single-set target sets that set\'s fill', () => {
  const { ast, warnings } = parseVennChart('venn-beta\n  set A\n  style A fill:#ff3300');
  assert.equal(ast.sets[0]?.fill, 'FF3300');
  assert.equal(warnings.length, 0);
});

test('style with a multi-set (union) target is recognized and warned, not silently dropped', () => {
  const { warnings } = parseVennChart('venn-beta\n  set A\n  set B\n  style A,B fill:#ff3300');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /Union-specific fill styling/);
});

test('style targeting an unknown set is warned, not silently dropped', () => {
  const { warnings } = parseVennChart('venn-beta\n  style Ghost fill:#000000');
  assert.equal(warnings.length, 1);
});

test('a union referencing an undeclared set is skipped with a warning', () => {
  const { ast, warnings } = parseVennChart('venn-beta\n  set A\n  union A,Ghost');
  assert.equal(ast.unions.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /undeclared set/);
});

test('a title statement is parsed', () => {
  const { ast } = parseVennChart('venn-beta\n  title My Venn\n  set A');
  assert.equal(ast.title, 'My Venn');
});

test('an unrecognized line is skipped with a warning', () => {
  const { warnings } = parseVennChart('venn-beta\n  this is not valid');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /Unsupported line ignored/);
});

test('a set with a bracket label but no id is skipped with a warning', () => {
  const { ast, warnings } = parseVennChart('venn-beta\n  set ["Label only"]');
  assert.equal(ast.sets.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /set with no id/);
});

test('a union with fewer than 2 sets is skipped with a warning', () => {
  const { ast, warnings } = parseVennChart('venn-beta\n  set A\n  union A');
  assert.equal(ast.unions.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /at least 2 sets/);
});

test('a text line with no preceding set/union is skipped with a warning', () => {
  const { warnings } = parseVennChart('venn-beta\n  text ["orphan"]');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /no preceding set\/union/);
});

test('blank lines and %% comments are skipped without warnings', () => {
  const { ast, warnings } = parseVennChart('venn-beta\n\n%% a comment\n  set A\n');
  assert.equal(ast.sets.length, 1);
  assert.equal(warnings.length, 0);
});
