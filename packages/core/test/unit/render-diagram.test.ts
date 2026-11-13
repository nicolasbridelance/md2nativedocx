import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDiagram, type RenderOptions } from '../../src/render-diagram.js';

/** Sequential part ids, for assertions that do not depend on random UUIDs. */
function counter(): () => string {
  let n = 0;
  return () => `id${++n}`;
}

const ON: RenderOptions = { smartArt: true, nativeCharts: true };

test('defaults: SmartArt and charts off, self-contained shapes, no parts', () => {
  for (const src of ['graph LR\n  A --> B --> C', 'pie\n  "A" : 1\n  "B" : 2', 'mindmap\n  root\n    a\n    b']) {
    const result = renderDiagram(src);
    assert.equal(result.kind, 'shapes');
    assert.deepEqual(result.parts, []);
    assert.ok(!result.fragment.includes('PLACEHOLDER'), src);
  }
});

test('flowchart chain with SmartArt on: one SmartArt part, its placeholders in the fragment and data part', () => {
  const result = renderDiagram('graph LR\n  A --> B --> C', { ...ON, newPartId: counter() });
  assert.equal(result.kind, 'smartart');
  assert.equal(result.parts.length, 1);
  const part = result.parts[0]!;
  assert.equal(part.kind, 'smartart');
  assert.equal(part.id, 'id1');
  for (const rel of ['dm', 'lo', 'qs', 'cs']) assert.ok(result.fragment.includes(`SMARTART_PLACEHOLDER:id1:${rel}`), rel);
  if (part.kind !== 'smartart') return;
  assert.ok(part.dataXml.includes('SMARTART_PLACEHOLDER:id1:dr'));
  assert.ok(!part.dataXml.includes('SMARTART_DRAWING_REL'), 'the generator token is replaced');
  assert.ok(part.drawingXml?.includes('dsp:drawing'), 'drawing on by default');
  assert.deepEqual(result.metadata, { diagramType: 'flowchart', label: 'Flowchart', warnings: [] });
});

test('smartArtDrawing: false leaves the drawing part out', () => {
  const part = renderDiagram('graph LR\n  A --> B --> C', { smartArt: true, smartArtDrawing: false }).parts[0];
  assert.equal(part?.kind, 'smartart');
  assert.equal(part?.kind === 'smartart' ? part.drawingXml : 'x', undefined);
});

test('an unknown SmartArt style falls back to the default instead of failing', () => {
  const src = 'graph LR\n  A --> B --> C';
  const bogus = renderDiagram(src, { smartArt: true, smartArtStyle: 'nope' as never, newPartId: counter() });
  const colorful = renderDiagram(src, { smartArt: true, smartArtStyle: 'colorful', newPartId: counter() });
  assert.deepEqual(bogus, colorful);
});

test('a merge stays shapes with SmartArt on, with the fallback note under it; no note when SmartArt is off', () => {
  const src = 'graph TD\n  A --> B\n  A --> C\n  B --> D\n  C --> D';
  const on = renderDiagram(src, ON);
  assert.equal(on.kind, 'shapes');
  assert.deepEqual(on.parts, []);
  const off = renderDiagram(src);
  assert.ok(on.fragment.startsWith(off.fragment + '\n<w:p'), 'shapes, then the note paragraph');
});

test('timeline as SmartArt: the title goes in a paragraph above, escaped', () => {
  const result = renderDiagram('timeline\n  title Q1 & <Q2>\n  2024 : a\n  2025 : b', ON);
  assert.equal(result.kind, 'smartart');
  assert.ok(result.fragment.startsWith('<w:p><w:pPr><w:jc w:val="center"/>'));
  assert.ok(result.fragment.includes('Q1 &amp; &lt;Q2&gt;'));
  assert.ok(!result.fragment.includes('<Q2>'));
});

test('pie with charts on: one chart part referenced by CHART_PLACEHOLDER', () => {
  const result = renderDiagram('pie\n  "A" : 1\n  "B" : 2', { nativeCharts: true, newPartId: counter() });
  assert.equal(result.kind, 'chart');
  assert.ok(result.fragment.includes('CHART_PLACEHOLDER:id1'));
  const part = result.parts[0];
  assert.equal(part?.kind, 'chart');
  if (part?.kind !== 'chart') return;
  assert.ok(part.chartXml.includes('c:pieChart'));
  assert.equal(part.hasWorkbook, true);
  assert.deepEqual(part.workbook.rows.map((r) => r[0]), ['A', 'B']);
});

