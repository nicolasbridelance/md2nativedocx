import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitGraphDiagram } from '../../src/diagrams/git-graph/parser.js';
import { translateGitGraphToOoxml } from '../../src/diagrams/git-graph/translator.js';

function translate(text: string): string {
  const { ast } = parseGitGraphDiagram(text);
  return translateGitGraphToOoxml(ast);
}

const BASIC = `gitGraph
  commit
  commit
  branch develop
  checkout develop
  commit
  commit
  checkout main
  merge develop
  commit`;

test('wraps the drawing canvas in the schema-required paragraph hierarchy, same envelope as the other translators', () => {
  const xml = translate(BASIC);
  assert.ok(xml.startsWith('<w:p '));
  const order = ['<w:p ', '<w:r>', '<w:drawing>', '<wp:inline ', '<wpc:wpc ', '<wps:wsp>', '</wpc:wpc>', '</w:p>'];
  let idx = -1;
  for (const token of order) {
    const found = xml.indexOf(token, idx + 1);
    assert.ok(found > idx, `expected "${token}" after position ${idx}`);
    idx = found;
  }
});

test('an empty gitGraph diagram (no commits) renders a visible note, not a silent blank canvas', () => {
  const xml = translate('gitGraph\n  branch dev');
  assert.ok(xml.includes('has no commits to render'));
  assert.ok(!xml.includes('wpc:wpc'));
});

test('every commit gets a circle/ellipse shape (NORMAL/MERGE/REVERSE all use one)', () => {
  const xml = translate(BASIC);
  assert.ok((xml.match(/prst="ellipse"/g) ?? []).length >= 5);
});

test('a HIGHLIGHT commit renders as a rounded-rect shape, not an ellipse for that commit', () => {
  const plain = translate('gitGraph\n  commit');
  const highlighted = translate('gitGraph\n  commit type: HIGHLIGHT');
  assert.ok(plain.includes('prst="ellipse"'));
  assert.ok(highlighted.includes('prst="roundRect"'));
});

test('a merge commit renders two concentric ellipses (the bullseye/double-circle approximation)', () => {
  const xml = translate('gitGraph\n  commit\n  branch dev\n  commit\n  checkout main\n  merge dev');
  assert.equal((xml.match(/prst="ellipse"/g) ?? []).length, 4); // 2 plain commits + 2 for the merge's bullseye
});

test('each branch renders in a distinct color from the 8-color palette', () => {
  const xml = translate(BASIC);
  assert.ok(xml.includes('<a:srgbClr val="4472C4"/>')); // main, colorIndex 0
  assert.ok(xml.includes('<a:srgbClr val="ED7D31"/>')); // develop, colorIndex 1
});

test('a tag renders a labeled pennant box', () => {
  const xml = translate('gitGraph\n  commit tag: "v1.0.0"');
  assert.ok(xml.includes('<w:t xml:space="preserve">v1.0.0</w:t>'));
});

test('a cherry-pick commit draws a dashed traceability connector and an annotated id label', () => {
  const xml = translate('gitGraph\n  commit id: "ZERO"\n  branch dev\n  commit id: "B"\n  checkout main\n  cherry-pick id: "B"');
  assert.ok(xml.includes('<a:prstDash val="dash"/>'));
  assert.ok(xml.includes('(cherry-pick of B)'));
});

test('the diagram title renders as a bold banner and names the drawing frame', () => {
  const xml = translate('gitGraph\n  title My History\n  commit');
  assert.ok(xml.includes('<w:t xml:space="preserve">My History</w:t>'));
  assert.ok(xml.includes('name="My History"'));
});

test('branch names render as their own text labels', () => {
  const xml = translate(BASIC);
  assert.ok(xml.includes('<w:t xml:space="preserve">main</w:t>'));
  assert.ok(xml.includes('<w:t xml:space="preserve">develop</w:t>'));
});

test('commit ids/labels are XML-escaped', () => {
  const xml = translate('gitGraph\n  commit id: "A & B <tag>"');
  assert.ok(xml.includes('&amp;'));
  assert.ok(xml.includes('&lt;tag&gt;'));
});

test('TB orientation produces a taller-than-wide canvas relative to LR for the same content', () => {
  const mmd = 'gitGraph {ORIENT}\n  commit\n  branch dev\n  commit\n  checkout main\n  commit\n  commit\n  commit';
  const lr = translate(mmd.replace('{ORIENT}', 'LR:'));
  const tb = translate(mmd.replace('{ORIENT}', 'TB:'));
  const extentOf = (xml: string): { cx: number; cy: number } => {
    const m = xml.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)!;
    return { cx: Number(m[1]), cy: Number(m[2]) };
  };
  const lrExtent = extentOf(lr);
  const tbExtent = extentOf(tb);
  assert.ok(lrExtent.cx > lrExtent.cy);
  assert.ok(tbExtent.cy > tbExtent.cx);
});

test('is a pure function: identical input produces byte-identical output', () => {
  assert.equal(translate(BASIC), translate(BASIC));
});
