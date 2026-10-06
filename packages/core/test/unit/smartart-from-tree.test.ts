import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMindmap } from '../../src/diagrams/mindmap/parser.js';
import { parseTreeView } from '../../src/diagrams/tree-view/parser.js';
import {
  generateMindmapSmartArt,
  generateTreeViewSmartArt,
  mindmapToFlowchart,
  treeViewToFlowchart,
} from '../../src/smartart/from-tree.js';

const MINDMAP = ['mindmap', '  root((Projet))', '    Objectifs', '      Délais', '      Budget', '    Équipe', '      Dev', '      QA'].join('\n');

test('mindmap -> left-to-right tree, one node per item, one edge per parent link', () => {
  const fc = mindmapToFlowchart(parseMindmap(MINDMAP).ast);
  assert.ok(fc);
  assert.equal(fc.direction, 'LR');
  assert.deepEqual(
    fc.nodes.map((n) => n.label),
    ['Projet', 'Objectifs', 'Délais', 'Budget', 'Équipe', 'Dev', 'QA']
  );
  assert.equal(fc.edges.length, 6);
  assert.ok(fc.edges.every((e) => e.label === null), 'no edge labels to fold');
});

test('mindmap SmartArt goes through the multi-level tree generator, left to right', () => {
  const out = generateMindmapSmartArt(parseMindmap(MINDMAP).ast, { drawing: true });
  assert.equal(out?.layout, 'tree');
  assert.ok(out?.layoutXml.includes('tree-deep1-lr'));
  assert.ok(out?.drawingXml?.includes('Équipe'));
});

test('a two-level mindmap uses the two-level tree, a straight-line one is still a hierarchy (never a chain)', () => {
  const flat = generateMindmapSmartArt(parseMindmap('mindmap\n  root\n    A\n    B').ast);
  assert.ok(flat?.layoutXml.includes('smartart-layout/tree1-lr'));
  const line = generateMindmapSmartArt(parseMindmap('mindmap\n  root\n    A\n      B\n        C').ast);
  assert.equal(line?.layout, 'tree');
  assert.ok(!line?.layoutXml.includes('chain'));
});

test('a single-node or empty mindmap keeps the shape-built rendering', () => {
  assert.equal(generateMindmapSmartArt(parseMindmap('mindmap\n  root').ast), null);
  assert.equal(generateMindmapSmartArt({ root: null }), null);
});

test('mindmap labels are XML-escaped in every SmartArt part', () => {
  const out = generateMindmapSmartArt(parseMindmap('mindmap\n  root["a<b & c"]\n    child["<script>"]').ast, { drawing: true });
  for (const part of [out?.dataXml ?? '', out?.drawingXml ?? '']) {
    assert.ok(!part.includes('<script>'));
    assert.ok(part.includes('&lt;script&gt;'));
  }
});

const TREE = ['treeView-beta', '  "projet/"', '    "src/" ## sources', '      index.ts:::highlight', '      util.ts', '    "README.md"'].join('\n');

test('treeView -> top-down tree; description folded into the text, highlight kept as a fill', () => {
  const fc = treeViewToFlowchart(parseTreeView(TREE).ast);
  assert.ok(fc);
  assert.equal(fc.direction, 'TD');
  assert.equal(fc.nodes.length, 5);
  assert.ok(fc.nodes.some((n) => n.label.includes('sources')));
  assert.equal(fc.nodes.find((n) => n.label.startsWith('index.ts'))?.fill, 'FFF2CC');
  const out = generateTreeViewSmartArt(parseTreeView(TREE).ast, { drawing: true });
  assert.equal(out?.layout, 'tree');
  assert.ok(out?.drawingXml?.includes('FFF2CC'));
});

test('a treeView with several top-level entries is not one tree: shape-built rendering kept', () => {
  const forest = parseTreeView('treeView-beta\n  a/\n    x\n  b/\n    y').ast;
  assert.equal(treeViewToFlowchart(forest), null);
  assert.equal(generateTreeViewSmartArt(forest), null);
});

test('no external relationship in any part', () => {
  const out = generateMindmapSmartArt(parseMindmap(MINDMAP).ast, { drawing: true });
  for (const part of [out?.dataXml, out?.layoutXml, out?.colorsXml, out?.styleXml, out?.drawingXml]) assert.ok(!part?.includes('TargetMode'));
});
