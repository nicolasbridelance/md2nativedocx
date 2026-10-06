import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRendering } from '../../src/rendering-plan.js';

const ON = { smartArt: true, nativeCharts: true };
const OFF = { smartArt: false, nativeCharts: false };

test('flowchart tree: SmartArt with its depth when on; shapes + "would apply" when off', () => {
  const src = 'graph TD\n  A --> B\n  A --> C\n  B --> D';
  assert.deepEqual(planRendering(src, ON), { type: 'flowchart', label: 'Flowchart', rendering: 'smartart', smartArt: { layout: 'tree', depth: 3 } });
  assert.deepEqual(planRendering(src, OFF), { type: 'flowchart', label: 'Flowchart', rendering: 'shapes', smartArtWouldApply: true });
});

test('chain and cycle carry their SmartArt family', () => {
  assert.equal(planRendering('graph LR\n  A --> B --> C', ON).smartArt?.layout, 'chain');
  assert.equal(planRendering('graph TD\n  A --> B\n  B --> C\n  C --> A', ON).smartArt?.layout, 'cycle');
});

test('a merge keeps shapes and says why when SmartArt is on (nothing to say when off)', () => {
  const src = 'graph TD\n  A --> B\n  A --> C\n  B --> D\n  C --> D';
  const on = planRendering(src, ON);
  assert.equal(on.rendering, 'shapes');
  assert.equal(on.smartArtRejected?.reason, 'merge-after-branch');
  assert.deepEqual(on.smartArtRejected?.at.sort(), ['B', 'C']);
  assert.deepEqual(planRendering(src, OFF), { type: 'flowchart', label: 'Flowchart', rendering: 'shapes' });
});

test('pie / xychart / radar: chart when native charts are on, else shapes + "would apply"', () => {
  const pie = 'pie\n  "A" : 1\n  "B" : 2';
  assert.equal(planRendering(pie, ON).rendering, 'chart');
  assert.deepEqual(planRendering(pie, OFF), { type: 'pie', label: 'Pie chart', rendering: 'shapes', chartWouldApply: true });
  // Per-type list: pie on, radar not yet.
  const pieOnly = { smartArt: true, nativeCharts: ['pie'] };
  assert.equal(planRendering(pie, pieOnly).rendering, 'chart');
  assert.equal(planRendering('radar-beta\n  axis a, b, c\n  curve x{1, 2, 3}', pieOnly).chartWouldApply, true);
});

test('mindmap and single-root treeView: SmartArt hierarchy when on; a two-root treeView stays shapes', () => {
  assert.deepEqual(planRendering('mindmap\n  root\n    A\n      B', ON).smartArt, { layout: 'tree', depth: 3 });
  assert.equal(planRendering('mindmap\n  root\n    A', OFF).smartArtWouldApply, true);
  assert.equal(planRendering('treeView-beta\n  a/\n    x\n  b/\n    y', ON).rendering, 'shapes');
});

test('timeline (with or without sections) and journey: SmartArt time line when on', () => {
  assert.deepEqual(planRendering('timeline\n  2002 : a\n  2003 : b', ON).smartArt, { layout: 'timeline' });
  assert.equal(planRendering('timeline\n  2002 : a\n  2003 : b', OFF).smartArtWouldApply, true);
  assert.deepEqual(planRendering('timeline\n  section A\n    2002 : a\n  section B\n    2003 : b', ON).smartArt, { layout: 'timeline' });
  assert.deepEqual(planRendering('journey\n  section A\n    Tea: 5: Me', ON).smartArt, { layout: 'timeline' });
});

test('kanban: SmartArt grouped list when on and it fits', () => {
  assert.deepEqual(planRendering('kanban\n  todo[Todo]\n    a[Doc]', ON).smartArt, { layout: 'list' });
  assert.equal(planRendering('kanban\n  todo[Todo]\n    a[Doc]', OFF).smartArtWouldApply, true);
  assert.equal(planRendering('kanban\n  todo[Todo]', ON).rendering, 'shapes');
});

test('gitGraph (main only), state machine (chain/loop), class inheritance tree: SmartArt when on', () => {
  assert.deepEqual(planRendering('gitGraph\n  commit\n  commit', ON).smartArt, { layout: 'chain' });
  assert.deepEqual(planRendering('stateDiagram-v2\n  A --> B\n  B --> A', ON).smartArt, { layout: 'cycle' });
  assert.deepEqual(planRendering('classDiagram\n  A <|-- B\n  B <|-- C', ON).smartArt, { layout: 'tree', depth: 3 });
  assert.equal(planRendering('classDiagram\n  A <|-- B', OFF).smartArtWouldApply, true);
  assert.equal(planRendering('classDiagram\n  A --> B', ON).rendering, 'shapes');
});

test('other types are shapes; never throws, even on empty or garbled input', () => {
  assert.equal(planRendering('sequenceDiagram\n  A->>B: hi', ON).rendering, 'shapes');
  for (const src of ['', '%% only a comment', 'graph TD\n  A -->', 'graph TD\n  A[[[', 'pie\n  "x" : nope']) {
    const plan = planRendering(src, ON);
    assert.ok(['shapes', 'smartart', 'chart', 'invalid'].includes(plan.rendering), src);
    if (plan.rendering === 'invalid') assert.equal(typeof plan.error, 'string');
  }
});
