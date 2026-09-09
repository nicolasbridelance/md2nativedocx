import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClassDiagram } from '../../src/diagrams/class-diagram/parser.js';

const BASIC = `classDiagram
  class Animal {
    +String name
    +int age
    +makeSound() void
  }
  class Dog {
    +bark() void
  }
  Animal <|-- Dog`;

test('parses a class block (colon and bracket member syntax) with attributes split from methods', () => {
  const { ast, warnings } = parseClassDiagram(BASIC);
  assert.equal(warnings.length, 0);
  const animal = ast.classes.find((c) => c.id === 'Animal')!;
  assert.equal(animal.label, 'Animal');
  assert.deepEqual(
    animal.attributes.map((m) => m.text),
    ['String name', 'int age'],
  );
  assert.deepEqual(
    animal.attributes.map((m) => m.visibility),
    ['+', '+'],
  );
  assert.deepEqual(
    animal.methods.map((m) => m.text),
    ['makeSound() void'],
  );
});

test('parses inheritance and records which end carries the marker', () => {
  const { ast } = parseClassDiagram(BASIC);
  assert.equal(ast.relationships.length, 1);
  const rel = ast.relationships[0]!;
  assert.equal(rel.from, 'Animal');
  assert.equal(rel.to, 'Dog');
  assert.equal(rel.type, 'inheritance');
  assert.equal(rel.markerEnd, 'from');
});

test('recognizes all 8 relationship arrow families and both marker sides', () => {
  const cases: Array<[string, string, string]> = [
    ['A <|-- B', 'inheritance', 'from'],
    ['A --|> B', 'inheritance', 'to'],
    ['A *-- B', 'composition', 'from'],
    ['A --* B', 'composition', 'to'],
    ['A o-- B', 'aggregation', 'from'],
    ['A --o B', 'aggregation', 'to'],
    ['A --> B', 'association', 'to'],
    ['A <-- B', 'association', 'from'],
    ['A -- B', 'link', 'none'],
    ['A ..> B', 'dependency', 'to'],
    ['A <.. B', 'dependency', 'from'],
    ['A ..|> B', 'realization', 'to'],
    ['A |>.. B', 'realization', 'from'],
    ['A .. B', 'dashedLink', 'none'],
  ];
  for (const [line, type, markerEnd] of cases) {
    const { ast, warnings } = parseClassDiagram(`classDiagram\n  ${line}`);
    assert.equal(ast.relationships.length, 1, `expected one relationship for: ${line}`);
    assert.equal(ast.relationships[0]!.type, type, `wrong type for: ${line}`);
    assert.equal(ast.relationships[0]!.markerEnd, markerEnd, `wrong markerEnd for: ${line}`);
    assert.equal(warnings.length, 0, `expected no warnings for: ${line}`);
  }
});

test('a relationship label after ":" is captured', () => {
  const { ast } = parseClassDiagram('classDiagram\n  Customer --> Order : places');
  assert.equal(ast.relationships[0]?.label, 'places');
});

test('quoted cardinalities are stripped and warned, not left in the label', () => {
  const { ast, warnings } = parseClassDiagram('classDiagram\n  Customer "1" --> "many" Order : places');
  assert.equal(ast.relationships.length, 1);
  assert.equal(ast.relationships[0]?.from, 'Customer');
  assert.equal(ast.relationships[0]?.to, 'Order');
  assert.equal(ast.relationships[0]?.label, 'places');
  assert.ok(warnings.some((w) => w.includes('cardinalities')));
});

test('class with a bracket label', () => {
  const { ast } = parseClassDiagram('classDiagram\n  class Animal["The Animal"]');
  assert.equal(ast.classes[0]?.id, 'Animal');
  assert.equal(ast.classes[0]?.label, 'The Animal');
});

test('a bare class declaration with no block is still recorded', () => {
  const { ast, warnings } = parseClassDiagram('classDiagram\n  class Animal');
  assert.equal(ast.classes.length, 1);
  assert.equal(ast.classes[0]?.id, 'Animal');
  assert.equal(warnings.length, 0);
});

test('generics are stripped from the class id without a warning', () => {
  const { ast, warnings } = parseClassDiagram('classDiagram\n  class List~int~');
  assert.equal(ast.classes[0]?.id, 'List');
  assert.equal(warnings.length, 0);
});

test('backtick-quoted class ids are supported', () => {
  const { ast } = parseClassDiagram('classDiagram\n  class `Animal-Class`');
  assert.equal(ast.classes[0]?.id, 'Animal-Class');
});

test('the alternate standalone member syntax (ClassName : +member) is supported', () => {
  const { ast } = parseClassDiagram('classDiagram\n  class Animal\n  Animal : +String name\n  Animal : +makeSound() void');
  const animal = ast.classes.find((c) => c.id === 'Animal')!;
  assert.deepEqual(animal.attributes.map((m) => m.text), ['String name']);
  assert.deepEqual(animal.methods.map((m) => m.text), ['makeSound() void']);
});

test('direction is parsed with the same TB->TD normalization as flowchart', () => {
  assert.equal(parseClassDiagram('classDiagram\n  direction LR\n  class A').ast.direction, 'LR');
  assert.equal(parseClassDiagram('classDiagram\n  direction TB\n  class A').ast.direction, 'TD');
  assert.equal(parseClassDiagram('classDiagram\n  class A').ast.direction, 'TD');
});

test('a namespace block is warned but its nested classes still parse', () => {
  const { ast, warnings } = parseClassDiagram(
    'classDiagram\n  namespace Shapes {\n    class Circle {\n      +radius: int\n    }\n  }',
  );
  assert.equal(ast.classes.length, 1);
  assert.equal(ast.classes[0]?.id, 'Circle');
  assert.deepEqual(ast.classes[0]?.attributes.map((m) => m.text), ['radius: int']);
  assert.ok(warnings.some((w) => w.includes('namespace')));
});

test('class annotations, classDef/style, and note lines are recognized and warned, not silently dropped', () => {
  const { warnings: w1 } = parseClassDiagram('classDiagram\n  class Shape {\n    <<interface>>\n    +area() double\n  }');
  assert.ok(w1.some((w) => w.includes('annotations')));

  const { warnings: w2 } = parseClassDiagram('classDiagram\n  classDef foo fill:#f00\n  class A');
  assert.ok(w2.some((w) => w.includes('Styling')));

  const { warnings: w3 } = parseClassDiagram('classDiagram\n  note "a note"\n  class A');
  assert.ok(w3.some((w) => w.includes('Notes')));
});

test('an unclosed class block is warned, not silently dropped', () => {
  const { warnings } = parseClassDiagram('classDiagram\n  class Animal {\n    +String name');
  assert.ok(warnings.some((w) => w.includes('not closed')));
});
