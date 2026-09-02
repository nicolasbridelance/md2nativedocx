import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';
import { layout, boundingBox, SUBGRAPH_TITLE_HEIGHT, NODE_WIDTH, NODE_HEIGHT } from '../../src/layout/layout.js';

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

test('reserves title-bar space so a subgraph does not overlap its first node', () => {
  const { ast } = parseMermaid('graph TD\n  subgraph S1[Group]\n    A --> B\n  end');
  const result = layout(ast);
  // The subgraph box starts where its title renders; the first contained node
  // must start at least one title-height below that, or the title (drawn by
  // the translator at the box's own top) overlaps the node.
  assert.ok(
    result.nodes['A']!.y >= result.subgraphs['S1']!.y + SUBGRAPH_TITLE_HEIGHT,
    `node A (y=${result.nodes['A']!.y}) overlaps S1's title (box y=${result.subgraphs['S1']!.y})`,
  );
});

test('nested subgraphs each reserve their own title space, cumulatively', () => {
  const { ast } = parseMermaid(
    'graph TD\n  subgraph Outer[Out]\n    A --> B\n    subgraph Inner[In]\n      C --> D\n    end\n    B --> C\n  end',
  );
  const result = layout(ast);
  assert.deepEqual(ast.subgraphs.find((s) => s.id === 'Outer')!.subgraphIds, ['Inner']);
  assert.deepEqual(ast.subgraphs.find((s) => s.id === 'Outer')!.nodeIds, ['A', 'B']);
  // A is only under Outer's title (1 reservation).
  assert.ok(result.nodes['A']!.y >= result.subgraphs['Outer']!.y + SUBGRAPH_TITLE_HEIGHT);
  // C is under both Outer's and Inner's titles (2 reservations) — Inner's own
  // box must itself have been pushed down by Outer's title too.
  assert.ok(result.subgraphs['Inner']!.y >= result.subgraphs['Outer']!.y + SUBGRAPH_TITLE_HEIGHT);
  assert.ok(result.nodes['C']!.y >= result.subgraphs['Inner']!.y + SUBGRAPH_TITLE_HEIGHT);
});

test('exposes a route per edge, parallel to flowchart.edges', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C');
  const result = layout(ast);
  assert.equal(result.edges.length, ast.edges.length);
  for (const points of result.edges) {
    assert.ok(points.length >= 2, 'every edge route has at least a start and an end point');
  }
});

test('an edge skipping a rank gets extra route points; an adjacent-rank edge does not', () => {
  // B has two outgoing edges: one to the next rank (C), one skipping over
  // C's rank to D — mirrors the classic decision-diamond `oui`/`non` shape.
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C\n  B --> D\n  C --> D');
  const result = layout(ast);
  const byEndpoints = new Map(
    ast.edges.map((e, i) => [`${e.from}->${e.to}`, result.edges[i]!]),
  );
  assert.ok(byEndpoints.get('B->C')!.length <= 3, 'adjacent-rank edge should not need routing');
  assert.ok(byEndpoints.get('B->D')!.length > 3, 'rank-skipping edge should carry routing waypoints');
});

test('subgraph boxes never go negative even when the cluster margin extends past its nodes', () => {
  // Regression: computing the normalization offset from node boxes alone
  // (matching the layout module's pre-refactor behaviour) leaves a subgraph
  // at a negative x/y whenever Dagre's cluster margin makes its box extend
  // further left/up than any contained node — which breaks rendering
  // entirely (verified empirically: LibreOffice renders nothing at all for a
  // drawing with a negative-origin child).
  const { ast } = parseMermaid(
    'graph TD\n  subgraph Outer[Out]\n    A --> B\n    subgraph Inner[In]\n      C --> D\n    end\n    B --> C\n  end\n  D --> E',
  );
  const result = layout(ast);
  for (const [id, box] of Object.entries(result.subgraphs)) {
    assert.ok(box.x >= 0, `subgraph ${id} has negative x=${box.x}`);
    assert.ok(box.y >= 0, `subgraph ${id} has negative y=${box.y}`);
  }
  for (const [id, box] of Object.entries(result.nodes)) {
    assert.ok(box.x >= 0, `node ${id} has negative x=${box.x}`);
    assert.ok(box.y >= 0, `node ${id} has negative y=${box.y}`);
  }
});

// --- Text-driven node sizing (found 2026-09-02: every node used to get the
// same fixed NODE_WIDTHxNODE_HEIGHT box regardless of its label — short
// labels sat lost in an oversized box, long ones wrapped badly, and a
// diamond's much smaller usable interior routinely clipped/corrupted its own
// label). ---

test('a node box grows with its label instead of staying a fixed size', () => {
  const { ast } = parseMermaid('graph TD\n  A[A] --> B[Demande soumise]');
  const result = layout(ast);
  assert.ok(
    result.nodes['B']!.width > result.nodes['A']!.width,
    `"Demande soumise" (${result.nodes['B']!.width}px) should be wider than "A" (${result.nodes['A']!.width}px)`,
  );
});

test('a very short label still gets at least the minimum node size', () => {
  const { ast } = parseMermaid('graph TD\n  A[A] --> B[B]');
  const result = layout(ast);
  assert.ok(result.nodes['A']!.width >= NODE_WIDTH);
  assert.ok(result.nodes['A']!.height >= NODE_HEIGHT);
});

test('a long label wraps to a taller box rather than growing arbitrarily wide', () => {
  const { ast } = parseMermaid(
    'graph TD\n  A[A] --> B[Ceci est un libellé nettement plus long que ce qui tient sur une seule ligne]',
  );
  const result = layout(ast);
  // Should have wrapped (height grew past a single line) rather than
  // stretching indefinitely wide.
  assert.ok(result.nodes['B']!.height > NODE_HEIGHT, 'expected the label to wrap to more than one line');
  assert.ok(result.nodes['B']!.width < 400, `box grew implausibly wide (${result.nodes['B']!.width}px) instead of wrapping`);
});

test('a diamond gets a bigger box than a rectangle with the same label', () => {
  const rect = layout(parseMermaid('graph TD\n  A[A] --> B[Validée]').ast);
  const diamond = layout(parseMermaid('graph TD\n  A[A] --> B{Validée}').ast);
  assert.ok(
    diamond.nodes['B']!.width > rect.nodes['B']!.width,
    'a decision diamond needs a visibly bigger box than a rectangle to fit the same text without clipping it',
  );
  assert.ok(diamond.nodes['B']!.height > rect.nodes['B']!.height);
});

test('explicit nodeWidth/nodeHeight still forces a fixed size for every node (escape hatch)', () => {
  const { ast } = parseMermaid('graph TD\n  A[A] --> B[A much, much longer label than A]');
  const result = layout(ast, { nodeWidth: 120, nodeHeight: 60 });
  assert.equal(result.nodes['A']!.width, 120);
  assert.equal(result.nodes['B']!.width, 120, 'the override should apply uniformly, ignoring label length');
  assert.equal(result.nodes['A']!.height, 60);
  assert.equal(result.nodes['B']!.height, 60);
});
