import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlantUmlSequence } from '../../src/diagrams/plantuml/sequence-parser.js';
import { detectDiagramType } from '../../src/parser/diagram-type.js';
import { renderDiagram } from '../../src/render-diagram.js';
import type { SequenceItem } from '../../src/diagrams/sequence/types.js';

const uml = (body: string): string => `@startuml\n${body}\n@enduml`;
const messages = (items: SequenceItem[]) => items.filter((i): i is Extract<SequenceItem, { type: 'message' }> => i.type === 'message');

test('detection: @startuml with messages is a PlantUML sequence diagram', () => {
  assert.equal(detectDiagramType(uml('Alice -> Bob : hi')).type, 'plantumlSequence');
  assert.equal(detectDiagramType(uml('participant A\nparticipant B')).type, 'plantumlSequence');
});

test('detection: other PlantUML diagrams are recognised and named, not drawn as sequences', () => {
  assert.deepEqual(detectDiagramType(uml('class Car\nCar --> Wheel')), { type: 'plantumlClass', label: 'PlantUML class diagram' });
  assert.equal(detectDiagramType(uml('start\n:Step;\nstop')).type, 'plantumlActivity');
  assert.equal(detectDiagramType(uml('[*] --> On')).type, 'plantumlState');
  assert.equal(detectDiagramType(uml('actor User\n(Login)\nUser -> (Login)')).label, 'PlantUML use case');
  assert.equal(detectDiagramType('@startmindmap\n* root\n@endmindmap').label, 'PlantUML mindmap');
  // Mermaid is untouched.
  assert.equal(detectDiagramType('sequenceDiagram\n A->>B: x').type, 'sequence');
});

test('participants: kinds, quoted names and aliases on either side', () => {
  const { ast } = parsePlantUmlSequence(
    uml('actor Client\nparticipant "Boutique web" as Web\ndatabase DB as "Base commandes" #yellow\nqueue Q order 10'),
  );
  assert.deepEqual(
    ast.participants.map((p) => [p.id, p.label, p.actor]),
    [
      ['Client', 'Client', true],
      ['Web', 'Boutique web', false],
      ['DB', 'Base commandes', false],
      ['Q', 'Q', false],
    ],
  );
});

test('arrows: solid, dashed, async, lost, reversed and two-way', () => {
  const { ast } = parsePlantUmlSequence(uml('A -> B : a\nA --> B : b\nA ->> B : c\nA ->x B : d\nB <- A : e\nA <-> B : f\nA -[#red]> B : g\nA -\\ B : h'));
  const m = messages(ast.items);
  assert.deepEqual(
    m.map((x) => [x.from, x.to, x.dashed, x.head, x.both, x.text]),
    [
      ['A', 'B', false, 'arrow', false, 'a'],
      ['A', 'B', true, 'arrow', false, 'b'],
      ['A', 'B', false, 'open', false, 'c'],
      ['A', 'B', false, 'cross', false, 'd'],
      ['A', 'B', false, 'arrow', false, 'e'],
      ['A', 'B', false, 'arrow', true, 'f'],
      ['A', 'B', false, 'arrow', false, 'g'],
      ['A', 'B', false, 'open', false, 'h'],
    ],
  );
});

test('activation shorthands and return', () => {
  const { ast } = parsePlantUmlSequence(uml('A -> B ++ : call\nB -> C ** : make\nreturn done\nC -> D !! : bye'));
  const m = messages(ast.items);
  assert.equal(m[0]?.activate, true);
  assert.ok(ast.items.some((i) => i.type === 'create' && i.actor === 'C'));
  // `return` goes back from the last activated callee to its caller, dashed, and ends the activation.
  assert.deepEqual([m[2]?.from, m[2]?.to, m[2]?.dashed, m[2]?.deactivate, m[2]?.text], ['B', 'A', true, true, 'done']);
  assert.ok(ast.items.some((i) => i.type === 'destroy' && i.actor === 'D'));
});

