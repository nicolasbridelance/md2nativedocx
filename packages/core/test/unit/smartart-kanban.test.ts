import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKanban } from '../../src/diagrams/kanban/parser.js';
import { generateKanbanSmartArt, kanbanCardText, kanbanFitsSmartArt } from '../../src/smartart/kanban.js';

const BOARD = [
  'kanban',
  '  todo[À faire]',
  "    a[Rédiger la doc]@{ assigned: 'Léa' }",
  '    b[Préparer la démo]',
  "    c[Relire le contrat]@{ ticket: MC-12, priority: 'High' }",
  '  doing[En cours]',
  "    d[Maquettes]@{ assigned: 'Tom', priority: 'Low' }",
].join('\n');

test('kanban card: title in bold, then ticket · assignee · priority', () => {
  assert.deepEqual(kanbanCardText({ id: 'c', title: 'Relire', ticket: 'MC-12', priority: 'High' }), [
    { text: 'Relire', bold: true },
    { break: true },
    { text: 'MC-12 · High' },
  ]);
  assert.deepEqual(kanbanCardText({ id: 'b', title: 'Démo' }), [{ text: 'Démo', bold: true }]);
});

test('kanban SmartArt: columns under the doc, cards under their column; header + cards per column', () => {
  const out = generateKanbanSmartArt(parseKanban(BOARD).ast, { drawing: true });
  assert.equal(out?.layout, 'list');
  const data = out?.dataXml ?? '';
  assert.equal((data.match(/type="parOf" srcId="0"/g) ?? []).length, 2, 'two columns');
  assert.equal((data.match(/type="parOf"/g) ?? []).length, 6, '2 columns + 4 cards');
  assert.ok(data.includes('loTypeId="urn:md2nativedocx/smartart-layout/kanban1-3x2"'), 'up to 3 cards of up to 2 lines');
  assert.ok(out?.layoutXml.includes('<dgm:param type="linDir" val="fromT"/>'));
  const drawing = out?.drawingXml ?? '';
  assert.equal((drawing.match(/prst="roundRect"/g) ?? []).length, 6);
  assert.ok(drawing.includes('MC-12 · High'));
  assert.ok(!data.includes('TargetMode'));
});

test('an empty board, or cards too long for whole words at 10 pt, keep the shape-built board', () => {
  assert.equal(kanbanFitsSmartArt({ columns: [] }), false);
  assert.equal(kanbanFitsSmartArt(parseKanban('kanban\n  todo[Todo]').ast), false);
  const crowded = ['kanban', ...Array.from({ length: 8 }, (_, i) => `  c${i}[Col ${i}]\n    k${i}[Anticonstitutionnellement]`)].join('\n');
  assert.equal(kanbanFitsSmartArt(parseKanban(crowded).ast), false);
  assert.equal(kanbanFitsSmartArt(parseKanban(BOARD).ast), true);
});

test('kanban text is XML-escaped in every SmartArt part', () => {
  const out = generateKanbanSmartArt(parseKanban('kanban\n  c[<col> & "x"]\n    k[<script>]').ast, { drawing: true });
  assert.ok(out);
  for (const part of [out.dataXml, out.drawingXml ?? '']) {
    assert.ok(!part.includes('<script>'));
    assert.ok(!part.includes('<col>'));
    assert.ok(part.includes('&lt;script&gt;'));
    assert.ok(part.includes('&lt;col&gt; &amp;'));
  }
});
