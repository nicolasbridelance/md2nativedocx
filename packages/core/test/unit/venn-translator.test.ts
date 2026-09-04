import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVennChart } from '../../src/diagrams/venn/parser.js';
import { translateVennToOoxml } from '../../src/diagrams/venn/translator.js';
import type { VennChart } from '../../src/diagrams/venn/types.js';

function translate(text: string): string {
  const { ast } = parseVennChart(text);
  return translateVennToOoxml(ast);
}

const TWO_SET = `venn-beta
  title Two Sets
  set A
  set B
  union A,B
    text ["Overlap"]`;

const THREE_SET = `venn-beta
  set A
  set B
  set C
  union A,B
  union B,C
  union A,C
  union A,B,C
    text ["All three"]`;

test('wraps the drawing canvas in the schema-required paragraph hierarchy, same envelope as flowchart/quadrant', () => {
  const xml = translate(TWO_SET);
  assert.ok(xml.startsWith('<w:p '));
  const order = ['<w:p ', '<w:r>', '<w:drawing>', '<wp:inline ', '<wpc:wpc ', '<wps:wsp>', '</wpc:wpc>', '</w:p>'];
  let idx = -1;
  for (const token of order) {
    const found = xml.indexOf(token, idx + 1);
    assert.ok(found > idx, `expected "${token}" after position ${idx}`);
    idx = found;
  }
});

test('two sets: 2 circles + 2 set labels + 1 union label + 1 title', () => {
  const xml = translate(TWO_SET);
  const circleCount = (xml.match(/<wps:cNvSpPr\/?>/g) ?? []).length;
  assert.equal(circleCount, 2);
  const textBoxCount = (xml.match(/txBox="1"/g) ?? []).length;
  assert.equal(textBoxCount, 1 + 2 + 1); // title + 2 set labels + 1 union label
});

test('three sets: 3 circles + 3 set labels; only the triple union has an attached text label', () => {
  // The 3 pairwise `union` lines in THREE_SET have no `text` line directly
  // after them (each is immediately followed by another `union` line), so
  // per the parser's "text attaches to the immediately preceding
  // set/union" rule, only the last (`union A,B,C`) gets a label.
  const xml = translate(THREE_SET);
  const circleCount = (xml.match(/<wps:cNvSpPr\/?>/g) ?? []).length;
  assert.equal(circleCount, 3);
  const textBoxCount = (xml.match(/txBox="1"/g) ?? []).length;
  assert.equal(textBoxCount, 3 + 1); // no title in THREE_SET + 3 set labels + 1 (triple) union label
  assert.ok(xml.includes('All three'));
});

test('a union with no attached text label renders no label shape for it', () => {
  const xml = translate('venn-beta\n  set A\n  set B\n  union A,B');
  const textBoxCount = (xml.match(/txBox="1"/g) ?? []).length;
  assert.equal(textBoxCount, 2); // just the 2 set labels
});

test('circle fill uses an alpha-blended solidFill so overlaps blend visually', () => {
  const xml = translate(TWO_SET);
  assert.ok(xml.includes('<a:alpha val="60000"/>'));
});

test('a set fill override reaches its own circle', () => {
  const xml = translate('venn-beta\n  set A\n  style A fill:#ff3300');
  assert.ok(xml.includes('val="FF3300"'));
});

test('an invalid set fill falls back to a default rather than reaching the XML unvalidated', () => {
  const chart: VennChart = { sets: [{ id: 'A', label: 'A', fill: 'not-a-color' }], unions: [] };
  const xml = translateVennToOoxml(chart);
  assert.ok(!xml.includes('not-a-color'));
});

test('4+ sets fall back to a non-overlapping row and append a visible degradation note', () => {
  const chart: VennChart = {
    sets: [
      { id: 'A', label: 'A' },
      { id: 'B', label: 'B' },
      { id: 'C', label: 'C' },
      { id: 'D', label: 'D' },
    ],
    unions: [{ setIds: ['A', 'B'], label: 'AB' }],
  };
  const xml = translateVennToOoxml(chart);
  const circleCount = (xml.match(/<wps:cNvSpPr\/?>/g) ?? []).length;
  assert.equal(circleCount, 4);
  // The union label is skipped (no true overlap geometry for 4+ sets).
  assert.ok(!xml.includes('>AB<'));
  assert.ok(xml.includes('more than 3 sets'));
});

test('zero sets renders a visible note, not a silent blank canvas', () => {
  const xml = translateVennToOoxml({ sets: [], unions: [] });
  assert.ok(xml.includes('no sets to render'));
  assert.ok(!xml.includes('<wpc:wpc'));
});

test('every set and union label is XML-escaped', () => {
  const xml = translate('venn-beta\n  set A ["A & B"]');
  assert.ok(xml.includes('A &amp; B'));
});

test('is a pure function: identical input produces byte-identical output', () => {
  assert.equal(translate(THREE_SET), translate(THREE_SET));
});
