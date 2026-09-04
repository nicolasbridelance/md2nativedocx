import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuadrantChart } from '../../src/diagrams/quadrant/parser.js';

const SAMPLE = `quadrantChart
    title Reach and engagement of campaigns
    x-axis Low Reach --> High Reach
    y-axis Low Engagement --> High Engagement
    quadrant-1 We should expand
    quadrant-2 Need to promote
    quadrant-3 Re-evaluate
    quadrant-4 May be improved
    Campaign A: [0.3, 0.6]
    Campaign B: [0.45, 0.23] color: #ff3300, radius: 10`;

test('parses title, both axes, all four quadrant labels, and points', () => {
  const { ast, warnings } = parseQuadrantChart(SAMPLE);
  assert.equal(ast.title, 'Reach and engagement of campaigns');
  assert.deepEqual(ast.xAxis, { low: 'Low Reach', high: 'High Reach' });
  assert.deepEqual(ast.yAxis, { low: 'Low Engagement', high: 'High Engagement' });
  assert.equal(ast.quadrants[1], 'We should expand');
  assert.equal(ast.quadrants[2], 'Need to promote');
  assert.equal(ast.quadrants[3], 'Re-evaluate');
  assert.equal(ast.quadrants[4], 'May be improved');
  assert.equal(ast.points.length, 2);
  assert.deepEqual(ast.points[0], { name: 'Campaign A', x: 0.3, y: 0.6 });
  assert.equal(ast.points[1]?.name, 'Campaign B');
  assert.equal(ast.points[1]?.color, 'FF3300');
  // radius: isn't implemented yet (v1 scope, see parser.ts doc comment) — the
  // point must still parse, just without that cosmetic attribute.
  assert.equal(warnings.length, 0);
});

test('one-sided x-axis/y-axis (no --> arrow) keeps only the low label', () => {
  const { ast } = parseQuadrantChart('quadrantChart\n  x-axis Low\n  y-axis Low');
  assert.deepEqual(ast.xAxis, { low: 'Low' });
  assert.deepEqual(ast.yAxis, { low: 'Low' });
});

test('a quoted point name has its quotes stripped', () => {
  const { ast } = parseQuadrantChart('quadrantChart\n  "Campaign A": [0.1, 0.2]');
  assert.equal(ast.points[0]?.name, 'Campaign A');
});

test('a point with a :::className is parsed (styling ignored, position kept)', () => {
  const { ast, warnings } = parseQuadrantChart('quadrantChart\n  Point B:::class1: [0.3, 0.4]');
  assert.equal(ast.points[0]?.name, 'Point B');
  assert.equal(ast.points[0]?.x, 0.3);
  assert.equal(ast.points[0]?.y, 0.4);
  assert.equal(warnings.length, 0);
});

test('classDef is recognized and ignored with a warning, not silently dropped', () => {
  const { warnings } = parseQuadrantChart('quadrantChart\n  classDef class1 color: #109060, radius: 8');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /classDef/);
});

test('an unrecognized line is skipped with a warning, matching the flowchart parser convention', () => {
  const { warnings } = parseQuadrantChart('quadrantChart\n  this is not a valid statement');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /Unsupported line ignored/);
});

test('blank lines and %% comments are skipped without warnings', () => {
  const { ast, warnings } = parseQuadrantChart('quadrantChart\n\n%% a comment\n  title Foo\n');
  assert.equal(ast.title, 'Foo');
  assert.equal(warnings.length, 0);
});

test('a line that does not match any known statement is a generic "unsupported" warning', () => {
  const { ast, warnings } = parseQuadrantChart('quadrantChart\n  Bad: [x, y]');
  assert.equal(ast.points.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /Unsupported line ignored/);
});

test('malformed-but-matching coordinates (e.g. two decimal points) are skipped with a specific warning', () => {
  const { ast, warnings } = parseQuadrantChart('quadrantChart\n  Bad: [1.2.3, 0.4]');
  assert.equal(ast.points.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /non-numeric point coordinates/);
});
