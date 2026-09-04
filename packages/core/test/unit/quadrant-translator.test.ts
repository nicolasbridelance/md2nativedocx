import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuadrantChart } from '../../src/diagrams/quadrant/parser.js';
import { translateQuadrantToOoxml } from '../../src/diagrams/quadrant/translator.js';
import type { QuadrantChart } from '../../src/diagrams/quadrant/types.js';

function translate(text: string): string {
  const { ast } = parseQuadrantChart(text);
  return translateQuadrantToOoxml(ast);
}

const SAMPLE = `quadrantChart
    title Reach and engagement of campaigns
    x-axis Low Reach --> High Reach
    y-axis Low Engagement --> High Engagement
    quadrant-1 We should expand
    quadrant-2 Need to promote
    quadrant-3 Re-evaluate
    quadrant-4 May be improved
    Campaign A: [0.3, 0.6]
    Campaign B: [0.45, 0.23]`;

test('wraps the drawing canvas in the schema-required paragraph hierarchy, same envelope as flowchart', () => {
  const xml = translate(SAMPLE);
  assert.ok(xml.startsWith('<w:p '));
  assert.ok(xml.trimEnd().endsWith('</w:p>'));
  const order = [
    '<w:p ',
    '<w:r>',
    '<w:drawing>',
    '<wp:inline ',
    '<a:graphic ',
    '<a:graphicData ',
    '<wpc:wpc ',
    '<wps:wsp>',
    '</wpc:wpc>',
    '</a:graphicData>',
    '</a:graphic>',
    '</wp:inline>',
    '</w:drawing>',
    '</w:r>',
    '</w:p>',
  ];
  let idx = -1;
  for (const token of order) {
    const found = xml.indexOf(token, idx + 1);
    assert.ok(found > idx, `expected "${token}" after position ${idx}`);
    idx = found;
  }
});

test('emits exactly 4 quadrant rects + 4 quadrant labels + 2 points (dot+label each) + 1 title', () => {
  const xml = translate(SAMPLE);
  // 4 quadrant cells + 2 point dots = 6 non-text-only rect/ellipse shapes with cNvSpPr.
  const shapeCount = (xml.match(/<wps:cNvSpPr\/?>/g) ?? []).length;
  assert.equal(shapeCount, 4 + 2);
  // title + 4 quadrant labels + 2 axis-low + 2 axis-high + 2 point labels = 11 text boxes.
  const textBoxCount = (xml.match(/txBox="1"/g) ?? []).length;
  assert.equal(textBoxCount, 1 + 4 + 2 + 2 + 2);
});

test('every quadrant label and point name is present, XML-escaped', () => {
  const xml = translate('quadrantChart\n  quadrant-1 A & B\n  "P<1>": [0.5, 0.5]');
  assert.ok(xml.includes('A &amp; B'));
  assert.ok(xml.includes('P&lt;1&gt;'));
  assert.ok(!xml.includes('P<1>'));
});

test('a point color override reaches the dot fill', () => {
  const xml = translate('quadrantChart\n  A: [0.1, 0.1] color: #ff3300');
  assert.ok(xml.includes('val="FF3300"'));
});

test('an invalid point color falls back to the default rather than reaching the XML unvalidated', () => {
  const chart: QuadrantChart = { quadrants: {}, points: [{ name: 'A', x: 0.1, y: 0.1, color: 'not-a-color' }] };
  const xml = translateQuadrantToOoxml(chart);
  assert.ok(!xml.includes('not-a-color'));
  assert.ok(xml.includes('val="2F5496"'));
});

test('a chart with no title still renders (smaller top margin, no title text box)', () => {
  const xml = translate('quadrantChart\n  quadrant-1 Only this');
  assert.ok(xml.includes('Only this'));
  const textBoxCount = (xml.match(/txBox="1"/g) ?? []).length;
  assert.equal(textBoxCount, 1); // just the one quadrant label, no title box
});

test('a chart with no points still renders the grid and quadrant labels', () => {
  const xml = translate('quadrantChart\n  title Empty\n  quadrant-1 A\n  quadrant-2 B\n  quadrant-3 C\n  quadrant-4 D');
  const shapeCount = (xml.match(/<wps:cNvSpPr\/?>/g) ?? []).length;
  assert.equal(shapeCount, 4); // 4 quadrant rects, 0 point dots
});

test('is a pure function: identical input produces byte-identical output', () => {
  assert.equal(translate(SAMPLE), translate(SAMPLE));
});
