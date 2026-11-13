import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWardley } from '../../src/diagrams/wardley/parser.js';

const src = `wardley-beta
title T
size [1100, 600]
anchor Business [0.95, 0.63]
component Cup of Tea [0.79, 0.61] label [-85, 10]
component Kettle [0.43, 0.35] (inertia)
component Water [0.38, 0.82] (buy)
pipeline Kettle {
  component "Electric Kettle" [0.57] label [-30, 10]
}
Business->Cup of Tea
Cup of Tea +<> Kettle
Kettle -.-> Water
Kettle +'flow'> Water
Kettle -> Water; some note
evolve Kettle 0.62
note "N" [0.30, 0.49]
annotations [0.01, 0.01]
annotation 1,[0.43,0.49] "S"
accelerator "Open Source" [0.7, 0.5]
evolution Genesis@0.2 -> Custom@0.4 -> Product@0.75 -> Commodity@1.0`;

test('parses every statement form like the real Mermaid parser', () => {
  const { ast, warnings } = parseWardley(src);
  assert.deepEqual(warnings, []);
  assert.equal(ast.title, 'T');
  assert.deepEqual(ast.size, { width: 1100, height: 600 });
  const cup = ast.nodes.find((n) => n.name === 'Cup of Tea');
  assert.deepEqual([cup?.x, cup?.y, cup?.labelDx, cup?.labelDy], [61, 79, -85, 10]);
  assert.equal(ast.nodes.find((n) => n.name === 'Kettle')?.inertia, true);
  assert.equal(ast.nodes.find((n) => n.name === 'Water')?.strategy, 'buy');
  assert.deepEqual(ast.pipelines, [{ parent: 'Kettle', components: ['Electric Kettle'] }]);
  assert.equal(ast.nodes.find((n) => n.name === 'Electric Kettle')?.y, 43);
  assert.deepEqual(ast.links.map((l) => [l.dashed, l.flow, l.label]), [
    [false, undefined, undefined],
    [false, 'bidirectional', undefined],
    [true, undefined, undefined],
    [false, 'forward', 'flow'],
    [false, undefined, 'some note'],
  ]);
  assert.deepEqual(ast.evolves, [{ name: 'Kettle', target: 62 }]);
  assert.equal(ast.annotations[0]?.text, 'S');
  assert.deepEqual(ast.annotationsBox, { x: 1, y: 1 });
  assert.deepEqual(ast.stages.map((s) => s.boundary), [20, 40, 75, 100]);
});

test('accepts 0-100 coordinates; skips out-of-range and unknown references with warnings', () => {
  const { ast, warnings } = parseWardley('wardley-beta\ncomponent A [50, 20]\ncomponent B [150, 0.2]\nA->Ghost\npipeline Ghost {\n component "x" [0.1]\n}\nevolve A 300');
  assert.deepEqual(ast.nodes.map((n) => [n.name, n.x, n.y]), [['A', 20, 50]]);
  assert.equal(ast.links.length, 0);
  assert.equal(ast.nodes.length, 1);
  assert.equal(warnings.length, 4);
});

test('caps hostile input and clamps size', () => {
  const many = Array.from({ length: 300 }, (_, i) => `component C${i} [0.5, 0.5]`).join('\n');
  const { ast, warnings } = parseWardley(`wardley-beta\nsize [999999, 1]\n${many}`);
  assert.equal(ast.nodes.length, 200);
  assert.deepEqual(ast.size, { width: 2400, height: 300 });
  assert.ok(warnings.some((w) => w.includes('limited to 200')));
});
