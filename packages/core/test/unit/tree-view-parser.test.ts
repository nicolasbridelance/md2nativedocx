import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTreeView } from '../../src/diagrams/tree-view/parser.js';

test('builds hierarchy from indentation; directories, quotes, descriptions, highlight', () => {
  const { ast, warnings } = parseTreeView(
    'treeView-beta\n  "my dir/" ## about\n    a.ts:::highlight\n    sub/\n      b.ts\n  other',
  );
  assert.deepEqual(ast.nodes.map((n) => [n.label, n.depth, n.parent]), [['my dir/', 0, -1], ['a.ts', 1, 0], ['sub/', 1, 0], ['b.ts', 2, 2], ['other', 0, -1]]);
  assert.equal(ast.nodes[0]?.isDirectory, true);
  assert.equal(ast.nodes[0]?.description, 'about');
  assert.equal(ast.nodes[1]?.highlighted, true);
  assert.deepEqual(warnings, []);
});

test('box-drawing prefixes and tabs define depth', () => {
  const { ast } = parseTreeView('treeView-beta\nroot/\n├── a\n│   └── b\n└── c\n\td');
  assert.deepEqual(ast.nodes.map((n) => n.depth), [0, 1, 2, 1, 1]);
});

test('icons and custom classes warn once; frontmatter warns once', () => {
  const { warnings, ast } = parseTreeView('treeView-beta\n  a icon(folder) :::x\n  b icon(none) :::y');
  assert.equal(warnings.length, 2);
  assert.equal(ast.nodes.length, 2);
  assert.equal(parseTreeView('---\nconfig:\n  a: b\n---\ntreeView-beta\n  a').warnings.length, 1);
});

test('depth and node count are capped', () => {
  const deep = 'treeView-beta\n' + Array.from({ length: 50 }, (_, i) => ' '.repeat(i + 1) + `n${i}`).join('\n');
  const d = parseTreeView(deep);
  assert.equal(d.ast.nodes.length, 32);
  assert.equal(d.warnings.length, 1);
  const wide = 'treeView-beta\n' + Array.from({ length: 2100 }, (_, i) => `  n${i}`).join('\n');
  assert.equal(parseTreeView(wide).ast.nodes.length, 2000);
});

test('labels keep injection characters verbatim; unterminated quote does not throw', () => {
  const { ast } = parseTreeView("treeView-beta\n  \"<b>&'\" ## <i>\n  \"open");
  assert.equal(ast.nodes[0]?.label, "<b>&'");
  assert.equal(ast.nodes[0]?.description, '<i>');
  assert.equal(ast.nodes[1]?.label, 'open');
});

test('an unquoted label with spaces and emoji keeps its whole text up to the annotations', () => {
  const { ast, warnings } = parseTreeView('treeView-beta\n  🚀 rocket-app/\n    📦 my packages/ ## note\n      README.md :::highlight');
  assert.deepEqual(ast.nodes.map((n) => n.label), ['🚀 rocket-app/', '📦 my packages/', 'README.md']);
  assert.equal(ast.nodes[1]?.description, 'note');
  assert.equal(ast.nodes[2]?.highlighted, true);
  assert.deepEqual(warnings, []);
});
