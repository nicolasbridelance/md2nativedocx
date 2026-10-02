import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWardley } from '../../src/diagrams/wardley/parser.js';
import { translateWardleyToOoxml } from '../../src/diagrams/wardley/translator.js';

const tr = (t: string): string => translateWardleyToOoxml(parseWardley(t).ast);
const base = 'wardley-beta\ntitle Map\nanchor U [0.9, 0.6]\ncomponent A [0.6, 0.3]\ncomponent B [0.3, 0.8] (buy)\nU->A\nA +> B\nevolve A 0.6';

test('renders title, default stages, axes, nodes and arrows', () => {
  const xml = tr(base);
  assert.ok(xml.includes('wpc:wpc'));
  for (const t of ['Map', 'Genesis', 'Custom Built', 'Product', 'Commodity', 'Visibility', 'Evolution', 'U', 'A', 'B']) assert.ok(xml.includes(`>${t}<`), t);
  assert.ok(xml.includes('prst="diamond"'));
  assert.ok(xml.includes('DC3545'));
  assert.ok(xml.includes('tailEnd'));
});

test('uses custom stage names', () => {
  const xml = tr('wardley-beta\nevolution Idea -> Done\ncomponent A [0.5, 0.5]');
  assert.ok(xml.includes('>Idea<') && xml.includes('>Done<') && !xml.includes('>Genesis<'));
});

test('escapes XML metacharacters in names, labels, notes and title', () => {
  const xml = tr('wardley-beta\ntitle <t>&\ncomponent "<a>&" [0.5, 0.5]\nnote "\'<n>\'" [0.2, 0.2]');
  assert.ok(!xml.includes('<a>') && !xml.includes('<n>') && !xml.includes('<t>'));
  assert.ok(xml.includes('&lt;a&gt;&amp;') && xml.includes('&lt;t&gt;&amp;'));
});

test('no external relationships; empty map yields a note', () => {
  assert.ok(!tr(base).includes('TargetMode'));
  assert.ok(tr('wardley-beta').includes('at least one component'));
});
