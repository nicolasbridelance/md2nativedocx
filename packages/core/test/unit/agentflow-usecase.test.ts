import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentflow } from '../../src/diagrams/agentflow/parser.js';
import { parseUseCase } from '../../src/diagrams/usecase/parser.js';
import { detectDiagramType } from '../../src/parser/diagram-type.js';
import { renderDiagram } from '../../src/render-diagram.js';
import { renderDiagramOdf } from '../../src/render-diagram-odf.js';
import type { Flowchart } from '../../src/types.js';

/** Edges as `from -[label]-> to`, nodes named by label. */
const edges = (ast: Flowchart): string[] => {
  const name = new Map(ast.nodes.map((n) => [n.id, n.label]));
  return ast.edges.map((e) => `${name.get(e.from)} -${e.label ? `[${e.label}]` : ''}${e.type}-> ${name.get(e.to)}`);
};

test('detection: agentflow-beta and usecase-beta are their own types', () => {
  assert.equal(detectDiagramType('agentflow-beta TB\n a --> b').type, 'agentflow');
  assert.equal(detectDiagramType('---\nconfig:\n  theme: default\n---\nusecase-beta\nactor A').type, 'usecase');
  assert.equal(detectDiagramType('railroad-beta\n x').type, 'mermaidUnsupported');
});

test('agentflow: flows are subgraphs, shapes follow the node kind, arrows to a flow reach its nodes', () => {
  const { ast, warnings } = parseAgentflow(`agentflow-beta LR
  brief["Release brief"]@{ shape: input }
  flow writer["Drafting Agent"]
    draft["Draft"]@{ shape: task }
    lookup["search"]@{ shape: tool }
    ok["Good?"]@{ shape: decision }
    draft --> lookup -- yes --> ok
    draft -.- ok
  end
  flow reviewer["Review Agent"]
    check["Check"]@{ shape: refdoc }
  end
  brief --> writer
  writer --> reviewer`);
  assert.deepEqual(warnings, []);
  assert.equal(ast.direction, 'LR');
  assert.deepEqual(
    ast.nodes.map((n) => [n.label, n.shape]).sort(),
    [['Check', 'document'], ['Draft', 'roundRect'], ['Good?', 'diamond'], ['Release brief', 'parallelogram'], ['search', 'subroutine']],
  );
  assert.deepEqual(ast.subgraphs.map((s) => s.title), ['Drafting Agent', 'Review Agent']);
  assert.deepEqual(edges(ast), [
    'Draft -arrow-> search',
    'search -[yes]arrow-> Good?',
    'Draft -dottedLine-> Good?',
    'Release brief -arrow-> Draft',
    'Good? -arrow-> Check',
  ]);
});

test('agentflow: nested flows, global block, inline node declarations, properties on their own line', () => {
  const { ast, warnings } = parseAgentflow(`agentflow-beta TB
  global
    corpus["Shared"]@{ shape: refdoc }
  end
  flow team["Team"]
    flow inner["Inner"]
      a["A"]@{ shape: task } --> b["B"]@{ shape: tool }
    end
    inner@{ instruction: "do it" }
  end
  b -.- corpus`);
  assert.equal(ast.subgraphs.length, 2);
  assert.deepEqual(ast.subgraphs[0]?.subgraphIds.length, 1);
  assert.ok(warnings.some((w) => /on a line of their own/.test(w)));
  assert.deepEqual(edges(ast), ['A -arrow-> B', 'B -dottedLine-> Shared']);
});

test('agentflow: hostile names and labels never reach the flowchart text as syntax', () => {
  const { ast } = parseAgentflow('agentflow-beta TB\n graph["x #quot; end"]@{ shape: task }\n subgraph["y"]\n graph --> subgraph');
  assert.equal(ast.nodes.length, 2);
  assert.equal(ast.edges.length, 1);
  assert.equal(ast.nodes[0]?.label, 'x " end');
  assert.ok(ast.nodes.every((n) => /^n\d+$/.test(n.id)));
});

test('usecase: actors, use cases, boundaries, include / extend, reversed and decorated arrows', () => {
  const { ast, warnings } = parseUseCase(`usecase-beta
direction LR
actor Customer("Buyer")
actor Support
systemBoundary Shop
  Browse("Browse catalogue")
  Checkout[Checkout]
end
Customer --> Browse
Customer -- "starts checkout" --> Checkout
Checkout ..> : include Browse
Browse --|> Checkout
Browse <-- Support
Checkout o-- Support
Support --o Checkout
Pay`);
  assert.equal(ast.direction, 'LR');
  assert.deepEqual(
    ast.nodes.map((n) => [n.label, n.shape]),
    [['Buyer', 'actor'], ['Support', 'actor'], ['Pay', 'ellipse'], ['Browse catalogue', 'ellipse'], ['Checkout', 'ellipse']],
  );
  assert.deepEqual(ast.subgraphs.map((s) => [s.title, s.nodeIds.length]), [['Shop', 2]]);
  assert.deepEqual(edges(ast), [
    'Buyer -arrow-> Browse catalogue',
    'Buyer -[starts checkout]arrow-> Checkout',
    'Checkout -[include]dotted-> Browse catalogue',
    'Browse catalogue -generalization-> Checkout',
    'Support -arrow-> Browse catalogue',
    'Support -circle-> Checkout',
    'Support -circle-> Checkout',
  ]);
  assert.deepEqual(warnings.filter((w) => /rrowhead/.test(w)), [], "`--|>` is a hollow triangle now, no warning");
});

