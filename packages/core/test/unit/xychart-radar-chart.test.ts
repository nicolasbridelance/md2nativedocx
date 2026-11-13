import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseXyChart } from '../../src/diagrams/xychart/parser.js';
import { translateXyChartToChart } from '../../src/diagrams/xychart/chart.js';
import { parseRadar } from '../../src/diagrams/radar/parser.js';
import { translateRadarToChart } from '../../src/diagrams/radar/chart.js';

const xy = (text: string) => parseXyChart(text).ast;
const radar = (text: string) => parseRadar(text).ast;

test('xychart: bars and a line share one category axis and one value axis in a single chart', () => {
  const out = translateXyChartToChart(
    xy('xychart-beta\n  title "T"\n  x-axis [a, b, c]\n  y-axis "Y" 0 --> 10\n  bar [1, 2, 3]\n  line [3, 2, 1]'),
    'id',
    { embedWorkbook: true },
  );
  assert.match(out.chartXml, /<c:barChart><c:barDir val="col"\/>/);
  assert.match(out.chartXml, /<c:lineChart>/);
  assert.equal(out.chartXml.match(/<c:catAx>/g)?.length, 1);
  assert.equal(out.chartXml.match(/<c:valAx>/g)?.length, 1);
  assert.match(out.chartXml, /<c:max val="10"\/><c:min val="0"\/>/);
  assert.match(out.chartXml, /<c:f>Sheet1!\$A\$2:\$A\$4<\/c:f>/);
  assert.deepEqual(out.workbook.header, ['Category', 'Series 1', 'Series 2']);
  assert.deepEqual(out.workbook.rows, [['a', 1, 3], ['b', 2, 2], ['c', 3, 1]]);
  assert.match(out.chartXml, /<c:externalData r:id="rId1">/);
});

test('xychart: series indices are unique across the bar and line groups, and a legend appears only for several series', () => {
  const two = translateXyChartToChart(xy('xychart-beta\n  x-axis [a, b]\n  bar [1, 2]\n  line [2, 1]'), 'id');
  assert.deepEqual([...two.chartXml.matchAll(/<c:idx val="(\d+)"\/><c:order/g)].map((m) => m[1]), ['0', '1']);
  assert.match(two.chartXml, /<c:legend>/);
  const one = translateXyChartToChart(xy('xychart-beta\n  x-axis [a, b]\n  bar [1, 2]'), 'id');
  assert.doesNotMatch(one.chartXml, /<c:legend>/);
});

test('xychart: a numeric x-axis becomes evenly spaced category labels', () => {
  const out = translateXyChartToChart(xy('xychart-beta\n  x-axis "t" 0 --> 10\n  line [1, 4, 9, 16, 25, 36]'), 'id');
  assert.deepEqual(out.workbook.rows.map((r) => r[0]), ['0', '2', '4', '6', '8', '10']);
});

test('xychart: a horizontal chart keeps its first category on top and the value axis at the bottom', () => {
  const out = translateXyChartToChart(xy('xychart-beta horizontal\n  x-axis [a, b]\n  bar [1, 2]'), 'id');
  assert.match(out.chartXml, /<c:barDir val="bar"\/>/);
  assert.match(out.chartXml, /<c:orientation val="maxMin"\/>/);
  assert.match(out.chartXml, /<c:crosses val="max"\/>/);
});

test('xychart: a horizontal chart with a line series cannot be a native chart (caller falls back to shapes)', () => {
  assert.throws(() => translateXyChartToChart(xy('xychart-beta horizontal\n  x-axis [a]\n  bar [1]\n  line [2]'), 'id'), RangeError);
});

test('xychart: user text is escaped in titles, axis titles, categories and series names (rule #2)', () => {
  const out = translateXyChartToChart(
    {
      horizontal: false,
      title: 'T <&>',
      xAxis: { title: 'X "x"', categories: ['a & b', '<c>'] },
      yAxis: { title: "Y 'y'" },
      series: [{ kind: 'bar', name: '</c:v><c:evil/>', values: [1, 2], labels: [undefined, undefined] }],
    },
    'id',
  );
  assert.doesNotMatch(out.chartXml, /<c:evil/);
  assert.match(out.chartXml, /a &amp; b/);
  assert.match(out.chartXml, /T &lt;&amp;&gt;/);
});

test('radar: one series per curve, one category per axis, scale and ring count from max/min/ticks', () => {
  const out = translateRadarToChart(
    radar('radar-beta\n  axis a["A"], b["B"], c["C"]\n  curve x["X"]{1, 2, 3}\n  curve y["Y"]{3, 2, 1}\n  max 6\n  ticks 3'),
    'id',
    { embedWorkbook: true },
  );
  assert.equal(out.chartXml.match(/<c:ser>/g)?.length, 2);
  assert.match(out.chartXml, /<c:radarStyle val="filled"\/>/);
  assert.match(out.chartXml, /<c:max val="6"\/><c:min val="0"\/>/);
  assert.match(out.chartXml, /<c:majorUnit val="2"\/>/);
  assert.deepEqual(out.workbook.header, ['Category', 'X', 'Y']);
  assert.deepEqual(out.workbook.rows, [['A', 1, 3], ['B', 2, 2], ['C', 3, 1]]);
});

test('radar: fewer than three axes cannot be a radar chart', () => {
  assert.throws(() => translateRadarToChart(radar('radar-beta\n  axis a["A"], b["B"]\n  curve x["X"]{1, 2}'), 'id'), RangeError);
});