test('notes: placed, attached to the last message, across, multi-line, and ref', () => {
  const { ast } = parsePlantUmlSequence(
    uml('A -> B : x\nnote left of A : one\nnote right : two\nnote over A, B #aqua : three\nnote across : four\nhnote over B\nfive\nsix\nend note\nref over A, B : seven'),
  );
  const notes = ast.items.filter((i): i is Extract<SequenceItem, { type: 'note' }> => i.type === 'note');
  assert.deepEqual(
    notes.map((n) => [n.placement, n.actors, n.text]),
    [
      ['left', ['A'], 'one'],
      ['right', ['B'], 'two'],
      ['over', ['A', 'B'], 'three'],
      ['over', ['A', 'B'], 'four'],
      ['over', ['B'], 'five\nsix'],
      ['over', ['A', 'B'], 'ref: seven'],
    ],
  );
});

test('groups, else, separators, title and autonumber', () => {
  const { ast, warnings } = parsePlantUmlSequence(
    uml('title Payment\nautonumber 10 5\nalt ok\nA -> B : x\nelse ko\nA -> B : y\nend\ngroup Tasks\nA -> B : z\nend\n== Phase 2 ==\n...\n|||'),
  );
  assert.equal(ast.title, 'Payment');
  assert.deepEqual(messages(ast.items).map((m) => m.number), [10, 15, 20]);
  const kinds = ast.items.filter((i) => i.type === 'blockStart').map((i) => (i.type === 'blockStart' ? [i.kind, i.label] : []));
  assert.deepEqual(kinds, [['alt', 'ok'], ['group', 'Tasks']]);
  assert.ok(ast.items.some((i) => i.type === 'blockElse' && i.label === 'ko'));
  assert.ok(ast.items.some((i) => i.type === 'note' && i.text === 'Phase 2'));
  assert.deepEqual(warnings, []);
});

test('styling and preprocessor lines are ignored with a warning; !include is never followed', () => {
  const { ast, warnings } = parsePlantUmlSequence(
    uml("!include https://example.com/x.puml\n!theme cerulean\nskinparam {\n  ArrowColor red\n}\nskinparam monochrome true\n' comment\n/' block\ncomment '/\nbox \"G\"\nparticipant A\nend box\nA -> B : x"),
  );
  assert.equal(messages(ast.items).length, 1);
  assert.ok(warnings.some((w) => w.includes('`!include` is not followed')));
  assert.ok(warnings.some((w) => w.includes('skinparam')));
  assert.ok(!warnings.some((w) => w.startsWith('Unsupported line')), warnings.join('\n'));
});

test('incoming / outgoing messages are skipped with a warning', () => {
  const { ast, warnings } = parsePlantUmlSequence(uml('[-> A : in\nA ->] : out\nA -> B : x'));
  assert.equal(messages(ast.items).length, 1);
  assert.ok(warnings.some((w) => w.includes('Incoming and outgoing')));
});

test('hostile labels are escaped in the Word output (AGENTS rule 2)', () => {
  const { fragment } = renderDiagram(uml('participant "<evil a=\'1\'>&" as X\nX -> Y : </w:t><w:evil/>\nnote over X : "quote" & <b>'));
  assert.ok(!fragment.includes('<evil'));
  assert.ok(!fragment.includes('<w:evil'));
  assert.ok(fragment.includes('&lt;evil'));
});

test('renderDiagram: PlantUML sequence becomes shapes; another PlantUML type becomes a note and a warning', () => {
  const seq = renderDiagram(uml('Alice -> Bob : hi'));
  assert.equal(seq.metadata.diagramType, 'plantumlSequence');
  assert.ok(seq.fragment.includes('<wps:wsp'));
  const other = renderDiagram(uml('actor User\n(Login)\nUser -> (Login)'));
  assert.equal(other.metadata.diagramType, 'plantuml');
  assert.ok(other.fragment.includes('not yet supported'));
  assert.ok(other.metadata.warnings.some((w) => w.includes('PlantUML use case')));
});

