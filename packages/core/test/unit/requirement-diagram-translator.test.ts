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

test('every relationship renders as a dashed line with a triangle only at the destination end', () => {
  const xml = translate(BASIC);
  assert.equal((xml.match(/<wps:cNvCnPr\/>/g) ?? []).length, 1);
  assert.equal((xml.match(/<a:headEnd /g) ?? []).length, 0);
  assert.equal((xml.match(/<a:tailEnd /g) ?? []).length, 1);
  assert.ok(xml.includes('<a:prstDash val="dash"/>'));
});

test('the relationship type renders as a «type» label', () => {
  assert.ok(translate(BASIC).includes('«satisfies»'));
});

test('a requirement box shows its stereotype and every populated field', () => {
  const xml = translate(BASIC);
  assert.ok(xml.includes('«requirement»'));
  assert.ok(xml.includes('id: 1'));
  assert.ok(xml.includes('text: the test text.'));
  assert.ok(xml.includes('risk: high'));
  assert.ok(xml.includes('verifyMethod: test'));
});

test('an element box shows its stereotype and populated fields', () => {
  const xml = translate(BASIC);
  assert.ok(xml.includes('«element»'));
  assert.ok(xml.includes('type: simulation'));
});

test('field text is XML-escaped', () => {
  const xml = translate('requirementDiagram\n  requirement A {\n    text: "quoted" & <tag>\n  }');
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
  // Emission order per relationship is [connector, label], so the 2
  // connectors' own <a:off> land at indices 0/2 and the 2 labels' at 1/3.
  const offsets = [...xml.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.notDeepEqual(offsets[0], offsets[2], 'the 2 connectors must not share the same bounding-box origin');
  // Regression: this pair is deliberately declared in *opposite* documented
  // directions (`A - traces -> B` then `A <- derives - B`, i.e.
  // {from:A,to:B} then {from:B,to:A}) — the first fix attempt derived the
  // labels' along-line stagger from each relationship's own (possibly
  // reversed) p1/p2, which flips sign for a reversed duplicate and exactly
  // cancels parallelEdgeOffset's own index-based sign flip, collapsing both
  // labels onto the same point again even though the connectors themselves
  // were already correctly separated. Only a real render caught it.
  assert.notDeepEqual(offsets[1], offsets[3], 'the 2 «type» labels must not share the same position');
});
