import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePacketDiagram } from '../../src/diagrams/packet/parser.js';
import { translatePacketToOoxml } from '../../src/diagrams/packet/translator.js';

const tr = (t: string): string => translatePacketToOoxml(parsePacketDiagram(t).ast);

test('renders labels, title and bit numbers inside the canvas envelope', () => {
  const xml = tr('packet\ntitle T\n0-15: "Source"\n16-31: "Dest"');
  assert.ok(xml.includes('wpc:wpc'));
  for (const t of ['T', 'Source', 'Dest', '0', '15', '16', '31']) assert.ok(xml.includes(`>${t}<`), t);
});

test('a field crossing a row boundary is split into one segment per row', () => {
  const xml = tr('packet\n0-31: "A"\n32-95: "Wide"');
  assert.equal((xml.match(/>Wide</g) ?? []).length, 2);
});

test('field width is proportional to bit count', () => {
  const xml = tr('packet\n0-7: "a"\n8-31: "b"');
  const widths = [...xml.matchAll(/<a:ext cx="(\d+)" cy="\d+"\/>/g)].map((m) => Number(m[1]));
  assert.ok(widths.includes(8 * 18 * 9525) && widths.includes(24 * 18 * 9525));
});

test('escapes XML metacharacters; no external relationships; empty yields a note', () => {
  const xml = tr('packet\n0: "<x>&"');
  assert.ok(!xml.includes('<x>') && !xml.includes('TargetMode'));
  assert.ok(tr('packet').includes('no fields'));
});
