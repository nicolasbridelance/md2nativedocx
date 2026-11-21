import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';
import { renderDiagram } from '../../src/index.js';
import { renderDiagramOdf } from '../../src/render-diagram-odf.js';

// TODO R2.2: `color:` in classDef / style / ::: sets the label colour of a node.

const sources: Array<[string, string]> = [
  ['classDef + :::', 'graph TD\n  classDef k fill:#FFFF00,color:#FF0000\n  A[One]:::k --> B[Two]'],
  ['classDef + class (declared after)', 'graph TD\n  A[One] --> B[Two]\n  classDef k color:#FF0000,fill:#FFFF00\n  class A k'],
  ['style', 'graph TD\n  A[One] --> B[Two]\n  style A fill:#FFFF00,color:#FF0000'],
  ['style before the node exists', 'graph TD\n  style A color:#FF0000\n  A[One] --> B[Two]'],
  ['color first, with a trailing ;', 'graph TD\n  A[One] --> B[Two]\n  style A color:#f00;'],
];

for (const [name, src] of sources) {
  test(`parser keeps node text colour: ${name}`, () => {
    const a = parseMermaid(src).ast.nodes.find((n) => n.id === 'A')!;
    assert.equal(a.textColor, 'FF0000');
    assert.equal(parseMermaid(src).ast.nodes.find((n) => n.id === 'B')!.textColor, undefined);
  });
}

test('OOXML: the label run of A is red, B keeps the automatic colour', () => {
  const xml = renderDiagram(sources[2]![1]).fragment;
  assert.match(xml, /<w:color w:val="FF0000"\/>/);
  assert.equal((xml.match(/<w:color w:val="FF0000"\/>/g) ?? []).length, 1);
});

test('ODF: the text style of A is red', () => {
  const xml = renderDiagramOdf(sources[2]![1]).automaticStyles.join('');
  assert.match(xml, /fo:color="#FF0000"/);
});

test('without `color:` the automatic black/white choice is unchanged', () => {
  const xml = renderDiagram('graph TD\n  A --> B\n  style A fill:#000000').fragment;
  assert.match(xml, /<w:color w:val="FFFFFF"\/>/);
});

test('an invalid colour value is dropped, never written to the XML', () => {
  for (const bad of ['reddish;"><x/>', 'url(#x)', '#GGGGGG', '#12345', 'constructor']) {
    const src = `graph TD\n  A[One] --> B\n  style A color:${bad}`;
    assert.equal(parseMermaid(src).ast.nodes.find((n) => n.id === 'A')!.textColor, undefined, bad);
    assert.ok(!renderDiagram(src).fragment.includes('<x/>'));
  }
});
