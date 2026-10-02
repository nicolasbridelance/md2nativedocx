import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRadar } from '../../src/diagrams/radar/parser.js';
import { translateRadarToOoxml } from '../../src/diagrams/radar/translator.js';

const tr = (t: string): string => translateRadarToOoxml(parseRadar(t).ast);
const base = 'radar-beta\n  title T\n  axis a["Alpha"], b["Beta"], c["Gamma"]\n  curve x["Curve X"]{1, 2, 3}';

test('renders title, axis labels and legend inside the canvas envelope', () => {
  const xml = tr(base);
  assert.ok(xml.includes('wpc:wpc'));
  for (const text of ['T', 'Alpha', 'Beta', 'Gamma', 'Curve X']) assert.ok(xml.includes(`>${text}<`), text);
  assert.ok(xml.includes('a:custGeom') && xml.includes('<a:close/>'));
});

test('graticule style and legend option change the output', () => {
  assert.ok(tr(base).includes('prst="ellipse"'));
  assert.ok(!tr(base + '\n  graticule polygon').includes('prst="ellipse"'));
  assert.ok(!tr(base + '\n  showLegend false').includes('>Curve X<'));
});

test('escapes XML metacharacters', () => {
  const xml = tr('radar-beta\n  title <t>&\n  axis a["<x>&"], b, c\n  curve k["<y>\'"]{1,2,3}');
  for (const raw of ['<t>', '<x>', '<y>']) assert.ok(!xml.includes(raw), raw);
  assert.ok(xml.includes('&lt;x&gt;&amp;'));
});

test('no external relationships; fewer than 3 axes yields a note', () => {
  assert.ok(!tr(base).includes('TargetMode'));
  assert.ok(tr('radar-beta\n  axis a, b').includes('at least 3 axes'));
});
