import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCynefinDiagram } from '../../src/diagrams/cynefin/parser.js';

const BASIC = `cynefin-beta
  title Incident Response

  complex
    "Investigate root cause"
    "Run chaos experiment"

  complicated
    "Analyze performance data"

  clear
    "Restart service"

  chaotic
    "Page on-call immediately"

  confusion
    "Unknown failure mode"

  complex --> complicated : "Pattern identified"
  clear --> chaotic : "Complacency"`;

test('title is parsed', () => {
  const { ast } = parseCynefinDiagram(BASIC);
  assert.equal(ast.title, 'Incident Response');
});

test('items attach to the current domain block', () => {
  const { ast } = parseCynefinDiagram(BASIC);
  assert.deepEqual(ast.items.complex, ['Investigate root cause', 'Run chaos experiment']);
  assert.deepEqual(ast.items.complicated, ['Analyze performance data']);
  assert.deepEqual(ast.items.clear, ['Restart service']);
  assert.deepEqual(ast.items.chaotic, ['Page on-call immediately']);
  assert.deepEqual(ast.items.confusion, ['Unknown failure mode']);
});

test('a domain with no items still exists as an empty array, not undefined', () => {
  const { ast } = parseCynefinDiagram('cynefin-beta\n  complex');
  assert.deepEqual(ast.items.complicated, []);
  assert.deepEqual(ast.items.confusion, []);
});

test('an item before any domain block is ignored with a warning', () => {
  const { ast, warnings } = parseCynefinDiagram('cynefin-beta\n  "orphan item"');
  assert.deepEqual(ast.items.complex, []);
  assert.ok(warnings.some((w) => w.includes('no preceding domain block')));
});

test('transitions are captured with an optional label', () => {
  const { ast } = parseCynefinDiagram(BASIC);
  assert.deepEqual(ast.transitions, [
    { from: 'complex', to: 'complicated', label: 'Pattern identified' },
    { from: 'clear', to: 'chaotic', label: 'Complacency' },
  ]);
});

test('a transition with no label omits the label field', () => {
  const { ast } = parseCynefinDiagram('cynefin-beta\n  complex --> complicated');
  assert.deepEqual(ast.transitions, [{ from: 'complex', to: 'complicated' }]);
});

test('a self-loop transition is silently ignored, no warning', () => {
  const { ast, warnings } = parseCynefinDiagram('cynefin-beta\n  complex --> complex');
  assert.equal(ast.transitions.length, 0);
  assert.equal(warnings.length, 0);
});

test('a transition referencing an unrecognized domain is ignored with a warning', () => {
  const { ast, warnings } = parseCynefinDiagram('cynefin-beta\n  complex --> bogus');
  assert.equal(ast.transitions.length, 0);
  assert.ok(warnings.some((w) => w.includes('unrecognized domain')));
});

test('domain keywords are case-insensitive', () => {
  const { ast } = parseCynefinDiagram('cynefin-beta\n  COMPLEX\n    "x"');
  assert.deepEqual(ast.items.complex, ['x']);
});

test('accTitle/accDescr are recognized and warned once, not silently dropped nor treated as errors', () => {
  const { ast, warnings } = parseCynefinDiagram('cynefin-beta\n  accTitle: A11y title\n  accDescr: A11y description\n  complex\n    "x"');
  assert.deepEqual(ast.items.complex, ['x']);
  assert.equal(warnings.filter((w) => w.includes('accTitle/accDescr')).length, 1);
});

test('an unsupported line is skipped with a warning, not thrown', () => {
  const { ast, warnings } = parseCynefinDiagram('cynefin-beta\n  this is not valid syntax');
  assert.equal(ast.transitions.length, 0);
  assert.ok(warnings.some((w) => w.includes('Unsupported line ignored')));
});

test('a %% comment line is ignored', () => {
  const { ast, warnings } = parseCynefinDiagram('cynefin-beta\n  %% a comment\n  complex\n    "x"');
  assert.deepEqual(ast.items.complex, ['x']);
  assert.equal(warnings.length, 0);
});

test('the empty-framework case (domains declared, no items) parses cleanly', () => {
  const { ast, warnings } = parseCynefinDiagram('cynefin-beta\n  title Cynefin Framework\n\n  complex\n  complicated\n  clear\n  chaotic');
  assert.equal(warnings.length, 0);
  for (const domain of ['complex', 'complicated', 'clear', 'chaotic', 'confusion'] as const) {
    assert.deepEqual(ast.items[domain], []);
  }
});
