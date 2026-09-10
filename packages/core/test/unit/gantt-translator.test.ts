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

test('an empty chart (no tasks) still produces a valid, self-contained drawing', () => {
  const xml = translateGanttToOoxml(chart('gantt\ndateFormat YYYY-MM-DD\ntitle Empty'));
  assert.match(xml, /<wpc:wpc/);
  assert.match(xml, /Empty/);
});
