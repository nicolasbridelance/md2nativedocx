import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClassDiagram } from '../../src/diagrams/class-diagram/parser.js';
import { translateClassDiagramToOoxml } from '../../src/diagrams/class-diagram/translator.js';

function translate(text: string): string {
  const { ast } = parseClassDiagram(text);
  return translateClassDiagramToOoxml(ast);
}

const BASIC = `classDiagram
  class Animal {
    +String name
    +makeSound() void
  }
  class Dog {
    +bark() void
  }
  Animal <|-- Dog : is a`;

test('wraps the drawing canvas in the schema-required paragraph hierarchy, same envelope as flowchart/quadrant/venn', () => {
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

test('renders one connector per relationship, with a marker only at the decorated end', () => {
  const xml = translate(BASIC);
  assert.equal((xml.match(/<wps:cNvCnPr\/>/g) ?? []).length, 1);
  assert.equal((xml.match(/<a:headEnd /g) ?? []).length, 1, 'inheritance marker is at the "from" end (headEnd)');
  assert.equal((xml.match(/<a:tailEnd /g) ?? []).length, 0);
  assert.ok(xml.includes('type="triangle"'));
});

test('a relationship label renders as its own text box', () => {
  const xml = translate(BASIC);
  assert.ok(xml.includes('is a'));
});

test('every relationship type produces a distinguishable marker/dash combination', () => {
  const cases = [
    'A <|-- B',
    'A *-- B',
    'A o-- B',
    'A --> B',
    'A -- B',
    'A ..> B',
    'A ..|> B',
    'A .. B',
  ];
  const renders = cases.map((line) => translate(`classDiagram\n  ${line}`));
  // Every rendering must be distinct from every other — no two relationship
  // types collapse onto the same connector XML.
  const unique = new Set(renders);
  assert.equal(unique.size, renders.length);
});

test('a class box has 3 stacked compartments when it has both attributes and methods', () => {
  const xml = translate(BASIC);
  // Animal: 3 text boxes (title/attrs/methods). Dog: 2 (title/methods, no
  // attrs). Plus 1 for the relationship's own ": is a" label.
  const textBoxCount = (xml.match(/txBox="1"/g) ?? []).length;
  assert.equal(textBoxCount, 3 + 2 + 1);
});

test('a class with no members renders only a title compartment', () => {
  const xml = translate('classDiagram\n  class Empty');
  const textBoxCount = (xml.match(/txBox="1"/g) ?? []).length;
  assert.equal(textBoxCount, 1);
});

test('member and label text is XML-escaped', () => {
  const xml = translate('classDiagram\n  class A {\n    +name: "quoted" & <tag>\n  }');
  assert.ok(xml.includes('&amp;'));
  assert.ok(xml.includes('&lt;tag&gt;'));
  assert.ok(!xml.includes('<tag>'));
});

test('every <w:jc> uses a valid ST_Jc value (this project has hit this real-Word-only schema bug before, 2026-09-06)', () => {
  const xml = translate(BASIC);
  const jcValues = [...xml.matchAll(/<w:jc w:val="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(jcValues.length > 0);
  for (const val of jcValues) {
    assert.ok(['left', 'center', 'right'].includes(val!), `invalid ST_Jc value: ${val}`);
  }
});

test('an empty class diagram renders a visible note, not a silent blank canvas', () => {
  const xml = translate('classDiagram');
  assert.ok(xml.includes('has no content to render'));
  assert.ok(!xml.includes('wpc:wpc'));
});

test('is a pure function: identical input produces byte-identical output', () => {
  assert.equal(translate(BASIC), translate(BASIC));
});
