import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { parseMermaid } from '../../src/parser/index.js';
import { classifyTopology } from '../../src/smartart/classify.js';
import {
  generateTree,
  TREE_LAYOUT_XML,
  TREE_LAYOUT_XML_LR,
  TREE_LAYOUT_XML_BT,
  TREE_LAYOUT_XML_RL,
  TREE_COLORS_XML,
  TREE_STYLE_XML,
} from '../../src/smartart/tree.js';

// Same minimal well-formedness check as smartart-chain.test.ts.
function assertWellFormedXml(xmlWithProlog: string): void {
  const xml = xmlWithProlog.replace(/^<\?xml[^?]*\?>/, '');
  const stack: string[] = [];
  const re = /<(\/?)([A-Za-z0-9:_-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[0].startsWith('<')) {
      const closing = m[1] === '/';
      const selfClosing = m[4] === '/';
      const name = m[2]!;
      if (selfClosing) continue;
      if (closing) {
        const top = stack.pop();
        assert.equal(top, name, `mismatched closing tag </${name}>`);
      } else {
        stack.push(name);
      }
    } else {
      assert.ok(!m[5]!.includes('<'), 'raw < in text content');
      assert.ok(!m[5]!.includes('>'), 'raw > in text content');
    }
  }
  assert.equal(stack.length, 0, 'unclosed tags remain');
}

function treeFlowchart(mermaid: string) {
  const { ast } = parseMermaid(mermaid);
  const classification = classifyTopology(ast);
  assert.equal(classification.eligible, true);
  if (classification.eligible) assert.equal(classification.layout, 'tree');
  return ast;
}

test('generates well-formed XML for all four parts', () => {
  const ast = treeFlowchart('graph TD\n  A --> B\n  A --> C');
  const out = generateTree(ast);
  assertWellFormedXml(out.dataXml);
  assertWellFormedXml(out.layoutXml);
  assertWellFormedXml(out.colorsXml);
  assertWellFormedXml(out.styleXml);
});

test('layout/colors/style are the fixed, diagram-independent constants', () => {
  const a = generateTree(treeFlowchart('graph TD\n  A --> B\n  A --> C'));
  const b = generateTree(treeFlowchart('graph TD\n  X --> Y\n  X --> Z\n  X --> W'));
  assert.equal(a.layoutXml, TREE_LAYOUT_XML);
  assert.equal(a.colorsXml, TREE_COLORS_XML);
  assert.equal(a.styleXml, TREE_STYLE_XML);
  assert.equal(a.layoutXml, b.layoutXml);
  assert.equal(a.colorsXml, b.colorsXml);
  assert.equal(a.styleXml, b.styleXml);
});

