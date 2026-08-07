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
  // drawing (a bare wpg:wgp cannot be a direct child of w:body).
  assert.ok(xml.startsWith('<w:p '));
  assert.ok(xml.trimEnd().endsWith('</w:p>'));
  // Schema-required nesting: w:p -> w:r -> w:drawing -> wp:inline ->
  // a:graphic -> a:graphicData -> wpc:wpc -> wpg:wgp.
  const order = [
    '<w:p ',
    '<w:r>',
    '<w:drawing>',
    '<wp:inline ',
    '<a:graphic ',
    '<a:graphicData ',
    '<wpc:wpc ',
    '<wpg:wgp',
    '</wpg:wgp>',
    '</wpc:wpc>',
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

// --- Regression tests for the Word-conformance defects fixed in this change ---
// Each of these passed silently while the generated .docx was unusable in Word.

test('is a pure function: identical input yields identical output', () => {
  const { ast } = parseMermaid('graph TD\n  A[Start] --> B[End]');
  const l = layout(ast);
  // A module-level id counter used to leak state between calls, so the second
  // call produced different shape ids and the golden fixtures were only stable
  // by accident of test ordering.
  assert.equal(translateToOoxml(ast, l), translateToOoxml(ast, l));
});

test('every drawing id in a fragment is distinct (Word reports collisions as corruption)', () => {
  const xml = translate('graph TD\n  A[A] --> B[B]\n  B --> C[C]\n  C --> A');
  const ids = [...xml.matchAll(/<(?:wp:docPr|wpg:cNvPr|wps:cNvPr)\s+id="(\d+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length, `duplicate drawing ids: ${ids.join(',')}`);
});

test('connector stCxn/endCxn resolve to shapes declared in the same fragment', () => {
  const xml = translate('graph TD\n  A[A] --> B[B]');
  const defined = new Set(
    [...xml.matchAll(/<wps:cNvPr\s+id="(\d+)"/g)].map((m) => m[1]),
  );
  const referenced = [...xml.matchAll(/<a:(?:stCxn|endCxn)\s+id="(\d+)"/g)].map((m) => m[1]);
  assert.ok(referenced.length > 0);
  for (const ref of referenced) {
    assert.ok(defined.has(ref), `connector references undeclared shape id ${ref}`);
  }
});

test('the drawing is inline, not anchored (spec §5.3)', () => {
  const xml = translate('graph TD\n  A[Start] --> B[End]');
  assert.ok(xml.includes('<wp:inline '));
  assert.ok(!xml.includes('<wp:anchor '));
});

test('edges carry arrow heads and per-type line styles (spec §6.2)', () => {
  const arrow = translate('graph TD\n  A[A] --> B[B]');
  assert.ok(arrow.includes('<a:tailEnd type="triangle"'), 'expected an arrow head');
  assert.ok(/<a:ln w="12700"/.test(arrow));

  const dotted = translate('graph TD\n  A[A] -.-> B[B]');
  assert.ok(dotted.includes('<a:prstDash val="dash"/>'));

  const thick = translate('graph TD\n  A[A] ==> B[B]');
  assert.ok(/<a:ln w="25400"/.test(thick), 'thick edges use a wider stroke');

  const plain = translate('graph TD\n  A[A] --- B[B]');
  assert.ok(!plain.includes('<a:tailEnd'), '`---` has no arrow head');
});

test('edge labels are rendered at the connector midpoint (spec §6.2)', () => {
  const xml = translate('graph TD\n  A[A] -->|Oui| B[B]');
  assert.ok(xml.includes('EdgeLabel'));
  assert.ok(xml.includes('>Oui<'));
});

test('edge labels are XML-escaped (rule #2)', () => {
  const xml = translate('graph TD\n  A[A] -->|a & b <c>| B[B]');
  assert.ok(xml.includes('a &amp; b &lt;c&gt;'));
  assert.ok(!xml.includes('<c>'));
});

test('label text gets an explicit colour readable against its fill', () => {
  // Word resolves shape text colour from the theme (white), which is invisible
  // on the light default fill.
  const light = translate('graph TD\n  A[Start] --> B[End]');
  assert.ok(light.includes('<w:color w:val="000000"/>'));

  const dark = translate('graph TD\n  classDef c fill:#1F3864\n  A[Start]:::c --> B[End]');
  assert.ok(dark.includes('<w:color w:val="FFFFFF"/>'));
});

test('an oversized diagram is scaled down to the usable page area', () => {
  // A wide graph would otherwise emit an extent many times the page width and
  // be clipped by Word.
  const wide = ['graph LR', ...Array.from({ length: 40 }, (_, i) => `  N${i} --> N${i + 1}`)].join('\n');
  const xml = translate(wide);
  const extent = /<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(xml);
  assert.ok(extent);
  assert.ok(Number(extent[1]) <= 5943600, `extent cx ${extent[1]} exceeds the usable page width`);
  assert.ok(Number(extent[2]) <= 8229600, `extent cy ${extent[2]} exceeds the usable page height`);
  // The children keep native coordinates; Word applies the homothety.
  assert.ok(/<a:chExt cx="(\d+)"/.exec(xml));
});

test('colours reaching a:srgbClr are validated as hex, not merely escaped', () => {
  const { ast } = parseMermaid('graph TD\n  A[A] --> B[B]');
  const xml = translateToOoxml(ast, layout(ast), { fill: '"/><a:evil', line: 'nothex' });
  assert.ok(!xml.includes('evil'));
  assert.ok(!xml.includes('nothex'));
});

// --- Regression tests for the connector-geometry defects found by rendering
// a generated .docx through LibreOffice headless (structural XML checks alone
// cannot catch these). ---

test('connector endpoints land on the box perimeter, not the box center', () => {
  // Two nodes stacked vertically: A above B, same width/x.
  const xml = translate('graph TD\n  A[A] --> B[B]');
  const off = /<a:off x="(\d+)" y="(\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>\s*<\/a:xfrm>\s*<a:prstGeom prst="line"/.exec(
    xml,
  );
  assert.ok(off, 'expected to find the connector xfrm');
  // A is 60px tall starting at y=0, so its bottom edge is at y=60 (571500 EMU).
  // The connector's start y must be there, not at A's center (y=30, 285750 EMU).
  assert.equal(Number(off[2]), 60 * 9525, 'connector must start at the box edge, not its center');
  assert.ok(Number(off[4]) > 0);
});

test('connection-site indices follow Word\'s own 0-based convention (0=top,1=right,2=bottom,3=left)', () => {
  // Verified against a real Word-authored document (tools/word-reference/): a
  // vertical connector used idx=2 (bottom) at the source, idx=0 (top) at the
  // target — not the 1-based "1=top..4=left" an earlier version assumed.
  const xml = translate('graph TD\n  A[A] --> B[B]');
  assert.ok(/<a:stCxn id="\d+" idx="2"\/>/.test(xml), 'source should attach at the bottom (idx=2)');
  assert.ok(/<a:endCxn id="\d+" idx="0"\/>/.test(xml), 'target should attach at the top (idx=0)');
});

test('an arrow head lands on the target box edge, not its center (would otherwise render hidden under the fill)', () => {
  const xml = translate('graph TD\n  A[A] --> B[B]');
  // The connector's own xfrm is the one immediately followed by prstGeom
  // "line" (both nodes' xfrms are followed by prstGeom "rect").
  const connector = /<a:off x="\d+" y="\d+"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>\s*<\/a:xfrm>\s*<a:prstGeom prst="line"/.exec(
    xml,
  );
  assert.ok(connector, 'expected to find the connector xfrm');
  // cy must span exactly the gap between the two boxes (80px in the default
  // layout), not the shorter center-to-center distance minus half each box.
  assert.equal(Number(connector[2]), 80 * 9525);
});

test('an edge label sits on the connector segment midpoint, not the node-center midpoint', () => {
  const xml = translate('graph TD\n  A[A] -->|Texte| B[B]');
  const label = /<wps:cNvPr id="\d+" name="EdgeLabel"\/>[\s\S]*?<a:off x="(\d+)" y="(\d+)"\/>/.exec(xml);
  assert.ok(label);
  const y = Number(label[2]);
  // The connector spans from A's bottom (y=60px) to B's top (y=140px), so its
  // midpoint is y=100px. The old node-center-to-node-center midpoint would
  // have been y=115px (center of A at 30 to center of B at 200 → 115).
  const midpointEmu = 100 * 9525;
  assert.ok(Math.abs(y + 228600 / 2 - midpointEmu) < 9525, `label y=${y} not on the connector midpoint`);
});
