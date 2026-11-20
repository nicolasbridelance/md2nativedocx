import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseErDiagram } from '../../src/diagrams/er-diagram/parser.js';

test('parses an entity attribute block with keys and a quoted comment', () => {
  const { ast, warnings } = parseErDiagram(
    'erDiagram\n  CUSTOMER {\n    int id PK\n    string email UK\n    string name\n    text address "Physical location"\n  }',
  );
  assert.equal(warnings.length, 0);
  const customer = ast.entities.find((e) => e.id === 'CUSTOMER')!;
  assert.equal(customer.attributes.length, 4);
  assert.deepEqual(customer.attributes[0], { type: 'int', name: 'id', keys: ['PK'] });
  assert.deepEqual(customer.attributes[1], { type: 'string', name: 'email', keys: ['UK'] });
  assert.deepEqual(customer.attributes[2], { type: 'string', name: 'name', keys: [] });
  assert.deepEqual(customer.attributes[3], { type: 'text', name: 'address', keys: [], comment: 'Physical location' });
});

test('parses a relationship with cardinality on both ends and a quoted label', () => {
  const { ast, warnings } = parseErDiagram('erDiagram\n  CUSTOMER ||--o{ ORDER : "places"');
  assert.equal(warnings.length, 0);
  assert.equal(ast.relationships.length, 1);
  const rel = ast.relationships[0]!;
  assert.equal(rel.from, 'CUSTOMER');
  assert.equal(rel.to, 'ORDER');
  assert.equal(rel.fromCardinality, 'exactly-one');
  assert.equal(rel.toCardinality, 'zero-or-many');
  assert.equal(rel.identifying, true);
  assert.equal(rel.label, 'places');
});

test('recognizes all 4 cardinality states on each side, and the non-identifying line style', () => {
  const cases: Array<[string, string, string, boolean]> = [
    ['A |o--o| B', 'zero-or-one', 'zero-or-one', true],
    ['A ||--|| B', 'exactly-one', 'exactly-one', true],
    ['A }o--o{ B', 'zero-or-many', 'zero-or-many', true],
    ['A }|--|{ B', 'one-or-many', 'one-or-many', true],
    ['A }|..|{ B', 'one-or-many', 'one-or-many', false],
  ];
  for (const [line, fromCard, toCard, identifying] of cases) {
    const { ast, warnings } = parseErDiagram(`erDiagram\n  ${line}`);
    assert.equal(ast.relationships.length, 1, `expected one relationship for: ${line}`);
    assert.equal(ast.relationships[0]!.fromCardinality, fromCard, `wrong fromCardinality for: ${line}`);
    assert.equal(ast.relationships[0]!.toCardinality, toCard, `wrong toCardinality for: ${line}`);
    assert.equal(ast.relationships[0]!.identifying, identifying, `wrong identifying for: ${line}`);
    assert.equal(warnings.length, 0, `expected no warnings for: ${line}`);
  }
});

test('the PERSON/CAR/NAMED-DRIVER example from the docs parses fully', () => {
  const { ast, warnings } = parseErDiagram(
    'erDiagram\n  PERSON }|..|{ CAR : "driver"\n  CAR ||--o{ NAMED-DRIVER : "insures"\n  PERSON ||--o{ NAMED-DRIVER : "is"',
  );
  assert.equal(warnings.length, 0);
  assert.equal(ast.entities.length, 3);
  assert.equal(ast.relationships.length, 3);
  assert.equal(ast.relationships[0]?.identifying, false);
  assert.equal(ast.relationships[1]?.identifying, true);
});

test('classDef/class/style lines are recognized and warned, not silently dropped', () => {
  const { warnings } = parseErDiagram('erDiagram\n  classDef foo fill:#f00\n  A ||--|| B');
  assert.ok(warnings.some((w) => w.includes('Styling')));
});

test('an unclosed attribute block is warned, not silently dropped', () => {
  const { warnings } = parseErDiagram('erDiagram\n  CUSTOMER {\n    int id PK');
  assert.ok(warnings.some((w) => w.includes('not closed')));
});

