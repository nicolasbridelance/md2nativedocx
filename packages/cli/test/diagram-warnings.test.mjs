import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramDiagnostics, findDiagramFences, formatDiagnostic, placedMessage } from '../src/diagramWarnings.mjs';

test('findDiagramFences: mermaid, plantuml and puml fences, in order, other blocks skipped', () => {
  const md = '```js\nx\n```\n\n```mermaid\ngraph TD\n```\n\n~~~plantuml\n@startuml\n~~~\n\n``` puml\nA -> B\n```\n';
  assert.deepEqual(findDiagramFences(md), [
    { line: 5, language: 'mermaid' },
    { line: 9, language: 'plantuml' },
    { line: 13, language: 'puml' },
  ]);
});

test('findDiagramFences: attribute form, first class only, as the Lua filter reads it', () => {
  assert.deepEqual(findDiagramFences('```{.mermaid}\ngraph TD\n```\n\n```{#d1 .plantuml .wide}\n@startuml\n```\n'), [
    { line: 1, language: 'mermaid' },
    { line: 5, language: 'plantuml' },
  ]);
  // `.text` comes first: the filter sees a text block, not a diagram.
  assert.deepEqual(findDiagramFences('```{.text .mermaid}\ngraph TD\n```\n'), []);
});

test('findDiagramFences: a fence shown inside a longer example is not a diagram', () => {
  assert.deepEqual(findDiagramFences('````md\n```mermaid\ngraph TD\n```\n````\n'), []);
});

test('findDiagramFences: a longer closing fence closes, a shorter one does not', () => {
  assert.deepEqual(findDiagramFences('```mermaid\ngraph TD\n`````\n\n```mermaid\ngraph LR\n```\n'), [
    { line: 1, language: 'mermaid' },
    { line: 5, language: 'mermaid' },
  ]);
  assert.deepEqual(findDiagramFences('````mermaid\ngraph TD\n```\n````\n\n```mermaid\ngraph LR\n```\n'), [
    { line: 1, language: 'mermaid' },
    { line: 6, language: 'mermaid' },
  ]);
});

test('findDiagramFences: CRLF sources', () => {
  assert.deepEqual(findDiagramFences('# T\r\n\r\n```mermaid\r\ngraph TD\r\n```\r\n'), [{ line: 3, language: 'mermaid' }]);
});

const STDERR = [
  'md2nativedocx-diagram: 1 mermaid',
  'md2nativedocx-diagram: 2 plantuml',
  'md2nativedocx: warning: Unsupported line ignored: foo',
  '[WARNING] Could not fetch resource x.png: not allowed',
  'md2nativedocx: warning: Railroad: expected ")".',
  'md2nativedocx (info): Native shapes used (subgraph detected — not supported by SmartArt export).',
  '',
].join('\n');

test('diagramDiagnostics: each line of ours goes to the diagram whose marker precedes it; Pandoc lines are not ours', () => {
  const source = '```mermaid\ngraph TD\n```\n\n```plantuml\n@startuml\n@enduml\n```\n';
  assert.deepEqual(diagramDiagnostics(STDERR, source), {
    warnings: [
      { message: 'Unsupported line ignored: foo', diagram: 2, language: 'plantuml', line: 5 },
      { message: 'Railroad: expected ")".', diagram: 2, language: 'plantuml', line: 5 },
    ],
    // An info line is a note: placed like a warning, never counted as one.
    notes: [{ message: 'Native shapes used (subgraph detected — not supported by SmartArt export).', diagram: 2, language: 'plantuml', line: 5 }],
  });
});

test('diagramDiagnostics: no line when the source fences do not match what the filter saw', () => {
  // One fence in the source, two diagrams seen by the filter (a block Pandoc read in another way).
  const { warnings: [first], notes: [note] } = diagramDiagnostics(STDERR, '```mermaid\ngraph TD\n```\n');
  assert.deepEqual(first, { message: 'Unsupported line ignored: foo', diagram: 2, language: 'plantuml' });
  assert.equal(note?.line, undefined);
  // Same count, languages out of step.
  const { warnings: [second] } = diagramDiagnostics(STDERR, '```plantuml\nx\n```\n\n```mermaid\ngraph TD\n```\n');
  assert.equal(second?.line, undefined);
  // Source unreadable.
  assert.equal(diagramDiagnostics(STDERR, undefined).warnings[0]?.line, undefined);
});

test('diagramDiagnostics: a line of ours before any marker has no diagram', () => {
  assert.deepEqual(diagramDiagnostics('md2nativedocx: could not start core bridge\n', ''), {
    warnings: [{ message: 'could not start core bridge' }],
    notes: [],
  });
});

test('diagramDiagnostics: diagram text never becomes a marker, only the exact marker line does', () => {
  // A warning quoting user text that looks like a marker stays a message of the current diagram.
  const stderr = 'md2nativedocx-diagram: 1 mermaid\nmd2nativedocx: warning: Unsupported line ignored: md2nativedocx-diagram: 9 mermaid\n';
  assert.deepEqual(diagramDiagnostics(stderr, '```mermaid\nx\n```\n').warnings, [
    { message: 'Unsupported line ignored: md2nativedocx-diagram: 9 mermaid', diagram: 1, language: 'mermaid', line: 1 },
  ]);
});

test('formatDiagnostic: place first, then the message', () => {
  assert.equal(formatDiagnostic({ message: 'm', diagram: 2, language: 'mermaid', line: 14 }), 'warning: diagram 2, line 14: m');
  assert.equal(formatDiagnostic({ message: 'm', diagram: 2, language: 'mermaid' }), 'warning: diagram 2: m');
  assert.equal(formatDiagnostic({ message: 'm', line: 3 }), 'warning: line 3: m');
  assert.equal(formatDiagnostic({ message: 'm' }), 'warning: m');
  assert.equal(placedMessage({ message: 'm', diagram: 1, line: 3 }), 'diagram 1, line 3: m');
});
