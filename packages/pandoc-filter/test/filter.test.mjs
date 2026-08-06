import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const filter = join(here, '..', 'md2nativedocx.lua');
const coreBin = join(here, '..', 'bin', 'md2nativedocx-core.mjs');

function runPandoc(markdown) {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-'));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  writeFileSync(md, markdown);
  try {
    execFileSync('pandoc', [md, '-o', docx, '--lua-filter', filter], {
      env: { ...process.env, PANDOC_FILTER_CORE: coreBin },
    });
    // Extract document.xml via unzip (Pandoc's job; we only read for testing).
    const xml = execFileSync('unzip', ['-p', docx, 'word/document.xml'], {
      encoding: 'utf8',
    });
    return xml;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('pandoc filter converts a mermaid block into native wpg:wgp', () => {
  const xml = runPandoc('```mermaid\ngraph TD\n  A[Start] --> B[End]\n```\n');
  assert.ok(xml.includes('<wpg:wgp'));
  assert.ok(xml.includes('<wpg:wsp>'));
  assert.ok(xml.includes('<wpg:cxnSp>'));
});

test('pandoc filter escapes hostile labels (rule #2)', () => {
  const xml = runPandoc('```mermaid\ngraph TD\n  A["a & b < c"] --> B\n```\n');
  assert.ok(xml.includes('&amp;'));
  assert.ok(xml.includes('&lt;'));
  assert.ok(!/a & b/.test(xml));
});

test('pandoc filter emits no external relationship (rule #3)', () => {
  const xml = runPandoc('```mermaid\ngraph TD\n  A --> B\n```\n');
  assert.ok(!xml.includes('TargetMode="External"'));
  assert.ok(!xml.includes('r:link'));
});

test('pandoc filter leaves non-mermaid blocks untouched', () => {
  const xml = runPandoc('```js\nconst x = 1;\n```\n');
  assert.ok(!xml.includes('wpg:wgp'));
});
