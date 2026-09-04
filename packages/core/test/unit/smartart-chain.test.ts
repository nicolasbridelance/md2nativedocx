import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { parseMermaid } from '../../src/parser/index.js';
import { classifyTopology } from '../../src/smartart/classify.js';
import {
  generateChain,
  CHAIN_LAYOUT_XML,
  CHAIN_LAYOUT_XML_TD,
  CHAIN_COLORS_XML,
  CHAIN_STYLE_XML,
} from '../../src/smartart/chain.js';

// Same minimal well-formedness check used by parser-fuzz.test.ts (no new
// dependency, AGENTS.md rule #6 -- balanced tags, no raw < or > in text).
// Unlike the translator fragments that helper was written for, these are
// standalone diagram parts with a leading `<?xml ... ?>` declaration, which
// the tag-matching regex below doesn't model as a tag -- stripped first so
// its `?>` isn't misread as stray text content.
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

function chainFlowchart(mermaid: string) {
  const { ast } = parseMermaid(mermaid);
  const classification = classifyTopology(ast);
  assert.equal(classification.eligible, true);
  if (classification.eligible) assert.equal(classification.layout, 'chain');
  return ast;
}

test('generates well-formed XML for all four parts', () => {
  const ast = chainFlowchart('graph TD\n  A --> B\n  B --> C');
  const out = generateChain(ast);
  assertWellFormedXml(out.dataXml);
  assertWellFormedXml(out.layoutXml);
  assertWellFormedXml(out.colorsXml);
  assertWellFormedXml(out.styleXml);
});

test('colors/style are fixed, diagram-independent constants; layout is fixed per direction', () => {
  const a = generateChain(chainFlowchart('graph LR\n  A --> B'));
  const b = generateChain(chainFlowchart('graph LR\n  X --> Y\n  Y --> Z\n  Z --> W'));
  assert.equal(a.layoutXml, CHAIN_LAYOUT_XML);
  assert.equal(a.colorsXml, CHAIN_COLORS_XML);
  assert.equal(a.styleXml, CHAIN_STYLE_XML);
  assert.equal(a.layoutXml, b.layoutXml);
  assert.equal(a.colorsXml, b.colorsXml);
  assert.equal(a.styleXml, b.styleXml);
});

