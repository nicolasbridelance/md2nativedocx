import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';
import { generateSmartArt } from '../../src/smartart/dispatch.js';
import { nodeGeom, presSpPrXml } from '../../src/smartart/node-shape.js';

const flow = (src: string) => parseMermaid(src).ast;

test('plain boxes keep the layout shape; other Mermaid shapes map to their Word preset', () => {
  const fc = flow('flowchart LR\n  A[a] --> B(b) --> C([c]) --> D{d} --> E((e)) --> F[(f)] --> G{{g}}');
  assert.deepEqual(fc.nodes.map(nodeGeom), [undefined, undefined, undefined, 'diamond', 'ellipse', 'can', 'hexagon']);
  assert.equal(presSpPrXml(undefined), '<dgm:spPr/>');
  assert.equal(presSpPrXml('diamond'), '<dgm:spPr><a:prstGeom prst="diamond"><a:avLst/></a:prstGeom></dgm:spPr>');
});

test('the override sits on the box presentation point (as Word writes Change Shape), and the drawing draws it', () => {
  for (const src of [
    'flowchart LR\n  A[a] --> B{b} --> C((c))',
    'flowchart LR\n  A{a} --> B((b)) --> C[c] --> A',
    'flowchart TD\n  R{{r}} --> A{a}\n  R --> B[b]',
    'flowchart TD\n  R[r] --> A{a}\n  A --> B((b))',
  ]) {
    const out = generateSmartArt(flow(src), { drawing: true });
    assert.ok(out, src);
    const presWithGeom = [...out.dataXml.matchAll(/<dgm:pt modelId="[^"]+" type="pres">(?:(?!<\/dgm:pt>).)*<a:prstGeom prst="(\w+)"/g)].map((m) => m[1]);
    const contentWithGeom = [...out.dataXml.matchAll(/<dgm:pt modelId="[^"]+">(?:(?!<\/dgm:pt>).)*<a:prstGeom/g)];
    assert.ok(presWithGeom.length >= 1, `${out.layout}: override on a presentation point`);
    assert.equal(contentWithGeom.length, 0, `${out.layout}: never on the content point`);
    for (const prst of presWithGeom) assert.ok(out.drawingXml?.includes(`<a:prstGeom prst="${prst}">`), `${out.layout}: drawing draws ${prst}`);
  }
});

test('a flowchart of plain boxes is unchanged: no shape override anywhere', () => {
  const out = generateSmartArt(flow('flowchart LR\n  A[a] --> B(b) --> C[c]'), { drawing: true });
  assert.ok(!out?.dataXml.includes('prstGeom'));
});

test('a diamond gets a font small enough for its half-width text area (no word broken in the cached drawing)', () => {
  const size = (src: string) => {
    const out = generateSmartArt(flow(src), { drawing: true });
    return Math.min(...[...(out?.drawingXml ?? '').matchAll(/ sz="(\d+)"/g)].map((m) => Number(m[1])));
  };
  const circle = size('flowchart LR\n  A([Idea]) --> B[Draft] --> C((Review)) --> D[(Archive)]');
  const diamond = size('flowchart LR\n  A([Idea]) --> B[Draft] --> C{Review} --> D[(Archive)]');
  assert.ok(diamond < circle, `diamond ${diamond} < circle ${circle}`);
});
