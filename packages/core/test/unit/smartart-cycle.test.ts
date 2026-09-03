import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { parseMermaid } from '../../src/parser/index.js';
import { classifyTopology } from '../../src/smartart/classify.js';
import {
  generateCycle,
  CYCLE_LAYOUT_XML,
  CYCLE_COLORS_XML,
  CYCLE_STYLE_XML,
} from '../../src/smartart/cycle.js';

// Same minimal well-formedness check as smartart-chain.test.ts / smartart-tree.test.ts.
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

function cycleFlowchart(mermaid: string) {
  const { ast } = parseMermaid(mermaid);
  const classification = classifyTopology(ast);
  assert.equal(classification.eligible, true);
  if (classification.eligible) assert.equal(classification.layout, 'cycle');
  return ast;
}

test('generates well-formed XML for all four parts', () => {
  const ast = cycleFlowchart('graph TD\n  A --> B\n  B --> C\n  C --> A');
  const out = generateCycle(ast);
  assertWellFormedXml(out.dataXml);
  assertWellFormedXml(out.layoutXml);
  assertWellFormedXml(out.colorsXml);
  assertWellFormedXml(out.styleXml);
});

test('layout/colors/style are the fixed, diagram-independent constants (no direction variant)', () => {
  // Unlike chain/tree, a circle has no natural TD/LR orientation to mirror,
  // so cycle uses a single fixed layout regardless of flowchart.direction.
  const a = generateCycle(cycleFlowchart('graph TD\n  A --> B\n  B --> A'));
  const b = generateCycle(cycleFlowchart('graph LR\n  X --> Y\n  Y --> Z\n  Z --> X'));
  assert.equal(a.layoutXml, CYCLE_LAYOUT_XML);
  assert.equal(a.colorsXml, CYCLE_COLORS_XML);
  assert.equal(a.styleXml, CYCLE_STYLE_XML);
  assert.equal(a.layoutXml, b.layoutXml);
});

test('none of the fixed parts reference any Microsoft URN or real diagram content', () => {
  for (const xml of [CYCLE_LAYOUT_XML, CYCLE_COLORS_XML, CYCLE_STYLE_XML]) {
    assert.ok(!xml.includes('urn:microsoft.com'), 'must not reference a Microsoft catalog URN');
  }
});

test('data references every node exactly once, in loop order', () => {
  const ast = cycleFlowchart('graph TD\n  Start --> Middle\n  Middle --> End\n  End --> Start');
  const { dataXml } = generateCycle(ast);
  const texts = [...dataXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
  assert.deepEqual(texts, ['Start', 'Middle', 'End']);
});

test('the doc point gets a presOf onto p-root (the mirror LibreOffice needs)', () => {
  const ast = cycleFlowchart('graph TD\n  A --> B\n  B --> C\n  C --> A');
  const { dataXml } = generateCycle(ast);
  assert.ok(
    dataXml.includes('type="presOf" srcId="0" destId="p-root"'),
    'doc point (modelId 0) must have a presOf onto p-root'
  );
});

test('an edge label is folded into the destination node text (spec §5.2 convention)', () => {
  const ast = cycleFlowchart('graph TD\n  A -->|Go| B\n  B --> C\n  C --> A');
  const { dataXml } = generateCycle(ast);
  const texts = [...dataXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
  assert.deepEqual(texts, ['A', 'Go : B', 'C']);
});

test("a node's classDef fill renders as a solidFill on its own content point", () => {
  const ast = cycleFlowchart('graph TD\n  A --> B\n  B --> C\n  C --> A\n  classDef hot fill:#ED7D31\n  class B hot');
  const { dataXml } = generateCycle(ast);
  assert.ok(
    dataXml.includes('modelId="2"><dgm:prSet phldrT="[Texte]"/><dgm:spPr><a:solidFill><a:srgbClr val="ED7D31"/>'),
    'node B (modelId 2) should carry the fill on its own content-point spPr'
  );
});

test('escapes hostile node labels (rule #2)', () => {
  const ast = cycleFlowchart('graph TD\n  A["Tom & Jerry <script>"] --> B\n  B --> A');
  const { dataXml } = generateCycle(ast);
  assertWellFormedXml(dataXml);
  assert.ok(dataXml.includes('Tom &amp; Jerry &lt;script&gt;'));
  assert.ok(!dataXml.includes('<script>'));
});

test('property: output is always well-formed XML for arbitrary hostile cycle labels', () => {
  const hostileText = fc.string({ maxLength: 30 });
  fc.assert(
    fc.property(
      fc.array(hostileText, { minLength: 3, maxLength: 10 }),
      (labels) => {
        const ids = labels.map((_, i) => `n${i}`);
        const lines = ['graph TD', ...ids.map((id, i) => `${id}["${labels[i]}"]`)];
        for (let i = 0; i < ids.length; i++) {
          lines.push(`${ids[i]} --> ${ids[(i + 1) % ids.length]}`);
        }
        const { ast } = parseMermaid(lines.join('\n'));
        const classification = classifyTopology(ast);
        assert.equal(classification.eligible, true);
        const out = generateCycle(ast);
        assertWellFormedXml(out.dataXml);
      }
    ),
    { numRuns: 200 }
  );
});
