import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDiagramOdf, buildOdfDiagramTooLargeNote } from '../../src/render-diagram-odf.js';
import { translateToOdf, ODF_GRAPHIC_DEFINITIONS, ODF_STYLE_NAMES } from '../../src/translator/odf-translator.js';
import { layout } from '../../src/layout/layout.js';
import { DiagramTooLargeError } from '../../src/layout/graph-limits.js';
import type { Flowchart } from '../../src/types.js';

/** Every opening tag of `name` in `xml`, as its attribute text. */
function tags(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'g'))].map((m) => m[1]!);
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
}

test('flowchart: one as-char group in one paragraph, a shape per node, a connector per edge', () => {
  const { fragment, metadata } = renderDiagramOdf('graph TD\n  A[Start] --> B{Ok?}\n  B -->|yes| C[End]', { idPrefix: 'd1' });
  assert.ok(fragment.startsWith('<text:p><draw:g '));
  assert.ok(fragment.endsWith('</draw:g></text:p>'));
  assert.equal(tags(fragment, 'draw:g').length, 1);
  assert.equal(attr(tags(fragment, 'draw:g')[0]!, 'text:anchor-type'), 'as-char');
  assert.equal(tags(fragment, 'draw:custom-shape').length, 3);
  assert.equal(tags(fragment, 'draw:connector').length, 2);
  assert.deepEqual(metadata, { diagramType: 'flowchart', label: 'Flowchart', warnings: [] });
});

test('connectors reference existing shape ids, with glue points and the required viewBox', () => {
  const { fragment } = renderDiagramOdf('graph LR\n  A --> B\n  B --> C\n  C --> A', { idPrefix: 'x' });
  const ids = new Set(tags(fragment, 'draw:custom-shape').map((t) => attr(t, 'draw:id')));
  for (const shape of tags(fragment, 'draw:custom-shape')) assert.equal(attr(shape, 'xml:id'), attr(shape, 'draw:id'));
  for (const c of tags(fragment, 'draw:connector')) {
    assert.ok(ids.has(attr(c, 'draw:start-shape')), c);
    assert.ok(ids.has(attr(c, 'draw:end-shape')), c);
    assert.match(attr(c, 'draw:start-glue-point')!, /^[0-3]$/);
    assert.match(attr(c, 'draw:end-glue-point')!, /^[0-3]$/);
    assert.match(attr(c, 'svg:viewBox')!, /^0 0 \d+ \d+$/);
    for (const end of ['svg:x1', 'svg:y1', 'svg:x2', 'svg:y2']) assert.match(attr(c, end)!, /^-?\d+(\.\d+)?cm$/);
  }
});

test('glue points follow the direction: bottom to top in TD, right to left in LR', () => {
  const td = tags(renderDiagramOdf('graph TD\n  A --> B').fragment, 'draw:connector')[0]!;
  assert.equal(attr(td, 'draw:start-glue-point'), '2');
  assert.equal(attr(td, 'draw:end-glue-point'), '0');
  const lr = tags(renderDiagramOdf('graph LR\n  A --> B').fragment, 'draw:connector')[0]!;
  assert.equal(attr(lr, 'draw:start-glue-point'), '1');
  assert.equal(attr(lr, 'draw:end-glue-point'), '3');
});

test('ids and style names carry the prefix, so two diagrams in one document do not collide', () => {
  const a = renderDiagramOdf('graph TD\n  A --> B', { idPrefix: 'p1' });
  const b = renderDiagramOdf('graph TD\n  A --> B', { idPrefix: 'p2' });
  const names = (r: typeof a) => [
    ...tags(r.fragment, 'draw:custom-shape').map((t) => attr(t, 'xml:id')!),
    ...r.automaticStyles.map((s) => attr(s, 'style:name')!),
  ];
  for (const n of names(a)) assert.ok(n.startsWith('p1-'), n);
  for (const n of names(b)) assert.ok(n.startsWith('p2-'), n);
  for (const n of names(a)) assert.ok(!names(b).includes(n));
});

