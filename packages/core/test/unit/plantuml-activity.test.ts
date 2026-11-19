import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creoleRuns, parsePlantUmlActivity } from '../../src/diagrams/plantuml/activity-parser.js';
import { detectDiagramType } from '../../src/parser/diagram-type.js';
import { renderDiagram } from '../../src/render-diagram.js';

const uml = (body: string): string => `@startuml\n${body}\n@enduml`;
/** Edges as `from -[label]-> to`, nodes named by label (diamonds in <>, circles by shape). */
const flow = (src: string): string[] => {
  const { ast } = parsePlantUmlActivity(uml(src));
  const name = new Map(ast.nodes.map((n) => [n.id, n.shape === 'diamond' ? `<${n.label}>` : n.label === '' ? n.shape : n.label]));
  return ast.edges.map((e) => `${name.get(e.from)} -${e.label ? `[${e.label}]` : ''}-> ${name.get(e.to)}`);
};

test('detection: activity keywords and actions win over other readings; list-only diagrams too', () => {
  for (const src of ['start\n:a;\nstop', ':a;', '(1)\n:a;\n(A)', 'if (x) then\n:a;\nendif', '- Action 1\n- Action 2', '<style>\nx {}\n</style>\n* A\n** B']) {
    assert.equal(detectDiagramType(uml(src)).type, 'plantumlActivity', src);
  }
  assert.equal(detectDiagramType(uml('Alice -> Bob : hi')).type, 'plantumlSequence');
});

test('actions: one or several lines, start/stop/end, SDL endings and stereotypes pick a shape', () => {
  const { ast, warnings } = parsePlantUmlActivity(uml('start\n:Hello;\n:several\n**lines**;\n:in; <<input>>\n:proc|\nstop'));
  assert.deepEqual(warnings, []);
  assert.deepEqual(
    ast.nodes.map((n) => [n.label, n.shape]),
    [
      ['', 'ellipse'],
      ['Hello', 'roundRect'],
      ['several lines', 'roundRect'],
      ['in', 'parallelogram'],
      ['proc', 'subroutine'],
      ['', 'ellipse'],
    ],
  );
  // Start and stop are black discs.
  assert.equal(ast.nodes[0]?.fill, '000000');
  assert.deepEqual(ast.nodes[2]?.labelRuns, [{ text: 'several' }, { break: true }, { text: 'lines', bold: true }]);
});

test('if / elseif / else / endif: branches with labels, all joining what follows', () => {
  assert.deepEqual(flow('if (A?) then (yes)\n:a;\n(no) elseif (B?) then (yes)\n:b;\nelse (other)\n:c;\nendif\n:after;'), [
    '<A?> -[yes]-> a',
    '<A?> -[no]-> <B?>',
    '<B?> -[yes]-> b',
    '<B?> -[other]-> c',
    'a --> after',
    'b --> after',
    'c --> after',
  ]);
  // Without else, the "no" side goes straight on; `is (x)` labels the "yes" side.
  assert.deepEqual(flow('if (color?) is (red) then\n:r;\nendif\n:z;'), ['<color?> -[red]-> r', 'r --> z', '<color?> --> z']);
});

test('switch, while (with backward), repeat (with backward and break), fork, arrows with labels', () => {
  assert.deepEqual(flow('switch (t?)\ncase (A)\n:a;\ncase (B)\n:b;\nendswitch\n:z;'), ['<t?> -[A]-> a', '<t?> -[B]-> b', 'a --> z', 'b --> z']);
  assert.deepEqual(flow('while (more?) is (yes)\n:read;\nbackward:log;\nendwhile (no)\n:close;'), [
    '<more?> -[yes]-> read',
    'read --> log',
    'log --> <more?>',
    '<more?> -[no]-> close',
  ]);
  assert.deepEqual(flow('repeat\n:a;\nif (bad?) then\nbreak\nendif\n:b;\nrepeat while (again?) is (yes) not (no)\n:z;'), [
    'a --> <bad?>',
    '<bad?> --> b',
    'b --> <again?>',
    '<again?> -[yes]-> a',
    '<again?> -[no]-> z',
    '<bad?> --> z',
  ]);
  assert.deepEqual(flow(':s;\nfork\n:a;\nfork again\n:b;\nend fork\n-> done;\n:z;'), ['s --> a', 's --> b', 'a -[done]-> z', 'b -[done]-> z']);
});

