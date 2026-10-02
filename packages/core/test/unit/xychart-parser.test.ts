import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseXyChart } from '../../src/diagrams/xychart/parser.js';

test('parses header, title, categorical x-axis, ranged y-axis and named series', () => {
  const { ast, warnings } = parseXyChart(
    'xychart-beta\n  title "Sales, 2026"\n  x-axis [jan, "feb x", mar]\n  y-axis "Rev" 10 --> 20\n  bar "B" [1, 2.5, -3]\n  line [4, 5, 6]',
  );
  assert.equal(ast.horizontal, false);
  assert.equal(ast.title, 'Sales, 2026');
  assert.deepEqual(ast.xAxis.categories, ['jan', 'feb x', 'mar']);
  assert.deepEqual([ast.yAxis.title, ast.yAxis.min, ast.yAxis.max], ['Rev', 10, 20]);
  assert.deepEqual(ast.series.map((s) => [s.kind, s.name, s.values]), [['bar', 'B', [1, 2.5, -3]], ['line', undefined, [4, 5, 6]]]);
  assert.deepEqual(warnings, []);
});

test('horizontal, titled x-axis, numeric x range, bare y range, quoted category titles', () => {
  const a = parseXyChart('xychart horizontal\n  x-axis "Sprint" ["S1", "S2"]\n  y-axis 0 --> 40\n  bar [1, 2]');
  assert.equal(a.ast.horizontal, true);
  assert.deepEqual([a.ast.xAxis.title, a.ast.xAxis.categories], ['Sprint', ['S1', 'S2']]);
  assert.deepEqual([a.ast.yAxis.title, a.ast.yAxis.min, a.ast.yAxis.max], [undefined, 0, 40]);
  const b = parseXyChart('xychart-beta\n  x-axis "T" 5 --> 15\n  line [1,2]');
  assert.deepEqual([b.ast.xAxis.title, b.ast.xAxis.min, b.ast.xAxis.max, b.ast.xAxis.categories], ['T', 5, 15, undefined]);
});

test('line point labels are kept; non-numeric values become 0 with one warning', () => {
  const { ast, warnings } = parseXyChart('xychart-beta\n  line [540 "label, with comma", 65, abc]');
  assert.deepEqual(ast.series[0]?.values, [540, 65, 0]);
  assert.deepEqual(ast.series[0]?.labels, ['label, with comma', undefined, undefined]);
  assert.equal(warnings.length, 1);
});

test('unknown lines warn; frontmatter warns once; caps hold; injection characters verbatim', () => {
  assert.equal(parseXyChart('xychart-beta\n  nonsense here\n  bar 1,2').warnings.length, 2);
  assert.equal(parseXyChart('---\nconfig:\n  a: b\n---\nxychart-beta\n  bar [1]').warnings.length, 1);
  const many = 'xychart-beta\n' + Array.from({ length: 30 }, () => '  bar [1]').join('\n');
  const r = parseXyChart(many);
  assert.equal(r.ast.series.length, 12);
  assert.equal(r.warnings.length, 1);
  const wide = parseXyChart(`xychart-beta\n  bar [${Array.from({ length: 500 }, (_, i) => i).join(',')}]`);
  assert.equal(wide.ast.series[0]?.values.length, 200);
  assert.equal(parseXyChart('xychart-beta\n  title "<t>&\'"\n  line [1]').ast.title, "<t>&'");
});
