import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';
import { layout, boundingBox } from '../../src/layout/layout.js';

test('produces a box for every node', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C');
  const result = layout(ast);
  assert.equal(Object.keys(result.nodes).length, 3);
  for (const id of ['A', 'B', 'C']) {
    assert.ok(result.nodes[id]!.width > 0);
    assert.ok(result.nodes[id]!.height > 0);
  }
});

test('normalizes so top-left is at (0,0)', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C');
  const result = layout(ast);
  const minX = Math.min(...Object.values(result.nodes).map((b) => b.x));
  const minY = Math.min(...Object.values(result.nodes).map((b) => b.y));
  assert.equal(minX, 0);
  assert.equal(minY, 0);
});

test('stacks ranks vertically for TD', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C');
  const result = layout(ast);
  // A is rank 0, B rank 1, C rank 2 -> increasing y.
  assert.ok(result.nodes['B']!.y > result.nodes['A']!.y);
  assert.ok(result.nodes['C']!.y > result.nodes['B']!.y);
});

test('respects LR direction', () => {
  const { ast } = parseMermaid('graph LR\n  A --> B\n  B --> C');
  const result = layout(ast);
  assert.ok(result.nodes['B']!.x > result.nodes['A']!.x);
  assert.ok(result.nodes['C']!.x > result.nodes['B']!.x);
});

test('boundingBox covers all nodes', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C');
  const result = layout(ast);
  const bb = boundingBox(result.nodes);
  for (const b of Object.values(result.nodes)) {
    assert.ok(b.x >= bb.x);
    assert.ok(b.y >= bb.y);
    assert.ok(b.x + b.width <= bb.x + bb.width);
    assert.ok(b.y + b.height <= bb.y + bb.height);
  }
});

test('handles a cycle without hanging', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> A');
  const result = layout(ast);
  assert.equal(Object.keys(result.nodes).length, 2);
});

test('computes subgraph container boxes', () => {
  const { ast } = parseMermaid('graph TD\n  subgraph S1[Group]\n    A --> B\n  end');
  const result = layout(ast);
  assert.ok(result.subgraphs['S1']);
  assert.ok(result.subgraphs['S1']!.width > 0);
  assert.ok(result.subgraphs['S1']!.height > 0);
});

test('throws for the reserved graphviz engine', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B');
  assert.throws(() => layout(ast, { engine: 'graphviz' }), /not implemented/);
});
