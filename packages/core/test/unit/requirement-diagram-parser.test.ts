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
  assert.equal(req.risk, 'high');
  assert.equal(req.verifyMethod, 'test');
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
    const { ast, warnings } = parseRequirementDiagram(`requirementDiagram\n  A - ${type} -> B`);
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

test('classDef/class/style lines are recognized and warned, not silently dropped', () => {
  const { warnings } = parseRequirementDiagram('requirementDiagram\n  classDef foo fill:#f00\n  A - traces -> B');
  assert.ok(warnings.some((w) => w.includes('Styling')));
});

test('an unclosed block is warned, not silently dropped', () => {
  const { warnings } = parseRequirementDiagram('requirementDiagram\n  requirement A {\n    id: 1');
  assert.ok(warnings.some((w) => w.includes('not closed')));
});

test('an unrecognized field inside a block is warned, not silently dropped', () => {
  const { warnings } = parseRequirementDiagram('requirementDiagram\n  requirement A {\n    bogus: x\n  }');
  assert.ok(warnings.some((w) => w.includes('Unsupported requirement field')));
});
