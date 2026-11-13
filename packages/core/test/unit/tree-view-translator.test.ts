import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTreeView } from '../../src/diagrams/tree-view/parser.js';
import { translateTreeViewToOoxml } from '../../src/diagrams/tree-view/translator.js';

const tr = (t: string): string => translateTreeViewToOoxml(parseTreeView(t).ast);

test('renders labels and descriptions inside the canvas envelope', () => {
  const xml = tr('treeView-beta\n  src/ ## code\n    a.ts');
  assert.ok(xml.includes('wpc:wpc'));
  for (const text of ['src/', 'code', 'a.ts']) assert.ok(xml.includes(`>${text}<`), text);
  assert.ok(xml.includes('<w:b/>') && xml.includes('<w:i/>'));
});

test('highlight adds a fill; plain nodes do not', () => {
  assert.ok(tr('treeView-beta\n  a:::highlight').includes('FFF2CC'));
  assert.ok(!tr('treeView-beta\n  a').includes('FFF2CC'));
});

test('escapes XML metacharacters in labels and descriptions', () => {
  const xml = tr("treeView-beta\n  \"<x>&'\" ## <d>\"");
  assert.ok(!xml.includes('<x>') && !xml.includes('<d>'));
  assert.ok(xml.includes('&lt;x&gt;&amp;'));
});

test('no external relationships; empty tree yields a note', () => {
  assert.ok(!tr('treeView-beta\n  a').includes('TargetMode'));
  assert.ok(tr('treeView-beta').includes('no nodes'));
});
