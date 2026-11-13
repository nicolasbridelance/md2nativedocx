import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIshikawa } from '../../src/diagrams/ishikawa/parser.js';

const example = 'ishikawa-beta\n    Blurry\n    Process\n        Out of focus\n    Equipment\n        LENS\n            Dirty\n    User';

test('effect, categories at the effect indent, flattened causes with depth', () => {
  const { ast, warnings } = parseIshikawa(example);
  assert.equal(ast.effect, 'Blurry');
  assert.deepEqual(ast.categories.map((c) => c.label), ['Process', 'Equipment', 'User']);
  assert.deepEqual(ast.categories[1]?.causes, [{ label: 'LENS', depth: 1 }, { label: 'Dirty', depth: 2 }]);
  assert.deepEqual(warnings, []);
});

test('categories indented deeper than the effect and tabs work', () => {
  const { ast } = parseIshikawa('ishikawa-beta\nE\n\tA\n\t\tx\n\tB');
  assert.deepEqual(ast.categories.map((c) => [c.label, c.causes.length]), [['A', 1], ['B', 0]]);
});

test('frontmatter warns once; depth and line caps; injection characters kept verbatim', () => {
  assert.equal(parseIshikawa('---\nconfig:\n  a: b\n---\nishikawa-beta\n  E\n  A').warnings.length, 1);
  const deep = 'ishikawa-beta\nE\nA\n' + Array.from({ length: 12 }, (_, i) => ' '.repeat(i + 1) + `n${i}`).join('\n');
  const d = parseIshikawa(deep);
  assert.equal(d.warnings.length, 1);
  assert.equal(d.ast.categories[0]?.causes.length, 8);
  const many = parseIshikawa('ishikawa-beta\nE\n' + Array.from({ length: 700 }, (_, i) => `A${i}`).join('\n'));
  assert.ok(many.ast.categories.length <= 500);
  assert.equal(many.warnings.length, 1);
  assert.equal(parseIshikawa('ishikawa-beta\n<e>&\n  "<c>\'').ast.effect, '<e>&');
});

test('empty diagram has an empty effect', () => {
  assert.equal(parseIshikawa('ishikawa-beta').ast.effect, '');
});
