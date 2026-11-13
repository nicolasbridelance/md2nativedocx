import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIshikawa } from '../../src/diagrams/ishikawa/parser.js';
import { translateIshikawaToOoxml } from '../../src/diagrams/ishikawa/translator.js';

const tr = (t: string): string => translateIshikawaToOoxml(parseIshikawa(t).ast);
const base = 'ishikawa-beta\n  Effect\n  Cat A\n    cause 1\n      sub 1\n  Cat B\n    cause 2\n  Cat C';

test('renders effect, categories and causes inside the canvas envelope', () => {
  const xml = tr(base);
  assert.ok(xml.includes('wpc:wpc'));
  for (const text of ['Effect', 'Cat A', 'Cat B', 'Cat C', 'cause 1', 'sub 1', 'cause 2']) assert.ok(xml.includes(`>${text}<`), text);
});

test('escapes XML metacharacters in every label', () => {
  const xml = tr('ishikawa-beta\n  <e>&\n  <a>"\n    <c>\'');
  for (const raw of ['<e>', '<a>', '<c>']) assert.ok(!xml.includes(raw), raw);
  assert.ok(xml.includes('&lt;e&gt;&amp;'));
});

test('no external relationships; effect-only and empty inputs render', () => {
  assert.ok(!tr(base).includes('TargetMode'));
  assert.ok(tr('ishikawa-beta\n  Only').includes('wpc:wpc'));
  assert.ok(tr('ishikawa-beta').includes('needs an effect'));
});
