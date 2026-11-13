import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseC4Diagram } from '../../src/diagrams/c4/parser.js';
import { translateC4DiagramToOoxml } from '../../src/diagrams/c4/translator.js';

function translate(text: string): string {
  const { ast } = parseC4Diagram(text);
  return translateC4DiagramToOoxml(ast);
}

const BASIC = `C4Context
  Person(customerA, "Banking Customer A", "A customer of the bank.")
  System(SystemAA, "Internet Banking System")
  BiRel(customerA, SystemAA, "Uses")`;

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

test('a Person and a System render with distinct category fill colors', () => {
  const xml = translate(BASIC);
  assert.ok(xml.includes('<a:srgbClr val="FFE699"/>'));
  assert.ok(xml.includes('<a:srgbClr val="D9E2F3"/>'));
});

test('the stereotype line reflects category/external/variant/technology', () => {
  const xml = translate('C4Container\n  ContainerDb_Ext(db, "DB", "SQL Server")');
  assert.ok(xml.includes('[Container, External, Database: SQL Server]'));
});

test('a BiRel renders arrowheads on both ends', () => {
  const xml = translate(BASIC);
  assert.equal((xml.match(/<a:headEnd /g) ?? []).length, 1);
  assert.equal((xml.match(/<a:tailEnd /g) ?? []).length, 1);
});

test('a plain Rel renders exactly one arrowhead', () => {
  const xml = translate('C4Context\n  Person(a, "A")\n  System(b, "B")\n  Rel(a, b, "Uses")');
  assert.equal((xml.match(/<a:headEnd /g) ?? []).length, 0);
  assert.equal((xml.match(/<a:tailEnd /g) ?? []).length, 1);
});

test('the diagram title renders as a bold banner and names the drawing frame', () => {
  const xml = translate('C4Context\n  title My Title\n  Person(a, "A")');
  assert.ok(xml.includes('<w:t xml:space="preserve">My Title</w:t>'));
  assert.ok(xml.includes('<wp:docPr id="'));
  assert.ok(xml.includes('name="My Title"'));
});

test('element labels and descriptions are XML-escaped', () => {
  const xml = translate('C4Context\n  Person(a, "Bank & Trust <tag>")');
  assert.ok(xml.includes('&amp;'));
  assert.ok(xml.includes('&lt;tag&gt;'));
  assert.ok(!xml.includes('<tag>'));
});

test('an empty C4 diagram renders a visible note, not a silent blank canvas', () => {
  const xml = translate('C4Context');
  assert.ok(xml.includes('has no content to render'));
  assert.ok(!xml.includes('wpc:wpc'));
});

test('is a pure function: identical input produces byte-identical output', () => {
  assert.equal(translate(BASIC), translate(BASIC));
});
