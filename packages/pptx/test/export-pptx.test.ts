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

test('showSource reserves a panel beside the diagram, shows the escaped source, and is off by default', async () => {
  const md = '# T\n\n```mermaid\nflowchart LR\n A["a & <b>"] --> B\n```\n';
  const areas: number[] = [];
  const fragmentProvider = async (text: string, area: { cx: number }) => {
    areas.push(area.cx);
    return { fragmentXml: '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>', warnings: [] };
  };
  const plain = await exportPptx(md, { fragmentProvider });
  const withSource = await exportPptx(md, { fragmentProvider, showSource: true });
  assert.ok((areas[1] as number) < (areas[0] as number), 'diagram area must shrink to make room for the panel');
  assert.doesNotMatch(new AdmZip(plain.buffer).readAsText('ppt/slides/slide1.xml'), /Mermaid source/);
  const slide = new AdmZip(withSource.buffer).readAsText('ppt/slides/slide1.xml');
  assert.match(slide, /name="Mermaid source"/);
  assert.match(slide, /Consolas/);
  assert.match(slide, /flowchart LR/);
  assert.match(slide, /a &amp; &lt;b&gt;/);
});
