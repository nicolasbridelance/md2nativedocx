import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMindmap } from '../../src/diagrams/mindmap/parser.js';

const SAMPLE = `mindmap
  root((Central Concept))
    [Square Branch]
      Child A
      Child B
    Cloud Section
      ({Nested Cloud})
        Detail 1
        Detail 2
    {{Hexagon Ideas}}
      Point X
      Point Y`;

test('parses the root and builds a 3-level tree from indentation', () => {
  const { ast, warnings } = parseMindmap(SAMPLE);
  assert.ok(ast.root);
  assert.equal(ast.root?.label, 'Central Concept');
  assert.equal(ast.root?.shape, 'circle');
  assert.equal(ast.root?.children.length, 3);
  assert.equal(warnings.length, 0);
});

test('a square-shaped branch with 2 default-shape children', () => {
  const { ast } = parseMindmap(SAMPLE);
  const square = ast.root?.children[0];
  assert.equal(square?.label, 'Square Branch');
  assert.equal(square?.shape, 'square');
  assert.deepEqual(square?.children.map((c) => c.label), ['Child A', 'Child B']);
  assert.ok(square?.children.every((c) => c.shape === 'default'));
});

test('all 6 shapes parse correctly: square, rounded, circle, bang, cloud, hexagon', () => {
  const { ast } = parseMindmap(
    [
      'mindmap',
      '  root(rounded root)',
      '    [square]',
      '    (rounded)',
      '    ((circle))',
      '    ))bang((',
      '    )cloud(',
      '    {{hexagon}}',
      '    default text',
    ].join('\n'),
  );
  const shapes = ast.root?.children.map((c) => c.shape);
  assert.deepEqual(shapes, ['square', 'rounded', 'circle', 'bang', 'cloud', 'hexagon', 'default']);
  const labels = ast.root?.children.map((c) => c.label);
  assert.deepEqual(labels, ['square', 'rounded', 'circle', 'bang', 'cloud', 'hexagon', 'default text']);
});

test('an explicit id before the shape delimiter is kept, distinct from the label', () => {
  const { ast } = parseMindmap('mindmap\n  myId[My Label]');
  assert.equal(ast.root?.label, 'My Label');
  assert.equal(ast.root?.id, 'myId');
});

test('a node with no explicit id gets an auto-generated one', () => {
  const { ast } = parseMindmap('mindmap\n  [Square]');
  assert.match(ast.root?.id ?? '', /^n\d+$/);
});

test('inconsistent indentation is compensated by picking the nearest ancestor with lesser indent', () => {
  // B is indented less than A's grandchild would need to be its child, but
  // more than the root -- Mermaid's own documented "nearest ancestor" rule.
  const { ast } = parseMindmap('mindmap\n  root\n      A\n    B');
  assert.equal(ast.root?.children.length, 2);
  assert.equal(ast.root?.children[0]?.label, 'A');
  assert.equal(ast.root?.children[1]?.label, 'B');
});

test('::icon(...) is recognized and stripped with a warning, not left in the label', () => {
  const { ast, warnings } = parseMindmap('mindmap\n  root\n    [Idea]::icon(fa fa-book)');
  assert.equal(ast.root?.children[0]?.label, 'Idea');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /::icon/);
});

test(':::className is recognized and stripped with a warning', () => {
  const { warnings } = parseMindmap('mindmap\n  root\n    [Idea]:::urgent');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /:::className/);
});

test('a second top-level node is warned and ignored (mindmaps have exactly one root)', () => {
  const { ast, warnings } = parseMindmap('mindmap\n  root\n  second root');
  assert.equal(ast.root?.label, 'root');
  assert.equal(ast.root?.children.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /exactly one root/);
});

test('blank lines and %% comments are skipped', () => {
  const { ast, warnings } = parseMindmap('mindmap\n\n%% a comment\n  root\n');
  assert.equal(ast.root?.label, 'root');
  assert.equal(warnings.length, 0);
});

test('an empty mindmap (header only) has a null root', () => {
  const { ast } = parseMindmap('mindmap\n');
  assert.equal(ast.root, null);
});
