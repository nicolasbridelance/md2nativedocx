import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';
import { layout, boundingBox } from '../../src/layout/layout.js';

test('produces a box for every node', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C');
  const boxes = layout(ast);
  assert.equal(Object.keys(boxes).length, 3);
  for (const id of ['A', 'B', 'C']) {
    assert.ok(boxes[id]!.width > 0);
    assert.ok(boxes[id]!.height > 0);
  }
});

test('normalizes so top-left is at (0,0)', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C');
  const boxes = layout(ast);
  const minX = Math.min(...Object.values(boxes).map((b) => b.x));
  const minY = Math.min(...Object.values(boxes).map((b) => b.y));
  assert.equal(minX, 0);
  assert.equal(minY, 0);
});

test('stacks ranks vertically for TD', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C');
  const boxes = layout(ast);
  // A is rank 0, B rank 1, C rank 2 -> increasing y.
  assert.ok(boxes['B']!.y > boxes['A']!.y);
  assert.ok(boxes['C']!.y > boxes['B']!.y);
});

test('respects LR direction', () => {
  const { ast } = parseMermaid('graph LR\n  A --> B\n  B --> C');
  const boxes = layout(ast);
  assert.ok(boxes['B']!.x > boxes['A']!.x);
  assert.ok(boxes['C']!.x > boxes['B']!.x);
});

test('boundingBox covers all nodes', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C');
  const boxes = layout(ast);
  const bb = boundingBox(boxes);
  for (const b of Object.values(boxes)) {
    assert.ok(b.x >= bb.x);
    assert.ok(b.y >= bb.y);
    assert.ok(b.x + b.width <= bb.x + bb.width);
    assert.ok(b.y + b.height <= bb.y + bb.height);
  }
});

test('handles a cycle without hanging', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> A');
  const boxes = layout(ast);
  assert.equal(Object.keys(boxes).length, 2);
});

test('throws for the reserved graphviz engine', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B');
  assert.throws(() => layout(ast, { engine: 'graphviz' }), /not implemented/);
});
