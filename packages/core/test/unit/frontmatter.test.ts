import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSource, splitFrontmatter } from '../../src/parser/frontmatter.js';
import { renderDiagram } from '../../src/index.js';

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

test('prepareSource: title on a type without a title statement, and options, are reported', () => {
  const { source, warnings } = prepareSource('---\ntitle: T\nconfig:\n  look: handDrawn\n---\nflowchart TD\n  A --> B', 'flowchart');
  assert.equal(source, 'flowchart TD\n  A --> B');
  assert.equal(warnings.length, 2);
  assert.match(warnings[0]!, /title "T" is not drawn/);
  assert.match(warnings[1]!, /Frontmatter options/);
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