test('every style the fragment uses is declared, each declared once', () => {
  const { fragment, automaticStyles } = renderDiagramOdf(
    'graph TD\n  subgraph S[Group]\n    A["`**b** _i_`"] --> B\n  end\n  B -.->|l| C\n  C ==> C',
    { idPrefix: 's' },
  );
  const declared = automaticStyles.map((s) => attr(s, 'style:name')!);
  assert.equal(new Set(declared).size, declared.length);
  const used = [...fragment.matchAll(/(?:draw|text):style-name="([^"]+)"/g)].map((m) => m[1]!);
  for (const name of used) assert.ok(declared.includes(name), `undeclared style ${name}`);
  for (const s of automaticStyles) assert.match(s, /^<style:style style:name="s-[gpt]\d+" style:family="(graphic|paragraph|text)">/);
});

test('identical node colours share one graphic style', () => {
  const { automaticStyles } = renderDiagramOdf('graph TD\n  A --> B\n  B --> C\n  C --> D', { idPrefix: 'q' });
  const graphic = automaticStyles.filter((s) => s.includes('style:family="graphic"'));
  assert.equal(graphic.length, 2, 'one node style, one edge style');
});

test('edge types map to dash, width and the reference markers', () => {
  const { automaticStyles } = renderDiagramOdf(
    'graph LR\n  A --> B\n  B -.- C\n  C ==> D\n  D <--> E\n  E --o F\n  F x--x G\n  G ~~~ H',
    { idPrefix: 'e', maxDrawingCx: 914400 * 100 },
  );
  const all = automaticStyles.join('\n');
  assert.ok(all.includes(`draw:marker-end="${ODF_STYLE_NAMES.arrowMarker}"`));
  assert.ok(all.includes(`draw:stroke-dash="${ODF_STYLE_NAMES.dash}"`));
  assert.ok(all.includes('svg:stroke-width="2pt"'));
  assert.ok(all.includes(`draw:marker-start="${ODF_STYLE_NAMES.arrowMarker}"`));
  assert.ok(all.includes(`draw:marker-end="${ODF_STYLE_NAMES.circleMarker}"`));
  assert.ok(all.includes(`draw:marker-start="${ODF_STYLE_NAMES.crossMarker}"`));
  assert.ok(all.includes('draw:stroke="none"'), 'the invisible edge is kept, without a stroke');
});

test('the reference definitions define every name the styles use', () => {
  for (const name of Object.values(ODF_STYLE_NAMES)) assert.ok(ODF_GRAPHIC_DEFINITIONS.includes(`draw:name="${name}"`), name);
});

test('classDef, style and linkStyle colours reach the styles', () => {
  const { automaticStyles } = renderDiagramOdf(
    'graph TD\n  A --> B\n  classDef hot fill:#ff0000,stroke:#00ff00\n  class A hot\n  linkStyle 0 stroke:#0000ff,stroke-width:4px',
    { idPrefix: 'c' },
  );
  const all = automaticStyles.join('\n');
  assert.ok(all.includes('draw:fill-color="#FF0000"'));
  assert.ok(all.includes('svg:stroke-color="#00FF00"'));
  assert.ok(all.includes('svg:stroke-color="#0000FF"'));
  assert.ok(all.includes('svg:stroke-width="3pt"'), '4px is 3pt');
});

test('a dark fill gets white text, in the paragraph style of that shape', () => {
  const { fragment, automaticStyles } = renderDiagramOdf('graph TD\n  A\n  style A fill:#111111', { idPrefix: 'k' });
  const byName = (n: string) => automaticStyles.find((s) => s.includes(`style:name="${n}"`))!;
  const shape = /<draw:custom-shape draw:style-name="([^"]+)"[^>]*><text:p text:style-name="([^"]+)"/.exec(fragment)!;
  assert.ok(byName(shape[1]!).includes('draw:fill-color="#111111"'));
  assert.ok(byName(shape[2]!).includes('fo:color="#FFFFFF"'));
});

test('text size and colour live in paragraph styles, not graphic ones, and scale with the drawing', () => {
  const src = 'graph TD\n' + Array.from({ length: 30 }, (_, i) => `  n${i} -->|l| n${i + 1}`).join('\n');
  const { automaticStyles } = renderDiagramOdf(src, { idPrefix: 'z' });
  for (const s of automaticStyles.filter((x) => x.includes('style:family="graphic"'))) assert.ok(!s.includes('text-properties'), s);
  const sizes = automaticStyles.flatMap((s) => [...s.matchAll(/fo:font-size="([\d.]+)pt"/g)].map((m) => Number(m[1])));
  assert.ok(sizes.length >= 2 && sizes.every((size) => size < 8), `scaled sizes ${sizes}`);
});

