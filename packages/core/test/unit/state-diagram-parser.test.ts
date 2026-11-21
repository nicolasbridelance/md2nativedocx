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

test('a composite state holds the states first named in its block, with its own start and end (Mermaid #2)', () => {
  const { ast, warnings } = parseStateDiagram(
    'stateDiagram-v2\n  [*] --> Draft\n  state Review {\n    [*] --> Screening\n    Screening --> Decision\n    Decision --> [*]\n  }\n  Draft --> Review\n  Review --> [*]',
  );
  assert.deepEqual(warnings, []);
  const parent = (id: string): string | undefined => ast.states.find((s) => s.id === id)?.parent;
  assert.equal(parent('Review'), undefined);
  assert.equal(parent('Screening'), 'Review');
  assert.equal(parent('Decision'), 'Review');
  assert.equal(parent('Draft'), undefined, 'named at the top level first: stays there');
  const starts = ast.states.filter((s) => s.kind === 'start');
  const ends = ast.states.filter((s) => s.kind === 'end');
  assert.deepEqual(starts.map((s) => s.parent), [undefined, 'Review'], 'one start per block');
  assert.deepEqual(ends.map((s) => s.parent), ['Review', undefined], 'one end per block');
});

test('every [*] of one block on the same side is the same node, as in Mermaid (#21)', () => {
  const { ast } = parseStateDiagram('stateDiagram-v2\n  [*] --> A\n  [*] --> B\n  A --> [*]\n  B --> [*]');
  assert.equal(ast.states.filter((s) => s.kind === 'start').length, 1);
  assert.equal(ast.states.filter((s) => s.kind === 'end').length, 1);
  assert.equal(new Set(ast.transitions.slice(0, 2).map((t) => t.from)).size, 1);
});

test('composites nest; a state keeps the block it first appeared in (Mermaid #11, #12)', () => {
  const { ast } = parseStateDiagram('stateDiagram-v2\n  First --> Second\n  state First {\n    state Inner {\n      a --> b\n    }\n    Second\n  }');
  const parent = (id: string): string | undefined => ast.states.find((s) => s.id === id)?.parent;
  assert.equal(parent('Inner'), 'First');
  assert.equal(parent('a'), 'Inner');
  assert.equal(parent('Second'), undefined);
  const order = ast.states.map((s) => s.id);
  assert.ok(order.indexOf('Inner') < order.indexOf('a'), 'a composite is listed before what it holds');
});

test("a direction inside a block is the composite's own, not the diagram's (Mermaid #17)", () => {
  const { ast } = parseStateDiagram('stateDiagram\n  direction LR\n  A --> B\n  state B {\n    direction BT\n    a --> b\n  }');
  assert.equal(ast.direction, 'LR');
  assert.equal(ast.states.find((s) => s.id === 'B')?.direction, 'BT');
  assert.equal(ast.states.find((s) => s.id === 'A')?.direction, undefined);
});

test('-- splits a composite into concurrent regions, each with its own start (Mermaid #16)', () => {
  const { ast, warnings } = parseStateDiagram(
    'stateDiagram-v2\n  state Active {\n    [*] --> NumOff\n    NumOff --> NumOn\n    --\n    [*] --> CapsOff\n    --\n    [*] --> ScrollOff\n  }',
  );
  assert.deepEqual(warnings, []);
  assert.deepEqual(ast.regions, [
    { id: '__region_0', parent: 'Active' },
    { id: '__region_1', parent: 'Active' },
    { id: '__region_2', parent: 'Active' },
  ]);
  const parent = (id: string): string | undefined => ast.states.find((s) => s.id === id)?.parent;
  assert.equal(parent('NumOff'), '__region_0', 'what came before the first -- is moved into the first region');
  assert.equal(parent('CapsOff'), '__region_1');
  assert.equal(parent('ScrollOff'), '__region_2');
  assert.deepEqual(
    ast.states.filter((s) => s.kind === 'start').map((s) => s.parent),
    ['__region_0', '__region_1', '__region_2'],
  );
});

test('-- outside a composite is warned; nesting past the depth cap is kept in the last level', () => {
  assert.ok(parseStateDiagram('stateDiagram-v2\n  A --> B\n  --').warnings.some((w) => w.includes('outside a composite')));
  const deep = parseStateDiagram(`stateDiagram-v2\n${'state S {\n'.repeat(40)}leaf\n${'}\n'.repeat(40)}after`);
  assert.ok(deep.warnings.some((w) => w.includes('nested deeper')));
  assert.ok(!deep.warnings.some((w) => w.includes('Unexpected "}"')), 'the ignored levels still close');
  assert.equal(deep.ast.states.find((s) => s.id === 'after')?.parent, undefined);
});

