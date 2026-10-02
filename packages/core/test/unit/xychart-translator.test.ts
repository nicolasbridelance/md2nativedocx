import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseXyChart } from '../../src/diagrams/xychart/parser.js';
import { translateXyChartToOoxml } from '../../src/diagrams/xychart/translator.js';

const tr = (t: string): string => translateXyChartToOoxml(parseXyChart(t).ast);
const base = 'xychart-beta\n  title "T"\n  x-axis "Months" [jan, feb, mar]\n  y-axis "Rev" 0 --> 100\n  bar "Bars" [10, 50, 90]\n  line "Trend" [20 "lbl", 40, 60]';

test('renders title, categories, ticks, series names, axis titles and point labels', () => {
  const xml = tr(base);
  assert.ok(xml.includes('wpc:wpc'));
  for (const text of ['T', 'jan', 'feb', 'mar', '0', '100', 'Bars', 'Trend', 'Months', 'Rev', 'lbl']) assert.ok(xml.includes(`>${text}<`), text);
  assert.ok(xml.includes('a:custGeom'));
});

test('horizontal orientation changes the geometry; auto range handles negatives and flat data', () => {
  assert.notEqual(tr(base), tr(base.replace('xychart-beta', 'xychart horizontal')));
  assert.ok(tr('xychart-beta\n  bar [-5, 3]').includes('wpc:wpc'));
  assert.ok(tr('xychart-beta\n  line [2, 2, 2]').includes('wpc:wpc'));
  assert.ok(tr('xychart-beta\n  line [7]').includes('wpc:wpc'));
});

test('escapes XML metacharacters in every text position', () => {
  const xml = tr('xychart-beta\n  title "<t>&"\n  x-axis "<x>" ["<c>"]\n  y-axis "<y>" 0 --> 9\n  bar "<b>" [1 "<l>"]');
  for (const raw of ['<t>', '<x>', '<c>', '<y>', '<b>', '<l>']) assert.ok(!xml.includes(raw), raw);
  assert.ok(xml.includes('&lt;t&gt;&amp;'));
});

test('no external relationships; series-less charts yield a note', () => {
  assert.ok(!tr(base).includes('TargetMode'));
  assert.ok(tr('xychart-beta\n  title "x"').includes('at least one series'));
});
