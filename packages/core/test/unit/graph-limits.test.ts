import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDiagram } from '../../src/render-diagram.js';
import { DiagramTooLargeError, DEFAULT_MAX_EDGES, DEFAULT_MAX_NODES } from '../../src/layout/graph-limits.js';
import { buildDiagramTooLargeNoteXml } from '../../src/translator/unsupported-diagram-note.js';

const chain = (header: string, nodes: number, edge: (a: number, b: number) => string): string => {
  let src = `${header}\n`;
  for (let i = 0; i < nodes; i++) src += `${edge(i, i + 1)}\n`;
  return src;
};

test('a flowchart over the node cap is refused before layout, with a typed error', () => {
  const src = chain('flowchart TD', DEFAULT_MAX_NODES + 5, (a, b) => `N${a} --> N${b}`);
  assert.throws(() => renderDiagram(src), (err: unknown) => {
    assert.ok(err instanceof DiagramTooLargeError);
    assert.equal(err.limit, 'nodes');
    assert.equal(err.max, DEFAULT_MAX_NODES);
    assert.ok(err.actual > DEFAULT_MAX_NODES);
    return true;
  });
});

test('a flowchart over the edge cap is refused', () => {
  let src = 'flowchart LR\n';
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) src += `A${i} --> B${j}\n`; // 40 nodes, 400 edges
  assert.throws(() => renderDiagram(src, { maxEdges: 100 }), (err: unknown) => err instanceof DiagramTooLargeError && err.limit === 'edges');
  assert.ok(DEFAULT_MAX_EDGES >= 400);
  assert.doesNotThrow(() => renderDiagram(src));
});

test('the caps are options: raising maxNodes lets the same diagram through', () => {
  const src = chain('flowchart TD', 30, (a, b) => `N${a} --> N${b}`);
  assert.throws(() => renderDiagram(src, { maxNodes: 10 }), DiagramTooLargeError);
  assert.doesNotThrow(() => renderDiagram(src, { maxNodes: 100 }));
});

test('every Dagre-based type honours the cap (the old 3 000-relation erDiagram overflowed the stack)', () => {
  const sources = [
    chain('erDiagram', 600, (a, b) => `E${a} ||--o{ E${b} : r`),
    chain('classDiagram', 600, (a, b) => `C${a} --> C${b}`),
    chain('stateDiagram-v2', 600, (a, b) => `S${a} --> S${b}`),
  ];
  for (const src of sources) {
    assert.throws(() => renderDiagram(src), DiagramTooLargeError, src.split('\n')[0]);
  }
});

test('an oversized source is refused before parsing', () => {
  assert.throws(
    () => renderDiagram(`flowchart TD\nA["${'x'.repeat(200)}"] --> B`, { maxSourceLength: 100 }),
    (err: unknown) => err instanceof DiagramTooLargeError && err.limit === 'source' && err.max === 100,
  );
});

test('a dense graph under the caps still lays out in a bounded time', () => {
  let src = 'flowchart LR\n';
  const n = 250; // 500 edges, under the default cap of 800
  for (let i = 0; i < n; i++) src += `M${i} --> M${(i * 7 + 3) % n}\nM${i} --> M${(i * 13 + 5) % n}\n`;
  const started = Date.now();
  renderDiagram(src);
  assert.ok(Date.now() - started < 30_000, 'worst case under the defaults stays well below a minute');
});

test('the too-large note is a well-formed escaped paragraph', () => {
  const xml = buildDiagramTooLargeNoteXml(new DiagramTooLargeError('nodes', 500, 400));
  assert.match(xml, /^<w:p /);
  assert.match(xml, /diagram too large: 500 nodes, the limit is 400/);
  assert.ok(!buildDiagramTooLargeNoteXml({ message: '<b>&"\'' }).includes('<b>'));
});
