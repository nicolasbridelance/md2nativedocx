import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseC4Diagram } from '../../src/diagrams/c4/parser.js';

const BASIC = `C4Context
  title System Context diagram for Internet Banking System
  Person(customerA, "Banking Customer A", "A customer of the bank, with personal bank accounts.")
  System(SystemAA, "Internet Banking System", "Allows customers to view information about their bank accounts.")
  System_Ext(SystemC, "E-mail system", "The internal Microsoft Exchange e-mail system.")
  BiRel(customerA, SystemAA, "Uses")
  Rel(SystemAA, SystemC, "Sends e-mails", "SMTP")`;

test('parses the diagram title', () => {
  const { ast } = parseC4Diagram(BASIC);
  assert.equal(ast.title, 'System Context diagram for Internet Banking System');
});

test('parses a Person element with description', () => {
  const { ast } = parseC4Diagram(BASIC);
  const p = ast.elements.find((e) => e.id === 'customerA')!;
  assert.equal(p.category, 'person');
  assert.equal(p.external, false);
  assert.equal(p.label, 'Banking Customer A');
  assert.equal(p.description, 'A customer of the bank, with personal bank accounts.');
});

test('System_Ext is external', () => {
  const { ast } = parseC4Diagram(BASIC);
  const sys = ast.elements.find((e) => e.id === 'SystemC')!;
  assert.equal(sys.category, 'system');
  assert.equal(sys.external, true);
});

test('SystemDb/SystemQueue get the right category+variant', () => {
  const { ast } = parseC4Diagram('C4Context\n  SystemDb(d, "DB")\n  SystemQueue(q, "Q")\n  SystemDb_Ext(de, "DBExt")');
  assert.deepEqual(
    ast.elements.map((e) => [e.id, e.category, e.variant, e.external]),
    [
      ['d', 'system', 'db', false],
      ['q', 'system', 'queue', false],
      ['de', 'system', 'db', true],
    ],
  );
});

test('Container/Component techn (technology) is captured', () => {
  const { ast } = parseC4Diagram('C4Container\n  Container(spa, "SPA", "JavaScript, Angular", "Front end")');
  const spa = ast.elements.find((e) => e.id === 'spa')!;
  assert.equal(spa.techn, 'JavaScript, Angular');
  assert.equal(spa.description, 'Front end');
});

test('a bare (unquoted) label is accepted', () => {
  const { ast } = parseC4Diagram('C4Container\n  Person(customer, Customer, "desc")');
  assert.equal(ast.elements[0]?.label, 'Customer');
});

test('Rel produces a normal from->to relationship', () => {
  const { ast } = parseC4Diagram(BASIC);
  const rel = ast.relationships.find((r) => r.from === 'SystemAA' && r.to === 'SystemC')!;
  assert.equal(rel.label, 'Sends e-mails');
  assert.equal(rel.techn, 'SMTP');
  assert.equal(rel.bidirectional, false);
});

test('BiRel is marked bidirectional', () => {
  const { ast } = parseC4Diagram(BASIC);
  const rel = ast.relationships.find((r) => r.from === 'customerA')!;
  assert.equal(rel.bidirectional, true);
});

test('Rel_Back swaps from/to', () => {
  const { ast } = parseC4Diagram(
    'C4Container\n  ContainerDb(database, "DB")\n  Container(backend_api, "API")\n  Rel_Back(database, backend_api, "Reads from and writes to")',
  );
  const rel = ast.relationships[0]!;
  assert.equal(rel.from, 'backend_api');
  assert.equal(rel.to, 'database');
});

test('RelIndex drops its leading index argument', () => {
  const { ast } = parseC4Diagram(
    'C4Dynamic\n  Container(c1, "A")\n  Container(c2, "B")\n  RelIndex(1, c1, c2, "Calls")',
  );
  const rel = ast.relationships[0]!;
  assert.equal(rel.from, 'c1');
  assert.equal(rel.to, 'c2');
  assert.equal(rel.label, 'Calls');
});

test('a Boundary block sets parent on its contents and warns once', () => {
  const { ast, warnings } = parseC4Diagram(
    'C4Container\n  Container_Boundary(c1, "Internet Banking") {\n    Container(spa, "SPA")\n    Container(web, "Web")\n  }',
  );
  assert.equal(ast.elements.find((e) => e.id === 'spa')?.parent, 'c1');
  assert.equal(ast.elements.find((e) => e.id === 'web')?.parent, 'c1');
  assert.equal(warnings.filter((w) => w.includes('nesting is not yet rendered')).length, 1);
});

test('no nesting warning when no Boundary/Deployment_Node is used', () => {
  const { warnings } = parseC4Diagram(BASIC);
  assert.ok(!warnings.some((w) => w.includes('nesting is not yet rendered')));
});

test('a nested Deployment_Node sets parent on its own children', () => {
  const { ast } = parseC4Diagram(
    'C4Deployment\n  Deployment_Node(comp, "Computer", "Windows") {\n    Container(spa, "SPA")\n  }',
  );
  assert.equal(ast.elements.find((e) => e.id === 'spa')?.parent, 'comp');
  assert.equal(ast.elements.find((e) => e.id === 'comp')?.category, 'node');
});

test('UpdateElementStyle/UpdateRelStyle/UpdateLayoutConfig are recognized and warned once, not treated as unsupported lines', () => {
  const { warnings } = parseC4Diagram(
    `C4Context\n  Person(a, "A")\n  Person(b, "B")\n  Rel(a, b, "Uses")\n  UpdateElementStyle(a, $fontColor="red")\n  UpdateRelStyle(a, b, $textColor="blue")\n  UpdateLayoutConfig($c4ShapeInRow="3")`,
  );
  assert.equal(warnings.filter((w) => w.includes('styling/layout-density')).length, 1);
  assert.equal(warnings.filter((w) => w.includes('Unsupported line')).length, 0);
});

test('a relationship referencing an undeclared element auto-vivifies it instead of dropping the edge', () => {
  const { ast, warnings } = parseC4Diagram('C4Context\n  Person(a, "A")\n  Rel(a, ghost, "Uses")');
  assert.ok(ast.elements.some((e) => e.id === 'ghost'));
  assert.equal(ast.relationships.length, 1);
  assert.ok(!warnings.some((w) => w.includes('could not read relationship endpoints')));
});

test('an unsupported line is warned, not silently dropped', () => {
  const { warnings } = parseC4Diagram('C4Context\n  this is not valid syntax at all');
  assert.ok(warnings.some((w) => w.includes('Unsupported line')));
});

test('a named arg out of positional order still resolves correctly', () => {
  const { ast } = parseC4Diagram('C4Container\n  System_Ext(e, "E-Mail System", "desc", $tags="v1.0")');
  const e = ast.elements[0]!;
  assert.equal(e.description, 'desc');
});
