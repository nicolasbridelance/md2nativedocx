import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveOutputPath, resolveBlockForCursor, exportMermaidFile } from '../../src/exportService';

test('resolveOutputPath defaults to the source file\'s own directory (zero-config)', () => {
  const out = resolveOutputPath('/home/user/reports/rapport.md', 'rapport', '');
  assert.equal(out, join('/home/user/reports', 'rapport.docx'));
});

test('resolveOutputPath honours an explicit outputDirectory setting', () => {
  const out = resolveOutputPath('/home/user/reports/rapport.md', 'rapport', '/home/user/out');
  assert.equal(out, join('/home/user/out', 'rapport.docx'));
});

test('resolveBlockForCursor picks the block under the cursor', () => {
  const md = [
    '```mermaid', // line 0
    'graph TD', // 1
    '  A --> B', // 2
    '```', // 3
    'texte', // 4
    '```mermaid', // 5
    'graph TD', // 6
    '  C --> D', // 7
    '```', // 8
  ].join('\n');
  const block = resolveBlockForCursor(md, 6);
  assert.equal(block?.index, 1);
});

test('resolveBlockForCursor falls back to the sole block when the cursor is elsewhere', () => {
  const md = '```mermaid\ngraph TD\n  A --> B\n```\n';
  const block = resolveBlockForCursor(md, 0);
  assert.equal(block?.index, 0);
});

test('exportMermaidFile wraps a raw .mmd file and produces a .docx named after it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-mmd-export-test-'));
  try {
    const mmdPath = join(dir, 'flow.mmd');
    writeFileSync(mmdPath, 'graph TD\n  A --> B\n');
    const result = await exportMermaidFile(mmdPath, '');
    assert.equal(result.outputPath, join(dir, 'flow.docx'));
    assert.ok(existsSync(result.outputPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveBlockForCursor returns null when ambiguous (cursor outside any block, several present)', () => {
  const md = [
    '```mermaid',
    'graph TD',
    '  A --> B',
    '```',
    'texte au curseur',
    '```mermaid',
    'graph TD',
    '  C --> D',
    '```',
  ].join('\n');
  const block = resolveBlockForCursor(md, 4);
  assert.equal(block, null);
});
