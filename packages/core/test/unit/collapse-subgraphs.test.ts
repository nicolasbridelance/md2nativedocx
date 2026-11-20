import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/index.js';
import { collapseSubgraphs, FOLDED_MARK } from '../../src/layout/collapse-subgraphs.js';
import { renderDiagram } from '../../src/render-diagram.js';
import { renderDiagramOdf } from '../../src/render-diagram-odf.js';

const NESTED =
  'flowchart LR\n  X --> A\n  subgraph P [Parent]\n    subgraph C [Folded]\n      A --> B\n      subgraph N\n        D\n      end\n    end\n    E\n  end\n  B --> E\n  D --> Y\n  C@{ view: collapsed }';

test('the parser marks a collapsed subgraph and keeps its contents, as Mermaid does', () => {
  const { ast, warnings } = parseMermaid(NESTED);
  assert.deepEqual(warnings, []);
  assert.equal(ast.subgraphs.find((s) => s.id === 'C')!.collapsed, true);
  assert.ok(ast.nodes.some((n) => n.id === 'A'), 'the contents stay in the parsed diagram');
  assert.ok(!ast.nodes.some((n) => n.id === 'C'), 'the `C@{ … }` statement is not a node');
});

test('collapseSubgraphs folds the subgraph into one node and redirects the links into it', () => {
  const folded = collapseSubgraphs(parseMermaid(NESTED).ast);
  assert.deepEqual(folded.nodes.map((n) => `${n.id}:${n.shape}`).sort(), ['C:collapsedGroup', 'E:rect', 'X:rect', 'Y:rect']);
  assert.deepEqual(folded.edges.map((e) => `${e.from}->${e.to}`), ['X->C', 'C->E', 'C->Y'], 'A->B stayed inside: not drawn');
  assert.deepEqual(folded.subgraphs, [{ id: 'P', title: 'Parent', nodeIds: ['E', 'C'], subgraphIds: [] }]);
  const node = folded.nodes.find((n) => n.id === 'C')!;
  assert.equal(node.label, 'Folded');
  assert.deepEqual(node.labelRuns, [{ text: 'Folded' }, { break: true }, { text: FOLDED_MARK }]);
});

test('collapseSubgraphs folds into the outermost collapsed subgraph and leaves an open diagram alone', () => {
  const src = 'flowchart TD\n  subgraph O\n    subgraph I\n      A\n    end\n  end\n  A --> Z\n  O@{ view: collapsed }\n  I@{ view: collapsed }';
  const folded = collapseSubgraphs(parseMermaid(src).ast);
  assert.deepEqual(folded.nodes.map((n) => n.id).sort(), ['O', 'Z']);
  assert.deepEqual(folded.edges.map((e) => `${e.from}->${e.to}`), ['O->Z']);
  const open = parseMermaid('flowchart TD\n  subgraph S\n    A\n  end').ast;
  assert.equal(collapseSubgraphs(open), open);
});

test('a folded subgraph is drawn in the subgraph colours, its title escaped (.docx and .odt)', () => {
  // Injection case (AGENTS.md): the title becomes the folded node's text.
  const src = 'flowchart TD\n  Start --> one\n  subgraph one ["a <b> & c"]\n    A --> B\n  end\n  one@{ view: collapsed }';
  const docx = renderDiagram(src);
  assert.deepEqual(docx.metadata.warnings, []);
  assert.ok(docx.fragment.includes('<a:prstGeom prst="roundRect">'));
  assert.ok(docx.fragment.includes('<a:srgbClr val="E8E8E8"/>'), 'subgraph fill');
  assert.ok(docx.fragment.includes('a &lt;b&gt; &amp; c'));
  assert.ok(!docx.fragment.includes('<b>'));
  assert.ok(docx.fragment.includes(FOLDED_MARK));
  assert.ok(!docx.fragment.includes('>A</w:t>'), 'the contents are not drawn');
  const odt = renderDiagramOdf(src, { idPrefix: 'c1' });
  assert.ok(odt.fragment.includes('draw:type="round-rectangle"'));
  assert.ok(odt.automaticStyles.some((s) => s.includes('draw:fill-color="#E8E8E8"') && s.includes('svg:stroke-color="#999999"')));
  assert.ok(odt.fragment.includes('a &lt;b&gt; &amp; c'));
});
