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

test('an icon at the end of a node line is kept on that node, out of its label, with a warning', () => {
  const { ast, warnings } = parseMindmap('mindmap\n  root\n    [Idea]::icon(fa fa-book)');
  const idea = ast.root?.children[0];
  assert.equal(idea?.label, 'Idea');
  assert.equal(idea?.icon, 'fa fa-book');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /icons are not drawn.*"Idea".*::icon\(fa fa-book\)/);
});

test('classes at the end of a node line are kept on that node, with a warning', () => {
  const { ast, warnings } = parseMindmap('mindmap\n  root\n    [Idea]:::urgent');
  assert.equal(ast.root?.children[0]?.className, 'urgent');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /classes are not applied.*"Idea".*:::urgent/);
});

test('an ::icon or ::: line of its own decorates the node added just before it, as in Mermaid', () => {
  // Mermaid's decorateNode() takes the last node added, whatever the decoration's indentation.
  const { ast, warnings } = parseMindmap(
    'mindmap\n  Root\n    A\n      Deep\n    ::icon(fa fa-book)\n    B(B)\n    :::urgent large',
  );
  const [a, b] = ast.root?.children ?? [];
  assert.equal(a?.icon, undefined);
  assert.equal(a?.children[0]?.icon, 'fa fa-book');
  assert.equal(b?.className, 'urgent large');
  assert.deepEqual(ast.root?.children.map((c) => c.label), ['A', 'B']);
  assert.equal(warnings.length, 2);
});

test('a decoration before any node is warned and ignored', () => {
  const { ast, warnings } = parseMindmap('mindmap\n  ::icon(fa fa-book)\n  Root');
  assert.equal(ast.root?.label, 'Root');
  assert.equal(ast.root?.icon, undefined);
  assert.match(warnings[0] ?? '', /before any node/);
});

test('a quoted Markdown label may run over several lines; each line break is kept', () => {
  // Official example (mermaid@12.3.0 docs, mindmap #14): the label's lines start at column 0, and must
  // neither become nodes of their own nor be read as extra roots.
  const { ast, warnings } = parseMindmap(
    'mindmap\n    id1["`**Root** with\na second line\nUnicode works too: 🤓`"]\n      id2["`The dog in **the** hog... a *very long text*`"]\n      id3[Regular labels still works]',
  );
  assert.deepEqual(warnings, []);
  assert.equal(ast.root?.id, 'id1');
  assert.equal(ast.root?.shape, 'square');
  assert.equal(ast.root?.label, 'Root with a second line Unicode works too: 🤓');
  assert.deepEqual(ast.root?.labelRuns, [
    { text: 'Root', bold: true },
    { text: ' with' },
    { break: true },
    { text: 'a second line' },
    { break: true },
    { text: 'Unicode works too: 🤓' },
  ]);
  assert.deepEqual(ast.root?.children.map((c) => c.id), ['id2', 'id3']);
  assert.deepEqual(ast.root?.children[0]?.labelRuns?.filter((r) => 'text' in r && (r.bold || r.italic)), [
    { text: 'the', bold: true },
    { text: 'very long text', italic: true },
  ]);
});

test('a plain double-quoted label may also run over several lines', () => {
  const { ast } = parseMindmap('mindmap\n  root["first\n  second"]\n    child');
  assert.equal(ast.root?.label, 'first second');
  assert.deepEqual(ast.root?.children.map((c) => c.label), ['child']);
});

test('an unclosed quoted label is warned and kept as plain text, never swallowing the next lines', () => {
  const { ast, warnings } = parseMindmap('mindmap\n  root["never closed\n    child');
  assert.match(warnings[0] ?? '', /Unclosed quoted label/);
  assert.equal(ast.root?.label, 'root["never closed');
  assert.deepEqual(ast.root?.children.map((c) => c.label), ['child']);
});

test('every label is Markdown, as in Mermaid; an underscore inside a word stays literal', () => {
  const { ast } = parseMindmap('mindmap\n  root\n    **Bold** and *it*\n    snake_case_name\n    a<br/>b');
  const [bold, snake, broken] = ast.root?.children ?? [];
  assert.deepEqual(bold?.labelRuns, [{ text: 'Bold', bold: true }, { text: ' and ' }, { text: 'it', italic: true }]);
  assert.equal(bold?.label, 'Bold and it');
  assert.deepEqual(snake?.labelRuns, [{ text: 'snake_case_name' }]);
  assert.deepEqual(broken?.labelRuns, [{ text: 'a' }, { break: true }, { text: 'b' }]);
});

test('a node whose text starts with the word mindmap is a node, not a second header', () => {
  const { ast } = parseMindmap('mindmap\n  root\n    mindmap tools');
  assert.deepEqual(ast.root?.children.map((c) => c.label), ['mindmap tools']);
});

test('XML-special characters in a label stay plain text in the AST, for the translator to escape', () => {
  const { ast } = parseMindmap(`mindmap\n  root["<a> & 'b'"]`);
  assert.equal(ast.root?.label, "<a> & 'b'");
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

test('a multi-class `:::a b` line is stripped whole and never becomes a node', () => {
  const { ast } = parseMindmap('mindmap\n  Root\n    A[A]\n    :::urgent large\n    B(B)\n    C');
  assert.deepEqual(ast.root?.children.map((c) => c.label), ['A', 'B', 'C']);
  assert.equal(ast.root?.children[0]?.className, 'urgent large');
});
