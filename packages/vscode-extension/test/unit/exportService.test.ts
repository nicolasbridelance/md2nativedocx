import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveOutputPath, resolveBlockForCursor, exportMermaidFile, exportDocument, exportBlock } from '../../src/exportService';

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

test('exportMermaidFile reports 0 warnings and a .log path alongside the .docx on a clean export', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-mmd-export-test-'));
  try {
    const mmdPath = join(dir, 'flow.mmd');
    writeFileSync(mmdPath, 'graph TD\n  A --> B\n');
    const result = await exportMermaidFile(mmdPath, '');
    assert.equal(result.warningCount, 0);
    assert.equal(result.logPath, join(dir, 'flow.log'));
    assert.ok(existsSync(result.logPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exportMermaidFile surfaces parser warnings via warningCount (spec §10)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-mmd-export-test-'));
  try {
    const mmdPath = join(dir, 'flow.mmd');
    writeFileSync(mmdPath, 'graph TD\n  A --> B\n  click A "https://example.com"\n');
    const result = await exportMermaidFile(mmdPath, '');
    assert.equal(result.warningCount, 1);
    assert.ok(existsSync(result.logPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exportDocument strips a .qmd source extension correctly instead of leaving it in the .docx name', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-qmd-export-test-'));
  try {
    const qmdPath = join(dir, 'report.qmd');
    writeFileSync(qmdPath, '# Titre\n\n```mermaid\ngraph TD\n  A --> B\n```\n');
    const result = await exportDocument(qmdPath, '');
    assert.equal(result.outputPath, join(dir, 'report.docx'));
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

test('resolveOutputPath uses the .pptx extension for a PowerPoint export', () => {
  assert.equal(resolveOutputPath('/r/rapport.md', 'rapport', '', 'pptx'), join('/r', 'rapport.pptx'));
});

test('exportDocument in pptx format writes a deck and its .log, without Pandoc', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-pptx-export-test-'));
  try {
    const mdPath = join(dir, 'deck.md');
    writeFileSync(mdPath, '# One\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n# Two\n\n```mermaid\ngraph LR\n  C --> D\n```\n');
    const result = await exportDocument(mdPath, '', { format: 'pptx' });
    assert.equal(result.outputPath, join(dir, 'deck.pptx'));
    assert.ok(existsSync(result.outputPath));
    assert.equal(result.logPath, join(dir, 'deck.log'));
    assert.match(readFileSync(result.logPath, 'utf8'), /^Slides: 2$/m);
    assert.equal(result.warningCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exportBlock in pptx format makes a one-slide deck named after the diagram; showSource is passed through', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-pptx-block-test-'));
  try {
    const mdPath = join(dir, 'rapport.md');
    const text = '# A\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n# B\n\n```mermaid\ngraph TD\n  SourceMarker --> D\n```\n';
    writeFileSync(mdPath, text);
    const result = await exportBlock(mdPath, text, 1, '', { format: 'pptx', pptxShowSource: true });
    assert.equal(result.outputPath, join(dir, 'rapport-diagram-2.pptx'));
    assert.match(readFileSync(result.logPath, 'utf8'), /^Slides: 1$/m);
    // The source panel carries the Mermaid text itself: `graph TD` only appears on the slide when it is shown.
    const slide = execFileSync('unzip', ['-p', result.outputPath, 'ppt/slides/slide1.xml'], { encoding: 'utf8' });
    assert.match(slide, /graph TD/);
    mkdirSync(join(dir, 'plain'));
    const plain = await exportBlock(mdPath, text, 1, join(dir, 'plain'), { format: 'pptx' });
    assert.doesNotMatch(execFileSync('unzip', ['-p', plain.outputPath, 'ppt/slides/slide1.xml'], { encoding: 'utf8' }), /graph TD/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
