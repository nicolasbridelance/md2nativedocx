import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';
import { generateSmartArt } from '../../src/smartart/dispatch.js';
import { DRAWING_FRAME, DRAWING_REL_TOKEN } from '../../src/smartart/drawing.js';

const flow = (text: string) => parseMermaid(text).ast;

const CASES: Array<[string, string]> = [
  ['chain LR', 'flowchart LR\n A[Idée] --> B[Proto] --> C[Test]'],
  ['chain TD', 'flowchart TD\n A[Idée] --> B[Proto] --> C[Test]'],
  ['chain RL', 'flowchart RL\n A[Idée] --> B[Proto] --> C[Test]'],
  ['chain BT', 'flowchart BT\n A[Idée] --> B[Proto] --> C[Test]'],
  ['tree TD', 'flowchart TD\n R[Projet] --> A[Un]\n R --> B[Deux]\n R --> C[Trois]'],
  ['tree LR', 'flowchart LR\n R[Projet] --> A[Un]\n R --> B[Deux]\n R --> C[Trois]'],
  ['tree BT', 'flowchart BT\n R[Projet] --> A[Un]\n R --> B[Deux]'],
  ['tree RL', 'flowchart RL\n R[Projet] --> A[Un]\n R --> B[Deux]'],
  ['cycle', 'flowchart TD\n A[A] --> B[B]\n B --> C[C]\n C --> D[D]\n D --> A'],
];

function presModelIds(dataXml: string): Set<string> {
  return new Set([...dataXml.matchAll(/<dgm:pt modelId="(\d+)" type="pres"/g)].map((m) => m[1] as string));
}

for (const [name, src] of CASES) {
  test(`${name}: the drawing's shapes reference presentation points and stay inside the frame`, () => {
    const out = generateSmartArt(flow(src), { drawing: true });
    assert.ok(out?.drawingXml, 'a drawing is produced');
    const pres = presModelIds(out.dataXml);
    const shapeIds = [...out.drawingXml.matchAll(/<dsp:sp modelId="(\d+)"/g)].map((m) => m[1] as string);
    assert.ok(shapeIds.length >= 3);
    for (const id of shapeIds) assert.ok(pres.has(id), `dsp:sp ${id} must be a presentation point`);
    assert.equal(new Set(shapeIds).size, shapeIds.length, 'one shape per presentation point');
    for (const m of out.drawingXml.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)) {
      const [x, y, cx, cy] = m.slice(1).map(Number) as [number, number, number, number];
      assert.ok(x >= 0 && y >= 0 && x + cx <= DRAWING_FRAME.cx + 2 && y + cy <= DRAWING_FRAME.cy + 2, `shape outside frame: ${m[0]}`);
    }
    assert.ok(out.dataXml.includes(DRAWING_REL_TOKEN), 'the data model points at its drawing through a placeholder');
  });
}

test('without the drawing option nothing changes: no drawing part and no dataModelExt', () => {
  const out = generateSmartArt(flow(CASES[0]![1]));
  assert.equal(out?.drawingXml, undefined);
  assert.ok(!out?.dataXml.includes('dataModelExt'));
  assert.ok(!out?.dataXml.includes(DRAWING_REL_TOKEN));
});

test('node text is XML-escaped in the drawing (rule #2) and a light fill gets dark text', () => {
  const out = generateSmartArt(
    flow('flowchart LR\n A["a & <b>"] --> B[B] --> C[C]\n style A fill:#FFE0B2'),
    { drawing: true },
  );
  assert.ok(out?.drawingXml);
  assert.match(out.drawingXml, /a &amp; &lt;b&gt;/);
  assert.doesNotMatch(out.drawingXml, /<b>/);
  assert.match(out.drawingXml, /<a:srgbClr val="FFE0B2"\/>/);
  assert.match(out.drawingXml, /<a:fontRef idx="minor"><a:schemeClr val="dk1"\/>/);
});

