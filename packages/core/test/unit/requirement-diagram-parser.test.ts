import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRequirementDiagram } from '../../src/diagrams/requirement-diagram/parser.js';

const BASIC = `requirementDiagram
  requirement test_req {
    id: 1
    text: the test text.
    risk: high
    verifymethod: test
  }
  element test_entity {
    type: simulation
  }
  test_entity - satisfies -> test_req`;

test('parses a requirement block with all 4 fields', () => {
  const { ast, warnings } = parseRequirementDiagram(BASIC);
  assert.equal(warnings.length, 0);
  const req = ast.requirements.find((r) => r.name === 'test_req')!;
  assert.equal(req.type, 'requirement');
  assert.equal(req.id, '1');
  assert.equal(req.text, 'the test text.');
  // Shown as Mermaid shows them.
  assert.equal(req.risk, 'High');
  assert.equal(req.verifyMethod, 'Test');
});

test('parses an element block', () => {
  const { ast } = parseRequirementDiagram(BASIC);
  const el = ast.elements.find((e) => e.name === 'test_entity')!;
  assert.equal(el.type, 'simulation');
});

test('parses a "source - type -> destination" relationship', () => {
  const { ast } = parseRequirementDiagram(BASIC);
  assert.equal(ast.relationships.length, 1);
  assert.deepEqual(ast.relationships[0], { from: 'test_entity', to: 'test_req', type: 'satisfies' });
});

test('parses the mirrored "destination <- type - source" relationship direction identically', () => {
  const { ast, warnings } = parseRequirementDiagram(
    'requirementDiagram\n  requirement A {\n    id: 1\n  }\n  element B {\n    type: x\n  }\n  A <- satisfies - B',
  );
  assert.equal(warnings.length, 0);
  assert.deepEqual(ast.relationships[0], { from: 'B', to: 'A', type: 'satisfies' });
});

test('recognizes all 7 relationship type keywords', () => {
  const types = ['contains', 'copies', 'derives', 'satisfies', 'verifies', 'refines', 'traces'];
  for (const type of types) {
    const { ast, warnings } = parseRequirementDiagram(`requirementDiagram\n  element A {\n  }\n  element B {\n  }\n  A - ${type} -> B`);
    assert.equal(ast.relationships.length, 1, `expected one relationship for: ${type}`);
    assert.equal(ast.relationships[0]!.type, type);
    assert.equal(warnings.length, 0, `expected no warnings for: ${type}`);
  }
});

test('every requirement type keyword is accepted as a block opener', () => {
  const types = [
    'requirement',
    'functionalRequirement',
    'interfaceRequirement',
    'performanceRequirement',
    'physicalRequirement',
    'designConstraint',
  ];
  for (const type of types) {
    const { ast, warnings } = parseRequirementDiagram(`requirementDiagram\n  ${type} r {\n    id: 1\n  }`);
    assert.equal(ast.requirements[0]?.type, type);
    assert.equal(warnings.length, 0, `expected no warnings for: ${type}`);
  }
});

test('an unrecognized relationship type keyword is warned, not silently dropped', () => {
  const { ast, warnings } = parseRequirementDiagram('requirementDiagram\n  A - madeup -> B');
  assert.equal(ast.relationships.length, 0);
  assert.ok(warnings.some((w) => w.includes('Unsupported line')));
});


test('an unclosed block is warned, not silently dropped', () => {
  const { warnings } = parseRequirementDiagram('requirementDiagram\n  requirement A {\n    id: 1');
  assert.ok(warnings.some((w) => w.includes('not closed')));
});

test('an unrecognized field inside a block is warned, not silently dropped', () => {
  const { warnings } = parseRequirementDiagram('requirementDiagram\n  requirement A {\n    bogus: x\n  }');
  assert.ok(warnings.some((w) => w.includes('Unsupported requirement field')));
});

test('a relationship naming an undefined box is kept but warned: it cannot be drawn', () => {
  const { ast, warnings } = parseRequirementDiagram('requirementDiagram\n  element A {\n  }\n  A - traces -> Ghost');
  assert.equal(ast.relationships.length, 1);
  assert.ok(warnings.some((w) => w.includes('"Ghost"') && w.includes('not defined')));
});

test('quoted names and values lose their quotes; an unquoted name may hold spaces', () => {
  const { ast, warnings } = parseRequirementDiagram(
    'requirementDiagram\n  requirement "__test_req__" {\n    text: "*italic* **bold**"\n  }\n  element my service {\n    type: "test suite"\n  }\n  "my service" - satisfies -> "__test_req__"',
  );
  assert.deepEqual(warnings, []);
  assert.equal(ast.requirements[0]!.name, '__test_req__');
  assert.equal(ast.requirements[0]!.text, '*italic* **bold**');
  assert.equal(ast.elements[0]!.name, 'my service');
  assert.equal(ast.elements[0]!.type, 'test suite');
  assert.deepEqual(ast.relationships[0], { from: 'my service', to: '__test_req__', type: 'satisfies' });
});

