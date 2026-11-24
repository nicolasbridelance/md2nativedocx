import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArchitectureDiagram } from '../../src/diagrams/architecture-diagram/parser.js';

const BASIC = `architecture-beta
  group public_api(cloud)[Public API]
  service database1(database)[My Database] in public_api
  service server(server)[Server] in public_api
  database1:R --> L:server`;

test('parses a group with icon and title, with no warning', () => {
  const { ast, warnings } = parseArchitectureDiagram(BASIC);
  const group = ast.nodes.find((n) => n.id === 'public_api')!;
  assert.equal(group.kind, 'group');
  assert.equal(group.icon, 'cloud');
  assert.equal(group.title, 'Public API');
  assert.deepEqual(warnings, []);
});

test('parses a service with icon, title, and parent group', () => {
  const { ast } = parseArchitectureDiagram(BASIC);
  const db = ast.nodes.find((n) => n.id === 'database1')!;
  assert.equal(db.kind, 'service');
  assert.equal(db.icon, 'database');
  assert.equal(db.title, 'My Database');
  assert.equal(db.parent, 'public_api');
});

test('parses an edge with ports and an arrow only on one side', () => {
  const { ast } = parseArchitectureDiagram(BASIC);
  assert.equal(ast.edges.length, 1);
  assert.deepEqual(ast.edges[0], { from: 'database1', fromSide: 'R', to: 'server', toSide: 'L', arrowAtFrom: false, arrowAtTo: true });
});

test('arrows: none, both sides, and spaces around every token', () => {
  const src = 'architecture-beta\n service a[A]\n service b[B]\n a:R -- L:b\n a : T <--> B : b';
  const { ast, warnings } = parseArchitectureDiagram(src);
  assert.deepEqual(warnings, []);
  assert.equal(ast.edges[0]?.arrowAtFrom, false);
  assert.equal(ast.edges[0]?.arrowAtTo, false);
  assert.equal(ast.edges[1]?.arrowAtFrom, true);
  assert.equal(ast.edges[1]?.arrowAtTo, true);
  assert.equal(ast.edges[1]?.fromSide, 'T');
});

test('an edge label -[label]- is read', () => {
  const { ast } = parseArchitectureDiagram('architecture-beta\n service a[A]\n service b[B]\n a:R -[HTTPS]-> L:b');
  assert.equal(ast.edges[0]?.label, 'HTTPS');
  assert.equal(ast.edges[0]?.arrowAtTo, true);
});

test('the {group} marker is kept as fromGroup / toGroup, not in the id', () => {
  const src = `architecture-beta
  group g1[One]
  group g2[Two]
  service server[Server] in g1
  service subnet[Subnet] in g2
  server{group}:B --> T:subnet{group}`;
  const { ast, warnings } = parseArchitectureDiagram(src);
  assert.deepEqual(warnings, []);
  const edge = ast.edges[0]!;
  assert.equal(edge.from, 'server');
  assert.equal(edge.to, 'subnet');
  assert.equal(edge.fromGroup, true);
  assert.equal(edge.toGroup, true);
});

test('{group} on a node outside any group is warned', () => {
  const { warnings } = parseArchitectureDiagram('architecture-beta\n service a[A]\n service b[B]\n a{group}:R -- L:b');
  assert.ok(warnings.some((w) => w.includes('outside any group')));
});

test('a service with quoted icon text, and a quoted title containing brackets', () => {
  const { ast } = parseArchitectureDiagram('architecture-beta\n service gw"API"["Gateway [v2]"]');
  const gw = ast.nodes[0]!;
  assert.equal(gw.iconText, 'API');
  assert.equal(gw.icon, undefined);
  assert.equal(gw.title, 'Gateway [v2]');
});

test('a pack icon name (logos:aws-s3) is read whole', () => {
  const { ast } = parseArchitectureDiagram('architecture-beta\n service s3(logos:aws-s3)[Bucket]');
  assert.equal(ast.nodes[0]?.icon, 'logos:aws-s3');
});

