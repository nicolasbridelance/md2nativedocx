import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePieChart } from '../../src/diagrams/pie/parser.js';
import { translatePieToChart, CHART_PLACEHOLDER_PREFIX } from '../../src/diagrams/pie/chart.js';

const pie = (text: string) => parsePieChart(text).ast;

/** Tag-balance check (no XML parser dependency in core's tests; schema validity is `test:oxml-validate`'s job). */
function balanced(xml: string): boolean {
  const stack: string[] = [];
  for (const m of xml.replace(/<\?[^>]*\?>/g, '').matchAll(/<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      if (stack.pop() !== name) return false;
    } else stack.push(name as string);
  }
  return stack.length === 0;
}

test('a native pie chart is well-formed and carries cached values plus the workbook ranges', () => {
  const out = translatePieToChart(pie('pie showData\n  title Pets\n  "Dogs" : 386\n  "Cats" : 85.5'), 'abc-123', { embedWorkbook: true });
  assert.equal(balanced(out.chartXml), true);
  assert.equal(balanced(out.paragraphXml), true);
  assert.match(out.chartXml, /<c:f>Sheet1!\$A\$2:\$A\$3<\/c:f>/);
  assert.match(out.chartXml, /<c:f>Sheet1!\$B\$2:\$B\$3<\/c:f>/);
  assert.match(out.chartXml, /<c:v>386<\/c:v>/);
  assert.match(out.chartXml, /<c:v>85.5<\/c:v>/);
  assert.match(out.chartXml, /<c:externalData r:id="rId1">/);
  assert.deepEqual(out.workbook.rows, [['Dogs', 386], ['Cats', 85.5]]);
  assert.equal(out.hasWorkbook, true);
});

test('without the workbook the chart has no externalData reference (cached values only)', () => {
  const out = translatePieToChart(pie('pie\n  "A" : 1'), 'x');
  assert.doesNotMatch(out.chartXml, /externalData/);
  assert.equal(out.hasWorkbook, false);
});

test('the frame references a placeholder, never a real relationship id', () => {
  const out = translatePieToChart(pie('pie\n  "A" : 1'), 'id-1');
  assert.match(out.paragraphXml, new RegExp(`r:id="${CHART_PLACEHOLDER_PREFIX}id-1"`));
  assert.match(out.paragraphXml, /drawingml\/2006\/chart/);
});

test('user text is XML-escaped everywhere it lands (rule #2)', () => {
  const hostile = '"</c:v><c:evil/>&\'';
  const out = translatePieToChart(
    { title: 'T <&> "q"', showData: false, slices: [{ label: hostile, value: 3 }] },
    'id',
  );
  assert.equal(balanced(out.chartXml), true);
  assert.doesNotMatch(out.chartXml, /<c:evil/);
  assert.match(out.chartXml, /T &lt;&amp;&gt; &quot;q&quot;/);
  assert.equal(out.workbook.rows[0]?.[0], hostile); // raw data stays raw; the workbook builder escapes it
});

test('an untitled pie deletes the automatic title; showData adds value labels', () => {
  const plain = translatePieToChart(pie('pie\n  "A" : 1'), 'x');
  assert.match(plain.chartXml, /<c:autoTitleDeleted val="1"\/>/);
  assert.match(plain.chartXml, /<c:showVal val="0"\/>/);
  const shown = translatePieToChart(pie('pie showData\n  title T\n  "A" : 1'), 'x');
  assert.match(shown.chartXml, /<c:autoTitleDeleted val="0"\/>/);
  assert.match(shown.chartXml, /<c:showVal val="1"\/>/);
});

test('the drawing is scaled down to a caller-supplied cap, never up', () => {
  const small = translatePieToChart(pie('pie\n  "A" : 1'), 'x', { maxDrawingCx: 2_000_000, maxDrawingCy: 9_000_000 });
  const cx = Number(/<wp:extent cx="(\d+)"/.exec(small.paragraphXml)?.[1]);
  assert.ok(cx <= 2_000_000);
  const big = translatePieToChart(pie('pie\n  "A" : 1'), 'x', { maxDrawingCx: 99_000_000, maxDrawingCy: 99_000_000 });
  assert.equal(Number(/<wp:extent cx="(\d+)"/.exec(big.paragraphXml)?.[1]), 5486400);
});

test('rejects an unsafe chart id and an empty pie', () => {
  assert.throws(() => translatePieToChart(pie('pie\n  "A" : 1'), 'a"b'), RangeError);
  assert.throws(() => translatePieToChart({ showData: false, slices: [] }, 'x'), RangeError);
});
