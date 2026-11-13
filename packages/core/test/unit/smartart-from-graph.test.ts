import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitGraphDiagram } from '../../src/diagrams/git-graph/parser.js';
import { parseStateDiagram } from '../../src/diagrams/state-diagram/parser.js';
import { parseClassDiagram } from '../../src/diagrams/class-diagram/parser.js';
import {
  classDiagramSmartArtLayout,
  classDiagramToFlowchart,
  generateClassDiagramSmartArt,
  generateGitGraphSmartArt,
  generateStateDiagramSmartArt,
  gitGraphSmartArtLayout,
  stateDiagramSmartArtLayout,
} from '../../src/smartart/from-graph.js';

const git = (src: string) => parseGitGraphDiagram(src).ast;
const state = (src: string) => parseStateDiagram(src).ast;
const cls = (src: string) => parseClassDiagram(src).ast;

test('gitGraph: main branch only -> process (commit id in bold, tag under it); any branch -> shapes', () => {
  const linear = git('gitGraph\n  commit id: "Init"\n  commit id: "Fix" tag: "v1.0"\n  commit');
  assert.equal(gitGraphSmartArtLayout(linear), 'chain');
  const out = generateGitGraphSmartArt(linear, { drawing: true });
  assert.equal(out?.layout, 'chain');
  assert.ok(out?.dataXml.includes('<a:rPr lang="fr-FR" b="1"/><a:t>Fix</a:t>'));
  assert.ok(out?.dataXml.includes('<a:t>v1.0</a:t>'));
  assert.equal(gitGraphSmartArtLayout(git('gitGraph\n  commit\n  branch dev\n  commit\n  checkout main\n  merge dev')), null);
  assert.equal(gitGraphSmartArtLayout(git('gitGraph\n  commit')), null);
});

test('stateDiagram: a loop -> cycle, a line -> process, start/end markers set aside; a branching machine -> shapes', () => {
  const loop = state('stateDiagram-v2\n  [*] --> A\n  A --> B : go\n  B --> C\n  C --> A');
  assert.equal(stateDiagramSmartArtLayout(loop), 'cycle');
  assert.ok(generateStateDiagramSmartArt(loop)?.dataXml.includes('go : B'));
  assert.equal(stateDiagramSmartArtLayout(state('stateDiagram-v2\n  [*] --> A\n  A --> B\n  B --> [*]')), 'chain');
  assert.equal(stateDiagramSmartArtLayout(state('stateDiagram-v2\n  A --> B\n  A --> C')), null, 'a tree-shaped machine is not an org chart');
  assert.equal(stateDiagramSmartArtLayout(state('stateDiagram-v2\n  state c <<choice>>\n  A --> c\n  c --> B')), null);
});

test('classDiagram: inheritance-only tree -> hierarchy, superclass on top, members in the box; other relations -> shapes', () => {
  const tree = cls('classDiagram\n  Animal <|-- Chien\n  Chat --|> Animal\n  Animal : +manger()');
  const fc = classDiagramToFlowchart(tree);
  assert.deepEqual(fc?.edges.map((e) => [e.from, e.to]), [['Animal', 'Chien'], ['Animal', 'Chat']]);
  assert.equal(classDiagramSmartArtLayout(tree), 'tree');
  const out = generateClassDiagramSmartArt(tree, { drawing: true });
  assert.ok(out?.dataXml.includes('<a:t>+manger()</a:t>'));
  assert.equal(classDiagramSmartArtLayout(cls('classDiagram\n  A <|-- B\n  B --> C')), null);
  assert.equal(classDiagramSmartArtLayout(cls('classDiagram\n  class A')), null);
});

test('labels from all three are XML-escaped in every SmartArt part', () => {
  const parts = [
    generateGitGraphSmartArt(git('gitGraph\n  commit id: "<script>"\n  commit id: "a&b"'), { drawing: true }),
    generateStateDiagramSmartArt(state('stateDiagram-v2\n  A --> B : <script>\n  B --> C : a&b'), { drawing: true }),
    generateClassDiagramSmartArt(cls('classDiagram\n  A <|-- B\n  A : +x List~<script>~\n  B : +y a&b'), { drawing: true }),
  ];
  for (const out of parts) {
    assert.ok(out);
    for (const part of [out.dataXml, out.drawingXml ?? '']) {
      assert.ok(!part.includes('<script>'));
      assert.ok(part.includes('&amp;'));
    }
  }
});
