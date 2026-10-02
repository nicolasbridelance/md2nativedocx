import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSankey } from '../../src/diagrams/sankey/parser.js';

test('parses CSV records, quoted names with commas and escaped quotes', () => {
  const { ast, warnings } = parseSankey('sankey-beta\n\n%% c\na,b,10\n"x, y","say ""hi""",2.5\nb,"x, y",1');
  assert.deepEqual(warnings, []);
  assert.deepEqual(ast.nodes, ['a', 'b', 'x, y', 'say "hi"']);
  assert.deepEqual(ast.links.map((l) => [l.source, l.target, l.value]), [['a', 'b', 10], ['x, y', 'say "hi"', 2.5], ['b', 'x, y', 1]]);
});

test('bad records, self-links and cycles are warned, never thrown', () => {
  const { ast, warnings } = parseSankey('sankey\na,b,x\na,b\na,a,1\na,b,1\nb,a,1\nc,d,-3\na,b,0');
  assert.equal(ast.links.length, 1);
  assert.equal(warnings.filter((w) => w.startsWith('Unsupported record')).length, 4);
  assert.ok(warnings.some((w) => w.includes('circular')));
});

test('caps links and nodes on hostile input', () => {
  const links = Array.from({ length: 600 }, (_, i) => `n${i},m${i},1`).join('\n');
  const r = parseSankey(`sankey-beta\n${links}`);
  assert.ok(r.ast.nodes.length <= 200);
  assert.ok(r.warnings.some((w) => w.includes('nodes')));
  assert.ok(parseSankey('---\nconfig: x\n---\nsankey-beta\na,b,1').warnings.some((w) => w.includes('frontmatter')));
});
