import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { parseMermaid } from '../../src/parser/index.js';
import { classifyTopology } from '../../src/smartart/classify.js';
import {
  generateChain,
  CHAIN_LAYOUT_XML,
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

test('layout/colors/style are the fixed, diagram-independent constants', () => {
  const a = generateChain(chainFlowchart('graph TD\n  A --> B'));
  const b = generateChain(chainFlowchart('graph TD\n  X --> Y\n  Y --> Z\n  Z --> W'));
  assert.equal(a.layoutXml, CHAIN_LAYOUT_XML);
  assert.equal(a.colorsXml, CHAIN_COLORS_XML);
  assert.equal(a.styleXml, CHAIN_STYLE_XML);
  assert.equal(a.layoutXml, b.layoutXml);
  assert.equal(a.colorsXml, b.colorsXml);
  assert.equal(a.styleXml, b.styleXml);
});

test('none of the fixed parts reference any Microsoft URN or real diagram content', () => {
  // ADR 0004 "Round 5": the whole point of this generator is that it never
  // redistributes Microsoft's own algorithm/colors/style content. Guard
  // against a future edit accidentally reintroducing a real Word URN.
  for (const xml of [CHAIN_LAYOUT_XML, CHAIN_COLORS_XML, CHAIN_STYLE_XML]) {
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
  assert.equal(presOfCount, 3); // one per content node
  assert.equal(presParOfCount, 6); // root->composite and composite->Main, per node
});

test('single-node chain (degenerate case) still produces valid output', () => {
  const ast = chainFlowchart('graph TD\n  Solo[Alone]');
  const out = generateChain(ast);
  assertWellFormedXml(out.dataXml);
  const texts = [...out.dataXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
  assert.deepEqual(texts, ['Alone']);
});

test('property: output is always well-formed XML for arbitrary hostile chain labels', () => {
  const hostileText = fc.string({ maxLength: 30 });
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
