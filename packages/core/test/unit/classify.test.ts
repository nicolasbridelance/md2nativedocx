import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';
import { classifyTopology, MAX_TREE_DEPTH } from '../../src/smartart/classify.js';

function classify(mermaid: string) {
  const { ast } = parseMermaid(mermaid);
  return classifyTopology(ast);
}

test('classifies a simple path as chain', () => {
  const result = classify('graph TD\n  A --> B\n  B --> C');
  assert.deepEqual(result, { eligible: true, layout: 'chain' });
});

test('classifies a branching tree as tree', () => {
  const result = classify(
    'graph TD\n  A --> B\n  A --> C\n  B --> D\n  B --> E'
  );
  assert.deepEqual(result, { eligible: true, layout: 'tree' });
});

test('classifies a closed loop as cycle', () => {
  const result = classify('graph TD\n  A --> B\n  B --> C\n  C --> A');
  assert.deepEqual(result, { eligible: true, layout: 'cycle' });
});

test('rejects a merge after branch, naming the converging nodes', () => {
  const result = classify(
    'graph TD\n  A --> B\n  A --> C\n  B --> D\n  C --> D'
  );
  assert.equal(result.eligible, false);
  if (!result.eligible) {
    assert.equal(result.reason, 'merge-after-branch');
    assert.deepEqual(new Set(result.at), new Set(['B', 'C']));
  }
});

test('rejects any flowchart containing a subgraph', () => {
  const result = classify(
    'graph TD\n  subgraph S1[Group]\n    A --> B\n  end'
  );
  assert.equal(result.eligible, false);
  if (!result.eligible) {
    assert.equal(result.reason, 'subgraph');
    assert.deepEqual(result.at, ['S1']);
  }
});

test('rejects a self-loop', () => {
  const result = classify('graph TD\n  A --> A');
  assert.equal(result.eligible, false);
  if (!result.eligible) {
    assert.equal(result.reason, 'self-loop');
    assert.deepEqual(result.at, ['A']);
  }
});

test('rejects a disconnected graph', () => {
  const result = classify('graph TD\n  A --> B\n  C --> D');
  assert.deepEqual(result, { eligible: false, reason: 'disconnected', at: [] });
});

test('rejects a cycle with an attached tail (zero roots, not a pure cycle)', () => {
  // A->B->C->A is a closed loop; C also feeds D, so C has out-degree 2 and
  // this is neither a pure cycle (every node must have out-degree exactly 1)
  // nor a tree (no node has in-degree 0).
  const result = classify(
    'graph TD\n  A --> B\n  B --> C\n  C --> A\n  C --> D'
  );
  assert.equal(result.eligible, false);
  if (!result.eligible) {
    assert.equal(result.reason, 'irregular-topology');
  }
});

test('accepts a tree at exactly the maximum supported depth', () => {
  assert.equal(MAX_TREE_DEPTH, 4);
  // A(1) -> B(2) -> C(3) -> D(4), plus a branch off A so it's a tree, not a chain.
  const result = classify(
    'graph TD\n  A --> B\n  A --> G\n  B --> C\n  C --> D'
  );
  assert.deepEqual(result, { eligible: true, layout: 'tree' });
});

test('rejects a tree deeper than hierarchy1 has a template for', () => {
  // Depth to F is 6 (A,B,C,D,E,F); A also branches to G so this is a tree,
  // not a chain. hierarchy1's real layout1.xml has no template past depth 4
  // (ADR 0004, "Round 3") regardless of how correctly a generator reproduces
  // the pattern for shallower levels.
  const result = classify(
    'graph TD\n  A --> B\n  A --> G\n  B --> C\n  C --> D\n  D --> E\n  E --> F'
  );
  assert.equal(result.eligible, false);
  if (!result.eligible) {
    assert.equal(result.reason, 'tree-too-deep');
    assert.deepEqual(result.at, ['A']);
  }
});

test('LR direction does not affect classification', () => {
  const result = classify('graph LR\n  A --> B\n  B --> C');
  assert.deepEqual(result, { eligible: true, layout: 'chain' });
});
