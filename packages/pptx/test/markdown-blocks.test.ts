import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMermaidBlocks } from '../src/markdown-blocks.js';

test('titles each block with the nearest preceding heading', () => {
  const md = '# One\n\n```mermaid\nA-->B\n```\n\n## Two *styled*\n\n```mermaid\nC-->D\n```\n';
  assert.deepEqual(extractMermaidBlocks(md), [
    { text: 'A-->B', title: 'One' },
    { text: 'C-->D', title: 'Two styled' },
  ]);
});

test('a block with no heading before it has no title', () => {
  assert.deepEqual(extractMermaidBlocks('```mermaid\nA-->B\n```'), [{ text: 'A-->B' }]);
});

test('ignores non-mermaid fences and headings inside fences', () => {
  const md = '```text\n# not a heading\n```\n\n```mermaid\nA-->B\n```';
  assert.deepEqual(extractMermaidBlocks(md), [{ text: 'A-->B' }]);
});

test('supports tilde fences, longer fences and CRLF', () => {
  const md = '# T\r\n\r\n~~~~mermaid\r\nA-->B\r\n~~~\r\nstill inside\r\n~~~~\r\n';
  assert.deepEqual(extractMermaidBlocks(md), [{ text: 'A-->B\n~~~\nstill inside', title: 'T' }]);
});

test('an unterminated block runs to the end of the document', () => {
  assert.deepEqual(extractMermaidBlocks('```mermaid\nA-->B'), [{ text: 'A-->B' }]);
});

test('returns nothing when there is no mermaid block', () => {
  assert.deepEqual(extractMermaidBlocks('# Just prose\n\ntext'), []);
});
