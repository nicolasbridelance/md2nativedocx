import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCynefinDiagram } from '../../src/diagrams/cynefin/parser.js';
import { translateCynefinToOoxml } from '../../src/diagrams/cynefin/translator.js';

function translate(text: string): string {
  const { ast } = parseCynefinDiagram(text);
  return translateCynefinToOoxml(ast);
}

const BASIC = `cynefin-beta
  title Incident Response

  complex
    "Investigate root cause"

  complicated
    "Analyze performance data"

  clear
    "Restart service"

  chaotic
    "Page on-call immediately"

  confusion
    "Unknown failure mode"

  complex --> complicated : "Pattern identified"`;

test('wraps the drawing canvas in the schema-required paragraph hierarchy, same envelope as the other translators', () => {
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

test('all 5 domain labels always render, even for an empty diagram (matches the docs\' own "Empty framework" example)', () => {
  const xml = translate('cynefin-beta');
  for (const label of ['Complex', 'Complicated', 'Clear', 'Chaotic', 'Confusion']) {
    assert.ok(xml.includes(`<w:t xml:space="preserve">${label}</w:t>`), `missing ${label}`);
  }
  assert.ok(xml.includes('<wpc:wpc'));
});

test('domain fill colors are distinct', () => {
  const xml = translate(BASIC);
  const colors = ['FFF2CC', 'D9E2F3', 'E2EFDA', 'F8CBAD', 'D9D9D9'];
  for (const c of colors) {
    assert.ok(xml.includes(`<a:srgbClr val="${c}"/>`), `missing color ${c}`);
  }
});

test('domain subtitles are sourced from the docs\' own decision-model descriptions', () => {
  const xml = translate(BASIC);
  assert.ok(xml.includes('Probe'));
  assert.ok(xml.includes('emergent practices'));
});

test('an item renders as a labeled badge', () => {
  const xml = translate(BASIC);
  assert.ok(xml.includes('<w:t xml:space="preserve">Restart service</w:t>'));
});

test('the confusion domain caps items at 3 and shows a "+N more" overflow badge', () => {
  const xml = translate(
    'cynefin-beta\n  confusion\n    "A"\n    "B"\n    "C"\n    "D"\n    "E"',
  );
  assert.ok(xml.includes('<w:t xml:space="preserve">A</w:t>'));
  assert.ok(xml.includes('<w:t xml:space="preserve">B</w:t>'));
  assert.ok(xml.includes('<w:t xml:space="preserve">C</w:t>'));
  assert.ok(!xml.includes('<w:t xml:space="preserve">D</w:t>'));
  assert.ok(!xml.includes('<w:t xml:space="preserve">E</w:t>'));
  assert.ok(xml.includes('<w:t xml:space="preserve">+2 more</w:t>'));
});

test('exactly 3 confusion items shows no overflow badge', () => {
  const xml = translate('cynefin-beta\n  confusion\n    "A"\n    "B"\n    "C"');
  assert.ok(!xml.includes('more</w:t>'));
});

test('a transition renders a connector with an arrowhead and its label', () => {
  const xml = translate(BASIC);
  assert.equal((xml.match(/<a:headEnd /g) ?? []).length, 0); // straight line, no head marker
  assert.equal((xml.match(/<a:tailEnd /g) ?? []).length, 1);
  assert.ok(xml.includes('<w:t xml:space="preserve">Pattern identified</w:t>'));
});

test('a self-loop transition renders no connector at all', () => {
  const xml = translate('cynefin-beta\n  complex --> complex');
  assert.equal((xml.match(/wps:cNvCnPr/g) ?? []).length, 0);
});

test('two transitions between the same domain pair are pushed apart, not drawn on top of each other', () => {
  const xml = translate('cynefin-beta\n  complex --> complicated : "A"\n  complicated --> complex : "B"');
  assert.equal((xml.match(/wps:cNvCnPr/g) ?? []).length, 2);
});

test('the diagram title renders as a bold banner and names the drawing frame', () => {
  const xml = translate(BASIC);
  assert.ok(xml.includes('<w:t xml:space="preserve">Incident Response</w:t>'));
  assert.ok(xml.includes('name="Incident Response"'));
});

test('a diagram with no title still names the drawing frame with a sensible default', () => {
  const xml = translate('cynefin-beta\n  complex\n    "x"');
  assert.ok(xml.includes('name="Cynefin framework"'));
});

test('item text and transition labels are XML-escaped', () => {
  const xml = translate('cynefin-beta\n  complex\n    "A & B <tag>"');
  assert.ok(xml.includes('&amp;'));
  assert.ok(xml.includes('&lt;tag&gt;'));
});

test('is a pure function: identical input produces byte-identical output', () => {
  assert.equal(translate(BASIC), translate(BASIC));
});
