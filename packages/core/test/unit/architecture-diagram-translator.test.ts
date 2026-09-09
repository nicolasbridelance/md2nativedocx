import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArchitectureDiagram } from '../../src/diagrams/architecture-diagram/parser.js';
import { translateArchitectureDiagramToOoxml } from '../../src/diagrams/architecture-diagram/translator.js';

function translate(text: string): string {
  const { ast } = parseArchitectureDiagram(text);
  return translateArchitectureDiagramToOoxml(ast);
}

const BASIC = `architecture-beta
  group public_api(cloud)[Public API]
  service database1(database)[My Database] in public_api
  service server(server)[Server] in public_api
  database1:R --> L:server`;

test('wraps the drawing canvas in the schema-required paragraph hierarchy, same envelope as the other Family B translators', () => {
  const xml = translate(BASIC);
  assert.ok(xml.startsWith('<w:p '));
  const order = ['<w:p ', '<w:r>', '<w:drawing>', '<wp:inline ', '<wpc:wpc ', '<wps:wsp>', '</wpc:wpc>', '</w:p>'];
  let idx = -1;
  for (const token of order) {
    const found = xml.indexOf(token, idx + 1);
    assert.ok(found > idx, `expected "${token}" after position ${idx}`);
    idx = found;
  }
});

test('a recognized icon maps to its stand-in preset geometry (database -> can, cloud -> cloud)', () => {
  const xml = translate(BASIC);
  assert.ok(xml.includes('<a:prstGeom prst="can">'));
  assert.ok(xml.includes('<a:prstGeom prst="cloud">'));
});

test('an unrecognized or missing icon falls back to a plain rounded rectangle', () => {
  const xml = translate('architecture-beta\n  service server(server)[Server]');
  assert.ok(xml.includes('<a:prstGeom prst="roundRect">'));
});

test('an edge with an arrow on only one side renders exactly one marker', () => {
  const xml = translate(BASIC);
  assert.equal((xml.match(/<a:headEnd /g) ?? []).length, 0);
  assert.equal((xml.match(/<a:tailEnd /g) ?? []).length, 1);
});

test('an edge with no arrows renders no markers at all', () => {
  const xml = translate('architecture-beta\n  db:R -- L:server');
  assert.equal((xml.match(/<a:headEnd /g) ?? []).length, 0);
  assert.equal((xml.match(/<a:tailEnd /g) ?? []).length, 0);
});

test('a junction renders as a small filled circle, distinct from a service box', () => {
  const xml = translate('architecture-beta\n  junction j1\n  service a(server)[A]\n  a:R --> L:j1');
  assert.ok(xml.includes('<a:prstGeom prst="ellipse">'));
});

test('node titles are XML-escaped', () => {
  const xml = translate('architecture-beta\n  service a(server)["quoted" & <tag>]');
  assert.ok(xml.includes('&amp;'));
  assert.ok(xml.includes('&lt;tag&gt;'));
  assert.ok(!xml.includes('<tag>'));
});

test('an empty architecture diagram renders a visible note, not a silent blank canvas', () => {
  const xml = translate('architecture-beta');
  assert.ok(xml.includes('has no content to render'));
  assert.ok(!xml.includes('wpc:wpc'));
});

test('is a pure function: identical input produces byte-identical output', () => {
  assert.equal(translate(BASIC), translate(BASIC));
});
