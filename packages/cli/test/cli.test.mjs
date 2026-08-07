import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'bin', 'md2nativedocx.mjs');

function runCli(args, opts = {}) {
  try {
    const out = execFileSync('node', [cli, ...args], {
      encoding: 'utf8',
      ...opts,
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status, out: err.stdout ?? '', err: err.stderr ?? '' };
  }
}

test('cli converts a markdown file to a valid docx', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-cli-'));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  writeFileSync(md, '# T\n\n```mermaid\ngraph TD\n  A --> B\n```\n');
  try {
    const { code, out } = runCli([md, '-o', docx]);
    assert.equal(code, 0, out);
    assert.ok(existsSync(docx));
    // The docx must be a valid ZIP containing the wpg:wgp fragment wrapped in
    // the schema-required w:p/w:drawing hierarchy (spec §5.3).
    const xml = execFileSync('unzip', ['-p', docx, 'word/document.xml'], {
      encoding: 'utf8',
    });
    assert.ok(xml.includes('<wpg:wgp'));
    assert.ok(xml.includes('<w:drawing>'));
    // Inline, not anchored: the diagram flows with the text (spec §5.3).
    assert.ok(xml.includes('<wp:inline '));
    assert.ok(!xml.includes('<wp:anchor '));
    assert.ok(xml.includes('<a:graphicData '));
    assert.ok(xml.includes('<wpc:wpc '));
    // The wpg:wgp must be nested inside wpc:wpc, not a bare child of body.
    const wgp = xml.indexOf('<wpg:wgp');
    const wpc = xml.indexOf('<wpc:wpc ');
    assert.ok(wgp > wpc, 'wpg:wgp must be nested inside wpc:wpc');
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