test('swimlanes and partitions become subgraphs; goto jumps to a label; hidden arrows stay invisible', () => {
  const { ast, warnings } = parsePlantUmlActivity(
    uml('|Lane A|\nstart\n:a;\n|#pink|Lane B|\npartition "Part" {\n:b;\n}\nlabel here\n:c;\n-[hidden]->\n:d;\ngoto here'),
  );
  assert.deepEqual(warnings.filter((w) => /ignored/.test(w)), []);
  assert.deepEqual(
    ast.subgraphs.map((s) => [s.title, s.nodeIds.length]),
    [
      ['Lane A', 2],
      ['Lane B', 2],
      ['Part', 1],
    ],
  );
  assert.ok(ast.edges.some((e) => e.type === 'invisible'));
  const c = ast.nodes.find((n) => n.label === 'c')?.id;
  const d = ast.nodes.find((n) => n.label === 'd')?.id;
  assert.ok(ast.edges.some((e) => e.from === d && e.to === c), 'goto edge');
});

test('creole: bold/italic kept, other markup reduced to text, no link and no image ever kept', () => {
  const { text, runs } = creoleRuns('a **b** //c// ""d"" [[https://evil.example e]] <img:https://evil.example/x.png> <U+221E>');
  assert.equal(text, 'a b c d e ∞');
  assert.ok(runs.some((r) => 'bold' in r && r.bold));
  assert.ok(!JSON.stringify(runs).includes('evil'));
});

test('skipped content: notes, skinparam, style, title, pragma, colours', () => {
  const { ast, warnings } = parsePlantUmlActivity(
    uml('!pragma useVerticalIf on\ntitle T\nskinparam conditionStyle inside\n<style>\nactivity { x }\n</style>\n:a; <<#pink>>\nnote right\n several\nend note\nfloating note left: x\n#blue:b;'),
  );
  assert.deepEqual(warnings.filter((w) => /ignored:/.test(w)), []);
  assert.deepEqual(ast.nodes.map((n) => n.label), ['a', 'b']);
});

test('hostile labels are escaped in the Word output (AGENTS rule 2)', () => {
  const { fragment } = renderDiagram(uml(':<evil a=\'1\'>&;\nif (</w:t><w:evil/>) then ("quote" & <b>)\n:x;\nendif'));
  assert.ok(!fragment.includes('<evil'));
  assert.ok(!fragment.includes('<w:evil'));
  assert.ok(fragment.includes('&lt;evil'));
});

test('renderDiagram: an activity is a flowchart; a straight sequence becomes a SmartArt process', () => {
  const branches = renderDiagram(uml('start\nif (x?) then\n:a;\nelse\n:b;\nendif\nstop'), { smartArt: true });
  assert.equal(branches.metadata.diagramType, 'plantumlActivity');
  assert.equal(branches.kind, 'shapes');
  const chain = renderDiagram(uml(':one;\n:two;\n:three;'), { smartArt: true });
  assert.equal(chain.kind, 'smartart');
});

test('never throws on malformed input, and caps hostile sizes', () => {
  for (const junk of ['@startuml', uml('endif\nelse\nendwhile\nend fork\n}\nrepeat while (x)\nbreak\ngoto nowhere\n:unclosed'), uml('if (a) then\n'.repeat(60)), uml('|x|\n|y|\n(')]) {
    assert.doesNotThrow(() => parsePlantUmlActivity(junk));
    assert.doesNotThrow(() => renderDiagram(junk));
  }
  const { ast, warnings } = parsePlantUmlActivity(uml(Array.from({ length: 500 }, (_, i) => `:a${i};`).join('\n')));
  assert.equal(ast.nodes.length, 400);
  assert.ok(warnings.some((w) => w.includes('limited to 400')));
});
