import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';
import { generateSmartArt } from '../../src/smartart/dispatch.js';
import { generateChain } from '../../src/smartart/chain.js';
import { generateTree } from '../../src/smartart/tree.js';
import { generateCycle } from '../../src/smartart/cycle.js';

test('dispatches a chain-shaped flowchart to generateChain', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C');
  const result = generateSmartArt(ast);
  assert.ok(result);
  assert.equal(result.layout, 'chain');
  assert.deepEqual(result, { layout: 'chain', ...generateChain(ast) });
});

test('dispatches a tree-shaped flowchart to generateTree', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  A --> C');
  const result = generateSmartArt(ast);
  assert.ok(result);
  assert.equal(result.layout, 'tree');
  assert.deepEqual(result, { layout: 'tree', ...generateTree(ast) });
});

test('dispatches a cycle-shaped flowchart to generateCycle', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C\n  C --> A');
  const result = generateSmartArt(ast);
  assert.ok(result);
  assert.equal(result.layout, 'cycle');
  assert.deepEqual(result, { layout: 'cycle', ...generateCycle(ast) });
});

test('returns null for a flowchart classifyTopology rejects (merge-after-branch)', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  A --> C\n  B --> D\n  C --> D');
  assert.equal(generateSmartArt(ast), null);
});

test('returns null for a flowchart containing a subgraph', () => {
  const { ast } = parseMermaid('graph TD\n  subgraph S1[Group]\n    A --> B\n  end');
  assert.equal(generateSmartArt(ast), null);
});

test('returns null for a tree deeper than tree.ts supports', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  A --> D\n  B --> C');
  assert.equal(generateSmartArt(ast), null);
});
