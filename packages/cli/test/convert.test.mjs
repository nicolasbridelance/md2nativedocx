import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

test('convert(): diagram warnings come back without the stderr prefix, placed at their diagram', async () => {
  const { warnings, diagnostics, pandocStderr } = await convert('```mermaid\ngraph TD\n  A --> B\n  this is not mermaid\n```\n');
  assert.deepEqual(warnings, ['warning: diagram 1, line 1: Unsupported line ignored: this is not mermaid']);
  assert.deepEqual(diagnostics, [{ message: 'Unsupported line ignored: this is not mermaid', diagram: 1, language: 'mermaid', line: 1 }]);
  assert.match(pandocStderr, /md2nativedocx: warning: Unsupported line ignored/);
});

test('convert(): each warning names its own diagram and fence line, in a document with several', async () => {
  const md = [
    '# Report', '', '```js', 'const a = 1;', '```', '',
    '```mermaid', 'graph TD', '  A --> B', '```', '',
    'Text.', '',
    '```mermaid', 'graph TD', '  C --> D', '  not mermaid at all', '```', '',
  ].join('\n');
  const { diagnostics } = await convert(md, { smartArt: false });
  assert.deepEqual(diagnostics, [{ message: 'Unsupported line ignored: not mermaid at all', diagram: 2, language: 'mermaid', line: 14 }]);
});

test('convert(): an unclosed fence is a diagnostic with its line and no diagram number', async () => {
  const { diagnostics, warnings } = await convert('# T\n\n```mermaid\ngraph TD\n  A --> B\n');
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.line, 3);
  assert.equal(diagnostics[0]?.diagram, undefined);
  assert.match(warnings[0] ?? '', /^warning: line 3: the ```mermaid block is never closed/);
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

// R3.4: a Pandoc run that never ends must not hang the caller.
// POSIX only: Windows `execFile` cannot launch a script stub, and a real `.exe` stub would need a build step.
test('convert(): timeoutMs kills a Pandoc that does not finish and rejects with a ConversionError', { skip: process.platform === 'win32' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-timeout-'));
  try {
    // A stand-in "pandoc" that sleeps far past the limit.
    const stub = join(dir, process.platform === 'win32' ? 'slow-pandoc.cmd' : 'slow-pandoc.sh');
    writeFileSync(stub, process.platform === 'win32' ? '@echo off\r\nping -n 30 127.0.0.1 >nul\r\n' : '#!/bin/sh\nsleep 30\n', { mode: 0o755 });
    const start = Date.now();
    await assert.rejects(
      convert(CHAIN, { pandocBin: stub, timeoutMs: 500 }),
      (err) => err instanceof ConversionError && err.stage === 'pandoc' && /timed out after 500 ms/.test(err.message),
    );
    assert.ok(Date.now() - start < 15000, 'must return soon after the limit, not when the stub ends');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MD2NATIVEDOCX_TIMEOUT_MS: 10 minutes by default for the CLI, overridable, 0 removes the limit', () => {
  assert.equal(readConvertOptionsFromEnv({}).timeoutMs, 600000);
  assert.equal(readConvertOptionsFromEnv({ MD2NATIVEDOCX_TIMEOUT_MS: '1500' }).timeoutMs, 1500);
  assert.equal(readConvertOptionsFromEnv({ MD2NATIVEDOCX_TIMEOUT_MS: '0' }).timeoutMs, 0);
  assert.equal(readConvertOptionsFromEnv({ MD2NATIVEDOCX_TIMEOUT_MS: 'abc' }).timeoutMs, 600000);
});

// --- sandbox (TODO R3.5): Pandoc reads no image, file, URL or network share named in the Markdown. ---

/** A 1x1 PNG, enough for Pandoc to embed. */
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const WITH_IMAGE = `${CHAIN}\n![local](pic.png)\n`;

function mediaOf(document) {
  return entries(document).filter((name) => name.startsWith('word/media/'));
}

test('without sandbox, a local image is embedded (unchanged behaviour)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-sbx-'));
  try {
    writeFileSync(join(dir, 'pic.png'), PNG_1X1);
    const { document, warnings } = await convert(WITH_IMAGE, { cwd: dir });
    assert.equal(mediaOf(document).length, 1);
    assert.ok(!warnings.some((w) => w.includes('sandbox')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sandbox leaves a local image out, says so, and still draws the diagram', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-sbx-'));
  try {
    writeFileSync(join(dir, 'pic.png'), PNG_1X1);
    const { document, warnings } = await convert(WITH_IMAGE, { cwd: dir, sandbox: true, smartArt: false });
    assert.deepEqual(mediaOf(document), []);
    assert.ok(warnings.some((w) => w.includes('image not embedded (sandbox') && w.endsWith('pic.png')), warnings.join('\n'));
    assert.ok(documentXml(document).includes('<wps:wsp'), 'the diagram is still drawn as shapes');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sandbox applies to .odt too', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-sbx-'));
  try {
    writeFileSync(join(dir, 'pic.png'), PNG_1X1);
    const { document, warnings } = await convert(WITH_IMAGE, { cwd: dir, sandbox: true, format: 'odt' });
    assert.deepEqual(entries(document).filter((n) => n.startsWith('Pictures/')), []);
    assert.ok(warnings.some((w) => w.includes('image not embedded (sandbox')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MD2NATIVEDOCX_SANDBOX=1 turns sandbox on; anything else leaves it off', () => {
  assert.equal(readConvertOptionsFromEnv({ MD2NATIVEDOCX_SANDBOX: '1' }).sandbox, true);
  assert.equal(readConvertOptionsFromEnv({}).sandbox, undefined);
  assert.equal(readConvertOptionsFromEnv({ MD2NATIVEDOCX_SANDBOX: '0' }).sandbox, undefined);
});
