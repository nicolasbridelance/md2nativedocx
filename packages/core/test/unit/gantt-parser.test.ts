import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGanttChart } from '../../src/diagrams/gantt/parser.js';

test('parses title, dateFormat-anchored dates, and section grouping', () => {
  const { ast, warnings } = parseGanttChart(
    'gantt\n  title My Plan\n  dateFormat YYYY-MM-DD\n  section Cadrage\n  Task A :a1, 2026-01-05, 3d\n',
  );
  assert.equal(ast.title, 'My Plan');
  assert.equal(ast.sections[0], 'Cadrage');
  assert.equal(ast.tasks.length, 1);
  const task = ast.tasks[0]!;
  assert.equal(task.id, 'a1');
  assert.equal(task.text, 'Task A');
  assert.equal(task.section, 'Cadrage');
  assert.equal(task.start.toISOString(), new Date(Date.UTC(2026, 0, 5)).toISOString());
  assert.equal(task.end.toISOString(), new Date(Date.UTC(2026, 0, 8)).toISOString());
  assert.equal(warnings.length, 0);
});

test('an id-less task (2 fields) chains its start from the previous task\'s end, across sections', () => {
  const { ast } = parseGanttChart(
    [
      'gantt',
      'dateFormat YYYY-MM-DD',
      'section One',
      'First :f1, 2026-01-05, 2d',
      'section Two',
      'Second :2d', // 1-field form: start = previous task's end, regardless of section boundary
    ].join('\n'),
  );
  const first = ast.tasks[0]!;
  const second = ast.tasks[1]!;
  assert.equal(second.start.getTime(), first.end.getTime());
  assert.equal(second.section, 'Two');
});

test('"after id" resolves to the referenced task\'s end date, taking the latest of several ids', () => {
  const { ast } = parseGanttChart(
    [
      'gantt',
      'dateFormat YYYY-MM-DD',
      'A :a, 2026-01-05, 2d', // ends 2026-01-07
      'B :b, 2026-01-05, 5d', // ends 2026-01-10 (later)
      'C :c, after a b, 1d',
    ].join('\n'),
  );
  const c = ast.tasks.find((t) => t.id === 'c')!;
  assert.equal(c.start.toISOString(), new Date(Date.UTC(2026, 0, 10)).toISOString());
});

test('"until id" resolves the end date to the referenced task\'s start', () => {
  const { ast } = parseGanttChart(
    ['gantt', 'dateFormat YYYY-MM-DD', 'A :a, 2026-01-10, 1d', 'B :b, 2026-01-05, until a'].join('\n'),
  );
  const b = ast.tasks.find((t) => t.id === 'b')!;
  assert.equal(b.end.toISOString(), new Date(Date.UTC(2026, 0, 10)).toISOString());
});

test('leading tags (done/active/crit/milestone) are recognized in any combination', () => {
  const { ast } = parseGanttChart(
    ['gantt', 'dateFormat YYYY-MM-DD', 'A :done, crit, a1, 2026-01-05, 1d'].join('\n'),
  );
  const task = ast.tasks[0]!;
  assert.deepEqual(task.tags.sort(), ['crit', 'done']);
});

test('a duration-based end date is stretched past excluded weekends, an explicit end date is not', () => {
  // 2026-01-05 is a Monday.
  const { ast } = parseGanttChart(
    [
      'gantt',
      'dateFormat YYYY-MM-DD',
      'excludes weekends',
      'A :a1, 2026-01-05, 5d', // naive end Saturday -> stretched past the weekend
      'B :b1, 2026-01-05, 2026-01-10', // explicit end date: taken as-is, never stretched
    ].join('\n'),
  );
  const a = ast.tasks.find((t) => t.id === 'a1')!;
  const b = ast.tasks.find((t) => t.id === 'b1')!;
  assert.equal(a.end.toISOString(), new Date(Date.UTC(2026, 0, 12)).toISOString());
  assert.equal(b.end.toISOString(), new Date(Date.UTC(2026, 0, 10)).toISOString());
});

test('an explicit excludes date (not just weekday names) is respected', () => {
  const { ast } = parseGanttChart(
    ['gantt', 'dateFormat YYYY-MM-DD', 'excludes 2026-01-06', 'A :a1, 2026-01-05, 2d'].join('\n'),
  );
  // naive end 2026-01-07; 2026-01-06 excluded -> stretched by 1 day.
  const a = ast.tasks[0]!;
  assert.equal(a.end.toISOString(), new Date(Date.UTC(2026, 0, 8)).toISOString());
});

test('a malformed duration ("1.2.3d", matched by the deliberately-loose regex) is rejected, not turned into an Invalid Date', () => {
  const { ast, warnings } = parseGanttChart(
    ['gantt', 'dateFormat YYYY-MM-DD', 'A :a1, 2026-01-05, 1.2.3d'].join('\n'),
  );
  assert.equal(ast.tasks.length, 0);
  assert.ok(warnings.some((w) => w.includes('invalid end/duration')));
});

test('an unresolvable line is skipped with a warning, not thrown', () => {
  const { ast, warnings } = parseGanttChart(
    ['gantt', 'dateFormat YYYY-MM-DD', 'Bad task :a1, not-a-date, 3d'].join('\n'),
  );
  assert.equal(ast.tasks.length, 0);
  assert.ok(warnings.some((w) => w.includes('invalid start date')));
});

test('an unsupported cosmetic directive is warned about, not silently dropped, and does not affect parsing', () => {
  const { ast, warnings } = parseGanttChart(
    ['gantt', 'dateFormat YYYY-MM-DD', 'axisFormat %m/%d', 'A :a1, 2026-01-05, 1d'].join('\n'),
  );
  assert.equal(ast.tasks.length, 1);
  assert.ok(warnings.some((w) => w.includes('axisFormat')));
});
