import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlantUmlClass } from '../../src/diagrams/plantuml/class-parser.js';
import { detectDiagramType } from '../../src/parser/diagram-type.js';
import { renderDiagram } from '../../src/render-diagram.js';

const uml = (body: string): string => `@startuml\n${body}\n@enduml`;
const rels = (src: string): string[] =>
  parsePlantUmlClass(uml(src)).ast.relationships.map((r) => `${r.from} ${r.type}/${r.markerEnd} ${r.to}${r.label ? ` :${r.label}` : ''}`);

test('detection: declarations and class-only relations make a PlantUML class diagram; sequences are untouched', () => {
  for (const src of ['class Car', 'abstract Shape', 'interface Runnable', 'enum Color', 'Animal <|-- Dog', 'Car *-- Wheel', 'A ..|> B', '-class "private" {\n}', 'package p {\n  A o-- B\n}', 'foo -left-> bar']) {
    assert.equal(detectDiagramType(uml(src)).type, 'plantumlClass', src);
  }
  for (const src of ['Alice -> Bob : hi', 'Alice --> Bob : a o-- b', 'participant A\nA -> B']) {
    assert.equal(detectDiagramType(uml(src)).type, 'plantumlSequence', src);
  }
});

test('relations: every family, either direction, dotted variants', () => {
  assert.deepEqual(rels('A <|-- B\nC *-- D\nE o-- F\nG .. H\nI -- J'), [
    'A inheritance/from B',
    'C composition/from D',
    'E aggregation/from F',
    'G dashedLink/none H',
    'I link/none J',
  ]);
  assert.deepEqual(rels('A <|.. B\nC --> D\nE ..> F\nG ..|> H\nI --* J\nK ^-- L'), [
    'A realization/from B',
    'C association/to D',
    'E dependency/to F',
    'G realization/to H',
    'I composition/to J',
    'K inheritance/from L',
  ]);
});

test('relations: cardinalities, roles, qualifiers, direction hints, colours and labels', () => {
  const { ast, warnings } = parsePlantUmlClass(
    uml('Car "1" *-- "4..*" Wheel : has >\nUser "owner"/1 -- "0..n"/items Item\nShop [id: long] ---> "customer" Customer\nfoo -up-> bar\nfoo -[#red]-> baz #line:red;text:red : coloured'),
  );
  assert.deepEqual(warnings.filter((w) => /ignored:/.test(w)), []);
  assert.deepEqual(
    ast.relationships.map((r) => [r.from, r.type, r.to, r.label]),
    [
      ['Car', 'composition', 'Wheel', 'has'],
      ['User', 'link', 'Item', undefined],
      ['Shop', 'association', 'Customer', undefined],
      ['foo', 'association', 'bar', undefined],
      ['foo', 'association', 'baz', 'coloured'],
    ],
  );
  assert.ok(warnings.some((w) => w.includes('cardinalities')));
});

test('declarations: kinds, aliases, generics, stereotypes, colours, extends/implements, members', () => {
  const { ast, warnings } = parsePlantUmlClass(
    uml(
      [
        'class "Long name" as L',
        'class S as "Shown name"',
        'abstract class Shape<T> <<Entity>> #pink {',
        '  {abstract} +area() : double',
        '  -- geometry --',
        '  #{static} count : int',
        '}',
        'class Circle extends Shape implements Drawable, Serializable',
        'enum Color { RED; GREEN }',
        'Circle : radius : double',
        'class X1::X2::foo',
        '() lollipop',
      ].join('\n'),
    ),
  );
  assert.deepEqual(warnings.filter((w) => /ignored:/.test(w)), []);
  const byId = new Map(ast.classes.map((c) => [c.id, c]));
  assert.equal(byId.get('L')?.label, 'Long name');
  assert.equal(byId.get('S')?.label, 'Shown name');
  assert.deepEqual(byId.get('Shape')?.methods, [{ visibility: '+', text: 'area() : double' }]);
  assert.deepEqual(byId.get('Shape')?.attributes, [{ visibility: '#', text: 'count : int' }]);
  assert.deepEqual(byId.get('Color')?.attributes.map((a) => a.text), ['RED', 'GREEN']);
  assert.deepEqual(byId.get('Circle')?.attributes.map((a) => a.text), ['radius : double']);
  assert.ok(byId.has('X1::X2::foo') && byId.has('lollipop'));
  assert.deepEqual(rels('class Circle extends Shape implements Drawable'), ['Shape inheritance/from Circle', 'Drawable realization/from Circle']);
});

test('skipped content: notes (also on members), packages, skinparam and style blocks, json, display commands', () => {
  const { ast, warnings } = parsePlantUmlClass(
    uml(
      [
        'left to right direction',
        'skinparam class {',
        '  BackgroundColor PaleGreen',
        '}',
        '<style>',
        'classDiagram { FontColor red }',
        '</style>',
        'package "Core" #DDD {',
        '  class A',
        '  namespace inner {',
        '    class B',
        '  }',
        '}',
        'note right of A::field',
        '  about a field',
        'end note',
        'note "free" as N1',
        'N1 .. A',
        'json cfg {',
        '  "a": { "b": [1, 2] }',
        '}',
        'hide empty members',
        'A <|-- B',
      ].join('\n'),
    ),
  );
  assert.deepEqual(warnings.filter((w) => /ignored:|never closed/.test(w)), []);
  assert.equal(ast.direction, 'LR');
  assert.deepEqual(ast.classes.map((c) => c.id), ['A', 'B', 'cfg']);
  assert.deepEqual(ast.relationships.length, 1);
});

test('hostile labels are escaped in the Word output (AGENTS rule 2)', () => {
  const { fragment } = renderDiagram(uml('class "<evil a=\'1\'>&" as X {\n  +</w:t><w:evil/> : int\n}\nX --> Y : "quote" & <b>'));
  assert.ok(!fragment.includes('<evil'));
  assert.ok(!fragment.includes('<w:evil'));
  assert.ok(fragment.includes('&lt;evil'));
});

test('renderDiagram: a PlantUML class diagram is drawn; an inheritance tree becomes SmartArt when it is on', () => {
  const shapes = renderDiagram(uml('Car *-- Wheel\nCar o-- Driver'));
  assert.equal(shapes.metadata.diagramType, 'plantumlClass');
  assert.equal(shapes.kind, 'shapes');
  const tree = renderDiagram(uml('Animal <|-- Dog\nAnimal <|-- Cat'), { smartArt: true });
  assert.equal(tree.kind, 'smartart');
});

test('never throws on malformed input, and caps hostile sizes', () => {
  for (const junk of ['@startuml', uml('class\n{\n}\n}\n<|--\n"\n:: x\n()\n<>\nnote\n(a,) .. b'), uml('package p {\n'.repeat(40)), uml('class A {\n')]) {
    assert.doesNotThrow(() => parsePlantUmlClass(junk));
    assert.doesNotThrow(() => renderDiagram(junk));
  }
  const { ast, warnings } = parsePlantUmlClass(uml(Array.from({ length: 400 }, (_, i) => `class C${i}`).join('\n')));
  assert.equal(ast.classes.length, 300);
  assert.ok(warnings.some((w) => w.includes('limited to 300 classes')));
});
