import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countDiagramBlocks, diagramSource, replaceDiagramBlocks } from '../src/diagram-blocks.mjs';

const code = (classes, text) => ({ t: 'CodeBlock', c: [['', classes, []], text] });

test('diagramSource picks the same blocks as the Lua filter, and adds @startuml to bare PlantUML', () => {
  assert.equal(diagramSource('mermaid', 'flowchart LR\nA-->B'), 'flowchart LR\nA-->B');
  assert.equal(diagramSource('plantuml', 'A -> B'), '@startuml\nA -> B\n@enduml');
  assert.equal(diagramSource('puml', '@startuml\nA -> B\n@enduml'), '@startuml\nA -> B\n@enduml');
  assert.equal(diagramSource('python', 'print(1)'), null);
  assert.equal(diagramSource(undefined, 'text'), null);
});

test('replaceDiagramBlocks reaches blocks nested in lists and quotes, and leaves other code alone', () => {
  const ast = {
    blocks: [
      code(['mermaid'], 'flowchart LR\nA-->B'),
      { t: 'BlockQuote', c: [code(['plantuml'], 'A -> B')] },
      { t: 'BulletList', c: [[code(['mermaid', 'extra'], 'pie\n"a":1')]] },
      code(['js'], 'let x = 1'),
    ],
  };
  assert.equal(countDiagramBlocks(ast), 3);
  const seen = [];
  const found = replaceDiagramBlocks(ast, (source) => {
    seen.push(source);
    return { t: 'RawBlock', c: ['openxml', `<w:p>${seen.length}</w:p>`] };
  });
  assert.equal(found, 3);
  assert.deepEqual(seen, ['flowchart LR\nA-->B', '@startuml\nA -> B\n@enduml', 'pie\n"a":1']);
  assert.deepEqual(ast.blocks[0], { t: 'RawBlock', c: ['openxml', '<w:p>1</w:p>'] });
  assert.equal(ast.blocks[1].c[0].t, 'RawBlock');
  assert.equal(ast.blocks[2].c[0][0].t, 'RawBlock');
  assert.equal(ast.blocks[3].t, 'CodeBlock');
});

test('a renderer can leave a block as it is', () => {
  const block = code(['mermaid'], 'not a diagram');
  const ast = { blocks: [block] };
  replaceDiagramBlocks(ast, (_source, original) => original);
  assert.equal(ast.blocks[0], block);
});
