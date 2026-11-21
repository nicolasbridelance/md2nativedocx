import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlantUmlState } from '../../src/diagrams/plantuml/state-parser.js';
import { detectDiagramType } from '../../src/parser/diagram-type.js';
import { renderDiagram } from '../../src/render-diagram.js';

const uml = (body: string): string => `@startuml\n${body}\n@enduml`;
const edges = (src: string): string[] => {
  const { ast } = parsePlantUmlState(uml(src));
  const kind = new Map(ast.states.map((s) => [s.id, s.kind]));
  const name = (id: string): string => (kind.get(id) === 'start' ? '(start)' : kind.get(id) === 'end' ? '(end)' : id);
  return ast.transitions.map((t) => `${name(t.from)}>${name(t.to)}${t.label ? `:${t.label}` : ''}`);
};

test('detection: [*], state declarations and direction hints make a PlantUML state diagram', () => {
  for (const src of ['[*] --> A', 'state A', '[*] -up-> First\nFirst -right-> Second', 'frame f {\n state a\n}\na --> b']) {
    assert.equal(detectDiagramType(uml(src)).type, 'plantumlState', src);
  }
  assert.equal(detectDiagramType(uml('A <|-- B')).type, 'plantumlClass');
});

test('transitions: [*] start and end, labels, short and long shafts, hints, styles, reversed arrows', () => {
  assert.deepEqual(edges('[*] --> A\nA -> B : go\nB ---> C\nC -up-> D\nD -[#red,dashed]-> E\nE x->o F\nG <-- F : back\nG --> [*]'), [
    '(start)>A',
    'A>B:go',
    'B>C',
    'C>D',
    'D>E',
    'E>F',
    'F>G:back',
    'G>(end)',
  ]);
});

test('states: aliases either way, stereotypes, descriptions, history, hidden transitions', () => {
  const { ast, warnings } = parsePlantUmlState(
    uml(
      [
        'state "Long\\nname" as L',
        'state S as "Shown"',
        'state c <<choice>>',
        'state f <<fork>>',
        'state j <<join>>',
        'state s1 <<start>>',
        'state e1 <<end>>',
        'state r <<sdlreceive>>',
        'state A : first line\\nsecond',
        'A : third',
        'A --> B[H*] : resume',
        'A -[hidden]-> Z',
      ].join('\n'),
    ),
  );
  assert.deepEqual(warnings.filter((w) => /ignored:/.test(w)), []);
  const byId = new Map(ast.states.map((s) => [s.id, s]));
  assert.equal(byId.get('L')?.label, 'Long name');
  assert.equal(byId.get('S')?.label, 'Shown');
  assert.deepEqual(['c', 'f', 'j', 's1', 'e1', 'r'].map((id) => byId.get(id)?.kind), ['choice', 'fork', 'join', 'start', 'end', 'normal']);
  assert.deepEqual(byId.get('A')?.description, ['first line', 'second', 'third']);
  assert.equal(ast.transitions.length, 1);
  assert.equal(ast.states.find((s) => s.id === ast.transitions[0]?.to)?.label, 'H*');
  assert.ok(!byId.has('Z'));
});

test('composite states and their regions kept; notes, skinparam, style, json and groups skipped', () => {
  const { ast, warnings } = parsePlantUmlState(
    uml(
      [
        'left to right direction',
        'skinparam state {',
        '  BackgroundColor Peru',
        '}',
        '<style>',
        'stateDiagram { FontColor Red }',
        '</style>',
        'state Outer #pink {',
        '  [*] --> In1',
        '  --',
        '  [*] -> In2',
        '  ||',
        '  state Inner ##[dashed]blue {',
        '    In1 --> In2',
        '  }',
        '}',
        'note right of Outer',
        '  several lines',
        'end note',
        'note on link',
        '  about a link',
        'end note',
        'json data {',
        '  "a": ["b", "c"]',
        '}',
        'frame f {',
        '  state x',
        '}',
        'Outer --> x',
      ].join('\n'),
    ),
  );
  assert.deepEqual(warnings.filter((w) => /ignored:|never closed/.test(w)), []);
  assert.equal(ast.direction, 'LR');
  assert.deepEqual(
    ast.states.filter((s) => s.kind === 'normal').map((s) => s.id),
    ['Outer', 'In1', 'In2', 'Inner', 'x'],
  );
  assert.equal(ast.transitions.length, 4);
  const parent = (id: string): string | undefined => ast.states.find((s) => s.id === id)?.parent;
  assert.equal(parent('In1'), '__region_0');
  assert.equal(parent('In2'), '__region_1');
  assert.equal(parent('Inner'), '__region_2');
  assert.equal(parent('x'), undefined, 'a frame group is not a composite state');
  assert.equal(ast.states.find((s) => s.id === 'Outer')?.direction, 'LR', 'PlantUML lays composites out in the diagram direction');
});

