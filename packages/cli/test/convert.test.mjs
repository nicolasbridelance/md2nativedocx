import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { ConversionError, convert } from '@md2nativedocx/cli';
import { readConvertOptionsFromEnv } from '../src/envOptions.mjs';

const CHAIN = '# Title\n\n```mermaid\ngraph LR\n  A --> B --> C\n```\n';

function entries(document) {
  return new AdmZip(document).getEntries().map((e) => e.entryName);
}

function documentXml(document) {
  return new AdmZip(document).readAsText('word/document.xml');
}

test('convert(): Markdown text in, .docx bytes out, diagram as SmartArt by default', async () => {
  const { document, warnings } = await convert(CHAIN);
  assert.ok(Buffer.isBuffer(document));
  assert.equal(document.subarray(0, 2).toString('latin1'), 'PK');
  assert.ok(entries(document).includes('word/diagrams/data1.xml'));
  assert.deepEqual(warnings, []);
});

test('convert(): options turn SmartArt off, and the diagram becomes shapes', async () => {
  const { document } = await convert(CHAIN, { smartArt: false });
  assert.ok(!entries(document).some((name) => name.startsWith('word/diagrams/')));
  assert.match(documentXml(document), /<wps:wsp>/);
});

test('convert(): MD2NATIVEDOCX_* variables of the host process do not change the result', async () => {
  const saved = { ...process.env };
  Object.assign(process.env, { MD2NATIVEDOCX_ENABLE_SMARTART: '0', MD2NATIVEDOCX_SMARTART_DIR: '/nonexistent', MD2NATIVEDOCX_PAGE_SIZE: 'A3' });
  try {
    const { document } = await convert(CHAIN);
    assert.ok(entries(document).includes('word/diagrams/data1.xml'));
  } finally {
    for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name];
    Object.assign(process.env, saved);
  }
});

test('convert(): diagram warnings come back without the stderr prefix', async () => {
  const { warnings, pandocStderr } = await convert('```mermaid\ngraph TD\n  A --> B\n  click A callback\n```\n');
  assert.deepEqual(warnings, ['warning: Unsupported line ignored: click A callback']);
  assert.match(pandocStderr, /md2nativedocx: warning: Unsupported line ignored/);
});

test('convert(): labels with XML metacharacters reach document.xml escaped', async () => {
  const { document } = await convert('```mermaid\ngraph TD\n  A["<b>&\'x\'"] --> B\n```\n', { smartArt: false });
  const xml = documentXml(document);
  assert.ok(!xml.includes('<b>&'), 'raw label leaked into the XML');
  assert.match(xml, /&lt;b&gt;&amp;/);
});

test('convert(): a missing Pandoc is a ConversionError at the pandoc stage', async () => {
  await assert.rejects(convert(CHAIN, { pandocBin: '/nonexistent/pandoc' }), (err) => {
    assert.ok(err instanceof ConversionError);
    assert.equal(err.stage, 'pandoc');
    assert.match(err.message, /^Pandoc failed \(exit ENOENT\)$/);
    return true;
  });
});

test('convert(): a reference document that does not exist is a setup error, before Pandoc runs', async () => {
  await assert.rejects(convert(CHAIN, { referenceDoc: join(tmpdir(), 'md2nativedocx-missing-reference.docx') }), (err) => {
    assert.ok(err instanceof ConversionError);
    assert.equal(err.stage, 'setup');
    return true;
  });
});

test('convert(): leaves nothing behind in the temporary directory, on success and on failure', async () => {
  // A private TMPDIR: other test files convert concurrently in the shared one.
  const privateTmp = mkdtempSync(join(tmpdir(), 'md2nativedocx-tmpdir-'));
  const savedTmpdir = process.env.TMPDIR;
  process.env.TMPDIR = privateTmp;
  try {
    await convert(CHAIN, { layout: { pageSize: 'A3' } });
    await assert.rejects(convert(CHAIN, { pandocBin: '/nonexistent/pandoc' }), ConversionError);
    assert.deepEqual(readdirSync(privateTmp), []);
  } finally {
    if (savedTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = savedTmpdir;
    rmSync(privateTmp, { recursive: true, force: true });
  }
});

test('readConvertOptionsFromEnv(): defaults are the CLI defaults', () => {
  const options = readConvertOptionsFromEnv({});
  assert.equal(options.smartArt, true);
  assert.equal(options.nativeCharts, true);
  assert.equal(options.emojiFont, true);
  assert.equal(options.toc, false);
  assert.equal(options.referenceDoc, undefined);
  assert.ok(Object.values(options.layout).every((v) => v === undefined));
});

test('readConvertOptionsFromEnv(): each variable lands in its option', () => {
  const options = readConvertOptionsFromEnv({
    MD2NATIVEDOCX_ENABLE_SMARTART: '0',
    MD2NATIVEDOCX_NATIVE_CHARTS: 'pie, radar',
    MD2NATIVEDOCX_TOC: '1',
    MD2NATIVEDOCX_TOC_DEPTH: '4',
    MD2NATIVEDOCX_PAGE_SIZE: ' A3 ',
    MD2NATIVEDOCX_MARGINS_CUSTOM_LEFT: '2.5',
    MD2NATIVEDOCX_MAX_DRAWING_CX: '3000000',
    MD2NATIVEDOCX_MAX_DRAWING_CY: 'abc',
    MD2NATIVEDOCX_PANDOC_BIN: '/opt/pandoc',
    MD2NATIVEDOCX_REFERENCE_DOC: '/nonexistent/template.docx',
  });
  assert.equal(options.smartArt, false);
  assert.deepEqual(options.nativeCharts, ['pie', 'radar']);
  assert.equal(options.toc, true);
  assert.equal(options.tocDepth, 4);
  assert.equal(options.layout.pageSize, 'A3');
  assert.deepEqual(options.layout.marginsCustomCm, { top: undefined, right: undefined, bottom: undefined, left: 2.5 });
  assert.equal(options.maxDrawingCx, 3000000);
  assert.equal(options.maxDrawingCy, undefined);
  assert.equal(options.pandocBin, '/opt/pandoc');
  // A template that does not exist is ignored, as the CLI always did.
  assert.equal(options.referenceDoc, undefined);
  assert.equal(readConvertOptionsFromEnv({ MD2NATIVEDOCX_NATIVE_CHARTS: '0' }).nativeCharts, false);
});
