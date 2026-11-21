import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTreeView } from '../../src/diagrams/tree-view/parser.js';
import { translateTreeViewToOoxml } from '../../src/diagrams/tree-view/translator.js';

const tr = (t: string): string => translateTreeViewToOoxml(parseTreeView(t).ast);
/** The `a:off` x of the shape whose text is `text`. */
const xOf = (xml: string, text: string): number => {
  const shape = xml.split('<wps:wsp>').find((s) => s.includes(`>${text}<`)) ?? '';
  return Number(/<a:off x="(\d+)"/.exec(shape)?.[1] ?? NaN);
};

test('draws the implicit / root, folders in bold without their slash, descriptions in green italics', () => {
  const xml = tr('treeView-beta\n  src/ ## code\n    a.ts');
  assert.ok(xml.includes('wpc:wpc'));
  for (const text of ['/', 'src', 'code', 'a.ts']) assert.ok(xml.includes(`>${text}<`), text);
  assert.ok(!xml.includes('>src/<'));
  assert.ok(xml.includes('<w:b/>') && xml.includes('<w:i/>'));
  assert.ok(xml.includes('6A9955'));
  assert.ok(xOf(xml, '/') < xOf(xml, 'src') && xOf(xml, 'src') < xOf(xml, 'a.ts'));
});

test('descriptions line up in one column to the right of the longest name', () => {
  const xml = tr('treeView-beta\n  a ## one\n  a-much-longer-name.ts\n    b ## two');
  assert.equal(xOf(xml, 'one'), xOf(xml, 'two'));
  assert.ok(xOf(xml, 'one') > xOf(xml, 'a-much-longer-name.ts'));
});

test('highlight draws an amber band behind the row; plain rows have none', () => {
  assert.ok(tr('treeView-beta\n  a :::highlight').includes('FFF6DA'));
  assert.ok(tr('treeView-beta\n  a :::highlight').includes('FFC107'));
  assert.ok(!tr('treeView-beta\n  a').includes('FFF6DA'));
});

test('the title, or else accTitle, names the drawing', () => {
  assert.ok(tr('treeView-beta\ntitle My <tree>\n  a').includes('name="My &lt;tree&gt;"'));
  assert.ok(tr('treeView-beta\naccTitle: Acc\n  a').includes('name="Acc"'));
  assert.ok(tr('treeView-beta\n  a').includes('name="Tree view"'));
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
