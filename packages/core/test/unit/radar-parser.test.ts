import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRadar } from '../../src/diagrams/radar/parser.js';

test('parses title, axes (several per line), list curves and options', () => {
  const { ast, warnings } = parseRadar(
    'radar-beta\n  title T\n  axis a["A"], b["B"]\n  axis c\n  curve x["X"]{1, 2, 3}, y{4,5,6}\n  max 10\n  min 1\n  ticks 3\n  graticule polygon\n  showLegend false',
  );
  assert.equal(ast.title, 'T');
  assert.deepEqual(ast.axes.map((a) => [a.id, a.label]), [['a', 'A'], ['b', 'B'], ['c', 'c']]);
  assert.deepEqual(ast.curves.map((c) => [c.id, c.label, c.values]), [['x', 'X', [1, 2, 3]], ['y', 'y', [4, 5, 6]]]);
  assert.deepEqual([ast.max, ast.min, ast.ticks, ast.graticule, ast.showLegend], [10, 1, 3, 'polygon', false]);
  assert.deepEqual(warnings, []);
});

test('keyed curves are re-ordered to axis order; gaps use min; unknown keys warn', () => {
  const { ast, warnings } = parseRadar('radar-beta\n  axis a, b, c\n  curve k{ c: 30, a: 20, zz: 5 }');
  assert.deepEqual(ast.curves[0]?.values, [20, 0, 30]);
  assert.equal(warnings.length, 1);
});

test('defaults: max = largest value, ticks 5, circle graticule, legend on; bad max falls back', () => {
  const { ast } = parseRadar('radar-beta\n  axis a, b, c\n  curve k{1, 7, 3}');
  assert.deepEqual([ast.max, ast.ticks, ast.graticule, ast.showLegend], [7, 5, 'circle', true]);
  const bad = parseRadar('radar-beta\n  axis a, b, c\n  curve k{1, 7, 3}\n  max 0');
  assert.equal(bad.ast.max, 7);
  assert.equal(bad.warnings.length, 1);
});

test('extra values and non-numbers warn; ticks clamped; frontmatter warns once', () => {
  const { ast, warnings } = parseRadar('radar-beta\n  axis a, b\n  curve k{1, x, 3, 4}\n  ticks 999');
  assert.deepEqual(ast.curves[0]?.values, [1, 0]);
  assert.equal(ast.ticks, 20);
  assert.equal(warnings.length, 2);
  assert.equal(parseRadar('---\nconfig:\n  a: b\n---\nradar-beta\n  axis a').warnings.length, 1);
});

test('axes and curves are capped; labels keep injection characters verbatim', () => {
  const many = 'radar-beta\n' + Array.from({ length: 100 }, (_, i) => `  axis a${i}`).join('\n');
  const r = parseRadar(many);
  assert.equal(r.ast.axes.length, 64);
  assert.equal(r.warnings.length, 1);
  const { ast } = parseRadar('radar-beta\n  title <t>&\n  axis a["<b>&\'"]');
  assert.equal(ast.axes[0]?.label, "<b>&'");
});
