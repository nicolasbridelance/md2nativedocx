import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKanban } from '../../src/diagrams/kanban/parser.js';
import { translateKanbanToOoxml } from '../../src/diagrams/kanban/translator.js';

const tr = (t: string): string => translateKanbanToOoxml(parseKanban(t).ast);

test('renders column headers, card titles and the ticket/assignee line', () => {
  const xml = tr("kanban\nc[Todo]\n  a[Write docs]@{ ticket: MC-1, assigned: bob, priority: 'High' }");
  assert.ok(xml.includes('wpc:wpc'));
  for (const t of ['Todo', 'Write docs', 'MC-1 · bob']) assert.ok(xml.includes(`>${t}<`), t);
  assert.ok(xml.includes('ED7D31')); // High priority stripe
});

test('card without priority has no stripe shape', () => {
  const withStripe = tr("kanban\nc[C]\n  a[T]@{ priority: High }");
  const without = tr('kanban\nc[C]\n  a[T]');
  assert.ok((withStripe.match(/<wps:wsp>/g) ?? []).length === (without.match(/<wps:wsp>/g) ?? []).length + 1);
});

test('escapes XML metacharacters; never emits an external relationship or hyperlink', () => {
  const xml = tr("kanban\nc[<b>&]\n  a[<x>&]@{ ticket: <t> }");
  assert.ok(!xml.includes('<x>') && !xml.includes('<b>') && !xml.includes('<t>'));
  assert.ok(!xml.includes('TargetMode') && !xml.includes('hyperlink'));
});

test('empty board yields a note; shape ids are unique', () => {
  assert.ok(tr('kanban').includes('no columns'));
  const ids = [...tr('kanban\nc[C]\n  a[T]\n  b[U]').matchAll(/cNvPr id="(\d+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});
