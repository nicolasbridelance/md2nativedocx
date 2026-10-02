import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJourney } from '../../src/diagrams/journey/parser.js';

test('parses title, sections, tasks, scores and actors', () => {
  const { ast, warnings } = parseJourney(
    'journey\n  title Day\n  section Work\n    Make tea: 5: Me\n    Do work: 1: Me, Cat\n  section Home\n    Sit: 4',
  );
  assert.equal(ast.title, 'Day');
  assert.deepEqual(ast.sections, ['Work', 'Home']);
  assert.deepEqual(ast.tasks.map((t) => [t.label, t.score, t.sectionIndex]), [['Make tea', 5, 0], ['Do work', 1, 0], ['Sit', 4, 1]]);
  assert.deepEqual(ast.tasks[1]?.actors, ['Me', 'Cat']);
  assert.deepEqual(ast.actors, ['Me', 'Cat']);
  assert.deepEqual(warnings, []);
});

test('clamps out-of-range scores and drops non-numeric ones, with warnings', () => {
  const { ast, warnings } = parseJourney('journey\n  A: 9\n  B: x\n  C: 0\n  no colon');
  assert.deepEqual(ast.tasks.map((t) => t.score), [5, 1]);
  assert.equal(warnings.length, 4);
});

test('frontmatter warns once; task count is capped', () => {
  assert.equal(parseJourney('---\nconfig:\n  a: b\n---\njourney\n  A: 3').warnings.length, 1);
  const many = 'journey\n' + Array.from({ length: 600 }, (_, i) => `  T${i}: 3`).join('\n');
  const { ast, warnings } = parseJourney(many);
  assert.equal(ast.tasks.length, 500);
  assert.equal(warnings.length, 1);
});

test('labels and actors keep injection characters verbatim', () => {
  const { ast } = parseJourney("journey\n  <b>&': 3: <i>\"");
  assert.equal(ast.tasks[0]?.label, "<b>&'");
  assert.deepEqual(ast.actors, ['<i>"']);
});