test('a chain draws one transition arrow per gap, pointing the way the chain runs', () => {
  const lr = generateSmartArt(flow('flowchart LR\n A --> B --> C'), { drawing: true });
  assert.equal(lr?.drawingXml?.match(/prst="rightArrow"/g)?.length, 2);
  const bt = generateSmartArt(flow('flowchart BT\n A --> B --> C'), { drawing: true });
  assert.equal(bt?.drawingXml?.match(/prst="upArrow"/g)?.length, 2);
});

// ---- look profiles (styles.ts) ----

test('simple (the default) keeps the original flat single-accent definitions', () => {
  const plain = generateSmartArt(flow('flowchart LR\n A --> B --> C'));
  const simple = generateSmartArt(flow('flowchart LR\n A --> B --> C'), { style: 'simple' });
  assert.equal(simple?.colorsXml, plain?.colorsXml);
  assert.equal(simple?.styleXml, plain?.styleXml);
  assert.doesNotMatch(plain?.colorsXml ?? '', /meth="repeat"/);
});

for (const kind of ['chain', 'tree', 'cycle'] as const) {
  const src = {
    chain: 'flowchart LR\n A --> B --> C',
    tree: 'flowchart TD\n R --> A\n R --> B\n R --> C',
    cycle: 'flowchart TD\n A --> B\n B --> C\n C --> A',
  }[kind];
  test(`${kind}: colorful cycles the theme accents; ids match the references in the data model`, () => {
    const out = generateSmartArt(flow(src), { style: 'colorful' });
    assert.ok(out);
    assert.match(out.colorsXml, /<dgm:fillClrLst meth="repeat"><a:schemeClr val="accent[2-6]"\/>/);
    assert.match(out.colorsXml, /<dgm:linClrLst meth="repeat"><a:schemeClr val="lt1"\/>/);
    const csId = /csTypeId="([^"]+)"/.exec(out.dataXml)?.[1];
    const qsId = /qsTypeId="([^"]+)"/.exec(out.dataXml)?.[1];
    assert.ok(out.colorsXml.includes(`uniqueId="${csId}"`));
    assert.ok(out.styleXml.includes(`uniqueId="${qsId}"`));
  });
}

test('intense points the style labels at the theme gradient fill and shadow, colorful does not', () => {
  const intense = generateSmartArt(flow('flowchart LR\n A --> B --> C'), { style: 'intense' });
  assert.match(intense?.styleXml ?? '', /<a:fillRef idx="3">/);
  assert.match(intense?.styleXml ?? '', /<a:effectRef idx="2">/);
  const colorful = generateSmartArt(flow('flowchart LR\n A --> B --> C'), { style: 'colorful' });
  assert.doesNotMatch(colorful?.styleXml ?? '', /<a:fillRef idx="3">/);
});

test('the cached drawing follows the profile: accents per shape, gradient and shadow only for intense', () => {
  const src = 'flowchart LR\n A --> B --> C';
  const simple = generateSmartArt(flow(src), { drawing: true });
  assert.match(simple?.drawingXml ?? '', /<a:schemeClr val="accent1">/);
  assert.doesNotMatch(simple?.drawingXml ?? '', /gradFill|outerShdw/);
  const colorful = generateSmartArt(flow(src), { drawing: true, style: 'colorful' });
  const accents = new Set([...(colorful?.drawingXml ?? '').matchAll(/<a:solidFill><a:schemeClr val="(accent\d)"/g)].map((m) => m[1]));
  assert.ok(accents.size >= 3, `several accents expected, got ${[...accents].join(',')}`);
  assert.doesNotMatch(colorful?.drawingXml ?? '', /gradFill|outerShdw/);
  const intense = generateSmartArt(flow(src), { drawing: true, style: 'intense' });
  assert.match(intense?.drawingXml ?? '', /<a:gradFill/);
  assert.match(intense?.drawingXml ?? '', /<a:outerShdw/);
});
