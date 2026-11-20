import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSource, splitFrontmatter } from '../../src/parser/frontmatter.js';
import { renderDiagram } from '../../src/index.js';
import { renderDiagramOdf } from '../../src/render-diagram-odf.js';

test('splitFrontmatter: title (quoted or not), options, body', () => {
  const fm = splitFrontmatter('---\ntitle: "Order flow"\nconfig:\n  theme: forest\n---\nflowchart LR\n  A --> B');
  assert.equal(fm.title, 'Order flow');
  assert.equal(fm.hasOptions, true);
  assert.equal(fm.body, 'flowchart LR\n  A --> B');
  assert.deepEqual(splitFrontmatter('flowchart LR\n  A --> B'), { body: 'flowchart LR\n  A --> B', hasOptions: false });
  assert.equal(splitFrontmatter('\uFEFF---\r\ntitle: x\r\n---\r\npie').body, 'pie');
});

test('prepareSource: a frontmatter title becomes the title statement of a type that has one', () => {
  const { source, warnings } = prepareSource('---\ntitle: UDP\n---\npacket\n0-15: "Port"', 'packet');
  assert.equal(source, 'packet\ntitle UDP\n0-15: "Port"');
  assert.deepEqual(warnings, []);
  // A title already in the body wins.
  assert.equal(prepareSource('---\ntitle: A\n---\npie\ntitle B\n"x": 1', 'pie').source, 'pie\ntitle B\n"x": 1');
});

test('prepareSource: title on a type without a title statement is returned to be drawn; options are reported', () => {
  const prepared = prepareSource('---\ntitle: T\nconfig:\n  look: handDrawn\n---\nflowchart TD\n  A --> B', 'flowchart');
  assert.equal(prepared.source, 'flowchart TD\n  A --> B');
  assert.equal(prepared.title, 'T');
  assert.equal(prepared.warnings.length, 1);
  assert.match(prepared.warnings[0]!, /Frontmatter options/);
  assert.equal(prepareSource('---\ntitle: UDP\n---\npacket\n0-15: "Port"', 'packet').title, undefined);
});

test('renderDiagram: a frontmatter title is drawn above a flowchart, kept with it, and escaped', () => {
  const r = renderDiagram(`---\ntitle: "Orders <&> 'flow'"\n---\nflowchart TD\n  A --> B`);
  assert.deepEqual(r.metadata.warnings, []);
  assert.ok(r.fragment.startsWith('<w:p><w:pPr><w:keepNext/><w:jc w:val="left"/></w:pPr>'), r.fragment.slice(0, 120));
  assert.ok(r.fragment.includes('Orders &lt;&amp;&gt; &apos;flow&apos;'));
  assert.ok(r.fragment.indexOf('<w:drawing>') > r.fragment.indexOf('Orders'));
});

test('renderDiagram: a frontmatter title is drawn above every kind of rendering (class diagram shown)', () => {
  const r = renderDiagram('---\ntitle: Animal example\n---\nclassDiagram\n  Animal <|-- Duck');
  assert.ok(r.metadata.warnings.every((w) => !w.includes('title')), r.metadata.warnings.join(' | '));
  assert.ok(r.fragment.includes('>Animal example</w:t>'));
});

test('renderDiagramOdf: a frontmatter title becomes a bold paragraph above the drawing', () => {
  const r = renderDiagramOdf('---\ntitle: "A <b>"\n---\nflowchart TD\n  A --> B', { idPrefix: 'd1' });
  assert.ok(r.fragment.startsWith('<text:p text:style-name="d1-title">A &lt;b&gt;</text:p><text:p>'), r.fragment.slice(0, 120));
  assert.ok(r.automaticStyles.some((s) => s.includes('style:name="d1-title"') && s.includes('fo:keep-with-next="always"')));
});

test('renderDiagram: frontmatter lines are no longer reported as unsupported statements', () => {
  const r = renderDiagram('---\nconfig:\n  logLevel: debug\n  theme: base\n---\ngitGraph\n  commit\n  branch dev\n  commit');
  assert.equal(r.metadata.diagramType, 'gitGraph');
  assert.ok(r.metadata.warnings.every((w) => !/Unsupported line/.test(w)), r.metadata.warnings.join(' | '));
});

test('frontmatter: a hostile title is plain text, never XML', () => {
  const r = renderDiagram('---\ntitle: "<w:p/>&\'"\n---\npie\n"a": 1');
  assert.ok(!r.fragment.includes('<w:p/>&'));
});