test('flowchart.direction picks the horizontal or vertical layout variant', () => {
  // Before this, chain.ts never read flowchart.direction at all -- every
  // chain rendered horizontally regardless of the Mermaid source's TD/LR
  // (docs/markdown-mermaid-compliance-table.md). Verified by rendering the
  // substituted XML under headless LibreOffice this session, not just this
  // structural assertion.
  const lr = generateChain(chainFlowchart('graph LR\n  A --> B'));
  const td = generateChain(chainFlowchart('graph TD\n  A --> B'));
  assert.equal(lr.layoutXml, CHAIN_LAYOUT_XML);
  assert.equal(td.layoutXml, CHAIN_LAYOUT_XML_TD);
  assert.ok(!lr.layoutXml.includes('linDir'), 'horizontal variant uses the format default, no explicit linDir');
  assert.ok(td.layoutXml.includes('<dgm:param type="linDir" val="fromT"/>'));
  assert.ok(td.dataXml.includes(CHAIN_LAYOUT_XML_TD.match(/uniqueId="([^"]+)"/)![1]!), 'data must reference the TD layout URN, not the LR one');
});

test('none of the fixed parts reference any Microsoft URN or real diagram content', () => {
  // ADR 0004 "Round 5": the whole point of this generator is that it never
  // redistributes Microsoft's own algorithm/colors/style content. Guard
  // against a future edit accidentally reintroducing a real Word URN.
  for (const xml of [CHAIN_LAYOUT_XML, CHAIN_LAYOUT_XML_TD, CHAIN_COLORS_XML, CHAIN_STYLE_XML]) {
    assert.ok(!xml.includes('urn:microsoft.com'), 'must not reference a Microsoft catalog URN');
  }
});

test('data references every node exactly once, in chain order', () => {
  const ast = chainFlowchart('graph TD\n  Start --> Middle\n  Middle --> End');
  const { dataXml } = generateChain(ast);
  const texts = [...dataXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
  assert.deepEqual(texts, ['Start', 'Middle', 'End']);
});

test('orders nodes by the chain path, not by declaration order', () => {
  // C is declared as the source of the first edge in the text, but the
  // actual chain starts at A (the only node with in-degree 0).
  const ast = chainFlowchart('graph TD\n  B --> C\n  A --> B');
  const { dataXml } = generateChain(ast);
  const texts = [...dataXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
  assert.deepEqual(texts, ['A', 'B', 'C']);
});

test('escapes hostile node labels (rule #2)', () => {
  const ast = chainFlowchart('graph TD\n  A["Tom & Jerry <script>"] --> B');
  const { dataXml } = generateChain(ast);
  assertWellFormedXml(dataXml);
  assert.ok(dataXml.includes('Tom &amp; Jerry &lt;script&gt;'));
  assert.ok(!dataXml.includes('<script>'));
});

test('every content node gets a presOf-bearing Main presentation point (the mirror LibreOffice needs)', () => {
  const ast = chainFlowchart('graph TD\n  A --> B\n  B --> C');
  const { dataXml } = generateChain(ast);
  const presOfCount = (dataXml.match(/type="presOf"/g) ?? []).length;
  const presParOfCount = (dataXml.match(/type="presParOf"/g) ?? []).length;
  // One per content node, plus the doc point's own presOf onto p-root: without
  // it, LibreOffice renders the whole diagram blank (confirmed by rendering
  // this generator's actual output under headless LibreOffice, not just
  // asserting on the XML string -- see chain.ts's buildChainDataXml doc comment).
  assert.equal(presOfCount, 4);
  assert.equal(presParOfCount, 6); // root->composite and composite->Main, per node
});

test('single-node chain (degenerate case) still produces valid output', () => {
  const ast = chainFlowchart('graph TD\n  Solo[Alone]');
  const out = generateChain(ast);
  assertWellFormedXml(out.dataXml);
  const texts = [...out.dataXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
  assert.deepEqual(texts, ['Alone']);
});

test('an edge label is folded into the destination node text (spec §5.2 convention)', () => {
  const { ast } = parseMermaid('graph TD\n  A -->|Oui| B\n  B --> C');
  const classification = classifyTopology(ast);
  assert.equal(classification.eligible, true);
  const { dataXml } = generateChain(ast);
  const texts = [...dataXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
  assert.deepEqual(texts, ['A', 'Oui : B', 'C']);
});

test('a node with no incoming edge label keeps its plain text', () => {
  const ast = chainFlowchart('graph TD\n  A --> B\n  B --> C');
  const { dataXml } = generateChain(ast);
  const texts = [...dataXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
  assert.deepEqual(texts, ['A', 'B', 'C']);
});

test("a node's classDef fill renders as a solidFill on its own content point (not a pres point)", () => {
  const ast = chainFlowchart('graph TD\n  A --> B\n  B --> C\n  classDef hot fill:#ED7D31\n  class B hot');
  const { dataXml } = generateChain(ast);
  assert.ok(
    dataXml.includes('modelId="2"><dgm:prSet phldrT="[Texte]"/><dgm:spPr><a:solidFill><a:srgbClr val="ED7D31"/>'),
    'node B (modelId 2) should carry the fill on its own content-point spPr'
  );
});

test('a node with no classDef gets an empty spPr (no fill override)', () => {
  const ast = chainFlowchart('graph TD\n  A --> B');
  const { dataXml } = generateChain(ast);
  assert.ok(dataXml.includes('modelId="1"><dgm:prSet phldrT="[Texte]"/><dgm:spPr/>'));
});

test('property: output is always well-formed XML for arbitrary hostile chain labels', () => {
  // Excludes `"`: this text is embedded in a quoted Mermaid label
  // (`id["text"]`), and Mermaid's quoted-label syntax has no escape for a
  // literal quote -- that's a source-level Mermaid limitation, not a case
  // this test's escaping guarantee is meant to cover.
  const hostileText = fc.string({ maxLength: 30 }).filter((s) => !s.includes('"'));
  fc.assert(
    fc.property(
      fc.array(hostileText, { minLength: 1, maxLength: 10 }),
      (labels) => {
        const ids = labels.map((_, i) => `n${i}`);
        const lines = ['graph TD', ...ids.map((id, i) => `${id}["${labels[i]}"]`)];
        for (let i = 0; i + 1 < ids.length; i++) lines.push(`${ids[i]} --> ${ids[i + 1]}`);
        const { ast } = parseMermaid(lines.join('\n'));
        const classification = classifyTopology(ast);
        assert.equal(classification.eligible, true);
        const out = generateChain(ast);
        assertWellFormedXml(out.dataXml);
      }
    ),
    { numRuns: 200 }
  );
});
