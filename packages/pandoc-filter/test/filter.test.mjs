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

test('pandoc filter converts a mermaid block into native shapes', () => {
  const xml = runPandoc('```mermaid\ngraph TD\n  A[Start] --> B[End]\n```\n');
  assert.ok(xml.includes('<wpc:wpc'));
  assert.ok(xml.includes('<wps:wsp>'));
  assert.ok(xml.includes('<wps:cNvCnPr>'));
});

test('pandoc filter emits the schema-required w:p/w:drawing wrapper', () => {
  const xml = runPandoc('```mermaid\ngraph TD\n  A[Start] --> B[End]\n```\n');
  // The fragment must be a complete w:p paragraph wrapping the drawing in the
  // schema-required hierarchy, so Word accepts the .docx (spec §5.3).
  assert.ok(xml.includes('<w:p '));
  assert.ok(xml.includes('<w:drawing>'));
  // Inline, not anchored: the diagram flows with the text (spec §5.3).
  assert.ok(xml.includes('<wp:inline '));
  assert.ok(!xml.includes('<wp:anchor '));
  assert.ok(xml.includes('<a:graphic '));
  assert.ok(xml.includes('<a:graphicData '));
  assert.ok(xml.includes('<wpc:wpc '));
  assert.ok(xml.includes('</w:p>'));
  // The shapes must be nested inside the wpc:wpc canvas, not a bare child of body.
  const wsp = xml.indexOf('<wps:wsp>');
  const wpc = xml.indexOf('<wpc:wpc ');
  assert.ok(wsp > wpc, 'wps:wsp must be nested inside wpc:wpc');
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
