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

test('a Boundary block becomes a frame, and sets parent on its contents, with no warning', () => {
  const { ast, warnings } = parseC4Diagram(
    'C4Container\n  Container_Boundary(c1, "Internet Banking") {\n    Container(spa, "SPA")\n    Container(web, "Web")\n  }',
  );
  assert.deepEqual(ast.boundaries, [{ id: 'c1', label: 'Internet Banking', kind: 'boundary', type: 'CONTAINER' }]);
  assert.equal(ast.elements.find((e) => e.id === 'spa')?.parent, 'c1');
  assert.equal(ast.elements.find((e) => e.id === 'web')?.parent, 'c1');
  assert.deepEqual(warnings, []);
});

test('each boundary call has the [type] Mermaid shows; Boundary takes its own, default system', () => {
  const { ast } = parseC4Diagram(
    'C4Context\n  Enterprise_Boundary(e, "E") {\n  System_Boundary(s, "S") {\n  Boundary(b, "B", "boundary") {\n  Boundary(d, "D") {\n  }\n  }\n  }\n  }',
  );
  assert.deepEqual(
    ast.boundaries?.map((b) => [b.id, b.type, b.parent]),
    [
      ['e', 'ENTERPRISE', undefined],
      ['s', 'SYSTEM', 'e'],
      ['b', 'boundary', 's'],
      ['d', 'system', 'b'],
    ],
  );
});

test('a Deployment_Node is a frame (not a box) holding its children, nested ones too', () => {
  const { ast } = parseC4Diagram(
    'C4Deployment\n  Deployment_Node(comp, "Computer", "Windows", "A desk") {\n    Node(browser, "Browser") {\n      Container(spa, "SPA")\n    }\n  }',
  );
  assert.deepEqual(ast.boundaries, [
    { id: 'comp', label: 'Computer', kind: 'deployment', type: 'Windows', description: 'A desk' },
    { id: 'browser', label: 'Browser', kind: 'deployment', type: 'node', parent: 'comp' },
  ]);
  assert.equal(ast.elements.find((e) => e.id === 'spa')?.parent, 'browser');
  assert.ok(!ast.elements.some((e) => e.id === 'comp'));
});

test('an element opening a block does not become a parent; the braces still balance', () => {
  const { ast, warnings } = parseC4Diagram(
    'C4Context\n  Boundary(b, "B") {\n  System(s, "S") {\n    System(t, "T")\n  }\n  System(u, "U")\n  }\n  System(v, "V")',
  );
  assert.equal(ast.elements.find((e) => e.id === 't')?.parent, 'b');
  assert.equal(ast.elements.find((e) => e.id === 'u')?.parent, 'b');
  assert.equal(ast.elements.find((e) => e.id === 'v')?.parent, undefined);
  assert.equal(warnings.filter((w) => w.includes('cannot hold other elements')).length, 1);
});

test('UpdateElementStyle sets colours on an element or a frame, CSS names included', () => {
  const { ast, warnings } = parseC4Diagram(
    'C4Context\n  Boundary(b, "B") {\n  Person(a, "A")\n  }\n  UpdateElementStyle(a, $fontColor="red", $bgColor="grey", $borderColor="#00f")\n  UpdateElementStyle(b, $bgColor="#fafafa")',
  );
  assert.deepEqual(ast.elements[0]!.style, { fill: '808080', text: 'FF0000', line: '0000FF' });
  assert.deepEqual(ast.boundaries![0]!.style, { fill: 'FAFAFA' });
  assert.deepEqual(warnings, []);
});

