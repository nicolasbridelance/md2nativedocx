import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findUnclosedMermaidFenceLines, unclosedFenceWarnings } from '../src/unclosedFences.mjs';

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'md2nativedocx.mjs');

test('a closed mermaid block is not reported', () => {
  assert.deepEqual(findUnclosedMermaidFenceLines('# T\n\n```mermaid\ngraph TD\n A-->B\n```\n\ntext\n'), []);
});

test('an unclosed mermaid block is reported at its opening line (1-based)', () => {
  assert.deepEqual(findUnclosedMermaidFenceLines('# T\n\n```mermaid\ngraph TD\n A-->B\n\n## Next\n'), [3]);
});

test('a later ```mermaid line does not close an earlier unclosed block, and only the first is reported', () => {
  assert.deepEqual(findUnclosedMermaidFenceLines('```mermaid\ngraph TD\n A-->B\n\n```mermaid\ngraph TD\n C-->D\n'), [1]);
});

test('a mermaid fence shown inside a longer fence, or another unclosed code block, is not ours to report', () => {
  assert.deepEqual(findUnclosedMermaidFenceLines('````md\n```mermaid\ngraph TD\n````\n'), []);
  assert.deepEqual(findUnclosedMermaidFenceLines('```js\nlet a\n\n```mermaid\ngraph TD\n'), []);
});

test('CRLF sources and a closed block followed by an unclosed one', () => {
  assert.deepEqual(findUnclosedMermaidFenceLines('```mermaid\r\ngraph TD\r\n```\r\n\r\n```mermaid\r\ngraph TD\r\n'), [5]);
});

test('warning text names the line and the consequence', () => {
  const [w] = unclosedFenceWarnings('```mermaid\ngraph TD\n');
  assert.match(w, /^warning: line 1: .*never closed.*no diagram is converted/);
});

test('CLI: an unclosed block is flagged in the stderr and the .log, and the export still succeeds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'unclosed-'));
  try {
    writeFileSync(join(dir, 'doc.md'), '# T\n\n```mermaid\ngraph TD\n  A --> B\n');
    const run = spawnSync('node', [cli, 'doc.md', '-o', 'doc.docx'], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stderr, /md2nativedocx: warning: line 3: the ```mermaid block is never closed/);
    const log = readFileSync(join(dir, 'doc.log'), 'utf8');
    assert.match(log, /Warnings: 1/);
    assert.match(log, /line 3: the ```mermaid block is never closed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
