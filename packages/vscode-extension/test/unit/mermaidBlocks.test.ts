import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMermaidBlocks,
  blockAtLine,
  wrapBlockAsDocument,
  wrapMermaidSource,
  isExportablePath,
  isMermaidFilePath,
} from '../../src/mermaidBlocks';

test('parses a single mermaid block with no heading', () => {
  const blocks = parseMermaidBlocks('```mermaid\ngraph TD\n  A --> B\n```\n');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.source, 'graph TD\n  A --> B');
  assert.equal(blocks[0]?.precedingHeading, null);
  assert.equal(blocks[0]?.index, 0);
});

test('associates a block with the nearest preceding heading', () => {
  const md = '# Titre\n\nTexte.\n\n## Sous-titre\n\n```mermaid\ngraph TD\n  A --> B\n```\n';
  const blocks = parseMermaidBlocks(md);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.precedingHeading, 'Sous-titre');
});

test('indexes multiple blocks in source order', () => {
  const md = [
    '# Un',
    '```mermaid',
    'graph TD',
    '  A --> B',
    '```',
    '# Deux',
    '```mermaid',
    'graph TD',
    '  C --> D',
    '```',
  ].join('\n');
  const blocks = parseMermaidBlocks(md);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.index, 0);
  assert.equal(blocks[0]?.precedingHeading, 'Un');
  assert.equal(blocks[1]?.index, 1);
  assert.equal(blocks[1]?.precedingHeading, 'Deux');
});

test('ignores mermaid-looking text inside a different fenced block', () => {
  const md = '```text\n```mermaid\n```\ngraph TD\n  A --> B\n```\n';
  // The first ```text fence swallows everything up to its own closing ```,
  // including what looks like a nested mermaid fence — no block found there.
  const blocks = parseMermaidBlocks(md);
  assert.equal(blocks.length, 0);
});

test('a "#" comment inside a non-mermaid code block does not corrupt heading tracking', () => {
  const md = [
    '# Vrai titre',
    '```bash',
    '# ceci est un commentaire shell, pas un titre Markdown',
    'echo hi',
    '```',
    '```mermaid',
    'graph TD',
    '  A --> B',
    '```',
  ].join('\n');
  const blocks = parseMermaidBlocks(md);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.precedingHeading, 'Vrai titre');
});

test('an unterminated fence is skipped rather than guessed', () => {
  const md = '```mermaid\ngraph TD\n  A --> B\n';
  const blocks = parseMermaidBlocks(md);
  assert.equal(blocks.length, 0);
});

test('blockAtLine finds the block spanning a given line, including its fences', () => {
  const md = '```mermaid\ngraph TD\n  A --> B\n```\n';
  const blocks = parseMermaidBlocks(md);
  const block = blocks[0];
  assert.ok(block);
  assert.equal(blockAtLine(blocks, block.fenceLine), block);
  assert.equal(blockAtLine(blocks, block.closingFenceLine), block);
  assert.equal(blockAtLine(blocks, block.closingFenceLine + 1), null);
});

test('wrapBlockAsDocument produces a standalone document with the block heading', () => {
  const blocks = parseMermaidBlocks('## Mon titre\n\n```mermaid\ngraph TD\n  A --> B\n```\n');
  const block = blocks[0];
  assert.ok(block);
  const wrapped = wrapBlockAsDocument(block);
  assert.equal(wrapped, '# Mon titre\n\n```mermaid\ngraph TD\n  A --> B\n```\n');
});

test('wrapBlockAsDocument falls back to a generic title when there is no heading', () => {
  const blocks = parseMermaidBlocks('```mermaid\ngraph TD\n  A --> B\n```\n');
  const block = blocks[0];
  assert.ok(block);
  assert.ok(wrapBlockAsDocument(block).startsWith('# Diagramme\n'));
});

test('wrapMermaidSource wraps raw Mermaid text (e.g. a whole .mmd file) in a minimal document', () => {
  const wrapped = wrapMermaidSource('graph TD\n  A --> B', 'diagram');
  assert.equal(wrapped, '# diagram\n\n```mermaid\ngraph TD\n  A --> B\n```\n');
});

test('isExportablePath accepts .md and .mmd (case-insensitive), rejects everything else', () => {
  assert.equal(isExportablePath('/a/b/notes.md'), true);
  assert.equal(isExportablePath('/a/b/diagram.mmd'), true);
  assert.equal(isExportablePath('/a/b/DIAGRAM.MMD'), true);
  assert.equal(isExportablePath('/a/b/readme.txt'), false);
  assert.equal(isExportablePath('/a/b/notes.md.bak'), false);
});

test('isMermaidFilePath is true only for .mmd', () => {
  assert.equal(isMermaidFilePath('/a/b/diagram.mmd'), true);
  assert.equal(isMermaidFilePath('/a/b/DIAGRAM.MMD'), true);
  assert.equal(isMermaidFilePath('/a/b/notes.md'), false);
});
