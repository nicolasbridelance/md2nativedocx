import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePieChart } from '../../src/diagrams/pie/parser.js';
import { translatePieToOoxml } from '../../src/diagrams/pie/translator.js';

function translate(text: string): string {
  return translatePieToOoxml(parsePieChart(text).ast);
}

test('emits one pie-preset slice per row with clockwise angles starting at 12 o\'clock', () => {
  const xml = translate('pie\n  "A" : 1\n  "B" : 1');
  assert.equal((xml.match(/prst="pie"/g) ?? []).length, 2);
  // slice A: -90° -> 90° ; slice B: 90° -> 270°
  assert.ok(xml.includes('val 16200000') && xml.includes('val 5400000'));
  assert.ok(xml.includes('50%'));
});

test('a single slice is a full ellipse, not a degenerate pie', () => {
  const xml = translate('pie\n  "Only" : 5');
  assert.ok(xml.includes('prst="ellipse"'));
  assert.ok(!xml.includes('prst="pie"'));
});

test('showData appends the raw value to legend labels', () => {
  assert.ok(translate('pie showData\n  "A" : 2.5').includes('A [2.5]'));
  assert.ok(!translate('pie\n  "A" : 2.5').includes('[2.5]'));
});

test('omits the percentage label for slices under 1%', () => {
  const xml = translate('pie\n  "Big" : 999\n  "Tiny" : 1');
  assert.ok(!xml.includes('>0%<'));
});

test('escapes XML metacharacters in labels and title', () => {
  const xml = translate('pie title <b>&"\'\n  "<x>&\'" : 1');
  assert.ok(!xml.includes('<x>'));
  assert.ok(!xml.includes('<b>'));
  assert.ok(xml.includes('&lt;x&gt;&amp;'));
});

test('never emits external relationships; empty chart yields a note', () => {
  assert.ok(!translate('pie\n  "A" : 1').includes('TargetMode'));
  assert.ok(translate('pie').includes('no data'));
});
