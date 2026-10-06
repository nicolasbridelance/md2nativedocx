import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';
import { generateSmartArt } from '../../src/smartart/dispatch.js';
import { generateDeepTree, TREE_DEEP_LAYOUT_XML } from '../../src/smartart/tree-deep.js';

const SAMPLE = [
  'graph TD',
  '  R[Racine] --> A[Branche A]',
  '  R --> B[Branche B]',
  '  A --> A1[Enfant A1]',
  '  A --> A2[Enfant A2]',
  '  B --> B1[Enfant B1]',
  '  B1 --> B1x[Petit-enfant]',
].join('\n');

function deep(mermaid: string, options = {}) {
  const { ast } = parseMermaid(mermaid);
  return generateDeepTree(ast, options);
}

/** `dsp:sp` rectangles of the cached drawing: [modelId, x, y, cx, cy, isConnector]. */
function rects(drawingXml: string) {
  return [...drawingXml.matchAll(/<dsp:sp modelId="(\d+)">.*?<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>.*?<\/dsp:sp>/gs)].map((m) => ({
    id: m[1]!,
    x: Number(m[2]),
    y: Number(m[3]),
    cx: Number(m[4]),
    cy: Number(m[5]),
    connector: m[0].includes('<a:custGeom>'),
  }));
}

