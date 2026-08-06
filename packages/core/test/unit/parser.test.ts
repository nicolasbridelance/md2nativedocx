import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';

test('parses a simple TD flowchart', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A[Start] --> B[End]');
  assert.equal(ast.direction, 'TD');
  assert.equal(ast.nodes.length, 2);
  assert.equal(ast.edges.length, 1);
  assert.equal(ast.edges[0]!.from, 'A');
  assert.equal(ast.edges[0]!.to, 'B');
  assert.equal(ast.edges[0]!.type, 'arrow');
  assert.equal(warnings.length, 0);
});

test('parses LR direction', () => {
  const { ast } = parseMermaid('flowchart LR\n  A --> B');
  assert.equal(ast.direction, 'LR');
});

test('parses node shapes (spec §6.1)', () => {
  const { ast } = parseMermaid(
    'graph TD\n  A[rect]\n  B(round)\n  C([stadium])\n  D{diamond}\n  E[(cylinder)]\n  F((ellipse))',
  );
  const byId = new Map(ast.nodes.map((n) => [n.id, n]));
  assert.equal(byId.get('A')!.shape, 'rect');
  assert.equal(byId.get('B')!.shape, 'roundRect');
  assert.equal(byId.get('C')!.shape, 'stadium');
  assert.equal(byId.get('D')!.shape, 'diamond');
  assert.equal(byId.get('E')!.shape, 'cylinder');
  assert.equal(byId.get('F')!.shape, 'ellipse');
});

test('parses edge types (spec §6.2)', () => {
  const { ast } = parseMermaid('graph TD\n  A --> B\n  C -.-> D\n  E ==> F\n  G --- H');
  const types = ast.edges.map((e) => e.type);
  assert.deepEqual(types, ['arrow', 'dotted', 'thick', 'line']);
});

test('parses edge labels', () => {
  const { ast } = parseMermaid('graph TD\n  A -->|yes| B');
  assert.equal(ast.edges[0]!.label, 'yes');
});

test('parses subgraphs', () => {
  const { ast } = parseMermaid('graph TD\n  subgraph S1[Group]\n    A --> B\n  end');
  assert.equal(ast.subgraphs.length, 1);
  assert.equal(ast.subgraphs[0]!.id, 'S1');
  assert.equal(ast.subgraphs[0]!.title, 'Group');
  assert.deepEqual(ast.subgraphs[0]!.nodeIds, ['A', 'B']);
});

test('ignores comments', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  %% a comment\n  A --> B');
  assert.equal(ast.nodes.length, 2);
  assert.equal(warnings.length, 0);
});

test('warns on unsupported constructs but keeps going', () => {
  const { ast, warnings } = parseMermaid('graph TD\n  A --> B\n  classDef X fill:#fff');
  assert.equal(ast.nodes.length, 2);
  assert.ok(warnings.some((w) => w.includes('Unsupported')));
});

test('warns on unclosed subgraph', () => {
  const { warnings } = parseMermaid('graph TD\n  subgraph S1\n    A --> B');
  assert.ok(warnings.some((w) => w.includes('Unclosed')));
});
