import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSankey } from '../../src/diagrams/sankey/parser.js';
import { translateSankeyToOoxml } from '../../src/diagrams/sankey/translator.js';

const tr = (t: string): string => translateSankeyToOoxml(parseSankey(t).ast);
const base = 'sankey-beta\na,b,10\na,c,5\nb,d,10\nc,d,5';

test('renders node names, values and one ribbon per link', () => {
  const xml = tr(base);
  assert.ok(xml.includes('wpc:wpc'));
  for (const text of ['a', 'b', 'c', 'd', '15']) assert.ok(xml.includes(`>${text}<`), text);
  assert.equal(xml.split('a:custGeom').length - 1 >= 8, true);
});

test('handles skip-column links, diamonds and fractional values', () => {
  assert.ok(tr('sankey-beta\na,b,1\nb,c,1\na,c,2').includes('>4<') === false);
  assert.ok(tr('sankey-beta\na,b,0.125\nb,c,0.125').includes('>0.13<'));
});

test('escapes XML metacharacters in node names', () => {
  const xml = tr('sankey-beta\n"<a>&","\'b\'",3');
  assert.ok(!xml.includes('<a>'));
  assert.ok(xml.includes('&lt;a&gt;&amp;'));
});

test('no external relationships; link-less diagrams yield a note', () => {
  assert.ok(!tr(base).includes('TargetMode'));
  assert.ok(tr('sankey-beta').includes('at least one link'));
});
