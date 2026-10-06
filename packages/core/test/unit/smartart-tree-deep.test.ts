import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';
import { generateSmartArt } from '../../src/smartart/dispatch.js';
import { deepTreeLayout, generateDeepTree, TREE_DEEP_LAYOUT_XML } from '../../src/smartart/tree-deep.js';

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

const DIRECTIONS = ['TD', 'LR', 'BT', 'RL'] as const;

test('each direction gets its own layoutDef URN, with the direction parameters substituted', () => {
  const expected = {
    TD: { urn: 'tree-deep1"', begEnd: ['bCtr', 'tCtr'], hierAlign: undefined },
    LR: { urn: 'tree-deep1-lr"', begEnd: ['rCtr', 'lCtr'], hierAlign: 'lCtrCh' },
    BT: { urn: 'tree-deep1-bt"', begEnd: ['tCtr', 'bCtr'], hierAlign: 'bCtrCh' },
    RL: { urn: 'tree-deep1-rl"', begEnd: ['lCtr', 'rCtr'], hierAlign: 'rCtrCh' },
  };
  for (const dir of DIRECTIONS) {
    const { layoutXml, layoutUrn } = deepTreeLayout(dir);
    const e = expected[dir];
    assert.ok(layoutXml.includes(`uniqueId="${layoutUrn}"`) && layoutXml.includes(e.urn), dir);
    assert.ok(layoutXml.includes(`<dgm:param type="begPts" val="${e.begEnd[0]}"/><dgm:param type="endPts" val="${e.begEnd[1]}"/>`), dir);
    if (e.hierAlign) {
      // Both hierRoot nodes and all three hierChild nodes carry the direction.
      assert.equal(layoutXml.split(`<dgm:param type="hierAlign" val="${e.hierAlign}"/>`).length - 1, 2, dir);
      assert.equal(layoutXml.split('type="chAlign"').length - 1, 3, dir);
      assert.ok(!layoutXml.includes('<dgm:alg type="hierRoot"/>'), dir);
    }
    assertBalanced(layoutXml);
    const { ast } = parseMermaid(`graph ${dir}\n  R --> A\n  R --> B\n  A --> A1`);
    assert.ok(generateDeepTree(ast).dataXml.includes(`loTypeId="${layoutUrn}"`), dir);
  }
});

test('cached drawing in every direction: inside the frame, no overlap, root on the expected side', () => {
  for (const dir of DIRECTIONS) {
    const out = deep(SAMPLE.replace('graph TD', `graph ${dir}`), { drawing: true });
    const shapes = rects(out.drawingXml ?? '');
    const boxes = shapes.filter((s) => !s.connector);
    assert.equal(boxes.length, 7, dir);
    for (const s of shapes) {
      assert.ok(s.x >= 0 && s.y >= 0, `${dir}: origin inside frame`);
      assert.ok(s.x + s.cx <= out.frame.cx + 1 && s.y + s.cy <= out.frame.cy + 1, `${dir}: extent inside frame`);
    }
    for (const a of boxes)
      for (const b of boxes) {
        if (a.id >= b.id) continue;
        assert.ok(!(a.x < b.x + b.cx && b.x < a.x + a.cx && a.y < b.y + b.cy && b.y < a.y + a.cy), `${dir}: ${a.id}/${b.id} overlap`);
      }
    const root = boxes[0]!;
    const others = boxes.slice(1);
    const side = {
      TD: others.every((b) => b.y > root.y),
      BT: others.every((b) => b.y < root.y),
      LR: others.every((b) => b.x > root.x),
      RL: others.every((b) => b.x < root.x),
    }[dir];
    assert.ok(side, `${dir}: root first along the flow`);
  }
});

test('a very wide tree still fits the frame, with a small font never below 8 pt', () => {
  // Left-to-right: no compact layout there, so 24 leaves down a 5 in frame get small boxes.
  const leaves = Array.from({ length: 24 }, (_, i) => `${i % 2 ? 'B' : 'S'} --> L${i}[Organisation ${i}]`).join('\n  ');
  const out = deep(`graph LR\n  A --> B\n  A --> S\n  ${leaves}`, { drawing: true });
  for (const s of rects(out.drawingXml ?? '')) assert.ok(s.y + s.cy <= out.frame.cy + 1, 'inside frame');
  const sizes = [...(out.drawingXml ?? '').matchAll(/ sz="(\d+)"/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 0 && sizes.every((sz) => sz >= 800 && sz <= 1200), `font between 8 and 12 pt: ${sizes[0]}`);
});

const WIDE = [
  'graph TD',
  '  R[Groupe] --> A[Filiale A]',
  '  R --> B[Filiale B]',
  '  R --> C[Filiale C]',
  '  R --> D[Filiale D]',
  ...['A', 'B', 'C', 'D'].map((p) => `  ${p} --> ${p}1[Ventes] & ${p}2[Achats] & ${p}3[RH] & ${p}4[IT]`),
].join('\n');

test('compact (org-chart) layout: chosen for a wide top-down tree only', () => {
  assert.ok(deep(WIDE).layoutXml.includes('tree-deep1-compact'));
  assert.ok(!deep(SAMPLE).layoutXml.includes('compact'), 'a small tree keeps the validated layout');
  assert.ok(!deep(WIDE.replace('graph TD', 'graph LR')).layoutXml.includes('compact'), 'top-down only');
  const { layoutXml } = deep(WIDE);
  assertBalanced(layoutXml);
  assert.equal((layoutXml.match(/<dgm:choose /g) ?? []).length, 3);
  assert.ok(layoutXml.includes('<dgm:param type="endPts" val="midL"/>'));
  assert.ok(layoutXml.includes('<dgm:param type="hierAlign" val="tL"/>'));
});

test('compact drawing: leaves stacked in an indented column, boxes much wider, nothing overlaps', () => {
  const compact = deep(WIDE, { drawing: true });
  const boxes = rects(compact.drawingXml ?? '').filter((s) => !s.connector);
  assert.equal(boxes.length, 21);
  // Preorder: root, A, A1..A4, B, ... -> A's four leaves share one x, indented from A, one below the other.
  const [, a, a1, a2, a3, a4] = boxes as [(typeof boxes)[0], (typeof boxes)[0], (typeof boxes)[0], (typeof boxes)[0], (typeof boxes)[0], (typeof boxes)[0]];
  for (const leaf of [a2, a3, a4]) assert.equal(leaf.x, a1.x);
  assert.ok(a1.x > a.x + a.cx / 2, 'column starts right of the parent centre');
  assert.ok(a1.y > a.y && a2.y > a1.y && a3.y > a2.y && a4.y > a3.y);
  assert.ok(a.cx > 700000, 'boxes ~2 cm wide, against ~7 mm in the row layout');
  for (const s of rects(compact.drawingXml ?? '')) {
    assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.cx <= compact.frame.cx + 1 && s.y + s.cy <= compact.frame.cy + 1, 'inside frame');
  }
  for (const p of boxes)
    for (const q of boxes) {
      if (p.id >= q.id) continue;
      assert.ok(!(p.x < q.x + q.cx && q.x < p.x + p.cx && p.y < q.y + q.cy && q.y < p.y + p.cy), `${p.id}/${q.id} overlap`);
    }
  // The data model is the same shape whichever layout is chosen.
  assert.equal((compact.dataXml.match(/presName="levelNConn"/g) ?? []).length, 20);
});
