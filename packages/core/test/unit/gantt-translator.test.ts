import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateGanttToOoxml } from '../../src/diagrams/gantt/translator.js';
import { parseGanttChart } from '../../src/diagrams/gantt/parser.js';
import type { GanttChart } from '../../src/diagrams/gantt/types.js';

function chart(source: string): GanttChart {
  return parseGanttChart(source).ast;
}

test('wraps output in the shared wpc:wpc drawing-canvas envelope', () => {
  const xml = translateGanttToOoxml(chart('gantt\ndateFormat YYYY-MM-DD\nA :a1, 2026-01-05, 2d'));
  assert.match(xml, /<w:drawing>/);
  assert.match(xml, /<wpc:wpc/);
  assert.match(xml, /<\/wpc:wpc>/);
});

test('a milestone renders as a diamond, not a bar', () => {
  const xml = translateGanttToOoxml(chart('gantt\ndateFormat YYYY-MM-DD\nGo-live :milestone, m1, 2026-01-05, 0d'));
  assert.match(xml, /prst="diamond"/);
});

test('an ordinary task renders as a rounded-rectangle bar', () => {
  const xml = translateGanttToOoxml(chart('gantt\ndateFormat YYYY-MM-DD\nA :a1, 2026-01-05, 2d'));
  assert.match(xml, /prst="roundRect"/);
});

test('a section change emits a labeled section band', () => {
  const xml = translateGanttToOoxml(
    chart('gantt\ndateFormat YYYY-MM-DD\nsection Cadrage\nA :a1, 2026-01-05, 1d\nsection Deploiement\nB :b1, 2026-01-06, 1d'),
  );
  assert.match(xml, /Cadrage/);
  assert.match(xml, /Deploiement/);
});

test('user-controlled task text is XML-escaped', () => {
  const xml = translateGanttToOoxml(chart('gantt\ndateFormat YYYY-MM-DD\n<script> :a1, 2026-01-05, 1d'));
  assert.doesNotMatch(xml, /<script>/);
  assert.match(xml, /&lt;script&gt;/);
});

/** The texts of the drawing, in order (axis labels first, then section and task labels). */
function texts(xml: string): string[] {
  return [...xml.matchAll(/<w:t xml:space="preserve">([^<]*)<\/w:t>/g)].map((m) => m[1] ?? '');
}

/** `x` and `cx` of the first shape named `name` (`Task`, `Milestone`…). */
function shapeX(xml: string, name: string): { x: number; cx: number } {
  const m = new RegExp(`name="${name} \\d+"/>[\\s\\S]*?<a:off x="(\\d+)"[^>]*/><a:ext cx="(\\d+)"`).exec(xml);
  assert.ok(m, `no ${name} shape`);
  return { x: Number(m[1]), cx: Number(m[2]) };
}

test('ticks: automatic steps from minutes to years, axisFormat for the labels', () => {
  const minutes = texts(translateGanttToOoxml(chart('gantt\ndateFormat HH:mm\nA :a, 17:49, 23m')));
  assert.deepEqual(minutes.slice(0, 3), ['17:50', '18:00', '18:10']);
  const days = texts(translateGanttToOoxml(chart('gantt\nA :a, 2026-01-05, 20d')));
  assert.deepEqual(days.slice(0, 3), ['01-05', '01-12', '01-19']);
  const years = texts(translateGanttToOoxml(chart('gantt\ndateFormat YYYY\nA :a, 1990, 2030')));
  assert.deepEqual(years.slice(0, 2), ['1990', '1995']);
  const formatted = texts(translateGanttToOoxml(chart('gantt\naxisFormat %d %b\nA :a, 2026-01-05, 20d')));
  assert.deepEqual(formatted.slice(0, 2), ['05 Jan', '12 Jan']);
});

test('tickInterval and weekday set the ticks', () => {
  const weekly = texts(translateGanttToOoxml(chart('gantt\ntickInterval 1week\nweekday wednesday\nA :a, 2026-01-05, 20d')));
  assert.deepEqual(weekly.slice(0, 3), ['01-07', '01-14', '01-21']);
  const everyTwoDays = texts(translateGanttToOoxml(chart('gantt\ntickInterval 2day\nA :a, 2026-01-02, 4d')));
  assert.deepEqual(everyTwoDays.slice(0, 2), ['01-03', '01-05']);
});

test('a long span is fitted into the bounded width instead of growing without limit', () => {
  const tenYears = shapeX(translateGanttToOoxml(chart('gantt\ndateFormat YYYY\nA :a, 1990, 2000'), { maxDrawingCx: 1e9 }), 'Task');
  const fortyDays = shapeX(translateGanttToOoxml(chart('gantt\nA :a, 2026-01-01, 40d'), { maxDrawingCx: 1e9 }), 'Task');
  assert.equal(tenYears.cx, fortyDays.cx);
});

test('a milestone is centred on the middle of its span, as in Mermaid', () => {
  const xml = translateGanttToOoxml(chart('gantt\ndateFormat HH:mm\nRef :r, 10:00, 10m\nM :milestone, m, 10:00, 10m'), { maxDrawingCx: 1e9 });
  const bar = shapeX(xml, 'Task');
  const diamond = shapeX(xml, 'Milestone');
  assert.ok(Math.abs(diamond.x + diamond.cx / 2 - (bar.x + bar.cx / 2)) <= 1);
});

test('a vert task is a line with its label under the chart, not a row', () => {
  const xml = translateGanttToOoxml(chart('gantt\ndateFormat HH:mm\nA :a, 09:00, 30m\nEnd : vert, v, 09:20, 1m'));
  assert.doesNotMatch(xml, /prst="roundRect"[\s\S]*prst="roundRect"/);
  assert.match(xml, /srgbClr val="1F3864"/);
  assert.equal(texts(xml).at(-1), 'End');
});

test('shaded days come from the parser: Friday and Saturday after weekend friday', () => {
  const xml = translateGanttToOoxml(chart('gantt\nexcludes weekends\nweekend friday\nA :a, 2026-04-01, 6d'));
  // 2026-04-03 and 04-04 (Friday, Saturday); the task, pushed past them, ends on the 9th.
  assert.equal((xml.match(/srgbClr val="F2F2F2"/g) ?? []).length, 2);
});

test('user text reaching new places is XML-escaped: a vert label, the literal text of axisFormat', () => {
  const xml = translateGanttToOoxml(chart('gantt\naxisFormat <b>&"%d\'\nA :a, 2026-01-05, 3d\n<i>&x : vert, 2026-01-06, 1d'));
  assert.doesNotMatch(xml, /<b>|<i>/);
  assert.match(xml, /&lt;b&gt;&amp;&quot;05&apos;/);
  assert.match(xml, /&lt;i&gt;&amp;x/);
});

test('an empty chart (no tasks) still produces a valid, self-contained drawing', () => {
  const xml = translateGanttToOoxml(chart('gantt\ndateFormat YYYY-MM-DD\ntitle Empty'));
  assert.match(xml, /<wpc:wpc/);
  assert.match(xml, /Empty/);
});