test('a title containing " in " is not mistaken for a parent', () => {
  const { ast, warnings } = parseArchitectureDiagram('architecture-beta\n group g[G]\n service a(server)[Log in page] in g');
  const a = ast.nodes.find((n) => n.id === 'a')!;
  assert.equal(a.title, 'Log in page');
  assert.equal(a.parent, 'g');
  assert.deepEqual(warnings, []);
});

test('a junction declaration is recognized, in a group', () => {
  const { ast } = parseArchitectureDiagram('architecture-beta\n group g[G]\n junction j1 in g');
  const j = ast.nodes.find((n) => n.id === 'j1')!;
  assert.equal(j.kind, 'junction');
  assert.equal(j.parent, 'g');
});

test('a parent that is not a declared group is dropped with a warning', () => {
  const { ast, warnings } = parseArchitectureDiagram('architecture-beta\n service a[A]\n service b[B] in a\n service c[C] in nowhere');
  assert.equal(ast.nodes.find((n) => n.id === 'b')?.parent, undefined);
  assert.equal(ast.nodes.find((n) => n.id === 'c')?.parent, undefined);
  assert.equal(warnings.filter((w) => w.includes('not a group')).length, 2);
});

test('a duplicate declaration keeps the first and warns', () => {
  const { ast, warnings } = parseArchitectureDiagram('architecture-beta\n service a[First]\n service a[Second]');
  assert.equal(ast.nodes.length, 1);
  assert.equal(ast.nodes[0]?.title, 'First');
  assert.ok(warnings.some((w) => w.includes('declared twice')));
});

test('an edge to a group is dropped with a warning', () => {
  const { ast, warnings } = parseArchitectureDiagram('architecture-beta\n group g[G]\n service a[A]\n a:R -- L:g');
  assert.equal(ast.edges.length, 0);
  assert.ok(warnings.some((w) => w.includes('is a group')));
});

test('an edge to an undeclared id draws it as a plain service, with a warning', () => {
  const { ast, warnings } = parseArchitectureDiagram('architecture-beta\n service a[A]\n a:R -- L:ghost');
  assert.equal(ast.nodes.find((n) => n.id === 'ghost')?.kind, 'service');
  assert.ok(warnings.some((w) => w.includes('never declared')));
});

test('align row / column are read; groups, unknown ids and repeats are left out', () => {
  const src = 'architecture-beta\n group g[G]\n service a[A]\n service b[B]\n service c[C]\n align row a b c\n align column a g a b';
  const { ast, warnings } = parseArchitectureDiagram(src);
  assert.deepEqual(ast.alignments, [
    { direction: 'row', members: ['a', 'b', 'c'] },
    { direction: 'column', members: ['a', 'b'] },
  ]);
  assert.equal(warnings.filter((w) => w.startsWith('align column')).length, 2);
});

test('an align with fewer than two ids is warned', () => {
  const { ast, warnings } = parseArchitectureDiagram('architecture-beta\n service a[A]\n align row a');
  assert.equal(ast.alignments, undefined);
  assert.ok(warnings.some((w) => w.includes('align takes')));
});

test('title, accTitle and a multi-line accDescr block are read', () => {
  const src = 'architecture-beta\n title My system %% note\n accTitle: Acc\n accDescr {\n  line one\n  line two\n }\n service a[A]';
  const { ast, warnings } = parseArchitectureDiagram(src);
  assert.equal(ast.title, 'My system');
  assert.equal(ast.accTitle, 'Acc');
  assert.equal(ast.accDescr, 'line one\nline two');
  assert.deepEqual(warnings, []);
});

test('a trailing %% comment on a statement is ignored', () => {
  const { ast, warnings } = parseArchitectureDiagram('architecture-beta\n service a(server)[A] %% the API');
  assert.equal(ast.nodes[0]?.title, 'A');
  assert.deepEqual(warnings, []);
});

test('an unsupported line is warned, not silently dropped', () => {
  const { warnings } = parseArchitectureDiagram('architecture-beta\n  this is not valid syntax at all');
  assert.ok(warnings.some((w) => w.includes('Unsupported line')));
});

test('a malformed declaration is warned', () => {
  const { ast, warnings } = parseArchitectureDiagram('architecture-beta\n service a[A] trailing junk');
  assert.equal(ast.nodes.length, 0);
  assert.ok(warnings.some((w) => w.includes('not a valid service declaration')));
});
