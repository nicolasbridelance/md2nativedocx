import { test } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { PptxConversionError } from '../src/errors.js';
import { exportPptx } from '../src/export-pptx.js';

test('one slide per mermaid block, via the real core bridge', async () => {
  const md = '# Flow\n\n```mermaid\nflowchart LR\n A --> B\n```\n\n# Seq\n\n```mermaid\nsequenceDiagram\n A->>B: hi\n```\n';
  const result = await exportPptx(md, { now: new Date('2026-10-02T00:00:00Z') });
  assert.equal(result.slideCount, 2);
  const zip = new AdmZip(result.buffer);
  assert.match(zip.readAsText('ppt/slides/slide1.xml'), /Flow/);
  assert.match(zip.readAsText('ppt/slides/slide2.xml'), /Seq/);
  assert.match(zip.readAsText('ppt/slides/slide2.xml'), /<p:sp>/);
});

test('a document without a mermaid block is an error, not an empty deck', async () => {
  await assert.rejects(exportPptx('# only prose'), PptxConversionError);
});

test('a failing provider surfaces as an error', async () => {
  const fragmentProvider = (): Promise<never> => Promise.reject(new PptxConversionError('boom'));
  await assert.rejects(exportPptx('```mermaid\nA-->B\n```', { fragmentProvider }), /boom/);
});

test('bridge warnings are reported with their slide number', async () => {
  const result = await exportPptx('```mermaid\nzenuml\n  @Database D\n  D.x()\n```');
  assert.ok(result.warnings.some((w) => w.startsWith('slide 1: ')), result.warnings.join('|'));
});