test('nativeCharts as a list only charts the listed types', () => {
  assert.equal(renderDiagram('pie\n  "A" : 1', { nativeCharts: ['pie'] }).kind, 'chart');
  assert.equal(renderDiagram('radar-beta\n  axis a, b, c\n  curve x{1, 2, 3}', { nativeCharts: ['pie'] }).kind, 'shapes');
});

test('a chart Word cannot draw falls back to shapes with a warning, never an error', () => {
  const result = renderDiagram('xychart-beta horizontal\n  x-axis [a]\n  bar [1]\n  line [2]', ON);
  assert.equal(result.kind, 'shapes');
  assert.deepEqual(result.parts, []);
  assert.equal(result.metadata.warnings.length, 1);
  assert.match(result.metadata.warnings[0]!, /^native chart not used, drawn as shapes instead: /);
});

test('parser warnings reach metadata.warnings, without a prefix', () => {
  const result = renderDiagram('stateDiagram-v2\n  A --> B\n  note right of A : hi');
  assert.ok(result.metadata.warnings.some((w) => w.startsWith('Notes are not yet supported for state diagrams')));
  assert.ok(result.metadata.warnings.every((w) => !w.startsWith('md2nativedocx')));
});

test('maxDrawingCx caps the drawing width', () => {
  const src = 'graph LR\n  A --> B --> C --> D --> E --> F --> G --> H';
  const extent = (xml: string): number => Number(/<wp:extent cx="(\d+)"/.exec(xml)?.[1]);
  const narrow = renderDiagram(src, { maxDrawingCx: 2_000_000 });
  assert.ok(extent(narrow.fragment) <= 2_000_000);
  assert.ok(extent(renderDiagram(src).fragment) > 2_000_000);
});

test('every one of the 29 types renders through the same call', () => {
  const samples: Record<string, string> = {
    sequence: 'sequenceDiagram\n  A->>B: hi',
    class: 'classDiagram\n  class A',
    er: 'erDiagram\n  A ||--o{ B : has',
    gantt: 'gantt\n  dateFormat YYYY-MM-DD\n  section S\n  t :2024-01-01, 3d',
    quadrant: 'quadrantChart\n  Point A: [0.3, 0.6]',
    c4: 'C4Context\n  Person(a, "A")',
    sankey: 'sankey-beta\n  a,b,1',
    packet: 'packet-beta\n  0-7: "x"',
    block: 'block-beta\n  a b',
    zenuml: 'zenuml\n  A.call()',
  };
  for (const [type, src] of Object.entries(samples)) {
    const result = renderDiagram(src, ON);
    assert.equal(result.metadata.diagramType, type);
    assert.ok(result.fragment.startsWith('<w:p'), type);
  }
});

test('a part id outside the safe alphabet is refused, not written into XML', () => {
  assert.throws(() => renderDiagram('pie\n  "A" : 1', { nativeCharts: true, newPartId: () => 'a"b' }), RangeError);
  assert.throws(() => renderDiagram('graph LR\n  A --> B', { smartArt: true, newPartId: () => 'x/../y' }), RangeError);
  // Not called when nothing needs a part.
  assert.equal(renderDiagram('graph LR\n  A --> B', { newPartId: () => 'a"b' }).kind, 'shapes');
});

test('injection: XML metacharacters in labels never reach the output raw, in shapes or in SmartArt parts', () => {
  const evil = `x" onload='1' <b>&amp;</b> ]]>`;
  for (const options of [{}, ON]) {
    const result = renderDiagram(`graph LR\n  A["${evil.replace(/"/g, '#quot;')}"] --> B["<script>"]`, options);
    const all = [result.fragment, ...result.parts.flatMap((p) => (p.kind === 'smartart' ? [p.dataXml, p.drawingXml ?? ''] : [p.chartXml]))];
    for (const xml of all) {
      assert.ok(!xml.includes('<script>'));
      assert.ok(!xml.includes('<b>'));
      assert.ok(!xml.includes('TargetMode'), 'no external relationship');
    }
  }
  const pie = renderDiagram('pie\n  "<a href=x>" : 1\n  "B & C" : 2', ON);
  const chart = pie.parts[0];
  assert.ok(chart?.kind === 'chart' && !chart.chartXml.includes('<a href') && chart.chartXml.includes('B &amp; C'));
});
