import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'bin', 'md2nativedocx.mjs');

function runCli(args, opts = {}) {
  const result = spawnSync('node', [cli, ...args], { encoding: 'utf8', ...opts });
  return { code: result.status, out: result.stdout ?? '', err: result.stderr ?? '' };
}

test('cli converts a markdown file to a valid docx', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-cli-'));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  // A merge-after-branch shape, not a plain A --> B: classifyTopology always
  // rejects this shape, so it reliably exercises the wpc:wpc/wps:wsp OOXML
  // path this test asserts on, regardless of what the SmartArt classifier
  // does or doesn't accept over time. A plain chain like `A --> B` now
  // dispatches to SmartArt instead (see md2nativedocx-core.mjs) — covered
  // separately in packages/cli/test/corpus.test.mjs.
  writeFileSync(md, '# T\n\n```mermaid\ngraph TD\n  A --> B\n  A --> C\n  B --> D\n  C --> D\n```\n');
  try {
    const { code, out } = runCli([md, '-o', docx]);
    assert.equal(code, 0, out);
    assert.ok(existsSync(docx));
    // The docx must be a valid ZIP containing the drawing fragment wrapped in
    // the schema-required w:p/w:drawing hierarchy (spec §5.3).
    const xml = execFileSync('unzip', ['-p', docx, 'word/document.xml'], {
      encoding: 'utf8',
    });
    assert.ok(xml.includes('<wpc:wpc'));
    assert.ok(xml.includes('<w:drawing>'));
    // Inline, not anchored: the diagram flows with the text (spec §5.3).
    assert.ok(xml.includes('<wp:inline '));
    assert.ok(!xml.includes('<wp:anchor '));
    assert.ok(xml.includes('<a:graphicData '));
    assert.ok(xml.includes('<wpc:wpc '));
    // The shapes must be nested inside wpc:wpc, not a bare child of body.
    const wsp = xml.indexOf('<wps:wsp>');
    const wpc = xml.indexOf('<wpc:wpc ');
    assert.ok(wsp > wpc, 'wps:wsp must be nested inside wpc:wpc');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli rejects a missing input file', () => {
  const { code } = runCli(['/nonexistent.md', '-o', '/tmp/out.docx']);
  assert.notEqual(code, 0);
});

test('cli rejects a path that escapes the working directory', () => {
  const { code } = runCli(['../../etc/passwd', '-o', '/tmp/out.docx']);
  assert.notEqual(code, 0);
});

test('cli prints usage on --help', () => {
  const { code, out } = runCli(['--help']);
  assert.equal(code, 0);
  assert.ok(out.includes('Usage'));
});

