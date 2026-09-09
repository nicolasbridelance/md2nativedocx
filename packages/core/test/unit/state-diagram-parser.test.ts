import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStateDiagram } from '../../src/diagrams/state-diagram/parser.js';

const BASIC = `stateDiagram-v2
  [*] --> Still
  Still --> Moving
  Moving --> Still
  Moving --> [*]`;

test('parses transitions and synthesizes distinct start/end pseudostate nodes', () => {
  const { ast, warnings } = parseStateDiagram(BASIC);
  assert.equal(warnings.length, 0);
  assert.equal(ast.transitions.length, 4);
  const kinds = ast.states.map((s) => s.kind).sort();
  assert.deepEqual(kinds, ['end', 'normal', 'normal', 'start']);
  const start = ast.states.find((s) => s.kind === 'start')!;
  const end = ast.states.find((s) => s.kind === 'end')!;
  assert.notEqual(start.id, end.id, 'each [*] occurrence gets its own synthesized id');
  assert.equal(ast.transitions[0]?.from, start.id);
  assert.equal(ast.transitions[0]?.to, 'Still');
  assert.equal(ast.transitions[3]?.to, end.id);
});

test('a transition label after ":" is captured', () => {
  const { ast } = parseStateDiagram('stateDiagram-v2\n  A --> B : go');
  assert.equal(ast.transitions[0]?.label, 'go');
});

test('state "Label" as id sets the display label', () => {
  const { ast } = parseStateDiagram('stateDiagram-v2\n  state "This is a state" as s2\n  s2 --> s2');
  const node = ast.states.find((s) => s.id === 's2')!;
  assert.equal(node.label, 'This is a state');
});

test('the alternate one-line description (id : text) sets the label', () => {
  const { ast } = parseStateDiagram('stateDiagram-v2\n  s2 : This is a state\n  s2 --> s2');
  assert.equal(ast.states.find((s) => s.id === 's2')?.label, 'This is a state');
});

test('choice/fork/join stereotypes are recognized', () => {
  const { ast, warnings } = parseStateDiagram(
    'stateDiagram-v2\n  state if_state <<choice>>\n  [*] --> Question\n  Question --> if_state\n  if_state --> Yes : answer1\n  if_state --> No : answer2',
  );
  assert.equal(warnings.length, 0);
  assert.equal(ast.states.find((s) => s.id === 'if_state')?.kind, 'choice');
});

test('fork and join stereotypes are recognized', () => {
  const { ast } = parseStateDiagram(
    'stateDiagram-v2\n  state fork_state <<fork>>\n  [*] --> fork_state\n  fork_state --> State2\n  fork_state --> State3\n  state join_state <<join>>\n  State2 --> join_state\n  State3 --> join_state\n  join_state --> [*]',
  );
  assert.equal(ast.states.find((s) => s.id === 'fork_state')?.kind, 'fork');
  assert.equal(ast.states.find((s) => s.id === 'join_state')?.kind, 'join');
});

test('direction is parsed with the same TB->TD normalization as flowchart', () => {
  assert.equal(parseStateDiagram('stateDiagram-v2\n  direction LR\n  A --> B').ast.direction, 'LR');
  assert.equal(parseStateDiagram('stateDiagram-v2\n  direction TB\n  A --> B').ast.direction, 'TD');
  assert.equal(parseStateDiagram('stateDiagram-v2\n  A --> B').ast.direction, 'TD');
});

test('a composite state block is warned once, but its nested states/transitions still parse (flattened)', () => {
  const { ast, warnings } = parseStateDiagram(
    'stateDiagram-v2\n  state Composite {\n    [*] --> One\n    One --> Two\n    Two --> [*]\n  }',
  );
  assert.ok(ast.states.some((s) => s.id === 'One'));
  assert.ok(ast.states.some((s) => s.id === 'Two'));
  assert.equal(ast.transitions.length, 3);
  assert.equal(warnings.filter((w) => w.includes('Composite')).length, 1, 'warned exactly once, not once per composite state');
});

test('note blocks (multi-line and one-line) are recognized and warned, contents skipped', () => {
  const { ast, warnings } = parseStateDiagram(
    'stateDiagram-v2\n  state Active {\n    note right of Active\n      this is a note\n    end note\n  }\n  [*] --> Active',
  );
  assert.equal(ast.states.length, 2); // Active + the start pseudostate
  assert.ok(warnings.some((w) => w.includes('Notes')));
});

test('a one-line note is recognized and warned', () => {
  const { warnings } = parseStateDiagram('stateDiagram-v2\n  note right of Active : a note\n  [*] --> Active');
  assert.ok(warnings.some((w) => w.includes('Notes')));
});

test('classDef/class/style lines are recognized and warned, not silently dropped', () => {
  const { warnings } = parseStateDiagram('stateDiagram-v2\n  classDef foo fill:#f00\n  [*] --> A');
  assert.ok(warnings.some((w) => w.includes('Styling')));
});

test('an unclosed composite state block is warned, not silently dropped', () => {
  const { warnings } = parseStateDiagram('stateDiagram-v2\n  state Composite {\n    [*] --> One');
  assert.ok(warnings.some((w) => w.includes('not closed')));
});
