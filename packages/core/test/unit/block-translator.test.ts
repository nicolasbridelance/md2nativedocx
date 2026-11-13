import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlock } from '../../src/diagrams/block/parser.js';
import { translateBlockToOoxml } from '../../src/diagrams/block/translator.js';

const tr = (t: string): string => translateBlockToOoxml(parseBlock(t).ast);
const base = 'block-beta\n  columns 3\n  a["Alpha"] b:2\n  block:g:3\n    c d\n  end\n  a-- "go" -->b\n  c --> d';

test('renders block labels, groups, link labels and arrowheads', () => {
  const xml = tr(base);
  assert.ok(xml.includes('wpc:wpc'));
  for (const text of ['Alpha', 'b', 'c', 'd', 'go']) assert.ok(xml.includes(`>${text}<`), text);
  assert.ok(xml.includes('roundRect'));
  assert.ok(xml.includes('a:tailEnd'));
});

test('spans change the geometry; circle and diamond use their own presets', () => {
  assert.notEqual(tr('block-beta\n  columns 2\n  a b'), tr('block-beta\n  columns 2\n  a:2 b'));
  const xml = tr('block-beta\n  a(("c")) b{"d"}');
  assert.ok(xml.includes('prst="ellipse"') && xml.includes('prst="diamond"'));
});

test('escapes XML metacharacters in labels and link labels', () => {
  const xml = tr('block-beta\n  a["<t>&"] b["\'q\'"]\n  a-- "<l>" -->b');
  for (const raw of ['<t>', '<l>']) assert.ok(!xml.includes(raw), raw);
  assert.ok(xml.includes('&lt;t&gt;&amp;'));
});

test('no external relationships; empty diagrams yield a note; unknown link ends are skipped', () => {
  assert.ok(!tr(base).includes('TargetMode'));
  assert.ok(tr('block-beta\n  columns 2').includes('at least one block'));
  assert.ok(tr('block-beta\n  a\n  style zz fill:#fff').includes('wpc:wpc'));
});
