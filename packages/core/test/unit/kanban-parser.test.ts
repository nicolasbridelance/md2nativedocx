import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKanban } from '../../src/diagrams/kanban/parser.js';

test('indentation separates columns from cards; all three item forms parse', () => {
  const { ast, warnings } = parseKanban('kanban\n  Todo\n    [Plain]\n    docs[With id]\n  [In progress]\n    t[x]\n  id9[Done]');
  assert.deepEqual(ast.columns.map((c) => c.title), ['Todo', 'In progress', 'Done']);
  assert.deepEqual(ast.columns[0]?.cards.map((c) => [c.id, c.title]), [['Plain', 'Plain'], ['docs', 'With id']]);
  assert.deepEqual(warnings, []);
});

test('parses @{ } metadata incl. quoted values with commas and priorities', () => {
  const { ast } = parseKanban("kanban\ncol[C]\n  a[T]@{ ticket: MC-1, assigned: 'a, b', priority: 'very high' }");
  assert.deepEqual(ast.columns[0]?.cards[0], { id: 'a', title: 'T', ticket: 'MC-1', assigned: 'a, b', priority: 'Very High' });
});

test('unknown priority/key warn; frontmatter (ticketBaseUrl) is ignored with a warning', () => {
  const r = parseKanban("---\nconfig:\n  kanban:\n    ticketBaseUrl: 'http://x/#TICKET#'\n---\nkanban\nc[C]\n  a[T]@{ priority: Urgent, foo: 1 }");
  assert.equal(r.ast.columns[0]?.cards[0]?.priority, undefined);
  assert.equal(r.warnings.length, 3);
});

test('title with brackets-free injection characters is kept verbatim', () => {
  const { ast } = parseKanban("kanban\nc[<b>&']\n  a[<x>&\"]");
  assert.equal(ast.columns[0]?.title, "<b>&'");
  assert.equal(ast.columns[0]?.cards[0]?.title, '<x>&"');
});
