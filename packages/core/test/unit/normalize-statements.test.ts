import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitLines, splitStatements } from '../../src/parser/normalize-statements.js';
import { parseMermaid } from '../../src/parser/index.js';

test('splitStatements: trailing and separating semicolons', () => {
  assert.deepEqual(splitStatements('A-->B;'), ['A-->B']);
  assert.deepEqual(splitStatements('A-->B; B-->C;'), ['A-->B', 'B-->C']);
  assert.deepEqual(splitStatements(' ; ;; '), []);
});

test('splitStatements: semicolons in quotes or brackets are label text', () => {
  assert.deepEqual(splitStatements('A["a;b"] --> B;'), ['A["a;b"] --> B']);
  assert.deepEqual(splitStatements('A[a; b] --> B'), ['A[a; b] --> B']);
  assert.deepEqual(splitStatements('A(x;y)-->B{p;q}'), ['A(x;y)-->B{p;q}']);
});

test('splitStatements: end-of-line comment dropped, whole-line comment and init kept', () => {
  assert.deepEqual(splitStatements('A-->B %% note'), ['A-->B']);
  assert.deepEqual(splitStatements('A-->B; %% note ; more'), ['A-->B']);
  assert.deepEqual(splitStatements('%% whole line'), ['%% whole line']);
  assert.deepEqual(splitStatements('%%{init: {"theme":"dark"}}%%'), ['%%{init: {"theme":"dark"}}%%']);
  assert.deepEqual(splitStatements('A["100%% sure"] --> B'), ['A["100%% sure"] --> B']);
  assert.deepEqual(splitStatements('A-->|50%%|B'), ['A-->|50%%|B']);
});

test('splitLines: BOM, CRLF and lone CR', () => {
  assert.deepEqual(splitLines('﻿a\r\nb\rc\nd'), ['a', 'b', 'c', 'd']);
});

test('parseMermaid: statement endings give the same AST as the clean form', () => {
  const clean = parseMermaid('graph TD\nA[Start] --> B[End]\nB --> C');
  for (const variant of [
    '﻿graph TD;\r\nA[Start] --> B[End];\r\nB --> C;\r\n',
    'graph TD\nA[Start] --> B[End]; B --> C',
    'graph TD\nA[Start] --> B[End] %% first\nB --> C %% second',
  ]) {
    const got = parseMermaid(variant);
    assert.deepEqual(got.ast, clean.ast, variant);
    assert.deepEqual(got.warnings, [], variant);
  }
});

test('parseMermaid: semicolon inside a label survives', () => {
  const { ast } = parseMermaid('graph TD\nA["a; b"] --> B;');
  assert.equal(ast.nodes.find((n) => n.id === 'A')!.label, 'a; b');
});

// Types whose Mermaid grammar treats `;` as a statement terminator accept it; the others keep `;` as text.
import { renderDiagram } from '../../src/index.js';
const SEMICOLON_TYPES: Array<[string, string]> = [
  ['flowchart', 'graph TD\nA[Start] --> B[End]\nB --> C'],
  ['class', 'classDiagram\nclass Animal\nclass Dog\nAnimal <|-- Dog'],
  ['state', 'stateDiagram-v2\n[*] --> Idle\nIdle --> Busy\nBusy --> [*]'],
  ['er', 'erDiagram\nCUSTOMER ||--o{ ORDER : places'],
];
for (const [type, source] of SEMICOLON_TYPES) {
  test(`${type}: trailing semicolons and CRLF give the same rendering`, () => {
    const noisy = '﻿' + source.split('\n').map((l) => l + ';').join('\r\n') + '\r\n';
    const a = renderDiagram(source);
    const b = renderDiagram(noisy);
    assert.equal(b.metadata.diagramType, a.metadata.diagramType);
    assert.deepEqual(b.metadata.warnings, a.metadata.warnings);
    assert.equal(b.fragment, a.fragment);
  });
}

test('splitStatements: brackets:false for grammars where braces are operators', () => {
  assert.deepEqual(splitStatements('A ||--o{ B : has;', { brackets: false }), ['A ||--o{ B : has']);
});
