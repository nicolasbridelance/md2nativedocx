import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEventModeling } from '../../src/diagrams/event-modeling/parser.js';
import { translateEventModelingToOoxml } from '../../src/diagrams/event-modeling/translator.js';

const tr = (t: string): string => translateEventModelingToOoxml(parseEventModeling(t).ast);
const base = 'eventmodeling\ntf 01 ui Screen\ntf 02 cmd Add {"a":1}\ntf 03 evt Added ->> 02\nrf 04 rmo View ->> 03\nnote 03 {\n n1\n}\ngwt 03 given evt Added then rmo View';

test('renders lanes, frame numbers, names, data, notes, arrows and scenarios', () => {
  const xml = tr(base);
  assert.ok(xml.includes('wpc:wpc'));
  for (const t of ['UI / Automation', 'Command / Read', 'Events', '01', '04 (reset)', 'Screen', 'Add', 'Added', 'View', 'n1']) assert.ok(xml.includes(`>${t}<`), t);
  assert.ok(xml.includes('{&quot;a&quot;:1}') || xml.includes('{"a":1}'));
  assert.ok(xml.includes('tailEnd'));
  assert.ok(xml.includes('Scenario @03: Given Event Added; Then Read model View'));
});

test('namespaces multiply lanes', () => {
  const xml = tr('eventmodeling\nrf 01 evt Inventory.Changed\nrf 02 evt External.Changed');
  assert.ok(xml.includes('Inventory / Events') && xml.includes('External / Events'));
});

test('escapes XML metacharacters in names, data, notes and scenarios', () => {
  const xml = tr('eventmodeling\ntf 01 ui A\ntf 02 cmd B <x> "&" ->> 01\ndata D {\n <d>&\n}\ntf 03 ui C [[D]]\nnote 01 {\n <n>&\n}');
  assert.ok(!xml.includes('<d>') && !xml.includes('<n>') && !xml.includes('<x>'));
  assert.ok(xml.includes('&lt;d&gt;&amp;') && xml.includes('&lt;n&gt;&amp;'));
});

test('no external relationships; empty diagram yields a note', () => {
  assert.ok(!tr(base).includes('TargetMode'));
  assert.ok(tr('eventmodeling').includes('at least one frame'));
});
