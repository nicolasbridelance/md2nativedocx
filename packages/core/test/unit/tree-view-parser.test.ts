import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTreeView } from '../../src/diagrams/tree-view/parser.js';

const rows = (source: string): Array<[string, number, number]> =>
  parseTreeView(source).ast.nodes.map((n) => [n.label, n.depth, n.parent]);

test('builds hierarchy from indentation; directories lose their slash, quotes, descriptions, highlight', () => {
  const { ast, warnings } = parseTreeView(
    'treeView-beta\n  "my dir/" ## about\n    a.ts :::highlight\n    sub/\n      b.ts\n  other',
  );
  assert.deepEqual(ast.nodes.map((n) => [n.label, n.depth, n.parent]), [['my dir', 0, -1], ['a.ts', 1, 0], ['sub', 1, 0], ['b.ts', 2, 2], ['other', 0, -1]]);
  assert.equal(ast.nodes[0]?.isDirectory, true);
  assert.equal(ast.nodes[2]?.isDirectory, true);
  assert.equal(ast.nodes[0]?.description, 'about');
  assert.equal(ast.nodes[1]?.highlighted, true);
  assert.equal(ast.nodes[1]?.className, 'highlight');
  assert.deepEqual(warnings, []);
});

test('an annotation needs a space before it, as in Mermaid: a.ts:::x is a name', () => {
  const { ast, warnings } = parseTreeView('treeView-beta\n  a.ts:::highlight\n  b.ts##x');
  assert.deepEqual(ast.nodes.map((n) => [n.label, n.highlighted, n.description]), [['a.ts:::highlight', false, undefined], ['b.ts##x', false, undefined]]);
  assert.deepEqual(warnings, []);
});

test('a tab counts as one column of indentation outside box drawing', () => {
  assert.deepEqual(rows('treeView-beta\n\tsrc/\n\t\ta.ts\n  b'), [['src', 0, -1], ['a.ts', 1, 0], ['b', 1, 0]]);
});

test('box drawing: the level comes from the branch column and the tree\'s own step', () => {
  assert.deepEqual(rows('treeView-beta\nroot/\n├── a\n│   └── b\n└── c'), [['root', 0, -1], ['a', 1, 0], ['b', 2, 1], ['c', 1, 0]]);
  // A 2-column step, from the first branch not at column 0.
  assert.deepEqual(rows('treeView-beta\n├─ a\n│ └─ b\n│   └─ c\n└─ d'), [['a', 0, -1], ['b', 1, 0], ['c', 2, 1], ['d', 0, -1]]);
});

test('box drawing: an indented line without a branch is read, with a warning (Mermaid rejects it)', () => {
  const { ast, warnings } = parseTreeView('treeView-beta\n├── a\n    b');
  assert.equal(ast.nodes.length, 2);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /without ├── or └──/);
});

test('single quotes, last annotation of a kind wins, empty icon() removes the icon', () => {
  const { ast } = parseTreeView("treeView-beta\n  'my dir/'\n    c.ts icon(a) icon(b) :::x :::highlight ## one ## two\n    d.ts icon()");
  assert.equal(ast.nodes[0]?.label, 'my dir');
  assert.equal(ast.nodes[0]?.isDirectory, true);
  // `##` runs to the end of the line, so the second `##` is part of the description.
  assert.deepEqual([ast.nodes[1]?.icon, ast.nodes[1]?.className, ast.nodes[1]?.highlighted, ast.nodes[1]?.description], ['b', 'highlight', true, 'one ## two']);
  assert.equal(ast.nodes[2]?.icon, 'none');
});

test('icons: none is silent, the built-in ones and pack icons warn per node; custom classes warn once', () => {
  const { warnings } = parseTreeView('treeView-beta\n  a icon(none)\n  b icon(folder) :::x\n  c icon(logos:react) :::y');
  assert.equal(warnings.length, 3);
  assert.match(warnings[0] ?? '', /class "x"/);
  assert.match(warnings[1] ?? '', /built-in folder and file icons.*"b": icon\(folder\)/);
  assert.match(warnings[2] ?? '', /icon packs.*"c": icon\(logos:react\)/);
});

test('title, accTitle and accDescr after the header; misplaced, they warn', () => {
  const { ast, warnings } = parseTreeView('treeView-beta\ntitle My tree %% note\naccTitle: Acc\naccDescr {\n  one\n  two\n}\n  a');
  assert.deepEqual([ast.title, ast.accTitle, ast.accDescr, ast.nodes.length], ['My tree', 'Acc', 'one\ntwo', 1]);
  assert.deepEqual(warnings, []);
  const late = parseTreeView('treeView-beta\n  a\ntitle Late');
  assert.equal(late.ast.title, undefined);
  assert.equal(late.ast.nodes.length, 1);
  assert.equal(late.warnings.length, 1);
});

test('unrecognized text and unsupported lines warn, never throw', () => {
  const { ast, warnings } = parseTreeView('treeView-beta\n  "a" b\n  ## orphan\n  c icon(fa fa-x)');
  assert.deepEqual(ast.nodes.map((n) => n.label), ['a', 'c']);
  assert.equal(warnings.length, 3);
});

test('depth and node count are capped', () => {
  const deep = 'treeView-beta\n' + Array.from({ length: 50 }, (_, i) => ' '.repeat(i + 1) + `n${i}`).join('\n');
  const d = parseTreeView(deep);
  assert.equal(d.ast.nodes.length, 32);
  assert.equal(d.warnings.length, 1);
  const wide = 'treeView-beta\n' + Array.from({ length: 2100 }, (_, i) => `  n${i}`).join('\n');
  assert.equal(parseTreeView(wide).ast.nodes.length, 2000);
});

test('labels keep injection characters verbatim; an unclosed quote warns and does not throw', () => {
  const { ast, warnings } = parseTreeView("treeView-beta\n  \"<b>&'\" ## <i>\n  \"open");
  assert.equal(ast.nodes[0]?.label, "<b>&'");
  assert.equal(ast.nodes[0]?.description, '<i>');
  assert.equal(ast.nodes[1]?.label, 'open');
  assert.equal(warnings.length, 1);
});

test('an unquoted label with spaces and emoji keeps its whole text up to the annotations', () => {
  const { ast, warnings } = parseTreeView('treeView-beta\n  🚀 rocket-app/\n    📦 my packages/ ## note\n      README.md :::highlight');
  assert.deepEqual(ast.nodes.map((n) => n.label), ['🚀 rocket-app', '📦 my packages', 'README.md']);
  assert.equal(ast.nodes[1]?.description, 'note');
  assert.equal(ast.nodes[2]?.highlighted, true);
  assert.deepEqual(warnings, []);
});