test('notes on four sides, one-line and block, colour dropped; floating notes still warned', () => {
  const { ast, warnings } = parsePlantUmlState(
    uml('A --> B\nnote left of A : one\\ntwo\nnote top of B #pink\n  first\n  second\nend note\nnote "floating" as N1\nnote bottom of "C" : below'),
  );
  assert.deepEqual(ast.notes, [
    { lines: ['one', 'two'], for: 'A', side: 'left' },
    { lines: ['first', 'second'], for: 'B', side: 'top' },
    { lines: ['below'], for: 'C', side: 'bottom' },
  ]);
  assert.ok(warnings.some((w) => /Floating notes/.test(w)));
});

test('one [*] start and end per block, as in PlantUML', () => {
  const { ast } = parsePlantUmlState(uml('[*] --> A\n[*] --> B\nstate A {\n  [*] --> a\n  a --> [*]\n}\nB --> [*]'));
  assert.deepEqual(ast.states.filter((s) => s.kind === 'start').map((s) => s.parent), [undefined, 'A']);
  assert.deepEqual(ast.states.filter((s) => s.kind === 'end').map((s) => s.parent), ['A', undefined]);
});

test('hostile labels are escaped in the Word output (AGENTS rule 2)', () => {
  const { fragment } = renderDiagram(uml('state "<evil a=\'1\'>&" as X\nX : </w:t><w:evil/>\nX --> Y : "quote" & <b>'));
  assert.ok(!fragment.includes('<evil'));
  assert.ok(!fragment.includes('<w:evil'));
  assert.ok(fragment.includes('&lt;evil'));
});

test('renderDiagram: description lines are drawn inside the state; a plain chain may become SmartArt', () => {
  const desc = renderDiagram(uml('[*] --> A\nA : first detail\nA --> B'), { smartArt: true });
  assert.equal(desc.metadata.diagramType, 'plantumlState');
  assert.equal(desc.kind, 'shapes');
  assert.ok(desc.fragment.includes('first detail'));
  const chain = renderDiagram(uml('[*] --> A\nA --> B\nB --> C\nC --> [*]'), { smartArt: true });
  assert.equal(chain.kind, 'smartart');
});

test('never throws on malformed input, and caps hostile sizes', () => {
  for (const junk of ['@startuml', uml('state\n{\n}\n}\n-->\n[*]\n:\n[H*] --> [H]\nstate "x'), uml('state s {\n'.repeat(40)), uml('note left of A\n')]) {
    assert.doesNotThrow(() => parsePlantUmlState(junk));
    assert.doesNotThrow(() => renderDiagram(junk));
  }
  const { ast, warnings } = parsePlantUmlState(uml(Array.from({ length: 400 }, (_, i) => `state S${i}`).join('\n')));
  assert.equal(ast.states.length, 300);
  assert.ok(warnings.some((w) => w.includes('limited to 300 states')));
});

test('a transition from a state to itself is drawn as a loop (Mermaid too), not a zero-length line', () => {
  for (const src of [uml('A --> A : again\nA --> B'), 'stateDiagram-v2\nA --> A : again\nA --> B']) {
    const { fragment } = renderDiagram(src);
    const connectors = fragment.match(/<wps:cNvCnPr/g) ?? [];
    assert.ok(connectors.length >= 4, `${connectors.length} connectors`); // 3 loop segments + A -> B
    assert.ok(fragment.includes('again'));
  }
});
