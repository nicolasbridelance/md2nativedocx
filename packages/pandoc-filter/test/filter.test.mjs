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

// --- Landscape table sections (spec §1.9/§2.3, "Lot 5") ---
//
// The block-detection/sectPr-placement half of ADR 0005's spike, now wired
// into the real filter. The blank-page cleanup (adjacent/trailing matches)
// is a separate concern, tested in packages/cli/test/postprocess.test.mjs
// (`collapseAdjacentSectionBreaks`/`collapseTrailingLandscapeSection`) —
// this file only tests what the Lua filter itself emits.

const LANDSCAPE_ENV = {
  ...process.env,
  PANDOC_FILTER_CORE: coreBin,
  MD2NATIVEDOCX_LANDSCAPE_TABLES: '1',
  MD2NATIVEDOCX_PAGE_W_TWIPS: '11906',
  MD2NATIVEDOCX_PAGE_H_TWIPS: '16838',
  MD2NATIVEDOCX_MARGIN_TOP_TWIPS: '1417',
  MD2NATIVEDOCX_MARGIN_RIGHT_TWIPS: '1417',
  MD2NATIVEDOCX_MARGIN_BOTTOM_TWIPS: '1417',
  MD2NATIVEDOCX_MARGIN_LEFT_TWIPS: '1417',
};

function runPandocWithEnv(markdown, env) {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-'));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  writeFileSync(md, markdown);
  try {
    execFileSync('pandoc', [md, '-o', docx, '--lua-filter', filter], { env });
    return execFileSync('unzip', ['-p', docx, 'word/document.xml'], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const HEADER_TABLE_MD = '# Intro\n\nParagraphe avant.\n\n## Section title before table\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n# After\n\nParagraphe apres.\n';

test('landscape tables: off by default — no sectPr paragraph is inserted around a Header+Table', () => {
  const xml = runPandocWithEnv(HEADER_TABLE_MD, { ...process.env, PANDOC_FILTER_CORE: coreBin });
  assert.ok(!xml.includes('<w:sectPr>'), 'MD2NATIVEDOCX_LANDSCAPE_TABLES unset must leave document.xml unchanged');
});

test('landscape tables: wraps a Header immediately followed by a Table with a portrait-closing paragraph before and a landscape-closing one after', () => {
  const xml = runPandocWithEnv(HEADER_TABLE_MD, LANDSCAPE_ENV);
  const beforeIdx = xml.indexOf('<w:sectPr>');
  const afterIdx = xml.indexOf('<w:sectPr>', beforeIdx + 1);
  assert.ok(beforeIdx >= 0 && afterIdx > beforeIdx, 'expected two sectPr-only paragraphs');

  // ADR 0005: the paragraph before the Header closes the CURRENT (portrait)
  // section, the one after the Table closes the just-opened (landscape) one
  // — the reverse of a naive "toggle before the Header" reading.
  const headerIdx = xml.indexOf('Section title before table');
  const tableIdx = xml.indexOf('<w:tbl>');
  assert.ok(beforeIdx < headerIdx, 'the portrait-closing paragraph must come before the Header');
  assert.ok(headerIdx < tableIdx, 'sanity: the Header must precede the Table in the source');
  assert.ok(afterIdx > tableIdx, 'the landscape-closing paragraph must come after the Table');

  const beforeBlock = xml.slice(beforeIdx, xml.indexOf('</w:sectPr>', beforeIdx));
  const afterBlock = xml.slice(afterIdx, xml.indexOf('</w:sectPr>', afterIdx));
  assert.ok(!beforeBlock.includes('w:orient="landscape"'), 'the closing-current-section paragraph must stay portrait');
  assert.ok(afterBlock.includes('w:orient="landscape"'), 'the closing-new-section paragraph must be landscape');
});

test('landscape tables: a Table not immediately preceded by a Header is left untouched', () => {
  const md = '# Intro\n\nUn paragraphe separe le titre du tableau.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
  const xml = runPandocWithEnv(md, LANDSCAPE_ENV);
  assert.ok(!xml.includes('<w:sectPr>'), 'a paragraph between the Header and the Table must prevent the match');
});

test('landscape tables: mermaid code blocks still convert normally when the feature is on (the two filter passes do not interfere)', () => {
  const md = '```mermaid\ngraph TD\n  A --> B\n```\n\n## Section title before table\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
  const xml = runPandocWithEnv(md, LANDSCAPE_ENV);
  assert.ok(xml.includes('<wpc:wpc'), 'mermaid conversion (filter 1) must still run');
  assert.ok(xml.includes('<w:sectPr>'), 'landscape table detection (filter 2) must still run');
});
