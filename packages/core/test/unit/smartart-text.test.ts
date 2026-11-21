import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateChain } from '../../src/smartart/chain.js';
import { generateCycle } from '../../src/smartart/cycle.js';
import { generateTree } from '../../src/smartart/tree.js';
import { parseMermaid } from '../../src/parser/index.js';
import { boxText, pointTextXml } from '../../src/smartart/text.js';

test('box text: <br/> becomes <a:br/>, an edge label is merged into a plain first run', () => {
  const node = parseMermaid('flowchart LR\n  A[a<br/>b]').ast.nodes[0]!;
  assert.equal(
    pointTextXml(boxText(node, 'yes')),
    '<dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR"/><a:t>yes : a</a:t></a:r><a:br><a:rPr lang="fr-FR"/></a:br><a:r><a:rPr lang="fr-FR"/><a:t>b</a:t></a:r></a:p></dgm:t>'
  );
});

test('box text is XML-escaped in every generator, data and drawing', () => {
  const src = 'flowchart LR\n  A["<script> & \'x\'"] --> B["a<br/>\\"b\\""]';
  const chain = generateChain(parseMermaid(src).ast, { drawing: true });
  const cycle = generateCycle(parseMermaid(src + '\n  B --> A').ast, { drawing: true });
  const tree = generateTree(parseMermaid('flowchart TD\n  A["<script>"] --> B[x]\n  A --> C["&"]').ast, { drawing: true });
  for (const part of [chain.dataXml, chain.drawingXml ?? '', cycle.dataXml, cycle.drawingXml ?? '', tree.dataXml, tree.drawingXml ?? '']) {
    assert.ok(!part.includes('<script>'), 'no raw tag');
    assert.ok(part.includes('&lt;script&gt;'));
  }
});

test('a flowchart chain keeps its original layout when no box has three lines, and gets <br/> lines otherwise', () => {
  const plain = generateChain(parseMermaid('flowchart LR\n  A[One] --> B[Two<br/>lines]').ast);
  assert.ok(plain.layoutXml.includes('uniqueId="urn:md2nativedocx/smartart-layout/chain1"'));
  assert.ok(plain.dataXml.includes('<a:t>Two</a:t></a:r><a:br><a:rPr lang="fr-FR"/></a:br><a:r><a:rPr lang="fr-FR"/><a:t>lines</a:t>'));
  const tall = generateChain(parseMermaid('flowchart TD\n  A[a<br/>b<br/>c<br/>d] --> B[x]').ast);
  assert.ok(tall.layoutXml.includes('chain1-td-h120'));
});

test('Markdown-string bold/italic reach the SmartArt runs', () => {
  const out = generateChain(parseMermaid('flowchart LR\n  A["`**Idea** first`"] --> B["`Ship *now*`"]').ast, { drawing: true });
  assert.ok(out.dataXml.includes('<a:rPr lang="fr-FR" b="1"/><a:t>Idea</a:t>'));
  assert.ok(out.dataXml.includes('<a:rPr lang="fr-FR" i="1"/><a:t>now</a:t>'));
  assert.ok(out.drawingXml?.includes('b="1"'));
});

test('a point with its own fill writes its text in the colour readable on it, in the data model too', () => {
  // Word lays the SmartArt out again from the data model: without a colour there, a light fill kept the
  // quick style's white text (seen on a highlighted tree view row, 2026-11-21).
  const dark = '<a:solidFill><a:schemeClr val="dk1"/></a:solidFill>';
  const light = '<a:solidFill><a:schemeClr val="lt1"/></a:solidFill>';
  assert.ok(pointTextXml([{ text: 'a' }, { break: true }], 'FFF2CC').includes(`<a:rPr lang="fr-FR">${dark}</a:rPr><a:t>a</a:t>`));
  assert.ok(pointTextXml([{ text: 'a', bold: true }], '1F3864').includes(`<a:rPr lang="fr-FR" b="1">${light}</a:rPr>`));
  assert.ok(!pointTextXml([{ text: 'a' }]).includes('solidFill'));
  assert.ok(!pointTextXml([{ text: 'a' }], 'not-a-colour').includes('solidFill'));

  const styled = 'classDef pale fill:#fff2cc\n  class A pale';
  const chain = generateChain(parseMermaid(`flowchart LR\n  A[x] --> B[y]\n  ${styled}`).ast);
  const cycle = generateCycle(parseMermaid(`flowchart LR\n  A[x] --> B[y] --> C[z] --> A\n  ${styled}`).ast);
  const tree = generateTree(parseMermaid(`flowchart TD\n  A[x] --> B[y]\n  A --> C[z]\n  ${styled}`).ast);
  for (const { dataXml } of [chain, cycle, tree]) {
    assert.ok(dataXml.includes(`${dark}</a:rPr><a:t>x</a:t>`));
    assert.ok(dataXml.includes('<a:rPr lang="fr-FR"/><a:t>y</a:t>'));
  }
});