test('subgraphs: a container shape behind the nodes, the outer one first', () => {
  const { fragment } = renderDiagramOdf(
    'graph TD\n  subgraph Outer\n    subgraph Inner\n      A\n    end\n    B\n  end\n  A --> B',
    { idPrefix: 'g' },
  );
  const shapes = tags(fragment, 'draw:custom-shape').map((t) => attr(t, 'draw:name'));
  assert.deepEqual(shapes.slice(0, 2), ['Outer', 'Inner']);
  assert.ok(fragment.indexOf('draw:name="Outer"') < fragment.indexOf('draw:name="A"'));
});

test('a self-loop is a polyline, not a connector bound twice to the same shape', () => {
  const { fragment } = renderDiagramOdf('graph TD\n  A --> A', { idPrefix: 'l' });
  assert.equal(tags(fragment, 'draw:connector').length, 0);
  const poly = tags(fragment, 'draw:polyline');
  assert.equal(poly.length, 1);
  assert.match(attr(poly[0]!, 'draw:points')!, /^\d+,\d+( \d+,\d+)+$/);
  assert.match(attr(poly[0]!, 'svg:viewBox')!, /^0 0 \d+ \d+$/);
});

test('rich labels: bold and italic spans, line breaks', () => {
  const { fragment } = renderDiagramOdf('graph TD\n  A["`**bold** _it_`"] --> B["one<br/>two"]', { idPrefix: 'r' });
  assert.match(fragment, /<text:span text:style-name="r-t\d+">bold<\/text:span>/);
  assert.ok(fragment.includes('one<text:line-break/>two'));
});

test('shapes: LibreOffice presets, the mirrored parallelogram, the narrow-top trapezoid as a path', () => {
  const { fragment } = renderDiagramOdf('graph TD\n  A{d} --> B[(c)]\n  B --> C[\\p\\]\n  C --> D[/t\\]\n  D --> E[\\u/]', { idPrefix: 'h' });
  assert.ok(fragment.includes('draw:type="diamond"'));
  assert.ok(fragment.includes('draw:type="can"'));
  assert.ok(fragment.includes('draw:type="parallelogram" draw:mirror-horizontal="true"'));
  assert.ok(fragment.includes('draw:enhanced-path="M 5400 0 L 16200 0 21600 21600 0 21600 Z N"'));
  assert.ok(fragment.includes('draw:type="trapezoid"/>'), 'the wide-top one is the preset as is');
  assert.ok(!fragment.includes('mirror-vertical'), 'a vertical mirror turns the text upside down');
});

test('a large diagram is scaled to the drawing area', () => {
  const src = 'graph LR\n' + Array.from({ length: 30 }, (_, i) => `  n${i} --> n${i + 1}`).join('\n');
  const { fragment } = renderDiagramOdf(src, { idPrefix: 'w', maxDrawingCx: 914400 * 4 });
  const right = Math.max(
    ...tags(fragment, 'draw:custom-shape').map((t) => parseFloat(attr(t, 'svg:x')!) + parseFloat(attr(t, 'svg:width')!)),
  );
  assert.ok(right <= 4 * 2.54 + 0.01, `${right}cm wider than 4in`);
});

test('not yet supported types: a note paragraph and a warning, no drawing', () => {
  const result = renderDiagramOdf('sequenceDiagram\n  A->>B: hi', { idPrefix: 'n' });
  assert.ok(!result.fragment.includes('draw:'));
  assert.match(result.fragment, /^<text:p><text:span text:style-name="n-note">Sequence diagram not converted/);
  assert.equal(result.automaticStyles.length, 1);
  assert.equal(result.metadata.diagramType, 'sequence');
  assert.equal(result.metadata.warnings.length, 1);
});