test('type keywords, field keys, risk and verify method are read case-insensitively, as by Mermaid', () => {
  const { ast, warnings } = parseRequirementDiagram('requirementDiagram\n  FunctionalRequirement r {\n    RISK: MEDIUM\n    VerifyMethod: Inspection\n  }');
  assert.deepEqual(warnings, []);
  assert.equal(ast.requirements[0]!.type, 'functionalRequirement');
  assert.equal(ast.requirements[0]!.risk, 'Medium');
  assert.equal(ast.requirements[0]!.verifyMethod, 'Inspection');
});

test('a value Mermaid rejects (unknown type, risk, verify method) is kept as written and warned', () => {
  const { ast, warnings } = parseRequirementDiagram('requirementDiagram\n  wish r {\n    risk: extreme\n    verifymethod: hope\n  }');
  assert.equal(ast.requirements[0]!.type, 'wish');
  assert.equal(ast.requirements[0]!.risk, 'extreme');
  assert.equal(ast.requirements[0]!.verifyMethod, 'hope');
  assert.equal(warnings.length, 3);
});

test('a block defined twice keeps its first definition, as in Mermaid, and says so', () => {
  const { ast, warnings } = parseRequirementDiagram('requirementDiagram\n  requirement r {\n    id: 1\n  }\n  requirement r {\n    id: 2\n  }');
  assert.equal(ast.requirements.length, 1);
  assert.equal(ast.requirements[0]!.id, '1');
  assert.ok(warnings.some((w) => w.includes('defined twice')));
});

test('direction is read; TB is stored as TD, like the class diagram', () => {
  assert.equal(parseRequirementDiagram('requirementDiagram\n  direction LR').ast.direction, 'LR');
  assert.equal(parseRequirementDiagram('requirementDiagram\n  direction TB').ast.direction, 'TD');
  assert.equal(parseRequirementDiagram('requirementDiagram').ast.direction, undefined);
});

test('style sets fill, stroke and text colour (official example #6)', () => {
  const { ast, warnings } = parseRequirementDiagram(
    'requirementDiagram\n  requirement test_req {\n    id: 1\n  }\n  element test_entity {\n  }\n  style test_req fill:#ffa,stroke:#000, color: green\n  style test_entity fill:#f9f,stroke:#333, color: blue',
  );
  assert.deepEqual(warnings, []);
  assert.deepEqual([ast.requirements[0]!.fill, ast.requirements[0]!.stroke, ast.requirements[0]!.textColor], ['FFFFAA', '000000', '008000']);
  assert.deepEqual([ast.elements[0]!.fill, ast.elements[0]!.stroke, ast.elements[0]!.textColor], ['FF99FF', '333333', '0000FF']);
});

test('classes from :::, class and classDef default, layered default -> classes -> style (official example #8)', () => {
  const { ast, warnings } = parseRequirementDiagram(
    [
      'requirementDiagram',
      '  requirement test_req:::important {',
      '    id: 1',
      '  }',
      '  element test_entity {',
      '  }',
      '  element other {',
      '  }',
      '  classDef important font-weight:bold',
      '  classDef default fill:#eee',
      '  class test_entity important',
      '  style test_entity fill:#f9f,stroke:#333',
      '  other:::important',
    ].join('\n'),
  );
  assert.deepEqual(warnings, []);
  const req = ast.requirements[0]!;
  const [entity, other] = ast.elements;
  assert.equal(req.name, 'test_req');
  assert.deepEqual([req.bold, req.fill], [true, 'EEEEEE']);
  assert.deepEqual([entity!.bold, entity!.fill, entity!.stroke], [true, 'FF99FF', '333333']);
  assert.deepEqual([other!.bold, other!.fill], [true, 'EEEEEE']);
});

test('style or class naming a box not defined yet does nothing, as in Mermaid', () => {
  const { ast } = parseRequirementDiagram('requirementDiagram\n  style r fill:#f00\n  class r c\n  classDef c fill:#0f0\n  requirement r {\n  }');
  assert.equal(ast.requirements[0]!.fill, undefined);
});

test('a class used but never defined is warned', () => {
  const { warnings } = parseRequirementDiagram('requirementDiagram\n  element e:::ghost {\n  }');
  assert.ok(warnings.some((w) => w.includes('"ghost"')));
});

test('only validated colours enter the AST: a hostile style value is dropped', () => {
  const { ast } = parseRequirementDiagram('requirementDiagram\n  element e {\n  }\n  style e fill:"/><evil/>,stroke:url(x),color:#12345');
  assert.deepEqual([ast.elements[0]!.fill, ast.elements[0]!.stroke, ast.elements[0]!.textColor], [undefined, undefined, undefined]);
});
