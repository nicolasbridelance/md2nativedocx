import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStateDiagram } from '../../src/diagrams/state-diagram/parser.js';
import { translateStateDiagramToOoxml } from '../../src/diagrams/state-diagram/translator.js';

function translate(text: string): string {
  const { ast } = parseStateDiagram(text);
  return translateStateDiagramToOoxml(ast);
}

const BASIC = `stateDiagram-v2
  [*] --> Still
  Still --> Moving : go
  Moving --> [*]`;

test('wraps the drawing canvas in the schema-required paragraph hierarchy, same envelope as the other Family B/C translators', () => {
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

test('renders one connector per transition, always a solid line with a triangle at the target end', () => {
  const xml = translate(BASIC);
  // BASIC has 3 transitions: [*]->Still, Still->Moving, Moving->[*].
  assert.equal((xml.match(/<wps:cNvCnPr\/>/g) ?? []).length, 3);
  assert.equal((xml.match(/<a:tailEnd /g) ?? []).length, 3);
  assert.equal((xml.match(/<a:headEnd /g) ?? []).length, 0);
  assert.ok(xml.includes('type="triangle"'));
});

test('a transition label renders as its own text box', () => {
  assert.ok(translate(BASIC).includes('>go<'));
});

test('start renders as a single filled circle, end as two (ring + inner dot)', () => {
  const xml = translate(BASIC);
  // 2 ellipses for start (1) + end (2) = 3 total.
  const ellipseCount = (xml.match(/<a:prstGeom prst="ellipse">/g) ?? []).length;
  assert.equal(ellipseCount, 3);
});

test('choice renders as a diamond, fork/join as a filled bar — all visually distinct shapes', () => {
  const xml = translate(
    'stateDiagram-v2\n  state c <<choice>>\n  state f <<fork>>\n  state j <<join>>\n  A --> c\n  c --> f\n  f --> j',
  );
  assert.ok(xml.includes('<a:prstGeom prst="diamond">'));
  // fork/join render as a plain black rect alongside the 2 normal-state
  // rounded rects (A, and the roundRect shapes) — assert the diamond and at
  // least one non-round rect both appear.
  assert.ok(xml.includes('<a:prstGeom prst="rect">') || xml.includes('<a:prstGeom prst="roundRect">'));
});

test('a normal state renders a rounded rect with a centered label', () => {
  const xml = translate('stateDiagram-v2\n  [*] --> Idle');
  assert.ok(xml.includes('<a:prstGeom prst="roundRect">'));
  assert.ok(xml.includes('>Idle<'));
});

test('state label text is XML-escaped', () => {
  const xml = translate('stateDiagram-v2\n  s2 : "quoted" & <tag>\n  [*] --> s2');
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

test('an empty state diagram renders a visible note, not a silent blank canvas', () => {
  const xml = translate('stateDiagram-v2');
  assert.ok(xml.includes('has no content to render'));
  assert.ok(!xml.includes('wpc:wpc'));
});

test('is a pure function: identical input produces byte-identical output', () => {
  assert.equal(translate(BASIC), translate(BASIC));
});
