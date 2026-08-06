import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';
import { layout } from '../../src/layout/layout.js';
import { translateToOoxml } from '../../src/translator/ooxml-translator.js';
import { escapeXml } from '../../src/translator/xml-escape.js';

function translate(text: string): string {
  const { ast } = parseMermaid(text);
  return translateToOoxml(ast, layout(ast));
}

test('emits a self-contained wpg:wgp group', () => {
  const xml = translate('graph TD\n  A[Start] --> B[End]');
  assert.ok(xml.includes('<wpg:wgp'));
  assert.ok(xml.includes('</wpg:wgp>'));
  assert.ok(xml.includes('xmlns:wpg='));
  assert.ok(xml.includes('xmlns:wps='));
  assert.ok(xml.includes('xmlns:a='));
});

test('wraps the wpg:wgp in the schema-required paragraph hierarchy (spec §5.3)', () => {
  const xml = translate('graph TD\n  A[Start] --> B[End]');
  // The fragment must be a complete w:p paragraph so Word accepts it as a
  // block-level drawing (a bare wpg:wgp cannot be a direct child of w:body).
  assert.ok(xml.startsWith('<w:p '));
  assert.ok(xml.trimEnd().endsWith('</w:p>'));
  // Schema-required nesting: w:p -> w:r -> w:drawing -> wp:inline ->
  // a:graphic -> a:graphicData -> wpg:wgp.
  const order = [
    '<w:p ',
    '<w:r>',
    '<w:drawing>',
    '<wp:inline ',
    '<a:graphic ',
    '<a:graphicData ',
    '<wpg:wgp',
    '</wpg:wgp>',
    '</a:graphicData>',
    '</a:graphic>',
    '</wp:inline>',
    '</w:drawing>',
    '</w:r>',
    '</w:p>',
  ];
  let idx = -1;
  for (const token of order) {
    const found = xml.indexOf(token, idx + 1);
    assert.ok(found > idx, `expected "${token}" after position ${idx}`);
    idx = found;
  }
});

test('emits one wps:wsp per node', () => {
  const xml = translate('graph TD\n  A --> B\n  B --> C');
  // Nodes are wps:wsp with wps:cNvSpPr; connectors are wps:wsp with wps:cNvCnPr.
  const nodeCount = (xml.match(/<wps:cNvSpPr\/?>/g) ?? []).length;
  assert.equal(nodeCount, 3);
});

test('emits one connector (wps:cNvCnPr) per edge', () => {
  const xml = translate('graph TD\n  A --> B\n  B --> C');
  const count = (xml.match(/<wps:cNvCnPr>/g) ?? []).length;
  assert.equal(count, 2);
});

test('maps node shapes to preset geometries', () => {
  const xml = translate('graph TD\n  A[rect]\n  B{diamond}');
  assert.ok(xml.includes('prst="rect"'));
  assert.ok(xml.includes('prst="diamond"'));
});

test('uses EMU coordinates (px * 9525)', () => {
  const xml = translate('graph TD\n  A --> B');
  // Node width 120px -> 120 * 9525 = 1143000 EMU.
  assert.ok(xml.includes('cx="1143000"'));
});

test('escapes XML-significant characters in labels (rule #2)', () => {
  // Use a label with all five XML-significant characters. The parser keeps the
  // surrounding quotes as part of the label; that's fine — what matters is that
  // every one of `& < > " '` is escaped in the emitted XML.
  const xml = translate('graph TD\n  A["a & b < c > d \\" e \' f"]');
  assert.ok(xml.includes('&amp;'));
  assert.ok(xml.includes('&lt;'));
  assert.ok(xml.includes('&gt;'));
  assert.ok(xml.includes('&quot;'));
  assert.ok(xml.includes('&apos;'));
  // The raw characters must NOT appear unescaped inside the text run.
  assert.ok(!/a & b/.test(xml));
  assert.ok(!/c > d/.test(xml));
});

test('never emits an external OOXML relationship (rule #3)', () => {
  const xml = translate('graph TD\n  A --> B');
  // No external relationship target, no remote reference. The `http://` URIs
  // in namespace declarations are legitimate and NOT external relationships.
  assert.ok(!xml.includes('TargetMode="External"'));
  assert.ok(!xml.includes('r:link'));
  assert.ok(!xml.includes('r:embed'));
  assert.ok(!xml.includes('r:id='));
});

test('escapes subgraph titles (rule #2)', () => {
  const xml = translate('graph TD\n  subgraph S1["Group <&>"]\n    A --> B\n  end');
  // The subgraph title is rendered in a wps:txbx and must be escaped.
  assert.ok(xml.includes('Group &lt;&amp;&gt;'));
  assert.ok(!xml.includes('Group <'));
});

test('applies classDef fill to a node (spec §6.3)', () => {
  const xml = translate('graph TD\n  classDef crit fill:#FF0000\n  A[Start]:::crit --> B[End]');
  assert.ok(xml.includes('val="FF0000"'));
  // The default fill must still be present for the un-classed node.
  assert.ok(xml.includes('val="D9E2F3"'));
});

test('renders a subgraph as a nested wpg:grpSp with title (spec §6.1)', () => {
  const xml = translate('graph TD\n  subgraph S1[Groupe A]\n    A --> B\n  end\n  B --> C');
  // Root group (wpg:wgp) + nested subgraph group (wpg:grpSp).
  assert.equal((xml.match(/<wpg:wgp/g) ?? []).length, 1);
  assert.equal((xml.match(/<\/wpg:wgp>/g) ?? []).length, 1);
  assert.equal((xml.match(/<wpg:grpSp>/g) ?? []).length, 1);
  assert.equal((xml.match(/<\/wpg:grpSp>/g) ?? []).length, 1);
  assert.ok(xml.includes('Groupe A'));
});

test('escapeXml escapes all five characters', () => {
  assert.equal(escapeXml('&<>"\''), '&amp;&lt;&gt;&quot;&apos;');
  assert.equal(escapeXml('plain text'), 'plain text');
});