test('UpdateRelStyle sets colours and label offsets, and names a Rel_Back as written', () => {
  const { ast, warnings } = parseC4Diagram(
    'C4Context\n  System(a, "A")\n  System(b, "B")\n  Rel_Back(a, b, "Reads")\n  UpdateRelStyle(a, b, $textColor="blue", $lineColor="red", $offsetX="-50", $offsetY="20")',
  );
  const rel = ast.relationships[0]!;
  assert.equal(rel.from, 'b');
  assert.equal(rel.to, 'a');
  assert.deepEqual(rel.style, { text: '0000FF', line: 'FF0000', offsetX: -50, offsetY: 20 });
  assert.deepEqual(warnings, []);
});

test('UpdateLayoutConfig sets shapes and frames per row; values below 1 are ignored, as in Mermaid', () => {
  assert.deepEqual(parseC4Diagram('C4Context\n  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")').ast.layout, {
    shapesPerRow: 3,
    boundariesPerRow: 1,
  });
  assert.equal(parseC4Diagram('C4Context\n  UpdateLayoutConfig($c4ShapeInRow="0")').ast.layout, undefined);
});

test('a style naming nothing declared above it, a colour that is not one, and style keys not applied are warned', () => {
  const { warnings } = parseC4Diagram(
    'C4Context\n  UpdateElementStyle(ghost, $bgColor="red")\n  System(a, "A")\n  UpdateElementStyle(a, $bgColor="url(x)", $shadowing="true")\n  UpdateRelStyle(a, ghost, $textColor="red")',
  );
  assert.equal(warnings.length, 4);
  assert.ok(warnings[0]!.includes('"ghost", which is not declared'));
  assert.ok(warnings[1]!.includes('$bgColor "url(x)" is not a colour'));
  assert.ok(warnings[2]!.includes('$shadowing not applied'));
  assert.ok(warnings[3]!.includes('a -> ghost that is not declared'));
});

test('a colour value cannot carry markup into the AST: only validated hex comes out', () => {
  const { ast } = parseC4Diagram('C4Context\n  System(a, "A")\n  UpdateElementStyle(a, $bgColor="red\\"/><evil x=\\"")');
  assert.equal(ast.elements[0]!.style, undefined);
});

test('AddElementTag/AddRelTag are warned once as C4-PlantUML only', () => {
  const { warnings } = parseC4Diagram('C4Context\n  AddElementTag("v1.0", $bgColor="red")\n  AddRelTag("x")');
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0]!.includes('not part of Mermaid'));
});

test('the header keyword is kept as the level, and <br/> is a line break', () => {
  const { ast } = parseC4Diagram('C4Dynamic\n  System(a, "A", "one<br/> two")');
  assert.equal(ast.level, 'dynamic');
  assert.equal(ast.elements[0]!.description, 'one\ntwo');
});

test('a relationship to a frame connects to the frame, it does not invent an element', () => {
  const { ast } = parseC4Diagram('C4Context\n  Boundary(b, "B") {\n  }\n  System(a, "A")\n  Rel(a, b, "Uses")');
  assert.deepEqual(
    ast.elements.map((e) => e.id),
    ['a'],
  );
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

test('a second relationship between the same two ends replaces the first, as in Mermaid, keeping its style', () => {
  const { ast } = parseC4Diagram(
    'C4Dynamic\n  System(a, "A")\n  System(b, "B")\n  Rel(a, b, "First")\n  UpdateRelStyle(a, b, $lineColor="red")\n  Rel(b, a, "Back")\n  Rel(a, b, "Second", "HTTPS")',
  );
  assert.deepEqual(
    ast.relationships.map((r) => [r.from, r.to, r.label, r.techn, r.style?.line]),
    [
      ['a', 'b', 'Second', 'HTTPS', 'FF0000'],
      ['b', 'a', 'Back', undefined, undefined],
    ],
  );
});

test('a relationship without a label is not drawn, with a warning (Mermaid drops it silently)', () => {
  const { ast, warnings } = parseC4Diagram('C4Context\n  System(a, "A")\n  System(b, "B")\n  Rel(a, b)');
  assert.equal(ast.relationships.length, 0);
  assert.ok(warnings[0]!.includes('needs a label'));
});
