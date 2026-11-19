/** Flowchart syntax found by the Mermaid official examples (TODO §2, "Conformité Mermaid"). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid } from '../../src/parser/parser.js';
import { parseClassDiagram } from '../../src/diagrams/class-diagram/parser.js';
import { INTERACTIVE_DIRECTIVES_IGNORED } from '../../src/parser/interactive.js';

test('flowchart: edge ids are removed from the edge, and their metadata is not a node', () => {
  const { ast, warnings } = parseMermaid('flowchart LR\n  Client e1@--> API\n  API e2@-->|miss| DB\n  A e3@==> B\n  e1@{ animate: true }\n  class e1 animate');
  assert.deepEqual(warnings, []);
  assert.deepEqual(ast.nodes.map((n) => n.id).sort(), ['A', 'API', 'B', 'Client', 'DB']);
  assert.deepEqual(ast.edges.map((e) => `${e.from}>${e.to}`), ['Client>API', 'API>DB', 'A>B']);
});

test('flowchart: a node shape `@{ … }` is not an edge id', () => {
  const { ast } = parseMermaid('flowchart LR\n  A@{ shape: rect, label: "x" } --> B');
  assert.deepEqual(ast.nodes.map((n) => n.id).sort(), ['A', 'B']);
});

test('flowchart: a quoted label spanning lines does not swallow the next statement', () => {
  const { ast, warnings } = parseMermaid('flowchart LR\n  markdown["`This **is** _Markdown_`"]\n  newLines["`Line1\n  Line 2\n  Line 3`"]\n  markdown --> newLines');
  assert.deepEqual(warnings, []);
  assert.deepEqual(ast.edges.map((e) => `${e.from}>${e.to}`), ['markdown>newLines']);
});

test('flowchart and class: interactive directives are dropped on purpose, one warning, never a link', () => {
  const flow = parseMermaid('flowchart LR\n  A-->B\n  click A callback "Tip"\n  click B href "https://example.com" _blank');
  assert.deepEqual(flow.warnings, [INTERACTIVE_DIRECTIVES_IGNORED]);
  assert.deepEqual(flow.ast.nodes.map((n) => n.id).sort(), ['A', 'B']);
  // A node named `click` is still a node.
  assert.deepEqual(parseMermaid('flowchart LR\n  click --> B').ast.edges.length, 1);
  const cls = parseClassDiagram('classDiagram\n  class Shape\n  link Shape "https://example.com" "tip"\n  callback Shape "fn" "tip"\n  click Shape href "https://example.com"');
  assert.deepEqual(cls.warnings, [INTERACTIVE_DIRECTIVES_IGNORED]);
});
