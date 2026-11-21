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

test('a malformed duration ("1.2.3d", matched by the deliberately-loose regex) gives no duration, as in Mermaid, never an Invalid Date', () => {
  const { ast, warnings } = parseGanttChart(
    ['gantt', 'dateFormat YYYY-MM-DD', 'A :a1, 2026-01-05, 1.2.3d'].join('\n'),
  );
  assert.equal(ast.tasks.length, 1);
  assert.equal(ast.tasks[0]!.end.toISOString(), ast.tasks[0]!.start.toISOString());
  assert.ok(warnings.some((w) => w.includes('Invalid end/duration')));
});

test('an unresolvable line is skipped with a warning, not thrown', () => {
  const { ast, warnings } = parseGanttChart(
    ['gantt', 'dateFormat YYYY-MM-DD', 'Bad task :a1, not-a-date, 3d'].join('\n'),
  );
  assert.equal(ast.tasks.length, 0);
  assert.ok(warnings.some((w) => w.includes('invalid start date')));
});

test('axis directives are carried to the translator; an invalid one is warned about, not silently dropped', () => {
  const { ast, warnings } = parseGanttChart(
    ['gantt', 'dateFormat YYYY-MM-DD', 'axisFormat %m/%d', 'tickInterval 2week', 'weekday monday', 'topAxis', 'todayMarker off', 'A :a1, 2026-01-05, 1d'].join('\n'),
  );
  assert.equal(ast.tasks.length, 1);
  assert.equal(ast.axisFormat, '%m/%d');
  assert.deepEqual(ast.tickInterval, { every: 2, unit: 'week' });
  assert.equal(ast.weekday, 'monday');
  assert.deepEqual(warnings, []);

  const bad = parseGanttChart(['gantt', 'tickInterval 1decade', 'axisFormat %U', 'todayMarker stroke:red', 'A :2026-01-05, 1d'].join('\n'));
  assert.equal(bad.ast.tickInterval, undefined);
  assert.equal(bad.warnings.length, 3);
});

test('"after" and "until" may name a task declared further down (resolved in passes, as Mermaid)', () => {
  const { ast, warnings } = parseGanttChart(
    ['gantt', 'Draft :d1, 2026-03-02, until rev', 'Mockup :after rev, 3d', 'Review :rev, 2026-03-09, 4d'].join('\n'),
  );
  assert.deepEqual(warnings, []);
  const [draft, mockup] = ast.tasks;
  assert.equal(draft!.end.toISOString(), '2026-03-09T00:00:00.000Z');
  assert.equal(mockup!.start.toISOString(), '2026-03-13T00:00:00.000Z');
});

test('a reference cycle drops the tasks involved with a warning, never loops', () => {
  const { ast, warnings } = parseGanttChart(['gantt', 'A :a, after b, 1d', 'B :b, after a, 1d', 'C :c, 2026-01-01, 1d'].join('\n'));
  assert.deepEqual(ast.tasks.map((t) => t.id), ['c']);
  assert.equal(warnings.filter((w) => w.includes('cycle')).length, 2);
});

test('"after" naming an unknown id chains from the previous task, with a warning (Mermaid would use today)', () => {
  const { ast, warnings } = parseGanttChart(['gantt', 'A :a, 2026-01-01, 2d', 'B :b, after nope, 1d'].join('\n'));
  assert.equal(ast.tasks[1]!.start.toISOString(), '2026-01-03T00:00:00.000Z');
  assert.ok(warnings.some((w) => w.includes('unknown task id(s) nope')));
});

test('minute, second and millisecond durations, and dateFormat X (Unix seconds)', () => {
  const minutes = parseGanttChart(['gantt', 'dateFormat HH:mm', 'A :a, 17:49, 2m', 'B :10m', 'C :30s', 'D :500ms'].join('\n'));
  assert.deepEqual(minutes.warnings, []);
  assert.deepEqual(minutes.ast.tasks.map((t) => t.end.toISOString()), [
    '1970-01-01T17:51:00.000Z',
    '1970-01-01T18:01:00.000Z',
    '1970-01-01T18:01:30.000Z',
    '1970-01-01T18:01:30.500Z',
  ]);
  const unix = parseGanttChart(['gantt', 'dateFormat X', 'A : 0, 71', 'B : 10, 3s'].join('\n'));
  assert.deepEqual(unix.warnings, []);
  assert.deepEqual(unix.ast.tasks.map((t) => [t.start.getTime(), t.end.getTime()]), [[0, 71_000], [10_000, 13_000]]);
});

test('weekend friday, includes and inclusiveEndDates', () => {
  // 2026-04-02 is a Thursday: with a Friday-Saturday weekend, 2 days end on Monday the 6th…
  const friday = parseGanttChart(['gantt', 'excludes weekends', 'weekend friday', 'A :a, 2026-04-02, 2d'].join('\n'));
  assert.equal(friday.ast.tasks[0]!.end.toISOString(), '2026-04-06T00:00:00.000Z');
  // …and on Sunday the 5th once the Friday is included.
  const included = parseGanttChart(['gantt', 'excludes weekends', 'weekend friday', 'includes 2026-04-03', 'A :a, 2026-04-02, 2d'].join('\n'));
  assert.equal(included.ast.tasks[0]!.end.toISOString(), '2026-04-05T00:00:00.000Z');
  const inclusive = parseGanttChart(['gantt', 'inclusiveEndDates', 'A :a, 2026-04-01, 2026-04-03'].join('\n'));
  assert.equal(inclusive.ast.tasks[0]!.end.toISOString(), '2026-04-04T00:00:00.000Z');
});

test('shaded days: the excluded days when there is an excludes, the weekend otherwise, none past five years', () => {
  const iso = (days: Date[] | undefined): string[] => (days ?? []).map((d) => d.toISOString().slice(0, 10));
  assert.deepEqual(iso(parseGanttChart('gantt\nA :a, 2026-04-01, 7d').ast.shadedDays), ['2026-04-04', '2026-04-05']);
  assert.deepEqual(iso(parseGanttChart('gantt\nexcludes 2026-04-02\nA :a, 2026-04-01, 3d').ast.shadedDays), ['2026-04-02']);
  assert.deepEqual(parseGanttChart('gantt\ndateFormat YYYY\nA :a, 1990, 2004').ast.shadedDays, []);
});

test('vert tasks keep their tag; a trailing %% comment in task data is ignored', () => {
  const { ast, warnings } = parseGanttChart(['gantt', 'dateFormat YYYY', 'Marker : vert, 1906, 1s   %% a comment'].join('\n'));
  assert.deepEqual(warnings, []);
  assert.deepEqual(ast.tasks[0]!.tags, ['vert']);
  assert.equal(ast.tasks[0]!.end.getTime() - ast.tasks[0]!.start.getTime(), 1000);
});
