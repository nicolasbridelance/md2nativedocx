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

test('renders one connector per relationship; inheritance ends in a hollow triangle, not a line end', () => {
  const xml = translate(BASIC);
  assert.equal((xml.match(/<wps:cNvCnPr\/>/g) ?? []).length, 1);
  // A line end is always filled, so the hollow marker is its own white closed polygon.
  assert.equal((xml.match(/<a:headEnd /g) ?? []).length, 0);
  assert.equal((xml.match(/<a:tailEnd /g) ?? []).length, 0);
  const polygons = xml.match(/<a:custGeom>[\s\S]*?<a:close\/>[\s\S]*?<a:srgbClr val="FFFFFF">/g) ?? [];
  assert.equal(polygons.length, 1);
  assert.equal((polygons[0]?.match(/<a:lnTo>/g) ?? []).length, 2, 'a triangle: a move and two lines');
});

test('aggregation is a hollow diamond, composition a filled line end, association a small arrow head', () => {
  const diamond = translate('classDiagram\n  A o-- B').match(/<a:lnTo>/g) ?? [];
  assert.equal(diamond.length, 3, 'a diamond: a move and three lines');
  assert.match(translate('classDiagram\n  A *-- B'), /<a:headEnd type="diamond"/);
  assert.match(translate('classDiagram\n  A --> B'), /<a:tailEnd type="triangle" w="sm"/);
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

test('an annotation is drawn as «…» above the class name, escaped', () => {
  // Injection case (AGENTS.md): the annotation is user text.
  const { ast } = parseClassDiagram('classDiagram\nclass Shape {\n  <<a & <b>>>\n}');
  const xml = translateClassDiagramToOoxml(ast);
  assert.ok(xml.includes('«a &amp; &lt;b&gt;»'), 'escaped');
  assert.ok(!xml.includes('<b>'));
  assert.ok(xml.indexOf('«a &amp;') < xml.indexOf('>Shape</w:t>'), 'the annotation comes before the name');
});

test('a namespace is a dashed box behind its classes, titled and escaped, nested inside its parent', () => {
  // Injection case (AGENTS.md): the namespace label is user text.
  const { ast } = parseClassDiagram(
    'classDiagram\nnamespace Outer {\n  namespace Inner["a <b> & c"] {\n    class A\n  }\n  class B\n}\nnamespace Empty {\n}\nA --> B',
  );
  const xml = translateClassDiagramToOoxml(ast);
  assert.equal((xml.match(/<a:prstDash val="dash"\/>/g) ?? []).length, 2, 'Outer and Inner, not the empty namespace');
  assert.ok(xml.includes('>a &lt;b&gt; &amp; c</w:t>'));
  assert.ok(!xml.includes('<b>'));
  // Boxes in emission order: Outer, Inner; Inner lies within Outer, below Outer's title band.
  const boxes = [...xml.matchAll(/<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>[\s\S]{0,400}?<a:prstDash val="dash"\/>/g)].map((m) =>
    m.slice(1, 5).map(Number),
  );
  const [outer, inner] = boxes as [number[], number[]];
  assert.ok(inner[0]! >= outer[0]! && inner[0]! + inner[2]! <= outer[0]! + outer[2]!, 'horizontally inside');
  assert.ok(inner[1]! > outer[1]! && inner[1]! + inner[3]! <= outer[1]! + outer[3]!, 'vertically inside, below the title');
  assert.ok(xml.indexOf('>Outer</w:t>') < xml.indexOf('>A</w:t>'), 'boxes are drawn before the classes');
});
