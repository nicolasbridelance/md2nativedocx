import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDiagram } from '../../src/index.js';

// TODO R2.3: warn when the page-fit scale shrinks node text below 7 pt.

const wide = (n: number): string => {
  let src = 'flowchart LR\n';
  for (let i = 0; i < n; i++) src += `A${i}[Step number ${i}] --> A${i + 1}[Step number ${i + 1}]\n`;
  return src;
};

test('a small diagram gives no small-font warning', () => {
  const { metadata } = renderDiagram('flowchart TD\n  A --> B', { smartArt: false });
  assert.ok(!metadata.warnings.some((w) => w.includes('hard to read')));
});

test('a very wide diagram warns with the effective size and a suggestion', () => {
  const { metadata } = renderDiagram(wide(40), { smartArt: false });
  const w = metadata.warnings.find((x) => x.includes('hard to read'));
  assert.ok(w, metadata.warnings.join('|'));
  assert.match(w, /node text is [\d.]+ pt \(below 7 pt/);
  assert.match(w, /TB/);
  assert.doesNotMatch(w, /LR/);
});

test('a very tall diagram is told to go horizontal, not vertical again', () => {
  // A merge keeps it out of SmartArt; the LibreOffice padding squares its frame, which must not flip the advice.
  let src = 'flowchart TD\n';
  for (let i = 1; i < 30; i++) src += `  S${i}[Step ${i}] --> S${i + 1}[Step ${i + 1}]\n`;
  src += '  S1 --> S30\n';
  const { metadata } = renderDiagram(src, { smartArt: false });
  const w = metadata.warnings.find((x) => x.includes('hard to read'));
  assert.ok(w, metadata.warnings.join('|'));
  assert.match(w, /horizontal direction \(LR\)/);
  assert.doesNotMatch(w, /TB/);
});
