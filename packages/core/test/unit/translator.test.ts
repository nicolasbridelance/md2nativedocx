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

test('emits a self-contained drawing canvas with the shape/group namespaces declared', () => {
  const xml = translate('graph TD\n  A[Start] --> B[End]');
  assert.ok(xml.includes('<wpc:wpc'));
  assert.ok(xml.includes('</wpc:wpc>'));
  assert.ok(xml.includes('xmlns:wpg='));
  assert.ok(xml.includes('xmlns:wps='));
  assert.ok(xml.includes('xmlns:a='));
});

test('wraps the drawing canvas in the schema-required paragraph hierarchy (spec §5.3)', () => {
  const xml = translate('graph TD\n  A[Start] --> B[End]');
  // The fragment must be a complete w:p paragraph so Word accepts it as a
  // drawing (a bare wpc:wpc cannot be a direct child of w:body).
  assert.ok(xml.startsWith('<w:p '));
  assert.ok(xml.trimEnd().endsWith('</w:p>'));
  // Schema-required nesting: w:p -> w:r -> w:drawing -> wp:inline ->
  // a:graphic -> a:graphicData -> wpc:wpc -> [shapes, no wrapping group].
  const order = [
    '<w:p ',
    '<w:r>',
    '<w:drawing>',
    '<wp:inline ',
    '<a:graphic ',
    '<a:graphicData ',
    '<wpc:wpc ',
    '<wps:wsp>',
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
  // Single-char label "A"/"B": text-driven sizing bottoms out at the
  // MIN_NODE_WIDTH floor (70px) -> 70 * 9525 = 666750 EMU.
  assert.ok(xml.includes('cx="666750"'));
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

test('renders a subgraph title as a flat top-level shape, not a wpg group (spec §6.1)', () => {
  const xml = translate('graph TD\n  subgraph S1[Groupe A]\n    A --> B\n  end\n  B --> C');
  // No wpg:wgp/wpg:grpSp at all any more: a subgraph never actually nests
  // real content (member nodes always render as separate top-level shapes,
  // renderContent's node loop) — its title used to be the sole occupant of
  // a wpg:grpSp, which only worked by accident since it needed a wpg:wgp
  // ancestor to position correctly (verified empirically in LibreOffice,
  // renderSubgraph's doc comment); it now renders as a plain wps:wsp at
  // absolute coordinates, like a node.
  assert.equal((xml.match(/<wpg:wgp/g) ?? []).length, 0);
  assert.equal((xml.match(/<wpg:grpSp>/g) ?? []).length, 0);
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

test('node/subgraph-title/edge-label text overrides the inherited paragraph spacing', () => {
  // Found from a real Word screenshot (2026-09-02): text sat visibly higher
  // than centered in its shape, a bigger gap below than above. Cause:
  // Pandoc's reference.docx sets a document-wide default of 10pt space
  // *after* every paragraph (docDefaults -> w:pPrDefault), which our shape
  // text never overrode — with `anchor="ctr"` centering the whole paragraph
  // box (glyphs + that trailing, invisible 10pt), the visible text ends up
  // off-center. Every w:pPr this translator emits for shape text must zero
  // both sides explicitly rather than trust the inherited default.
  const xml = translate('graph TD\n  subgraph S[Title]\n    A[A] -->|label| B[B]\n  end');
  const spacingCount = (xml.match(/<w:spacing w:before="0" w:after="0"\/>/g) ?? []).length;
  // One per w:p: the subgraph title, node A, node B, and the edge label.
  assert.equal(spacingCount, 4, `expected 4 zeroed paragraph spacings, found ${spacingCount}`);
});

test('an oversized diagram is scaled down to the usable page area', () => {
  // A wide graph would otherwise emit an extent many times the page width and
  // be clipped by Word. Height is capped too, on purpose: verified
  // empirically that LibreOffice fails to render a wpc:wpc/wpg:wgp group at
  // all past roughly one page's height (not degraded — entirely absent, no
  // error), so letting a tall diagram flow across pages the way an oversized
  // picture would is not safe here (see the MAX_DRAWING_CY comment).
  const wide = ['graph LR', ...Array.from({ length: 40 }, (_, i) => `  N${i} --> N${i + 1}`)].join('\n');
  const xml = translate(wide);
  const extent = /<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(xml);
  assert.ok(extent);
  const cx = Number(extent[1]);
  const cy = Number(extent[2]);
  assert.ok(cx <= 5943600, `extent cx ${cx} exceeds the usable page width`);
  assert.ok(cy <= 8229600, `extent cy ${cy} exceeds the usable page height`);
  // No enclosing group to let Word apply the shrink for us any more (see
  // renderContent's doc comment) — every child must already be pre-scaled to
  // fit inside the declared extent itself. A 41-node LR chain is far wider
  // natively than the page, so if scaling weren't actually applied to child
  // coordinates, at least one node would land far past cx.
  const maxChildRight = Math.max(
    ...[...xml.matchAll(/<a:off x="(\d+)" y="\d+"\/>\s*<a:ext cx="(\d+)" cy="\d+"\/>/g)].map(
      (m) => Number(m[1]) + Number(m[2]),
    ),
  );
  assert.ok(
    maxChildRight <= cx + 9525,
    `a child shape extends to ${maxChildRight}, past the declared extent cx=${cx} — scaling was not applied to its coordinates`,
  );
});

test('node border and connector line widths shrink along with geometry on a scaled-down diagram', () => {
  // Regression (user report, real Word, 2026-09-02): a large diagram scaled
  // down to fit the page had its node/text geometry shrink correctly, but
  // every connector's stroke width — and, far more visibly, its arrowhead —
  // stayed at a fixed size, so arrows towered over the now-tiny boxes they
  // pointed at. Same fixture shape as "an oversized diagram is scaled down
  // to the usable page area" above (guaranteed scale < 1).
  const wide = ['graph LR', ...Array.from({ length: 40 }, (_, i) => `  N${i} --> N${i + 1}`)].join('\n');
  const xml = translate(wide);
  const lineWidths = [...xml.matchAll(/<a:ln w="(\d+)"/g)].map((m) => Number(m[1]));
  assert.ok(lineWidths.length > 0, 'expected at least one a:ln in the output');
  for (const w of lineWidths) {
    if (w === 0) continue; // the subgraph title box's borderless w="0" — not a stroke to scale
    assert.ok(w < 12700, `line width ${w} was not scaled down below the unscaled base (12700)`);
  }
});

test('a tall, narrow diagram gets its extent widened to a safe aspect ratio', () => {
  // Regression: verified empirically (soffice --headless render) that a
  // wpc:wpc/wpg:wgp group taller than ~7.5in renders NOTHING AT ALL in
  // LibreOffice once its native width:height ratio drops much below 1:1 —
  // not degraded, completely absent. A single-column chain long enough to
  // exceed the risk height is exactly that shape. There is no more separate
  // native-vs-display coordinate space to check (no enclosing group) — but
  // scale multiplies both dimensions of the extent equally, so the widening
  // is still directly observable on `wp:extent`'s own aspect ratio.
  // N0..N9 (single-digit ids only): every label is the same length, so
  // every node gets the same text-driven width and stays centered on the
  // same x — an N10 here would be one character wider than the rest, no
  // longer landing at x=0 for reasons unrelated to what this test checks.
  const tall = ['graph TD', ...Array.from({ length: 9 }, (_, i) => `  N${i} --> N${i + 1}`)].join('\n');
  const xml = translate(tall);
  const extent = /<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(xml);
  assert.ok(extent);
  const cx = Number(extent![1]);
  const cy = Number(extent![2]);
  assert.ok(cx / cy >= 1, `extent aspect ratio ${cx}/${cy} is below the safe 1:1 floor`);
  // The padding must not move any node — only the frame's own declared width
  // grows; the content stays exactly where the layout put it (x=0).
  const firstNode = /<a:off x="(\d+)" y="(\d+)"\/>\s*<a:ext cx="\d+" cy="\d+"\/>\s*<\/a:xfrm>\s*<a:prstGeom prst="rect"/.exec(
    xml,
  );
  assert.ok(firstNode);
  assert.equal(Number(firstNode![1]), 0, 'the first node should still start at x=0');
});

test('a short diagram is not widened, even if narrow', () => {
  const short = translate('graph TD\n  A[A] --> B[B]');
  const extent = /<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(short);
  assert.ok(extent);
  const cy = Number(extent![2]);
  assert.ok(cy <= 6858000, 'test fixture should be under the 7.5in risk height');
  // Width matches the actual content width (single-char "A"/"B" labels
  // bottom out at the 70px MIN_NODE_WIDTH floor), not padded out to match
  // height, and the diagram is small enough that scale stays 1 — the whole
  // point is this case needs no help.
  assert.equal(Number(extent![1]), 70 * 9525);
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
  // A single-char label "A" is text-driven-sized (nodeDimensions: line
  // height + padding + the wrap buffer, times SCALE_SAFETY_MARGIN) to 75px,
  // above the 40px MIN_NODE_HEIGHT floor, so the text-driven value wins. A's
  // bottom edge is at y=75 (714375 EMU). The connector's start y must be
  // there, not at A's center.
  assert.equal(Number(off[2]), 75 * 9525, 'connector must start at the box edge, not its center');
  assert.ok(Number(off[4]) > 0);
});

test('vertical connection-site indices: 2=bottom at the source, 0=top at the target', () => {
  // Verified against a real Word-authored document (tools/word-reference/): a
  // vertical connector used idx=2 (bottom) at the source, idx=0 (top) at the
  // target — not the 1-based "1=top..4=left" an earlier version assumed.
  const xml = translate('graph TD\n  A[A] --> B[B]');
  assert.ok(/<a:stCxn id="\d+" idx="2"\/>/.test(xml), 'source should attach at the bottom (idx=2)');
  assert.ok(/<a:endCxn id="\d+" idx="0"\/>/.test(xml), 'target should attach at the top (idx=0)');
});

test('horizontal connection-site indices: 3=right at the source, 1=left at the target', () => {
  // Found 2026-09-02 opening a generated .docx in real Word: connectors
  // looked attached to the wrong side. The vertical case above (idx 0/2) was
  // the only one ever checked against a real Word document — the left/right
  // half of the SITE mapping was an unverified assumption (clockwise from
  // top: 0=top,1=right,2=bottom,3=left), and it was backwards. Decoded from
  // LibreOffice's oox-drawingml-cs-presets (its mirror of Microsoft's
  // presetShapeDefinitions.xml): both `rect` and `diamond` list connection
  // sites top(0)/left(1)/bottom(2)/right(3) — counter-clockwise, not
  // clockwise. `flowchart LR` is exactly the case that exercises idx 1/3, so
  // this would have gone uncaught by every TD-only test in this file.
  const xml = translate('graph LR\n  A[A] --> B[B]');
  assert.ok(/<a:stCxn id="\d+" idx="3"\/>/.test(xml), 'source should attach at the right (idx=3)');
  assert.ok(/<a:endCxn id="\d+" idx="1"\/>/.test(xml), 'target should attach at the left (idx=1)');
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
  // x can legitimately go slightly negative: the label box has a fixed width
  // (EDGE_LABEL_CX, sized for a short caption) centered on the connector's
  // x, which can now be narrower than that fixed label width since node
  // width is text-driven — a 1px overhang for single-char labels, not a bug.
  const label = /<wps:cNvPr id="\d+" name="EdgeLabel"\/>[\s\S]*?<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(xml);
  assert.ok(label);
  const y = Number(label[2]);
  // A[A] is 75px tall (see the connector-perimeter test above), so its
  // bottom is at y=75px; B[B] is at the next Dagre rank, LEVEL_GAP(80px)
  // below that, so its top is at y=155px. Midpoint y=115px. The old
  // node-center-to-node-center midpoint would have been a different value —
  // what matters here is the connector's real segment midpoint, not a
  // specific historical number.
  const midpointEmu = 115 * 9525;
  assert.ok(Math.abs(y + 228600 / 2 - midpointEmu) < 9525, `label y=${y} not on the connector midpoint`);
});

// --- Future-proofing (docs/specs/FUTURE_docx2mermaid_SPEC.md §4): retain the original
// Mermaid id on every emitted shape/connector, cheap now while the output
// format is still actively changing, expensive to retrofit once it's frozen.
// `descr` carries the id (not `name`, which stays the human label Word shows
// in its Selection Pane — a decision, not an oversight).

test('every node cNvPr carries its original Mermaid id in descr', () => {
  const xml = translate('graph TD\n  start[Start] --> decision1{Decision?}\n  decision1 --> theEnd[End]');
  for (const id of ['start', 'decision1', 'theEnd']) {
    assert.ok(
      xml.includes(`descr="${id}"`),
      `expected a cNvPr descr="${id}" for Mermaid node "${id}"`,
    );
  }
});

test('every connector cNvPr name is "{source}--{target}" in Mermaid ids', () => {
  const xml = translate('graph TD\n  start[Start] --> decision1{Decision?}\n  decision1 --> theEnd[End]');
  assert.ok(xml.includes('name="start--decision1"'));
  assert.ok(xml.includes('name="decision1--theEnd"'));
});

test('the Mermaid id in descr is XML-escaped (rule #2)', () => {
  // Mermaid ids are normally simple identifiers, but nothing stops a hostile
  // source file from trying to break out via the id itself.
  const { ast } = parseMermaid('graph TD\n  A["a"] --> B["b"]');
  ast.nodes[0]!.id = 'x"><evil a="';
  ast.edges[0]!.from = ast.nodes[0]!.id;
  const xml = translateToOoxml(ast, layout(ast));
  assert.ok(!xml.includes('<evil'));
});

// --- Edge routing (spec §9 "0 croisement de flèches"): a connector spanning
// more than one rank now follows Dagre's own routing around the intervening
// node instead of a straight line straight through it. ---

test('an adjacent-rank edge still renders as a plain straight line (no regression)', () => {
  const xml = translate('graph TD\n  A[A] --> B[B]');
  assert.ok(xml.includes('<a:prstGeom prst="line">'));
  assert.ok(!xml.includes('<a:custGeom>'));
});

test('a rank-skipping edge is routed around the intermediate node, not through it', () => {
  const xml = translate(
    'flowchart TD\n  A[Debut] --> B{Choix}\n  B -->|oui| C[Action]\n  B -->|non| D[Fin]\n  C --> D',
  );
  // The B->D connector ("non") must use a custom path, not a straight line.
  assert.ok(xml.includes('<a:custGeom>'), 'expected the skip-rank edge to use a:custGeom');

  // None of that path's points should fall inside Action's (C's) box.
  const actionBox = /<wps:cNvPr id="(\d+)" name="Action" descr="C"\/>[\s\S]*?<a:off x="(\d+)" y="(\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(
    xml,
  );
  assert.ok(actionBox, 'expected to find Action\'s own box');
  const [, , ax, ay, aw, ah] = actionBox!.map(Number);

  const custGeom = /<a:xfrm>\s*<a:off x="(\d+)" y="(\d+)"\/>[\s\S]*?<a:custGeom>[\s\S]*?<a:pathLst>([\s\S]*?)<\/a:pathLst>/.exec(
    xml,
  );
  assert.ok(custGeom, 'expected to find the custGeom connector');
  const [, offXStr, offYStr, pathBody] = custGeom!;
  const offX = Number(offXStr);
  const offY = Number(offYStr);
  const points = [...pathBody!.matchAll(/<a:pt x="(-?\d+)" y="(-?\d+)"\/>/g)].map((m) => ({
    x: Number(m[1]) + offX,
    y: Number(m[2]) + offY,
  }));
  assert.ok(points.length > 2, 'expected intermediate waypoints beyond just start/end');
  for (const p of points) {
    const inside = p.x > ax! && p.x < ax! + aw! && p.y > ay! && p.y < ay! + ah!;
    assert.ok(!inside, `connector point (${p.x},${p.y}) falls inside Action's box`);
  }
});

test('a label on a routed edge sits on the real path, not inside the node it routes around', () => {
  const xml = translate(
    'flowchart TD\n  A[Debut] --> B{Choix}\n  B -->|oui| C[Action]\n  B -->|non| D[Fin]\n  C --> D',
  );
  const actionBox = /<wps:cNvPr id="(\d+)" name="Action" descr="C"\/>[\s\S]*?<a:off x="(\d+)" y="(\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(
    xml,
  );
  assert.ok(actionBox);
  const [, , ax, ay, aw, ah] = actionBox!.map(Number);
  // "non" is B->D's label.
  const label = /<wps:cNvPr id="\d+" name="EdgeLabel"\/>[\s\S]*?<a:off x="(\d+)" y="(\d+)"\/>[\s\S]*?>non</.exec(
    xml,
  );
  assert.ok(label, 'expected to find the "non" edge label');
  const [, lx, ly] = label!.map(Number);
  const inside = lx! > ax! && lx! < ax! + aw! && ly! > ay! && ly! < ay! + ah!;
  assert.ok(!inside, `"non" label at (${lx},${ly}) overlaps Action's box`);
});

test('a routed connector still declares stCxn/endCxn for magnetic attachment', () => {
  const xml = translate(
    'flowchart TD\n  A[Debut] --> B{Choix}\n  B -->|oui| C[Action]\n  B -->|non| D[Fin]\n  C --> D',
  );
  const custGeomBlock = /<wps:cNvCnPr>[\s\S]*?<\/wps:cNvCnPr>[\s\S]*?<a:custGeom>/.exec(xml);
  assert.ok(custGeomBlock, 'expected a custGeom connector to still declare wps:cNvCnPr first');
  assert.ok(/<a:stCxn id="\d+" idx="\d"\/>/.test(custGeomBlock![0]));
  assert.ok(/<a:endCxn id="\d+" idx="\d"\/>/.test(custGeomBlock![0]));
});
