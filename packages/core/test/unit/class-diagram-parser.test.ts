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

test('a namespace block groups its classes, which still parse', () => {
  const { ast, warnings } = parseClassDiagram(
    'classDiagram\n  namespace Shapes {\n    class Circle {\n      +radius: int\n    }\n  }',
  );
  assert.equal(ast.classes.length, 1);
  assert.equal(ast.classes[0]?.id, 'Circle');
  assert.deepEqual(ast.classes[0]?.attributes.map((m) => m.text), ['radius: int']);
  assert.equal(ast.classes[0]?.namespace, 'Shapes');
  assert.deepEqual(ast.namespaces, [{ id: 'Shapes', label: 'Shapes' }]);
  assert.deepEqual(warnings, []);
});

test('classDef/style and note lines are recognized and warned, not silently dropped', () => {
  const { warnings: w2 } = parseClassDiagram('classDiagram\n  classDef foo fill:#f00\n  class A');
  assert.ok(w2.some((w) => w.includes('Styling')));

  const { warnings: w3 } = parseClassDiagram('classDiagram\n  note "a note"\n  class A');
  assert.ok(w3.some((w) => w.includes('Notes')));
});

test('an unclosed class block is warned, not silently dropped', () => {
  const { warnings } = parseClassDiagram('classDiagram\n  class Animal {\n    +String name');
  assert.ok(warnings.some((w) => w.includes('not closed')));
});

// The cases below come from Mermaid's official class examples, where our parser differed from Mermaid's own
// (tools/mermaid-differential/).

test('relations follow Mermaid grammar: optional end, solid or dotted line, optional end', () => {
  const { ast, warnings } = parseClassDiagram(
    'classDiagram\n  classA <|-- classB\n  classM <|.. classN\n  classK <.. classL\n  classC *-- classD\n  classE o-- classF\n  classI -- classJ\n  classO .. classP\n  A ..|> B\n  C --> D',
  );
  assert.deepEqual(
    ast.relationships.map((r) => [r.from, r.type, r.markerEnd, r.to]),
    [
      ['classA', 'inheritance', 'from', 'classB'],
      ['classM', 'realization', 'from', 'classN'],
      ['classK', 'dependency', 'from', 'classL'],
      ['classC', 'composition', 'from', 'classD'],
      ['classE', 'aggregation', 'from', 'classF'],
      ['classI', 'link', 'none', 'classJ'],
      ['classO', 'dashedLink', 'none', 'classP'],
      ['A', 'realization', 'to', 'B'],
      ['C', 'association', 'to', 'D'],
    ],
  );
  assert.equal(warnings.length, 0);
});

test('a two-way relation (<|--|>) carries its marker at both ends', () => {
  const { ast, warnings } = parseClassDiagram('classDiagram\n  Animal <|--|> Zebra');
  assert.deepEqual(ast.relationships.map((r) => [r.type, r.markerEnd]), [['inheritance', 'both']]);
  assert.equal(warnings.length, 0);
});

test('backtick-quoted names with spaces in a relation; a name ending in o is not read as an aggregation', () => {
  const { ast } = parseClassDiagram('classDiagram\n  `Animal Class!` --> `Car Class`\n  Foo--Bar');
  assert.deepEqual(ast.relationships.map((r) => [r.from, r.type, r.to]), [
    ['Animal Class!', 'association', 'Car Class'],
    ['Foo', 'link', 'Bar'],
  ]);
});

test('class header with :::style and an inline <<annotation>> still declares the class (the style warned once)', () => {
  const { ast, warnings } = parseClassDiagram(
    'classDiagram\n  class Shape <<interface>>\n  class Animal:::someclass {\n    -int sizeInFeet\n    -canEat()\n  }\n  class Mineral:::pink',
  );
  assert.deepEqual(ast.classes.map((c) => [c.id, c.attributes.length, c.methods.length]), [
    ['Shape', 0, 0],
    ['Animal', 1, 1],
    ['Mineral', 0, 0],
  ]);
  assert.deepEqual(ast.classes[0]!.annotations, ['interface']);
  assert.equal(warnings.length, 1);
});

test('annotations are read in the body, in the header and on their own line, as Mermaid reads them', () => {
  const { ast, warnings } = parseClassDiagram(
    [
      'classDiagram',
      'class Shape {',
      '  <<interface>>',
      '  noOfVertices',
      '}',
      'class Color <<enumeration>>',
      '<<service>> Api',
      'class Multi {',
      '  <<abstract>>',
      '  <<entity>>',
      '}',
    ].join('\n'),
  );
  const byId = new Map(ast.classes.map((c) => [c.id, c]));
  assert.deepEqual(byId.get('Shape')?.annotations, ['interface']);
  assert.deepEqual(byId.get('Shape')?.attributes.map((a) => a.text), ['noOfVertices'], 'the annotation is not a member');
  assert.deepEqual(byId.get('Color')?.annotations, ['enumeration']);
  assert.deepEqual(byId.get('Api')?.annotations, ['service']);
  assert.deepEqual(warnings, ['Class "Multi" has several annotations; only the first, «abstract», is drawn (as in Mermaid).']);
});

test('namespaces are qualified as Mermaid qualifies them: nested, dotted with implicit ancestors, labelled', () => {
  const { ast, warnings } = parseClassDiagram(
    [
      'classDiagram',
      'namespace Platform {',
      '  namespace Auth["Authentication"] {',
      '    class UserService',
      '  }',
      '  class Gateway',
      '}',
      'namespace Company.Engineering.Backend {',
      '  class Developer',
      '}',
      'namespace Company.Engineering {',
      '  class TechLead',
      '}',
      'class Outside',
    ].join('\n'),
  );
  assert.deepEqual(warnings, []);
  assert.deepEqual(ast.namespaces, [
    { id: 'Platform', label: 'Platform' },
    { id: 'Platform.Auth', label: 'Authentication', parent: 'Platform' },
    { id: 'Company', label: 'Company' },
    { id: 'Company.Engineering', label: 'Engineering', parent: 'Company' },
    { id: 'Company.Engineering.Backend', label: 'Backend', parent: 'Company.Engineering' },
  ]);
  const where = Object.fromEntries(ast.classes.map((c) => [c.id, c.namespace ?? '-']));
  assert.deepEqual(where, {
    UserService: 'Platform.Auth',
    Gateway: 'Platform',
    Developer: 'Company.Engineering.Backend',
    TechLead: 'Company.Engineering',
    Outside: '-',
  });
});