/** Tag-balance check (the validator caught a mismatched close once; unit tests had not). */
function assertBalanced(xml: string): void {
  const stack: string[] = [];
  for (const m of xml.replace(/^<\?xml[^?]*\?>/, '').matchAll(/<(\/?)([A-Za-z0-9:_-]+)(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/g)) {
    if (m[3] === '/') continue;
    if (m[1] === '/') assert.equal(stack.pop(), m[2], `mismatched </${m[2]}>`);
    else stack.push(m[2]!);
  }
  assert.deepEqual(stack, []);
}

test('every generated part is well-formed', () => {
  const out = deep(SAMPLE, { drawing: true });
  for (const part of [out.dataXml, out.layoutXml, out.colorsXml, out.styleXml, out.drawingXml ?? '']) assertBalanced(part);
});

test('layoutDef recurses through ref="repeat"', () => {
  assert.ok(TREE_DEEP_LAYOUT_XML.includes('<dgm:forEach name="repeatAgain" ref="repeat"/>'));
  assert.ok(TREE_DEEP_LAYOUT_XML.includes('type="hierRoot"') && TREE_DEEP_LAYOUT_XML.includes('type="hierChild"'));
  assert.ok(!TREE_DEEP_LAYOUT_XML.includes('TargetMode'));
});

test('data model: one content point, one box and one connector per node, ids unique', () => {
  const out = deep(SAMPLE);
  const ids = [...out.dataXml.matchAll(/modelId="(\d+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal((out.dataXml.match(/presName="level1Main"/g) ?? []).length, 1);
  assert.equal((out.dataXml.match(/presName="level2Main"/g) ?? []).length, 6);
  assert.equal((out.dataXml.match(/presName="levelNConn"/g) ?? []).length, 6);
  assert.equal((out.dataXml.match(/type="parOf"|<dgm:cxn [^>]*type="parOf"/g) ?? []).length, 7); // doc->root + 6 links
});

test('every connection references a point that exists', () => {
  const out = deep(SAMPLE);
  const points = new Set([...out.dataXml.matchAll(/<dgm:pt modelId="(\d+)"/g)].map((m) => m[1]));
  for (const m of out.dataXml.matchAll(/(?:srcId|destId|parTransId|sibTransId|presAssocID)="(\d+)"/g)) {
    assert.ok(points.has(m[1]), `dangling reference ${m[1]}`);
  }
});

test('children under a node follow connector-then-node order (srcOrd 2i, 2i+1)', () => {
  const out = deep('graph TD\n  R --> A\n  R --> B\n  A --> A1\n  A --> A2');
  const orders = [...out.dataXml.matchAll(/type="presParOf" srcId="(\d+)" destId="(\d+)" srcOrd="(\d+)"/g)];
  const bySrc = new Map<string, number[]>();
  for (const m of orders) bySrc.set(m[1]!, [...(bySrc.get(m[1]!) ?? []), Number(m[3])]);
  const hierChildOrders = [...bySrc.values()].filter((o) => o.length >= 2 && o[0] === 0);
  assert.ok(hierChildOrders.some((o) => o.join() === '0,1,2,3'), 'root row: conn,node,conn,node');
});

test('escapes XML metacharacters in labels at every level', () => {
  const out = deep('graph TD\n  R["a<b & c"] --> A["x\\"y"]\n  R --> B["<script>"]\n  A --> C["it\'s & </a:t>"]', { drawing: true });
  for (const part of [out.dataXml, out.drawingXml ?? '']) {
    assert.ok(!part.includes('<script>'));
    assert.ok(!part.includes('</a:t></a:t>'));
    assert.ok(part.includes('&lt;script&gt;'));
  }
});

test('cached drawing: every shape inside the frame, siblings never overlap, parents centred over their children', () => {
  const out = deep(SAMPLE, { drawing: true });
  const shapes = rects(out.drawingXml ?? '');
  const boxes = shapes.filter((s) => !s.connector);
  assert.equal(boxes.length, 7);
  assert.equal(shapes.length - boxes.length, 6);
  for (const s of shapes) {
    assert.ok(s.x >= 0 && s.y >= 0, 'origin inside frame');
    assert.ok(s.x + s.cx <= out.frame.cx + 1 && s.y + s.cy <= out.frame.cy + 1, 'extent inside frame');
  }
  for (const a of boxes)
    for (const b of boxes) {
      if (a.id >= b.id) continue;
      const overlap = a.x < b.x + b.cx && b.x < a.x + a.cx && a.y < b.y + b.cy && b.y < a.y + a.cy;
      assert.ok(!overlap, `boxes ${a.id} and ${b.id} overlap`);
    }
  // Root is the first box and sits centred above the whole tree.
  const root = boxes[0]!;
  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.cx));
  assert.ok(Math.abs(root.x + root.cx / 2 - (left + right) / 2) < root.cx, 'root roughly centred');
});

test('space follows the subtree shape: a branch with two leaves is wider than a lone leaf', () => {
  const out = deep('graph TD\n  R --> A\n  R --> B\n  A --> A1\n  A --> A2', { drawing: true });
  const boxes = rects(out.drawingXml ?? '').filter((s) => !s.connector);
  const [, a, a1, a2, b] = boxes as [(typeof boxes)[0], (typeof boxes)[0], (typeof boxes)[0], (typeof boxes)[0], (typeof boxes)[0]];
  // A sits midway between its two children; B (a leaf) is pushed right of A's whole subtree.
  assert.ok(Math.abs(a.x + a.cx / 2 - (a1.x + a1.cx / 2 + a2.x + a2.cx / 2) / 2) < 2);
  assert.ok(b.x >= a2.x + a2.cx, 'B clears A2');
});

test('frame height is sized to the number of levels', () => {
  const three = deep('graph TD\n  R --> A\n  R --> B\n  A --> A1', { drawing: true });
  const four = deep('graph TD\n  R --> A\n  R --> B\n  A --> A1\n  A1 --> A2', { drawing: true });
  assert.ok(four.frame.cy > three.frame.cy);
  assert.ok(four.frame.cy <= 4572000);
});

test('edge labels fold into the destination box text', () => {
  const out = deep('graph TD\n  R --> A\n  R --> B\n  A -->|oui| C', { drawing: true });
  assert.ok(out.dataXml.includes('oui : C'));
});

test('look profiles change the colour/style parts, not the topology', () => {
  const simple = deep(SAMPLE, { drawing: true });
  const intense = deep(SAMPLE, { drawing: true, style: 'intense' });
  assert.notEqual(simple.colorsXml, intense.colorsXml);
  assert.ok(intense.drawingXml?.includes('gradFill'));
  assert.equal(simple.dataXml, intense.dataXml);
});

test('no drawing unless requested, and no external relationships ever', () => {
  const out = deep(SAMPLE);
  assert.equal(out.drawingXml, undefined);
  for (const xml of [out.dataXml, out.layoutXml, out.colorsXml, out.styleXml, deep(SAMPLE, { drawing: true }).drawingXml ?? '']) {
    assert.ok(!xml.includes('TargetMode'));
  }
});

test('dispatch reaches the multi-level generator and passes the frame through', () => {
  const { ast } = parseMermaid(SAMPLE);
  const out = generateSmartArt(ast, { drawing: true });
  assert.equal(out?.layout, 'tree');
  assert.deepEqual(out?.frame, generateDeepTree(ast, { drawing: true }).frame);
});
