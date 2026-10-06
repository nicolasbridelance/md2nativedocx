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
  const result = classify('graph TD\n  A --> B\n  A --> C\n  A --> D');
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

test('accepts a two-level tree in every direction', () => {
  // A(1) -> B(2), A(1) -> C(2): root plus one row of direct children, not a chain since A branches.
  for (const dir of ['TD', 'LR', 'BT', 'RL']) {
    assert.deepEqual(classify(`graph ${dir}\n  A --> B\n  A --> C`), { eligible: true, layout: 'tree' }, dir);
  }
});

test('accepts a top-down tree with grandchildren (multi-level generator)', () => {
  assert.equal(MAX_TREE_DEPTH, 5);
  // A -> B -> C, A -> D: depth 3; A branches so this is a tree, not a chain.
  assert.deepEqual(classify('graph TD\n  A --> B\n  A --> D\n  B --> C'), { eligible: true, layout: 'tree' });
});

test('accepts a tree at exactly the maximum depth and rejects one level more', () => {
  const chainDown = (n: number) => Array.from({ length: n - 1 }, (_, i) => `N${i} --> N${i + 1}`).join('\n  ');
  assert.equal(classify(`graph TD\n  ${chainDown(5)}\n  N0 --> X`).eligible, true);
  const tooDeep = classify(`graph TD\n  ${chainDown(6)}\n  N0 --> X`);
  assert.equal(tooDeep.eligible, false);
  if (!tooDeep.eligible) {
    assert.equal(tooDeep.reason, 'tree-too-deep');
    assert.deepEqual(tooDeep.at, ['N0']);
  }
});

test('a tree with grandchildren is only eligible top-down', () => {
  for (const dir of ['LR', 'BT', 'RL']) {
    const result = classify(`graph ${dir}\n  A --> B\n  A --> D\n  B --> C`);
    assert.equal(result.eligible, false, dir);
    if (!result.eligible) assert.equal(result.reason, 'tree-too-deep', dir);
  }
});

test('rejects a multi-level tree with more than MAX_TREE_LEAVES leaves', () => {
  const leaves = (n: number) => Array.from({ length: n }, (_, i) => `B --> L${i}`).join('\n  ');
  assert.equal(classify(`graph TD\n  A --> B\n  A --> S\n  ${leaves(7)}`).eligible, true); // 8 leaves
  const wide = classify(`graph TD\n  A --> B\n  A --> S\n  ${leaves(8)}`); // 9 leaves
  assert.equal(wide.eligible, false);
  if (!wide.eligible) assert.equal(wide.reason, 'tree-too-deep');
});

test('LR direction does not affect classification', () => {
  const result = classify('graph LR\n  A --> B\n  B --> C');
  assert.deepEqual(result, { eligible: true, layout: 'chain' });
});
