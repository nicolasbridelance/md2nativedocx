import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseErDiagram } from '../../src/diagrams/er-diagram/parser.js';
import { translateErDiagramToOoxml } from '../../src/diagrams/er-diagram/translator.js';

function translate(text: string): string {
  const { ast } = parseErDiagram(text);
  return translateErDiagramToOoxml(ast);
}

const BASIC = `erDiagram
  CUSTOMER {
    int id PK
    string email UK
  }
  ORDER {
    int id PK
  }
  CUSTOMER ||--o{ ORDER : places`;

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

test('renders one connector per relationship, with a marker at both ends (unlike classDiagram)', () => {
  const xml = translate(BASIC);
  assert.equal((xml.match(/<wps:cNvCnPr\/>/g) ?? []).length, 1);
  assert.equal((xml.match(/<a:headEnd /g) ?? []).length, 0, 'exactly-one maps to no marker');
  assert.equal((xml.match(/<a:tailEnd /g) ?? []).length, 1, 'zero-or-many maps to a marker');
  assert.ok(xml.includes('type="diamond"'));
});

test('a relationship label renders as its own text box', () => {
  assert.ok(translate(BASIC).includes('>places<'));
});

test('every cardinality pair produces a distinguishable marker/dash combination', () => {
  const cases = ['A |o--o| B', 'A ||--|| B', 'A }o--o{ B', 'A }|--|{ B', 'A }|..|{ B'];
  const renders = cases.map((line) => translate(`erDiagram\n  ${line}`));
  const unique = new Set(renders);
  assert.equal(unique.size, renders.length);
});

test('a non-identifying relationship renders a dashed line', () => {
  const xml = translate('erDiagram\n  A }|..|{ B');
  assert.ok(xml.includes('<a:prstDash val="dash"/>'));
});

test('an entity with attributes has 2 text regions (title + attributes); one with none has just the title', () => {
  const xml = translate(BASIC);
  // CUSTOMER: title + attrs. ORDER: title + attrs. Plus 1 relationship label.
  const textBoxCount = (xml.match(/txBox="1"/g) ?? []).length;
  assert.equal(textBoxCount, 2 + 2 + 1);

  const noAttrs = translate('erDiagram\n  LONELY {\n  }\n  A ||--|| B');
  const noAttrsCount = (noAttrs.match(/txBox="1"/g) ?? []).length;
  // LONELY (title only) + A (title only) + B (title only) = 3.
  assert.equal(noAttrsCount, 3);
});

test('entity id and attribute text is XML-escaped', () => {
  // "A&B" as the type, "<tag>" as the name — a valid 2-token attribute line
  // (Mermaid attribute types/names are whitespace-delimited, so neither
  // token itself contains a space) that still exercises escaping.
  const xml = translate('erDiagram\n  A {\n    A&B <tag>\n  }');
  assert.ok(xml.includes('&amp;'));
  assert.ok(xml.includes('&lt;tag&gt;'));
  assert.ok(!xml.includes('<tag>'));
});

test('every <w:jc> uses a valid ST_Jc value', () => {
  const xml = translate(BASIC);
  const jcValues = [...xml.matchAll(/<w:jc w:val="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(jcValues.length > 0);
  for (const val of jcValues) {
    assert.ok(['left', 'center', 'right'].includes(val!), `invalid ST_Jc value: ${val}`);
  }
});

test('an empty ER diagram renders a visible note, not a silent blank canvas', () => {
  const xml = translate('erDiagram');
  assert.ok(xml.includes('has no content to render'));
  assert.ok(!xml.includes('wpc:wpc'));
});

test('is a pure function: identical input produces byte-identical output', () => {
  assert.equal(translate(BASIC), translate(BASIC));
});