test('usecase: stereotype, multi-line and entity labels, notes, json cards, colours on nodes', () => {
  const { ast } = parseUseCase(`usecase-beta
actor Boss("Boss") <<Employee>>
Quote("Show #quot;quoted#quot; text")
Multi("\`**Bold**
second line\`")
note for Quote "Check twice"
json Payload@{
  "a": { "b": 1 },
  "c": []
}:::data
classDef data stroke:#3572a5
class Quote data
style Boss stroke:#c33,stroke-width:4px
Boss --> Quote
Boss --> Payload`);
  const byLabel = new Map(ast.nodes.map((n) => [n.label, n]));
  assert.ok(byLabel.has('Boss «Employee»'));
  assert.ok(byLabel.has('Show "quoted" text'));
  assert.ok([...byLabel.keys()].some((l) => l.startsWith('Bold') && l.includes('second line')));
  assert.equal(byLabel.get('Check twice')?.shape, 'card');
  assert.equal(byLabel.get('Payload')?.shape, 'document');
  assert.equal(byLabel.get('Payload')?.stroke, '3572A5');
  assert.equal(byLabel.get('Show "quoted" text')?.stroke, '3572A5');
  assert.equal(byLabel.get('Boss «Employee»')?.stroke, 'CC3333');
});

test('usecase and agentflow render as shapes, SmartArt when asked, and as .odt; nothing external', () => {
  const sources = ['agentflow-beta TB\n a["A"] --> b["B"] --> c["C"]', 'usecase-beta\nactor U\nU --> Login\nLogin --> Home'];
  for (const source of sources) {
    const docx = renderDiagram(source, { smartArt: true, newPartId: () => 'part-1' });
    assert.notEqual(docx.metadata.diagramType, 'mermaidUnsupported');
    assert.doesNotMatch(docx.fragment, /TargetMode="External"/);
    const odf = renderDiagramOdf(source);
    assert.match(odf.fragment, /draw:/);
    assert.doesNotMatch(odf.fragment, /xlink:href|text:a\b/);
  }
});

test('limits: a huge source is capped, never thrown', () => {
  const lines = ['usecase-beta'];
  for (let i = 0; i < 1000; i++) lines.push(`A${i} --> B${i}`);
  const { ast, warnings } = parseUseCase(lines.join('\n'));
  assert.ok(ast.nodes.length <= 400);
  assert.ok(warnings.some((w) => /limited to 400 nodes/.test(w)));
  assert.doesNotThrow(() => parseAgentflow('agentflow-beta\nend\nend\nflow x[\n@{\n-- --> --'));
  assert.doesNotThrow(() => parseUseCase('usecase-beta\nsystemBoundary\nend\nend\n..> :\n"\n`'));
});

test('actor: one custom-geometry shape per format, label area below the figure, connectors attached', () => {
  const source = 'usecase-beta\nactor Customer("Buyer")\nCustomer --> Login';
  const docx = renderDiagram(source);
  // One wsp for the actor with a custom geometry (head arc + strokes) and four connection sites.
  assert.match(docx.fragment, /name="Buyer"[\s\S]*?<a:custGeom>[\s\S]*?<a:arcTo[\s\S]*?<\/a:custGeom>/);
  assert.equal((docx.fragment.match(/<a:cxn /g) ?? []).length, 4);
  assert.match(docx.fragment, /<a:stCxn id="\d+" idx="\d"\/>/);
  assert.doesNotMatch(docx.fragment, /TargetMode="External"/);
  const odf = renderDiagramOdf(source);
  assert.match(odf.fragment, /draw:name="Buyer"[\s\S]*?draw:enhanced-path="M \d+ \d+ C/);
  assert.match(odf.fragment, /draw:text-areas="0 \d+ \d+ \d+"/);
});

test('generalization and realization: typed on the edge, hollow triangle in .docx, plain arrow in .odt', () => {
  const { ast, warnings } = parseUseCase('usecase-beta\nactor Admin\nactor Person\nAdmin --|> Person\nCoupon ..|> Checkout\nPerson <|-- Staff\nAdmin --> Checkout');
  const name = new Map(ast.nodes.map((n) => [n.id, n.label]));
  assert.deepEqual(
    ast.edges.map((e) => `${name.get(e.from)} -${e.type}-> ${name.get(e.to)}`),
    ['Admin -generalization-> Person', 'Coupon -realization-> Checkout', 'Staff -generalization-> Person', 'Admin -arrow-> Checkout'],
  );
  assert.deepEqual(warnings.filter((w) => /rrowhead/.test(w)), []);
  const source = 'usecase-beta\nactor Admin\nactor Person\nAdmin --|> Person';
  const docx = renderDiagram(source);
  // The line has no end marker; the triangle is a white closed polygon right after the connector.
  assert.doesNotMatch(docx.fragment, /<a:(?:head|tail)End /);
  assert.match(docx.fragment, /<wps:cNvCnPr>[\s\S]*?<\/wps:wsp>\s*<wps:wsp>[\s\S]*?<a:close\/>[\s\S]*?<a:srgbClr val="FFFFFF">/);
  const odf = renderDiagramOdf(source);
  assert.ok(odf.metadata.warnings.some((w) => /Hollow triangles/.test(w)));
});
