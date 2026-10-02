import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimeline } from '../../src/diagrams/timeline/parser.js';

test('parses title, periods and multiple events (inline and continuation lines)', () => {
  const { ast, warnings } = parseTimeline(
    'timeline\n  title T\n  2002 : LinkedIn\n  2004 : Facebook : Google\n       : Extra\n  2005 : YouTube',
  );
  assert.equal(ast.title, 'T');
  assert.deepEqual(ast.periods.map((p) => p.label), ['2002', '2004', '2005']);
  assert.deepEqual(ast.periods[1]?.events, ['Facebook', 'Google', 'Extra']);
  assert.deepEqual(warnings, []);
});

test('assigns periods to sections; periods before any section are -1', () => {
  const { ast } = parseTimeline('timeline\n  A : x\n  section S1\n  B : y\n  section S2\n  C : z');
  assert.deepEqual(ast.sections, ['S1', 'S2']);
  assert.deepEqual(ast.periods.map((p) => p.sectionIndex), [-1, 0, 1]);
});

test('converts <br> variants to newlines', () => {
  const { ast } = parseTimeline('timeline\n  P : one<br>two<br/>three');
  assert.deepEqual(ast.periods[0]?.events, ['one\ntwo\nthree']);
});

test('TD direction warns; orphan continuation warns; frontmatter warns once', () => {
  assert.equal(parseTimeline('timeline TD\n  A : x').warnings.length, 1);
  assert.equal(parseTimeline('timeline\n  : x').warnings.length, 1);
  assert.equal(parseTimeline('---\nconfig:\n  a: b\n---\ntimeline\n  A : x').warnings.length, 1);
});

test('period without events is kept; label keeps injection characters verbatim', () => {
  const { ast } = parseTimeline("timeline\n  <b>&' : x\n  Lonely");
  assert.equal(ast.periods[0]?.label, "<b>&'");
  assert.deepEqual(ast.periods[1]?.events, []);
});
