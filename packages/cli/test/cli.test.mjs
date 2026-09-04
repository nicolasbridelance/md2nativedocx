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
