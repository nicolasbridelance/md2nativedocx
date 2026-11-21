import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRequirementDiagram } from '../../src/diagrams/requirement-diagram/parser.js';
import { translateRequirementDiagramToOoxml } from '../../src/diagrams/requirement-diagram/translator.js';

function translate(text: string): string {
  const { ast } = parseRequirementDiagram(text);
  return translateRequirementDiagramToOoxml(ast);
}

const BASIC = `requirementDiagram
  requirement test_req {
    id: 1
    text: the test text.
    risk: high
    verifymethod: test
  }
  element test_entity {
    type: simulation
  }
  test_entity - satisfies -> test_req`;

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

test('a relationship other than contains is a dashed line with an open arrowhead only at the destination end, as in Mermaid', () => {
  const xml = translate(BASIC);
  assert.equal((xml.match(/<wps:cNvCnPr\/>/g) ?? []).length, 1);
  assert.equal((xml.match(/<a:headEnd /g) ?? []).length, 0);
  assert.equal((xml.match(/<a:tailEnd type="arrow"/g) ?? []).length, 1);
  assert.ok(xml.includes('<a:prstDash val="dash"/>'));
});

test('contains is a solid line with a circled cross at the containing end, no arrowhead, as in Mermaid', () => {
  const xml = translate('requirementDiagram\n  requirement A {\n  }\n  requirement B {\n  }\n  A - contains -> B');
  assert.ok(!xml.includes('<a:prstDash val="dash"/>'));
  assert.ok(!xml.includes('<a:tailEnd '));
  assert.ok(!xml.includes('<a:headEnd '));
  // The line, then the two strokes of the cross; the circle is an ellipse.
  assert.equal((xml.match(/<wps:cNvCnPr\/>/g) ?? []).length, 3);
  assert.equal((xml.match(/prst="ellipse"/g) ?? []).length, 1);
});

test('the relationship type renders as a «type» label on a white background, as in Mermaid', () => {
  const xml = translate(BASIC);
  assert.ok(xml.includes('«satisfies»'));
  assert.ok(/name="«satisfies» background"\/>[^]*?<a:srgbClr val="FFFFFF"\/>/.test(xml));
});

test('a requirement box shows its stereotype and every populated field, labelled as Mermaid labels them', () => {
  const xml = translate(BASIC);
  assert.ok(xml.includes('«Requirement»'));
  assert.ok(xml.includes('ID: 1'));
  assert.ok(xml.includes('Text: the test text.'));
  assert.ok(xml.includes('Risk: High'));
  assert.ok(xml.includes('Verification: Test'));
});

test('each requirement type keyword shows as Mermaid displays it', () => {
  assert.ok(translate('requirementDiagram\n  functionalRequirement r {\n  }').includes('«Functional Requirement»'));
  assert.ok(translate('requirementDiagram\n  designConstraint r {\n  }').includes('«Design Constraint»'));
});

test('an element box shows its stereotype and populated fields', () => {
  const xml = translate(BASIC);
  assert.ok(xml.includes('«Element»'));
  assert.ok(xml.includes('Type: simulation'));
  assert.ok(translate('requirementDiagram\n  element e {\n    docref: a/b\n  }').includes('Doc Ref: a/b'));
});

test('names and fields are read as Markdown, as Mermaid draws them (official example #3)', () => {
  const xml = translate('requirementDiagram\nrequirement "__test_req__" {\n    text: "*italicized text* **bold text**"\n}');
  assert.ok(/<w:b\/>[^]*?>test_req<\/w:t>/.test(xml), 'the name, without its underscores, in bold');
  assert.ok(!xml.includes('__test_req__'));
  assert.ok(/<w:i\/>[^]*?>italicized text<\/w:t>/.test(xml));
  assert.ok(/<w:b\/>[^]*?>bold text<\/w:t>/.test(xml));
  assert.ok(xml.includes('>Text: </w:t>'));
});

test('a styled box takes its fill, border and text colour; font-weight makes every text bold', () => {
  const xml = translate('requirementDiagram\n  element e {\n    type: x\n  }\n  style e fill:#f9f,stroke:#333,color:blue,font-weight:bold');
  assert.ok(xml.includes('<a:srgbClr val="FF99FF"/>'));
  assert.ok(xml.includes('<a:srgbClr val="333333"/>'));
  assert.ok(!xml.includes('D9E2F3'), 'a styled fill covers the header too');
  assert.ok(/<w:b\/><w:color w:val="0000FF"\/>[^]*?Type: x/.test(xml));
});

test('direction LR lays the boxes out side by side', () => {
  const positions = (src: string): number[][] =>
    [...translate(src).matchAll(/<wps:cNvPr id="\d+" name="(?:A|B)"\/>[^]*?<a:off x="(\d+)" y="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const body = '\n  element A {\n  }\n  element B {\n  }\n  A - traces -> B';
  const [tdA, tdB] = positions(`requirementDiagram${body}`);
  const [lrA, lrB] = positions(`requirementDiagram\n  direction LR${body}`);
  assert.equal(tdA![0], tdB![0]);
  assert.equal(lrA![1], lrB![1]);
});

test('field text is XML-escaped', () => {
  const xml = translate('requirementDiagram\n  requirement "A&<b>\'" {\n    text: "quoted" & <tag>\n  }\n  element "<x/>" {\n    docref: a"&b\n  }');
  assert.ok(!xml.includes('<b>'));
  assert.ok(!xml.includes('<x/>'));
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

test('an empty requirement diagram renders a visible note, not a silent blank canvas', () => {
  const xml = translate('requirementDiagram');
  assert.ok(xml.includes('has no content to render'));
  assert.ok(!xml.includes('wpc:wpc'));
});

test('is a pure function: identical input produces byte-identical output', () => {
  assert.equal(translate(BASIC), translate(BASIC));
});

test('2 relationships between the same pair of boxes are pushed apart (parallel-edge offset), not drawn on top of each other', () => {
  // Found via a real render (test-corpus/visual/fixtures/requirement-diagram.mmd):
  // without an offset, both connectors share the exact same 2 endpoints,
  // and both «label» text boxes land at the exact same midpoint, garbling
  // together illegibly.
  const xml = translate(
    'requirementDiagram\n  requirement A {\n    id: 1\n  }\n  requirement B {\n    id: 2\n  }\n  A - traces -> B\n  A <- derives - B',
  );
  // Emission order per relationship is [connector, label background, label],
  // so the 2 connectors' own <a:off> land at indices 0/3 and the 2 labels' at 2/5.
  const offsets = [...xml.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.notDeepEqual(offsets[0], offsets[3], 'the 2 connectors must not share the same bounding-box origin');
  // Regression: this pair is deliberately declared in *opposite* documented
  // directions (`A - traces -> B` then `A <- derives - B`, i.e.
  // {from:A,to:B} then {from:B,to:A}) — the first fix attempt derived the
  // labels' along-line stagger from each relationship's own (possibly
  // reversed) p1/p2, which flips sign for a reversed duplicate and exactly
  // cancels parallelEdgeOffset's own index-based sign flip, collapsing both
  // labels onto the same point again even though the connectors themselves
  // were already correctly separated. Only a real render caught it.
  assert.notDeepEqual(offsets[2], offsets[5], 'the 2 «type» labels must not share the same position');
});