test('never throws on malformed input, and caps hostile sizes', () => {
  for (const junk of ['@startuml', '@startuml\n->\n<-\n-->>x\n"\n::\nend\nelse\nreturn\n@enduml', uml('A -> B ++ ++ -- !! ** : x'), uml('alt\n'.repeat(40))]) {
    assert.doesNotThrow(() => parsePlantUmlSequence(junk));
    assert.doesNotThrow(() => renderDiagram(junk));
  }
  const many = uml(Array.from({ length: 80 }, (_, i) => `P${i} -> Q${i} : m`).join('\n'));
  const { ast, warnings } = parsePlantUmlSequence(many);
  assert.equal(ast.participants.length, 50);
  assert.ok(warnings.some((w) => w.includes('limited to 50 participants')));
});

// Syntax from the official reference page (plantuml.com/sequence-diagram), run end to end on 2026-11-19.
test('official-page syntax: a participant named Participant, multi-line names, inline alias in a message', () => {
  const multi = parsePlantUmlSequence(uml('participant Participant [\n  =Title\n  ----\n  ""SubTitle""\n]\nparticipant Bob\nParticipant -> Bob'));
  assert.deepEqual(multi.warnings, []);
  // Heading marker, rule and monospace quotes dropped; the two lines kept as two lines.
  assert.match(multi.ast.participants[0]?.label ?? '', /^Title\s*(?:<br\/>|\n)\s*SubTitle$/);
  assert.equal(messages(multi.ast.items).length, 1);
  const alias = parsePlantUmlSequence(uml('"Bob()" -> "This is very\\nlong" as Long\nLong --> "Bob()" : ok'));
  assert.deepEqual(alias.warnings, []);
  assert.deepEqual(alias.ast.participants.map((p) => p.id), ['Bob()', 'Long']);
  assert.equal(messages(alias.ast.items).length, 2);
});

test('official-page syntax: colour after the receiver, --++, autoactivate with return', () => {
  const { ast, warnings } = parsePlantUmlSequence(
    uml('autoactivate on\nalice -> bob : hello\nbob -> bob : self call\nbill -> bob #005500 : hello from thread 2\nbob -> george ** : create\nreturn done in thread 2\nreturn rc\nbob -> george !! : delete\nreturn success\nalice -> bob --++ #gold: again'),
  );
  assert.ok(!warnings.some((w) => /ignored:/.test(w)), warnings.join(' | '));
  const msgs = messages(ast.items);
  assert.equal(msgs.length, 9);
  assert.deepEqual(msgs.slice(4, 7).map((x) => [x.from, x.to]), [['george', 'bob'], ['bob', 'bill'], ['bob', 'george']]);
  assert.deepEqual([msgs[7]?.from, msgs[7]?.to], ['bob', 'alice']);
});

test('official-page syntax: slanted arrows, teoz &, anchors, / note, partition and <style> are kept or skipped cleanly', () => {
  const { ast, warnings } = parsePlantUmlSequence(
    uml('<style>\nlifeLine {\n LineStyle 0\n}\n</style>\n{start} A ->(10) B : go\n& B -> C : hi\nA (10)<- B : back\n{start} <-> {end} : some time\nnote over A : a\n/ note over B : b\nnote left B: c\npartition p1\nA -> B\nend'),
  );
  assert.ok(!warnings.some((w) => /ignored:/.test(w)), warnings.join(' | '));
  assert.equal(messages(ast.items).length, 4);
  assert.equal(ast.items.filter((i) => i.type === 'note').length, 3);
  assert.equal(ast.items.filter((i) => i.type === 'blockStart').length, 1);
  for (const w of ['Slanted arrows', 'Parallel messages', 'Duration anchors', '`<style>`']) assert.ok(warnings.some((x) => x.includes(w)), w);
});