test('flowchart.direction picks the vertical (root-on-top) or horizontal (root-on-left) variant', () => {
  // Before this, tree.ts never read flowchart.direction at all -- every tree
  // rendered root-on-top regardless of the Mermaid source's TD/LR
  // (docs/markdown-mermaid-compliance-table.md). Verified by rendering the
  // substituted XML under headless LibreOffice this session, not just this
  // structural assertion.
  const td = generateTree(treeFlowchart('graph TD\n  A --> B\n  A --> C'));
  const lr = generateTree(treeFlowchart('graph LR\n  A --> B\n  A --> C'));
  assert.equal(td.layoutXml, TREE_LAYOUT_XML);
  assert.equal(lr.layoutXml, TREE_LAYOUT_XML_LR);
  assert.ok(!td.layoutXml.includes('linDir'), 'vertical variant uses the format default, no explicit linDir');
  assert.ok(lr.layoutXml.includes('<dgm:param type="linDir" val="fromT"/>'));
  assert.ok(lr.dataXml.includes(TREE_LAYOUT_XML_LR.match(/uniqueId="([^"]+)"/)![1]!), 'data must reference the LR layout URN, not the TD one');
});

test('flowchart.direction also picks the BT (root-on-bottom) / RL (root-on-right) variants', () => {
  const bt = generateTree(treeFlowchart('graph BT\n  A --> B\n  A --> C'));
  const rl = generateTree(treeFlowchart('graph RL\n  A --> B\n  A --> C'));
  assert.equal(bt.layoutXml, TREE_LAYOUT_XML_BT);
  assert.equal(rl.layoutXml, TREE_LAYOUT_XML_RL);
  assert.ok(!bt.layoutXml.includes('linDir'), 'BT only flips the vertical split, no explicit linDir needed');
  assert.ok(rl.layoutXml.includes('<dgm:param type="linDir" val="fromT"/>'), 'RL inherits LR\'s vertical child stacking');
  assert.ok(bt.dataXml.includes(TREE_LAYOUT_XML_BT.match(/uniqueId="([^"]+)"/)![1]!));
  assert.ok(rl.dataXml.includes(TREE_LAYOUT_XML_RL.match(/uniqueId="([^"]+)"/)![1]!));
  assertWellFormedXml(bt.layoutXml);
  assertWellFormedXml(rl.layoutXml);
});

test('none of the fixed parts reference any Microsoft URN or real diagram content', () => {
  for (const xml of [TREE_LAYOUT_XML, TREE_LAYOUT_XML_LR, TREE_COLORS_XML, TREE_STYLE_XML]) {
    assert.ok(!xml.includes('urn:microsoft.com'), 'must not reference a Microsoft catalog URN');
  }
});

test('data references the root and every child exactly once', () => {
  const ast = treeFlowchart('graph TD\n  Root --> Left\n  Root --> Right');
  const { dataXml } = generateTree(ast);
  const texts = [...dataXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
  assert.deepEqual(new Set(texts), new Set(['Root', 'Left', 'Right']));
});

test('the doc point gets a presOf onto the root presentation point (the mirror LibreOffice needs)', () => {
  // Without this connector the whole diagram renders blank under LibreOffice
  // -- discovered this session by rendering this generator's actual output,
  // not just asserting on the XML string. See TREE_LAYOUT_XML's doc comment
  // and chain.ts's identical fix for the shared root cause.
  const ast = treeFlowchart('graph TD\n  A --> B\n  A --> C');
  const { dataXml } = generateTree(ast);
  // modelIds are plain sequential integers (ST_ModelId, ECMA-376 §21.4,
  // rejects an arbitrary string like the old "p-root" scheme -- see the
  // doc comment on buildTreeDataXml), so this checks the *structure*
  // instead of a literal id: the doc point's presOf must target whichever
  // pres point is presName="root".
  const rootPresId = dataXml.match(/<dgm:pt modelId="(\d+)" type="pres"><dgm:prSet presAssocID="0" presName="root"/)?.[1];
  assert.ok(rootPresId, 'expected a presName="root" presentation point associated with the doc point');
  assert.ok(
    dataXml.includes(`type="presOf" srcId="0" destId="${rootPresId}"`),
    'doc point (modelId 0) must have a presOf onto the root presentation point',
  );
});

test('escapes hostile node labels (rule #2)', () => {
  const ast = treeFlowchart('graph TD\n  A["Tom & Jerry <script>"] --> B\n  A --> C');
  const { dataXml } = generateTree(ast);
  assertWellFormedXml(dataXml);
  assert.ok(dataXml.includes('Tom &amp; Jerry &lt;script&gt;'));
  assert.ok(!dataXml.includes('<script>'));
});

test('a root-to-child edge label is folded into the child node text (spec §5.2 convention)', () => {
  const { ast } = parseMermaid('graph TD\n  A -->|Oui| B\n  A -->|Non| C');
  const classification = classifyTopology(ast);
  assert.equal(classification.eligible, true);
  const { dataXml } = generateTree(ast);
  const texts = [...dataXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
  assert.deepEqual(new Set(texts), new Set(['A', 'Oui : B', 'Non : C']));
});

test("a child's classDef fill renders as a solidFill on its own content point", () => {
  const ast = treeFlowchart('graph TD\n  A --> B\n  A --> C\n  classDef hot fill:#ED7D31\n  class B hot');
  const { dataXml } = generateTree(ast);
  assert.ok(
    dataXml.includes('modelId="2"><dgm:prSet phldrT="[Texte]"/><dgm:spPr><a:solidFill><a:srgbClr val="ED7D31"/>'),
    'the first child (modelId 2) should carry the fill on its own content-point spPr'
  );
});

test("the root's own classDef fill also renders as a solidFill", () => {
  const ast = treeFlowchart('graph TD\n  A --> B\n  A --> C\n  classDef hot fill:#4472C4\n  class A hot');
  const { dataXml } = generateTree(ast);
  assert.ok(
    dataXml.includes('modelId="1"><dgm:prSet phldrT="[Texte]"/><dgm:spPr><a:solidFill><a:srgbClr val="4472C4"/>'),
    'the root (modelId 1) should carry the fill on its own content-point spPr'
  );
});

test('property: output is always well-formed XML for arbitrary hostile trees', () => {
  // Excludes `"`: this text is embedded in a quoted Mermaid label
  // (`id["text"]`), and Mermaid's quoted-label syntax has no escape for a
  // literal quote -- that's a source-level Mermaid limitation, not a case
  // this test's escaping guarantee is meant to cover.
  const hostileText = fc.string({ maxLength: 30 }).filter((s) => !s.includes('"'));
  fc.assert(
    fc.property(
      fc.array(hostileText, { minLength: 2, maxLength: 8 }),
      (childLabels) => {
        const lines = ['graph TD', `root["${childLabels.length > 0 ? 'Root' : 'Root'}"]`];
        childLabels.forEach((label, i) => {
          lines.push(`c${i}["${label}"]`);
          lines.push(`root --> c${i}`);
        });
        const { ast } = parseMermaid(lines.join('\n'));
        const classification = classifyTopology(ast);
        assert.equal(classification.eligible, true);
        const out = generateTree(ast);
        assertWellFormedXml(out.dataXml);
      }
    ),
    { numRuns: 200 }
  );
});

// ---- parent-to-child connector lines ----

test('the layout has a conn node on each child\'s parTrans point, with end points per direction', () => {
  const pts = (xml: string) => /begPts" val="(\w+)"\/><dgm:param type="endPts" val="(\w+)"/.exec(xml)?.slice(1);
  for (const xml of [TREE_LAYOUT_XML, TREE_LAYOUT_XML_LR, TREE_LAYOUT_XML_BT, TREE_LAYOUT_XML_RL]) {
    assert.match(xml, /<dgm:forEach name="level2ConnForEach" axis="self" ptType="parTrans" cnt="1">/);
    assert.match(xml, /<dgm:layoutNode name="level2Conn" styleLbl="parChTrans1D2">/);
    assert.match(xml, /<dgm:shape [^>]*type="conn"/);
    assertWellFormedXml(xml);
  }
  assert.deepEqual(pts(TREE_LAYOUT_XML), ['bCtr', 'tCtr']);
  assert.deepEqual(pts(TREE_LAYOUT_XML_LR), ['rCtr', 'lCtr']);
  assert.deepEqual(pts(TREE_LAYOUT_XML_BT), ['tCtr', 'bCtr']);
  assert.deepEqual(pts(TREE_LAYOUT_XML_RL), ['lCtr', 'rCtr']);
});

test('colors and quick style define the connector label', () => {
  const ast = treeFlowchart('graph TD\n  A --> B\n  A --> C');
  for (const style of ['simple', 'colorful', 'intense'] as const) {
    const out = generateTree(ast, { style });
    assert.match(out.colorsXml, /<dgm:styleLbl name="parChTrans1D2">/);
    assert.match(out.styleXml, /<dgm:styleLbl name="parChTrans1D2">/);
  }
});

test('data model: one parTrans/sibTrans pair per link, each parTrans tied to its parOf cxn and presented as a conn', () => {
  const out = generateTree(treeFlowchart('graph TD\n  A --> B\n  A --> C\n  A --> D'));
  const xml = out.dataXml;
  assert.equal((xml.match(/type="parTrans"/g) ?? []).length, 4); // doc->A and A->B/C/D
  assert.equal((xml.match(/type="sibTrans"/g) ?? []).length, 4);
  assert.equal((xml.match(/presName="level2Conn"/g) ?? []).length, 3);
  for (const m of xml.matchAll(/<dgm:pt modelId="(\d+)" type="parTrans" cxnId="(\d+)"/g)) {
    assert.match(xml, new RegExp(`<dgm:cxn modelId="${m[2]}" type="parOf"[^>]*parTransId="${m[1]}"`));
  }
  const ids = [...xml.matchAll(/modelId="(\d+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'modelIds are unique');
});

test('cached drawing: one elbow connector per child in every direction, inside the frame', () => {
  for (const dir of ['TD', 'LR', 'BT', 'RL'] as const) {
    const ast = treeFlowchart(`graph ${dir}\n  A --> B\n  A --> C\n  A --> D`);
    const drawing = generateTree(ast, { drawing: true }).drawingXml ?? '';
    assert.equal((drawing.match(/<a:custGeom>/g) ?? []).length, 3, dir);
    assert.equal((drawing.match(/<a:prstGeom prst="roundRect"/g) ?? []).length, 4, dir);
    for (const m of drawing.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)) {
      assert.ok(Number(m[1]) >= 0 && Number(m[2]) >= 0, `${dir}: origin inside frame`);
      assert.ok(Number(m[1]) + Number(m[3]) <= 5486400 && Number(m[2]) + Number(m[4]) <= 3200400, `${dir}: extent inside frame`);
    }
    assert.ok(!drawing.includes('TargetMode'), 'no external relationship');
  }
});
