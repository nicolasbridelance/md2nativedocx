import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArchitectureDiagram } from '../../src/diagrams/architecture-diagram/parser.js';

const BASIC = `architecture-beta
  group public_api(cloud)[Public API]
  service database1(database)[My Database] in public_api
  service server(server)[Server] in public_api
  database1:R --> L:server`;

test('parses a group with icon and title', () => {
  const { ast, warnings } = parseArchitectureDiagram(BASIC);
  const group = ast.nodes.find((n) => n.id === 'public_api')!;
  assert.equal(group.kind, 'group');
  assert.equal(group.icon, 'cloud');
  assert.equal(group.title, 'Public API');
  assert.ok(warnings.some((w) => w.includes('Group/parent containment')));
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
  const edge = ast.edges[0]!;
  assert.equal(edge.from, 'database1');
  assert.equal(edge.fromSide, 'R');
  assert.equal(edge.to, 'server');
  assert.equal(edge.toSide, 'L');
  assert.equal(edge.arrowAtFrom, false);
  assert.equal(edge.arrowAtTo, true);
});

test('a service declared with no icon (bracket title only) still parses', () => {
  const { ast, warnings } = parseArchitectureDiagram(
    'architecture-beta\n  service server[Server] in groupOne\n  service subnet[Subnet] in groupTwo\n  server{group}:B --> T:subnet{group}',
  );
  assert.equal(ast.nodes.find((n) => n.id === 'server')?.title, 'Server');
  assert.equal(warnings.filter((w) => w.includes('Unsupported')).length, 0);
});

test('the literal {group} suffix on an edge endpoint is stripped', () => {
  const { ast } = parseArchitectureDiagram(
    'architecture-beta\n  service server[Server] in groupOne\n  service subnet[Subnet] in groupTwo\n  server{group}:B --> T:subnet{group}',
  );
  assert.equal(ast.edges[0]?.from, 'server');
  assert.equal(ast.edges[0]?.to, 'subnet');
});

test('an edge with no arrow on either side is recognized', () => {
  const { ast } = parseArchitectureDiagram('architecture-beta\n  db:R -- L:server');
  assert.equal(ast.edges[0]?.arrowAtFrom, false);
  assert.equal(ast.edges[0]?.arrowAtTo, false);
});

test('an edge with arrows on both sides is recognized', () => {
  const { ast } = parseArchitectureDiagram('architecture-beta\n  db:R <--> L:server');
  assert.equal(ast.edges[0]?.arrowAtFrom, true);
  assert.equal(ast.edges[0]?.arrowAtTo, true);
});

test('a junction declaration is recognized', () => {
  const { ast } = parseArchitectureDiagram('architecture-beta\n  junction j1');
  assert.equal(ast.nodes.find((n) => n.id === 'j1')?.kind, 'junction');
});

test('no "grouping flattened" warning when nothing uses "in <parent>"', () => {
  const { warnings } = parseArchitectureDiagram('architecture-beta\n  service a(server)[A]\n  service b(server)[B]\n  a:R --> L:b');
  assert.ok(!warnings.some((w) => w.includes('Group/parent containment')));
});

test('an unsupported line is warned, not silently dropped', () => {
  const { warnings } = parseArchitectureDiagram('architecture-beta\n  this is not valid syntax at all');
  assert.ok(warnings.some((w) => w.includes('Unsupported line')));
});