test('cli always writes a .log file next to the output, "Warnings: 0" on a clean export', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-cli-'));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  writeFileSync(md, '# T\n\n```mermaid\ngraph TD\n  A --> B\n```\n');
  try {
    const { code, out } = runCli([md, '-o', docx]);
    assert.equal(code, 0, out);
    assert.ok(!out.includes('Warnings:'), 'no summary line expected on a clean export');
    const logPath = join(dir, 'doc.log');
    assert.ok(existsSync(logPath));
    const log = readFileSync(logPath, 'utf8');
    assert.ok(log.includes('Warnings: 0'));
    assert.ok(log.includes('No warnings.'));
    assert.ok(log.includes(`Input: ${md}`));
    assert.ok(log.includes(`Output: ${docx}`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli surfaces parser warnings: stdout summary + stderr + itemized in the .log file (spec §10)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-cli-'));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  writeFileSync(md, '# T\n\n```mermaid\ngraph TD\n  A --> B\n  click A "https://example.com"\n```\n');
  try {
    const { code, out, err } = runCli([md, '-o', docx]);
    assert.equal(code, 0, out);
    assert.match(out, /^Warnings: 1 \(see doc\.log\)$/m);
    assert.match(err, /^md2nativedocx: warning: /m);
    const log = readFileSync(join(dir, 'doc.log'), 'utf8');
    assert.ok(log.includes('Warnings: 1'));
    assert.ok(/^- /m.test(log), 'expected an itemized warning line');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli honours MD2NATIVEDOCX_REFERENCE_DOC when it points to a real file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-cli-'));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  const customReferenceDoc = join(dir, 'custom-reference.docx');
  writeFileSync(md, '# T\n\n```mermaid\ngraph TD\n  A --> B\n```\n');
  copyFileSync(join(here, '..', 'assets', 'reference.docx'), customReferenceDoc);
  try {
    const { code, out } = runCli([md, '-o', docx], {
      env: { ...process.env, MD2NATIVEDOCX_REFERENCE_DOC: customReferenceDoc },
    });
    assert.equal(code, 0, out);
    assert.ok(existsSync(docx));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli falls back to the bundled reference.docx when MD2NATIVEDOCX_REFERENCE_DOC does not exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-cli-'));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  writeFileSync(md, '# T\n\n```mermaid\ngraph TD\n  A --> B\n```\n');
  try {
    const { code, out } = runCli([md, '-o', docx], {
      env: { ...process.env, MD2NATIVEDOCX_REFERENCE_DOC: join(dir, 'does-not-exist.docx') },
    });
    assert.equal(code, 0, out);
    assert.ok(existsSync(docx));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MD2NATIVEDOCX_DISABLE_SMARTART forces the wpc:wpc canvas fallback even for a SmartArt-eligible diagram', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-cli-'));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  // A plain chain: SmartArt-eligible (see corpus.test.mjs), so this is
  // exactly the case the setting mirrored by this env var needs to override.
  writeFileSync(md, '# T\n\n```mermaid\ngraph TD\n  A --> B\n  B --> C\n```\n');
  try {
    const { code, out } = runCli([md, '-o', docx], {
      env: { ...process.env, MD2NATIVEDOCX_DISABLE_SMARTART: '1' },
    });
    assert.equal(code, 0, out);
    const xml = execFileSync('unzip', ['-p', docx, 'word/document.xml'], { encoding: 'utf8' });
    assert.ok(xml.includes('<wpc:wpc '), 'expected the OOXML canvas fallback');
    assert.ok(!xml.includes('<dgm:relIds'), 'SmartArt must not be attempted when disabled');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Lot 1: page/typography env vars reach the generated .docx end to end (export_customization_SPEC.md §1.1-1.8/1.14)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-cli-'));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  writeFileSync(md, '# T\n\nUn paragraphe de test.\n');
  try {
    const { code, out } = runCli([md, '-o', docx], {
      env: {
        ...process.env,
        MD2NATIVEDOCX_PAGE_SIZE: 'Letter',
        MD2NATIVEDOCX_ORIENTATION: 'landscape',
        MD2NATIVEDOCX_MARGINS: 'narrow',
        MD2NATIVEDOCX_HEADING_FONT: 'Georgia',
        MD2NATIVEDOCX_BODY_FONT: 'Verdana',
        MD2NATIVEDOCX_FONT_SIZE: '13',
        MD2NATIVEDOCX_LINE_SPACING: '1.5',
        MD2NATIVEDOCX_JUSTIFY: 'both',
        MD2NATIVEDOCX_ACCENT_COLOR: 'FF0000',
      },
    });
    assert.equal(code, 0, out);
    // Pandoc re-serializes the sectPr it copies from the reference doc
    // (attribute order/spacing not preserved verbatim), so assert on the
    // sectPr as a whole rather than a fixed attribute order.
    const documentXml = execFileSync('unzip', ['-p', docx, 'word/document.xml'], { encoding: 'utf8' });
    const sectPr = documentXml.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/)[0];
    assert.match(sectPr, /w:w="15840"/);
    assert.match(sectPr, /w:h="12240"/);
    assert.match(sectPr, /w:orient="landscape"/);
    assert.match(sectPr, /w:top="720"/);
    assert.match(sectPr, /w:right="720"/);
    assert.match(sectPr, /w:bottom="720"/);
    assert.match(sectPr, /w:left="720"/);
    const themeXml = execFileSync('unzip', ['-p', docx, 'word/theme/theme1.xml'], { encoding: 'utf8' });
    assert.ok(themeXml.includes('typeface="Georgia"'));
    assert.ok(themeXml.includes('typeface="Verdana"'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Lot 1: a Letter-portrait-sized diagram is re-scaled to fit a smaller custom page/margins', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-cli-'));
  const md = join(dir, 'doc.md');
  const docxDefault = join(dir, 'default.docx');
  const docxNarrow = join(dir, 'narrow.docx');
  // A merge-after-branch shape (not SmartArt-eligible, see the first test in
  // this file) with long labels, big enough to actually hit the scale-down
  // path under a much smaller usable page area.
  writeFileSync(
    md,
    '# T\n\n```mermaid\ngraph TD\n' +
      '  A[Un noeud avec un long libelle] --> B[Un autre noeud avec un long libelle]\n' +
      '  A --> C[Encore un noeud avec un long libelle]\n' +
      '  B --> D[Dernier noeud avec un long libelle]\n  C --> D\n```\n',
  );
  try {
    assert.equal(runCli([md, '-o', docxDefault]).code, 0);
    const { code, out } = runCli([md, '-o', docxNarrow], {
      env: { ...process.env, MD2NATIVEDOCX_PAGE_SIZE: 'A4', MD2NATIVEDOCX_MARGINS: 'wide' },
    });
    assert.equal(code, 0, out);
    const extentOf = (docx) => {
      const xml = execFileSync('unzip', ['-p', docx, 'word/document.xml'], { encoding: 'utf8' });
      const [, cx] = xml.match(/<wp:extent cx="(\d+)"/);
      return Number(cx);
    };
    assert.ok(
      extentOf(docxNarrow) < extentOf(docxDefault),
      'a smaller usable page area (A4 + wide margins vs the Letter-portrait default) must produce a narrower diagram',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Lot 3: MD2NATIVEDOCX_TOC generates a TOC placed after the H1 title, with auto-update-on-open set', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-cli-'));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  writeFileSync(
    md,
    '# Rapport\n\n## Introduction\nTexte.\n\n## Conclusion\nTexte.\n',
  );
  try {
    const { code, out } = runCli([md, '-o', docx], {
      env: { ...process.env, MD2NATIVEDOCX_TOC: '1', MD2NATIVEDOCX_TOC_DEPTH: '2' },
    });
    assert.equal(code, 0, out);
    const documentXml = execFileSync('unzip', ['-p', docx, 'word/document.xml'], { encoding: 'utf8' });
    assert.ok(documentXml.includes('docPartGallery'), 'expected a TOC field');
    assert.ok(
      documentXml.indexOf('Heading1') < documentXml.indexOf('docPartGallery'),
      'the TOC must be placed after the H1 title, not before it (spec §1.10)',
    );
    assert.match(documentXml, /TOC \\o &quot;1-2&quot;/, 'expected --toc-depth=2 to reach the field code');
    const settingsXml = execFileSync('unzip', ['-p', docx, 'word/settings.xml'], { encoding: 'utf8' });
    assert.match(settingsXml, /<w:updateFields w:val="true"\s*\/>/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Lot 3: TOC auto-update still works with a custom reference document (settings.xml is Pandoc\'s own, not the template\'s)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-cli-'));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  const customReferenceDoc = join(dir, 'custom-reference.docx');
  writeFileSync(md, '# Rapport\n\n## Introduction\nTexte.\n');
  copyFileSync(join(here, '..', 'assets', 'reference.docx'), customReferenceDoc);
  try {
    const { code, out } = runCli([md, '-o', docx], {
      env: { ...process.env, MD2NATIVEDOCX_REFERENCE_DOC: customReferenceDoc, MD2NATIVEDOCX_TOC: '1' },
    });
    assert.equal(code, 0, out);
    const settingsXml = execFileSync('unzip', ['-p', docx, 'word/settings.xml'], { encoding: 'utf8' });
    assert.match(settingsXml, /<w:updateFields w:val="true"\s*\/>/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Lot 2: emoji color font is forced by default, opt-out via MD2NATIVEDOCX_EMOJI_FONT=0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-cli-'));
  const md = join(dir, 'doc.md');
  const docxDefault = join(dir, 'default.docx');
  const docxOptOut = join(dir, 'opt-out.docx');
  writeFileSync(md, '# T\n\nStatut : **✅ fait**, texte normal.\n');
  try {
    assert.equal(runCli([md, '-o', docxDefault]).code, 0);
    const defaultXml = execFileSync('unzip', ['-p', docxDefault, 'word/document.xml'], { encoding: 'utf8' });
    assert.ok(defaultXml.includes('Segoe UI Emoji'), 'default (no env var) must force the emoji font');
    assert.ok(defaultXml.includes('<w:t xml:space="preserve">✅</w:t>'), 'the emoji must be split into its own run');
    assert.ok(defaultXml.includes('fait'), 'the surrounding bold text must survive unchanged');

    const { code } = runCli([md, '-o', docxOptOut], { env: { ...process.env, MD2NATIVEDOCX_EMOJI_FONT: '0' } });
    assert.equal(code, 0);
    const optOutXml = execFileSync('unzip', ['-p', docxOptOut, 'word/document.xml'], { encoding: 'utf8' });
    assert.ok(!optOutXml.includes('Segoe UI Emoji'), 'MD2NATIVEDOCX_EMOJI_FONT=0 must skip the font-forcing patch');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Lot 1 fast-follow: MD2NATIVEDOCX_FOOTER_PAGE_NUMBER adds a working page-number footer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-cli-'));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  writeFileSync(md, '# T\n\nUn paragraphe.\n');
  try {
    const { code, out } = runCli([md, '-o', docx], {
      env: { ...process.env, MD2NATIVEDOCX_FOOTER_PAGE_NUMBER: '1' },
    });
    assert.equal(code, 0, out);
    const listing = execFileSync('unzip', ['-l', docx], { encoding: 'utf8' });
    assert.ok(listing.includes('word/footer1.xml'));
    const documentXml = execFileSync('unzip', ['-p', docx, 'word/document.xml'], { encoding: 'utf8' });
    assert.ok(documentXml.includes('<w:footerReference'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Lot 1: layout/typography options are ignored (with an info note, not a counted warning) when a custom reference doc is set', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-cli-'));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  const customReferenceDoc = join(dir, 'custom-reference.docx');
  writeFileSync(md, '# T\n\nUn paragraphe.\n');
  copyFileSync(join(here, '..', 'assets', 'reference.docx'), customReferenceDoc);
  try {
    const { code, out, err } = runCli([md, '-o', docx], {
      env: {
        ...process.env,
        MD2NATIVEDOCX_REFERENCE_DOC: customReferenceDoc,
        MD2NATIVEDOCX_PAGE_SIZE: 'A4',
        MD2NATIVEDOCX_ORIENTATION: 'landscape',
      },
    });
    assert.equal(code, 0, out);
    assert.match(err, /md2nativedocx \(info\): page\/typography options are ignored/);
    assert.ok(!out.includes('Warnings:'), 'the info note must not be counted as a warning');
    const documentXml = execFileSync('unzip', ['-p', docx, 'word/document.xml'], { encoding: 'utf8' });
    assert.ok(documentXml.includes('<w:sectPr />'), "the custom reference doc's own (empty) sectPr must be untouched");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
