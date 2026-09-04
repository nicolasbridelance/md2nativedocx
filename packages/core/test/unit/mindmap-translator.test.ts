import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMindmap } from '../../src/diagrams/mindmap/parser.js';
import { translateMindmapToOoxml } from '../../src/diagrams/mindmap/translator.js';
import type { MindmapChart } from '../../src/diagrams/mindmap/types.js';

function translate(text: string): string {
  const { ast } = parseMindmap(text);
  return translateMindmapToOoxml(ast);
}

const SAMPLE = `mindmap
  root((Central Concept))
    [Square Branch]
      Child A
      Child B
    Cloud Section`;

test('wraps the drawing canvas in the schema-required paragraph hierarchy, same envelope as the other diagram modules', () => {
  const xml = translate(SAMPLE);
  assert.ok(xml.startsWith('<w:p '));
  const order = ['<w:p ', '<w:r>', '<w:drawing>', '<wp:inline ', '<wpc:wpc ', '</wpc:wpc>', '</w:p>'];
  let idx = -1;
  for (const token of order) {
    const found = xml.indexOf(token, idx + 1);
    assert.ok(found > idx, `expected "${token}" after position ${idx}`);
    idx = found;
  }
});

test('emits one shape per node and one connector per parent-child edge', () => {
  const xml = translate(SAMPLE);
  // 5 nodes: root, Square Branch, Child A, Child B, Cloud Section.
  const nodeCount = (xml.match(/<wps:cNvSpPr\/?>/g) ?? []).length;
  assert.equal(nodeCount, 5);
  // 4 edges: root->Square Branch, root->Cloud Section, Square Branch->Child A/B.
  const connectorCount = (xml.match(/<wps:cNvCnPr\/?>/g) ?? []).length;
  assert.equal(connectorCount, 4);
});

test('every node uses its mapped preset geometry (square/hexagon/circle/default)', () => {
  const xml = translate(
    'mindmap\n  root\n    [Square]\n    {{Hex}}\n    ((Circle))\n    ))Bang((\n    )Cloud(\n    Default',
  );
  assert.ok(xml.includes('prstGeom prst="rect"'));
  assert.ok(xml.includes('prstGeom prst="hexagon"'));
  assert.ok(xml.includes('prstGeom prst="ellipse"'));
  assert.ok(xml.includes('prstGeom prst="irregularSeal2"'));
  assert.ok(xml.includes('prstGeom prst="cloud"'));
  assert.ok(xml.includes('prstGeom prst="roundRect"')); // root + default-shape node
});

test('direct children of the root each get a distinct branch color, inherited by their descendants', () => {
  const xml = translate(SAMPLE);
  // 2 distinct branch colors for the 2 direct children (Square Branch, Cloud Section).
  assert.ok(xml.includes('val="4472C4"'));
  assert.ok(xml.includes('val="ED7D31"'));
});

test('labels are XML-escaped', () => {
  const xml = translate('mindmap\n  root\n    [A & B]');
  assert.ok(xml.includes('A &amp; B'));
});

test('a null-root chart renders a visible note, not a silent blank canvas', () => {
  const chart: MindmapChart = { root: null };
  const xml = translateMindmapToOoxml(chart);
  assert.ok(xml.includes('no content to render'));
  assert.ok(!xml.includes('<wpc:wpc'));
});

test('a single-node mindmap (root only, no children) still renders', () => {
  const xml = translate('mindmap\n  root((Just Root))');
  const nodeCount = (xml.match(/<wps:cNvSpPr\/?>/g) ?? []).length;
  assert.equal(nodeCount, 1);
  const connectorCount = (xml.match(/<wps:cNvCnPr\/?>/g) ?? []).length;
  assert.equal(connectorCount, 0);
});

test('is a pure function: identical input produces byte-identical output', () => {
  assert.equal(translate(SAMPLE), translate(SAMPLE));
});