test('a relationship with an unrecognized cardinality token is warned, not silently dropped', () => {
  const { ast, warnings } = parseErDiagram('erDiagram\n  A xx--yy B');
  assert.equal(ast.relationships.length, 0);
  assert.ok(warnings.some((w) => w.includes('Unsupported line')));
});

// The cases below come from Mermaid's official ER examples, where our parser differed from Mermaid's own
// (tools/mermaid-differential/).

test('relationships in words: cardinality aliases and `to` / `optionally to`', () => {
  const { ast, warnings } = parseErDiagram(
    'erDiagram\n  CAR 1 to zero or more NAMED-DRIVER : allows\n  PERSON many(0) optionally to 0+ NAMED-DRIVER : is\n  MANUFACTURER only one to one or many CAR : makes',
  );
  assert.deepEqual(
    ast.relationships.map((r) => [r.from, r.fromCardinality, r.identifying, r.toCardinality, r.to, r.label]),
    [
      ['CAR', 'exactly-one', true, 'zero-or-many', 'NAMED-DRIVER', 'allows'],
      ['PERSON', 'zero-or-many', false, 'zero-or-many', 'NAMED-DRIVER', 'is'],
      ['MANUFACTURER', 'exactly-one', true, 'one-or-many', 'CAR', 'makes'],
    ],
  );
  assert.equal(warnings.length, 0);
});

test('symbols without spaces, and a right-side spelling on the left (o{--||)', () => {
  const { ast, warnings } = parseErDiagram('erDiagram\n  id1||--||id2 : label\n  PERSON o{--|| HOUSE : has');
  assert.deepEqual(
    ast.relationships.map((r) => [r.from, r.fromCardinality, r.toCardinality, r.to]),
    [
      ['id1', 'exactly-one', 'exactly-one', 'id2'],
      ['PERSON', 'zero-or-many', 'exactly-one', 'HOUSE'],
    ],
  );
  assert.equal(warnings.length, 0);
});

test('an alias is drawn instead of the id; quoted and Unicode names; bare declarations', () => {
  const { ast, warnings } = parseErDiagram(
    'erDiagram\n  p[Person] {\n    string firstName\n  }\n  a["Customer Account"] {\n    string email\n  }\n  p ||--o| a : has\n  "This ❤ Unicode"\n  CUSTOMER',
  );
  assert.deepEqual(
    ast.entities.map((e) => [e.id, e.label, e.attributes.length]),
    [
      ['p', 'Person', 1],
      ['a', 'Customer Account', 1],
      ['This ❤ Unicode', undefined, 0],
      ['CUSTOMER', undefined, 0],
    ],
  );
  assert.equal(warnings.length, 0);
});

test('`:::class` suffixes are stripped from the entity name and warned once', () => {
  const { ast, warnings } = parseErDiagram('erDiagram\n  PERSON:::foo ||--|| CAR : owns\n  HOUSE:::a,b');
  assert.deepEqual(ast.entities.map((e) => e.id), ['PERSON', 'CAR', 'HOUSE']);
  assert.equal(warnings.filter((w) => w.includes(':::class')).length, 1);
});

test('direction is kept; a subgraph keeps its entities and warns that the box is not drawn', () => {
  const { ast, warnings } = parseErDiagram('erDiagram\n  direction LR\n  subgraph id1 [title 1]\n    CUSTOMER\n  end\n  CUSTOMER ||--o{ ORDER : places');
  assert.equal(ast.direction, 'LR');
  assert.deepEqual(ast.entities.map((e) => e.id), ['CUSTOMER', 'ORDER']);
  assert.deepEqual(warnings, ['ER groups (`subgraph`) are not drawn as boxes; their entities are kept.']);
});

test('a line that is not a statement is still warned, not guessed', () => {
  const { ast, warnings } = parseErDiagram('erDiagram\n  CAR ||-- NAMED-DRIVER\n  CAR <> TRUCK');
  assert.equal(ast.relationships.length, 0);
  assert.equal(warnings.length, 2);
});
