import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTreemap } from '../../src/diagrams/treemap/parser.js';
import { translateTreemapToOoxml } from '../../src/diagrams/treemap/translator.js';

const tr = (t: string): string => translateTreemapToOoxml(parseTreemap(t).ast);

test('renders section headers, leaf labels and values in the canvas envelope', () => {
  const xml = tr('treemap-beta\n"Cat"\n  "Item A": 10\n  "Item B": 20');
  assert.ok(xml.includes('wpc:wpc'));
  for (const t of ['Cat', 'Item A', 'Item B', '10', '20']) assert.ok(xml.includes(`>${t}<`), t);
});

test('leaf areas are proportional to values (squarified layout)', () => {
  const xml = tr('treemap-beta\n"A": 75\n"B": 25');
  const dims = [...xml.matchAll(/<a:ext cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => Number(m[1]) * Number(m[2]));
  const [big, small] = dims.slice(-2).sort((a, b) => b - a);
  assert.ok(Math.abs((big ?? 0) / (small ?? 1) - 3) < 0.05);
});

test('classDef fill overrides the palette; invalid color values never reach the XML', () => {
  const xml = tr('treemap-beta\n"A": 5:::c\nclassDef c fill:#123456');
  assert.ok(xml.includes('123456'));
  const bad = tr('treemap-beta\n"A": 5:::c\nclassDef c fill:"/><x/>');
  assert.ok(!bad.includes('<x/>'));
});

test('escapes XML metacharacters; no external relationships; empty yields a note', () => {
  const xml = tr('treemap-beta\n"<x>&": 5');
  assert.ok(!xml.includes('<x>') && !xml.includes('TargetMode'));
  assert.ok(tr('treemap-beta').includes('no values'));
  assert.ok(tr('treemap-beta\n"Empty section"').includes('no values'));
});