test('limits: source length and graph size throw DiagramTooLargeError; the note helper escapes', () => {
  assert.throws(() => renderDiagramOdf('graph TD\n  A --> B', { maxSourceLength: 5 }), DiagramTooLargeError);
  assert.throws(() => renderDiagramOdf('graph TD\n  A --> B --> C', { maxNodes: 2 }), DiagramTooLargeError);
  const note = buildOdfDiagramTooLargeNote({ message: 'a <b> & c' }, 'z');
  assert.ok(note.fragment.includes('a &lt;b&gt; &amp; c'));
  assert.throws(() => buildOdfDiagramTooLargeNote({ message: 'm' }, '1bad'), RangeError);
});

test('idPrefix is validated: it ends up in ids and style names', () => {
  for (const bad of ['', '1a', 'a b', 'a"b', 'a<b', 'x'.repeat(33), 'é']) {
    assert.throws(() => renderDiagramOdf('graph TD\n  A', { idPrefix: bad }), RangeError, JSON.stringify(bad));
  }
  assert.doesNotThrow(() => renderDiagramOdf('graph TD\n  A', { idPrefix: 'A_b-9' }));
});

// --- injection (AGENTS.md rule 2) ---

test('injection: labels, edge labels and subgraph titles are escaped', () => {
  const evil = `"/><office:scripts/><x a='`;
  const src = `graph TD\n  subgraph S["${evil} & <t>"]\n    A["${evil}"] -->|"${evil}"| B\n  end`;
  const { fragment, automaticStyles } = renderDiagramOdf(src, { idPrefix: 'i' });
  const all = fragment + automaticStyles.join('');
  assert.ok(!all.includes('<office:scripts'));
  assert.ok(!all.includes('<x '));
  assert.ok(fragment.includes('&lt;office:scripts/&gt;'));
  assert.ok(fragment.includes('&amp; &lt;t&gt;'));
});

test('injection: node ids in connector names are escaped', () => {
  const { fragment } = renderDiagramOdf('graph TD\n  A&B --> C', { idPrefix: 'j' });
  assert.ok(!/draw:name="[^"]*&(?!amp;|lt;|gt;|quot;|apos;)/.test(fragment));
});

test('injection: a colour that is not 6 hex digits never reaches a style', () => {
  const flowchart: Flowchart = {
    direction: 'TD',
    nodes: [
      { id: 'A', label: 'A', labelRuns: [{ text: 'A' }], shape: 'rect', fill: 'fff" draw:x="1', stroke: '"><script/>' },
      { id: 'B', label: 'B', labelRuns: [{ text: 'B' }], shape: 'rect' },
    ],
    edges: [{ from: 'A', to: 'B', type: 'arrow', label: null, labelRuns: null, stroke: 'red"/>', strokeWidth: Number.NaN }],
    subgraphs: [],
  };
  const { fragment, automaticStyles } = translateToOdf(flowchart, layout(flowchart), { idPrefix: 'v' });
  const all = fragment + automaticStyles.join('');
  assert.ok(!all.includes('script'));
  assert.ok(!all.includes('draw:x='));
  assert.ok(!all.includes('NaN'));
  assert.ok(automaticStyles.join('').includes('draw:fill-color="#D9E2F3"'), 'falls back to the default fill');
});

test('no link, image, object, script, event listener or DDE source in the output (rule 3)', () => {
  const src =
    'graph TD\n  A[https://example.com] --> B["file:///etc/passwd"]\n  click A "https://example.com"\n  click B call alert()';
  const { fragment, automaticStyles } = renderDiagramOdf(src, { idPrefix: 'u' });
  const all = fragment + automaticStyles.join('');
  for (const forbidden of ['xlink:href', '<text:a', '<draw:a', '<draw:image', '<draw:object', '<draw:plugin', '<draw:applet',
    '<draw:floating-frame', 'office:scripts', 'event-listener', 'office:dde-source']) {
    assert.ok(!all.includes(forbidden), forbidden);
  }
});

test('edge labels: the connector text area is centred, so the label sits mid-edge, not at its start', () => {
  const { fragment, automaticStyles } = renderDiagramOdf('graph TD\n  A -->|yes| B', { idPrefix: 'm' });
  const connector = tags(fragment, 'draw:connector')[0]!;
  const style = automaticStyles.find((s) => s.includes(`style:name="${attr(connector, 'draw:style-name')}"`))!;
  assert.ok(style.includes('draw:textarea-horizontal-align="center"'));
  assert.ok(style.includes('draw:textarea-vertical-align="middle"'));
});
