import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDiagramType } from '../../src/parser/diagram-type.js';
import { buildUnsupportedDiagramTypeNoteXml } from '../../src/translator/unsupported-diagram-note.js';

test('recognizes graph/flowchart headers as flowchart', () => {
  assert.equal(detectDiagramType('graph TD\n  A --> B').type, 'flowchart');
  assert.equal(detectDiagramType('flowchart LR\n  A --> B').type, 'flowchart');
  assert.equal(detectDiagramType('graph\n  A --> B').type, 'flowchart');
});

test('skips blank lines and %% comments/init directives before classifying', () => {
  const info = detectDiagramType('\n\n%%{init: {"theme": "dark"}}%%\n%% a comment\ngitGraph\n  commit');
  assert.equal(info.type, 'gitGraph');
});

test('recognizes the bug case from the roadmap: gitGraph and mindmap headers', () => {
  assert.equal(detectDiagramType('gitGraph\n  commit\n  commit').type, 'gitGraph');
  assert.equal(detectDiagramType('mindmap\n  root((mind))\n    child').type, 'mindmap');
});

test('recognizes a representative sample of the other ~28 diagram types', () => {
  const cases: Array<[string, string]> = [
    ['sequenceDiagram\n  Alice->>Bob: Hi', 'sequence'],
    ['classDiagram\n  class Foo', 'class'],
    ['stateDiagram-v2\n  [*] --> A', 'state'],
    ['erDiagram\n  A ||--o{ B : has', 'er'],
    ['journey\n  title My day', 'journey'],
    ['gantt\n  title A Gantt Diagram', 'gantt'],
    ['pie title Pets\n  "Dogs" : 10', 'pie'],
    ['quadrantChart\n  title Reach', 'quadrant'],
    ['requirementDiagram\n  requirement test_req {}', 'requirement'],
    ['C4Context\n  Person(a, "A")', 'c4'],
    ['timeline\n  title History', 'timeline'],
    ['zenuml\n  A->B: hi', 'zenuml'],
    ['sankey-beta\n  A,B,10', 'sankey'],
    ['xychart-beta\n  title "Sales"', 'xychart'],
    ['block-beta\n  block:A', 'block'],
    ['kanban\n  Todo\n    task1', 'kanban'],
    ['architecture-beta\n  service a(cloud)[A]', 'architecture'],
    ['radar-beta\n  title Skills', 'radar'],
    ['treemap-beta\n  "root"', 'treemap'],
  ];
  for (const [text, expected] of cases) {
    assert.equal(detectDiagramType(text).type, expected, `expected ${expected} for: ${text.split('\n')[0]}`);
  }
});

test('treats a missing/unrecognized header as unknown, not a diversion type', () => {
  assert.equal(detectDiagramType('A --> B').type, 'unknown');
  assert.equal(detectDiagramType('').type, 'unknown');
  assert.equal(detectDiagramType('%% just a comment').type, 'unknown');
});

test('buildUnsupportedDiagramTypeNoteXml produces a well-formed, escaped note', () => {
  const xml = buildUnsupportedDiagramTypeNoteXml({ type: 'gitGraph', label: 'GitGraph' });
  assert.match(xml, /^<w:p /);
  assert.ok(xml.includes('GitGraph diagrams are not yet supported'));
  assert.ok(!xml.includes('<w:t xml:space="preserve"><'), 'label must not inject raw XML');
});
