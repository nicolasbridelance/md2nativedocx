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

test("elements take Mermaid's colours per category and external flag, with white text", () => {
  const xml = translate('C4Context\n  Person(p, "P")\n  System(s, "S")\n  Container_Ext(c, "C")\n  Component(k, "K")');
  for (const fill of ['08427B', '1168BD', 'B3B3B3', '85BBF0']) assert.ok(xml.includes(`<a:srgbClr val="${fill}"/>`), fill);
  assert.ok(xml.includes('<w:color w:val="FFFFFF"/>'));
});

test("the stereotype line is Mermaid's: [Software System], [Container: technology]", () => {
  assert.ok(translate('C4Context\n  System_Ext(s, "S")').includes('>[Software System]<'));
  assert.ok(translate('C4Container\n  ContainerDb_Ext(db, "DB", "SQL Server")').includes('>[Container: SQL Server]<'));
});

test('a Db is a cylinder, a Queue a cylinder on its side, a person a body under a head', () => {
  assert.ok(translate('C4Context\n  SystemDb(d, "D")').includes('prst="can"'));
  const queue = translate('C4Context\n  SystemQueue(q, "Q")');
  assert.ok(queue.includes('<a:custGeom>') && queue.includes('<a:arcTo'));
  const person = translate('C4Context\n  Person(p, "P")');
  assert.equal((person.match(/<a:path /g) ?? []).length, 2);
});

/** Position and size (EMU) of the shape named `name`. */
function boxOf(xml: string, name: string): { x: number; y: number; cx: number; cy: number } {
  const at = xml.indexOf(`name="${name}"`);
  assert.ok(at >= 0, name);
  const m = /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"/.exec(xml.slice(at))!;
  return { x: Number(m[1]), y: Number(m[2]), cx: Number(m[3]), cy: Number(m[4]) };
}

/** The XML of the shape named `name`. */
function shapeXml(xml: string, name: string): string {
  const at = xml.indexOf(`name="${name}"`);
  return xml.slice(at, xml.indexOf('</wps:wsp>', at));
}

test('a boundary is a dashed frame around what it holds, a deployment node a solid one', () => {
  const xml = translate('C4Deployment\n  Boundary(b, "Outer") {\n    Deployment_Node(n, "Server", "Ubuntu") {\n      Container(c, "App")\n    }\n  }');
  const outer = boxOf(xml, 'Outer');
  const server = boxOf(xml, 'Server');
  const app = boxOf(xml, 'App');
  for (const [inner, around] of [
    [server, outer],
    [app, server],
  ] as const) {
    assert.ok(inner.x > around.x && inner.y > around.y);
    assert.ok(inner.x + inner.cx < around.x + around.cx && inner.y + inner.cy < around.y + around.cy);
  }
  assert.ok(shapeXml(xml, 'Outer').includes('<a:prstDash val="dash"/>'));
  assert.ok(!shapeXml(xml, 'Server').includes('<a:prstDash'));
  assert.ok(shapeXml(xml, 'Server').includes('>[Ubuntu]<'));
});

test('elements are laid out in declaration order, shapesPerRow to a row', () => {
  const four = 'C4Context\n  System(a, "A")\n  System(b, "B")\n  System(c, "C")\n  System(d, "D")';
  const flat = translate(four);
  assert.equal(boxOf(flat, 'A').y, boxOf(flat, 'D').y);
  assert.ok(boxOf(flat, 'A').x < boxOf(flat, 'B').x);
  const wrapped = translate(`${four}\n  UpdateLayoutConfig($c4ShapeInRow="2")`);
  assert.equal(boxOf(wrapped, 'C').x, boxOf(wrapped, 'A').x);
  assert.ok(boxOf(wrapped, 'C').y > boxOf(wrapped, 'A').y);
});

test('UpdateElementStyle and UpdateRelStyle colours reach the drawing', () => {
  const xml = translate(
    'C4Context\n  Person(a, "A")\n  System(b, "B")\n  Rel(a, b, "Uses")\n  UpdateElementStyle(a, $bgColor="grey", $fontColor="red")\n  UpdateRelStyle(a, b, $lineColor="blue", $textColor="#00aa00")',
  );
  assert.ok(xml.includes('<a:srgbClr val="808080"/>'));
  assert.ok(xml.includes('<w:color w:val="FF0000"/>'));
  assert.ok(xml.includes('<a:srgbClr val="0000FF"/>'));
  assert.ok(xml.includes('<w:color w:val="00AA00"/>'));
});

test('a C4Dynamic numbers its relationships in statement order; techn is italic in brackets', () => {
  const xml = translate('C4Dynamic\n  System(a, "A")\n  System(b, "B")\n  Rel(a, b, "Calls", "HTTPS")\n  Rel(b, a, "Answers")');
  assert.ok(xml.includes('>1: Calls<'));
  assert.ok(xml.includes('>2: Answers<'));
  assert.ok(/<w:i\/><w:color w:val="444444"\/><w:sz w:val="\d+"\/><\/w:rPr><w:t xml:space="preserve">\[HTTPS\]</.test(xml));
});

test('frame labels and relationship labels are XML-escaped', () => {
  const xml = translate('C4Context\n  Boundary(b, "A & <B>") {\n    System(s, "S")\n  }\n  System(t, "T")\n  Rel(s, t, "x < y & z")');
  assert.ok(!xml.includes('<B>'));
  assert.ok(xml.includes('A &amp; &lt;B&gt;'));
  assert.ok(xml.includes('x &lt; y &amp; z'));
});

test('a diagram holding only an empty frame still draws the frame', () => {
  const xml = translate('C4Context\n  Boundary(b, "Empty") {\n  }');
  assert.ok(xml.includes('name="Empty"'));
});

test('a parent cycle built by hand does not loop: the frames fall back to the top level', () => {
  const xml = translateC4DiagramToOoxml({
    elements: [{ id: 'e', category: 'system', external: false, label: 'E', parent: 'a' }],
    boundaries: [
      { id: 'a', label: 'A', kind: 'boundary', type: 'system', parent: 'b' },
      { id: 'b', label: 'B', kind: 'boundary', type: 'system', parent: 'a' },
    ],
    relationships: [],
  });
  assert.ok(xml.includes('name="E"'));
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
