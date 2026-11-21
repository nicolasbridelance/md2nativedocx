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

/** Offset and extent of the shape named `name` (the first one), in EMU. */
function frameOf(xml: string, name: string): { x: number; y: number; w: number; h: number } {
  const at = xml.indexOf(`name="${name}"`);
  assert.ok(at !== -1, name);
  const m = /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(xml.slice(at));
  assert.ok(m, name);
  return { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
}
const inside = (inner: { x: number; y: number; w: number; h: number }, outer: { x: number; y: number; w: number; h: number }): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

test('groups: a dashed titled box around its entities, nested groups inside their parent, title escaped', () => {
  const xml = translate(`erDiagram
  subgraph outer [Outer <&>]
    CAR ||--o{ DRIVER : allows
    subgraph inner
      PERSON
    end
  end
  HOUSE`);
  assert.ok(xml.includes('Outer &lt;&amp;&gt;') && !xml.includes('Outer <&>'));
  const boxes = [...xml.matchAll(/<a:prstDash val="dash"\/>/g)].length;
  assert.ok(boxes >= 2, 'two dashed group boxes');
  const group = (title: string): { x: number; y: number; w: number; h: number } => {
    // A group's box is the shape just before its title text box.
    const titleAt = xml.indexOf(`>${title}<`);
    const before = xml.slice(0, titleAt);
    const all = [...before.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)];
    const m = all[all.length - 2] as RegExpMatchArray;
    return { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
  };
  const outer = group('Outer &lt;&amp;&gt;');
  const innerBox = group('inner');
  assert.ok(inside(innerBox, outer), 'inner group inside outer');
  assert.ok(inside(frameOf(xml, 'CAR'), outer) && inside(frameOf(xml, 'DRIVER'), outer));
  assert.ok(inside(frameOf(xml, 'PERSON'), innerBox));
  assert.ok(!inside(frameOf(xml, 'HOUSE'), outer));
  // Groups are drawn first, behind the entities.
  assert.ok(xml.indexOf('>inner<') < xml.indexOf('name="PERSON"'));
});

test('groups: a relationship to a group ends on its box; one per relationship, none lost', () => {
  const xml = translate('erDiagram\n  subgraph G1\n    A ||--|| B : x\n  end\n  subgraph G2\n    C\n  end\n  G1 ||--|| G2 : links\n  G2 ||--|| A : y');
  assert.equal((xml.match(/<wps:cNvCnPr\/>/g) ?? []).length, 3);
  assert.ok(!xml.includes('name="G1"'), 'no entity box for a group name');
});

test('groups: an empty, cyclic or dangling group from a hand-built AST is drawn or dropped without throwing', () => {
  const xml = translateErDiagramToOoxml({
    entities: [{ id: 'A', attributes: [], group: 'nowhere' }, { id: 'B', attributes: [], group: 'X' }],
    relationships: [{ from: 'A', to: 'Y', fromCardinality: 'exactly-one', toCardinality: 'exactly-one', identifying: true }],
    groups: [
      { id: 'X', label: 'X', parent: 'Y' },
      { id: 'Y', label: 'Y', parent: 'X' },
      { id: 'E', label: 'Empty', fill: '"/><evil/>' },
    ],
  });
  assert.ok(xml.includes('>Empty<') && !xml.includes('evil'));
  assert.ok(xml.includes('name="A"') && xml.includes('name="B"'));
});

test('styling: fill, stroke and text colour of an entity; text contrasts with a dark fill', () => {
  const xml = translate('erDiagram\n  A {\n    int id\n  }\n  style A fill:#000080,stroke:#ff0000');
  assert.ok(xml.includes('<a:srgbClr val="000080"/>'));
  assert.ok(xml.includes('<a:srgbClr val="FF0000"/>'));
  assert.ok(/w:color w:val="FFFFFF"/.test(xml), 'white text on navy');
  const plain = translate('erDiagram\n  A {\n    int id\n  }');
  assert.ok(!plain.includes('000080'));
});

test('groups: a group no relationship crosses keeps its own direction; a crossed one follows the diagram', () => {
  const centreX = (xml: string, name: string): number => {
    const f = frameOf(xml, name);
    return f.x + f.w / 2;
  };
  const centreY = (xml: string, name: string): number => {
    const f = frameOf(xml, name);
    return f.y + f.h / 2;
  };
  // B1 runs right to left inside a top-to-bottom diagram: `I1 -- F1` puts F1 left of I1, on the same row.
  const own = translate('erDiagram\n  subgraph B1\n    direction RL\n    I1 ||--|| F1 : links\n  end\n  A ||--|| B1 : x');
  assert.ok(centreX(own, 'F1') < centreX(own, 'I1'));
  assert.equal(centreY(own, 'F1'), centreY(own, 'I1'));
  // The same group with a relationship crossing its border is laid out with the rest, top to bottom.
  const crossed = translate('erDiagram\n  subgraph B1\n    direction RL\n    I1 ||--|| F1 : links\n  end\n  A ||--|| F1 : x');
  assert.notEqual(centreY(crossed, 'F1'), centreY(crossed, 'I1'));
});