test('notes: a block up to end note and the one-line form, each line trimmed (Mermaid #15)', () => {
  const { ast, warnings } = parseStateDiagram(
    'stateDiagram-v2\n  State1: The state with a note\n  note right of State1\n    Important information! You can write\n    notes. %% a comment, as everywhere in Mermaid\n  end note\n  State1 --> State2\n  note left of State2 : This is the note<br>to the left.',
  );
  assert.deepEqual(warnings, []);
  assert.deepEqual(ast.notes, [
    { lines: ['Important information! You can write', 'notes.'], for: 'State1', side: 'right' },
    { lines: ['This is the note', 'to the left.'], for: 'State2', side: 'left' },
  ]);
});

test('a note names its state into existence, in the block it is written in', () => {
  const { ast } = parseStateDiagram('stateDiagram-v2\n  state Outer {\n    note left of Inner : here\n  }');
  assert.equal(ast.states.find((s) => s.id === 'Inner')?.parent, 'Outer');
  assert.equal(ast.notes?.[0]?.for, 'Inner');
});

test('an unclosed note block is kept and warned', () => {
  const { ast, warnings } = parseStateDiagram('stateDiagram-v2\n  A --> B\n  note right of A\n    dangling');
  assert.deepEqual(ast.notes?.[0]?.lines, ['dangling']);
  assert.ok(warnings.some((w) => w.includes('end note')));
});

test('styles layer as in Mermaid: classes in the order given (class or :::), then style (Mermaid #19, #20)', () => {
  const { ast, warnings } = parseStateDiagram(
    [
      'stateDiagram',
      '  classDef movement font-style:italic',
      '  classDef bad fill:#f00,color:#fff,font-weight:bold,stroke:#ff0',
      '  [*] --> Still',
      '  Still --> Moving:::movement',
      '  Crash:::bad --> [*]',
      '  Moving --> Crash',
      '  class Moving, Crash movement',
      '  style Crash fill:#00ff00',
      '  class end bad',
    ].join('\n'),
  );
  assert.deepEqual(warnings, []);
  const st = (id: string) => ast.states.find((s) => s.id === id)!;
  assert.equal(st('Moving').italic, true);
  assert.equal(st('Moving').fill, undefined);
  const crash = st('Crash');
  assert.deepEqual([crash.fill, crash.stroke, crash.textColor, crash.bold, crash.italic], ['00FF00', 'FFFF00', 'FFFFFF', true, true]);
  assert.equal(st('Still').fill, undefined);
  assert.ok(!ast.states.some((s) => s.id === 'end'), 'a class on an unknown state creates none, as in Mermaid');
});

test('classDef default styles every state first; an undefined class is warned', () => {
  const { ast, warnings } = parseStateDiagram('stateDiagram-v2\n  classDef default fill:#eeeeee\n  classDef hot fill:#f00\n  [*] --> A\n  A --> B\n  class B hot\n  class A nope');
  assert.equal(ast.states.find((s) => s.id === 'A')?.fill, 'EEEEEE');
  assert.equal(ast.states.find((s) => s.id === 'B')?.fill, 'FF0000');
  assert.equal(ast.states.find((s) => s.kind === 'start')?.fill, undefined, 'the start dot stays black');
  assert.ok(warnings.some((w) => w.includes('"nope"')));
});

test('an unclosed composite state block is warned, not silently dropped', () => {
  const { warnings } = parseStateDiagram('stateDiagram-v2\n  state Composite {\n    [*] --> One');
  assert.ok(warnings.some((w) => w.includes('not closed')));
});

test('accTitle/accDescr, frontmatter, trailing %% comments and :::class suffixes never become states or labels', () => {
  const { ast, warnings } = parseStateDiagram(
    '---\ntitle: Simple sample\n---\nstateDiagram-v2\n  accTitle: A title\n  accDescr: A description\n  accDescr {\n    multi line\n  }\n  [*] --> Still:::cls\n  Still --> Moving %% trailing\n  Moving:::cls --> [*] : go\n',
  );
  assert.deepEqual(ast.states.filter((st) => st.kind === 'normal').map((st) => st.id), ['Still', 'Moving']);
  assert.deepEqual(ast.transitions.map((t) => t.label), [undefined, undefined, 'go']);
  assert.equal(warnings.filter((w) => /frontmatter/.test(w)).length, 1);
  assert.ok(warnings.some((w) => w.includes('"cls" referenced but not defined')));
});

test('a state declared by its name alone is kept (Mermaid official example stateDiagram#4)', () => {
  const { ast, warnings } = parseStateDiagram('stateDiagram-v2\n  stateId\n  [*] --> Other');
  assert.ok(ast.states.some((s) => s.id === 'stateId'));
  assert.equal(warnings.length, 0);
});
