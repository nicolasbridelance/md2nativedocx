import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'md2nativedocx.mjs');

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-pptx-cli-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('exports a deck: one slide per mermaid block, titled by its heading', () => {
  withDir((dir) => {
    const md = join(dir, 'deck.md');
    const out = join(dir, 'deck.pptx');
    writeFileSync(md, '# Flow\n\n```mermaid\ngraph TD\n A --> B\n```\n\n# Seq\n\n```mermaid\nsequenceDiagram\n A->>B: hi\n```\n');
    const stdout = execFileSync('node', [cli, md, '-o', out], { encoding: 'utf8' });
    assert.match(stdout, /Wrote deck\.pptx \(2 slides\)/);
    const zip = new AdmZip(readFileSync(out));
    assert.match(zip.readAsText('ppt/slides/slide1.xml'), /Flow/);
    assert.match(zip.readAsText('ppt/slides/slide2.xml'), /<p:cxnSp>/);
  });
});

test('a document with no mermaid block fails with exit code 1 and writes nothing', () => {
  withDir((dir) => {
    const md = join(dir, 'prose.md');
    writeFileSync(md, '# Only prose\n');
    const r = spawnSync('node', [cli, md, '-o', join(dir, 'x.pptx')], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no ```mermaid block/);
  });
});

test('rejects an output path escaping the working directory', () => {
  withDir((dir) => {
    const md = join(dir, 'deck.md');
    writeFileSync(md, '```mermaid\ngraph TD\n A --> B\n```\n');
    const r = spawnSync('node', [cli, 'deck.md', '-o', '../escape.pptx'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /escapes the working directory/);
  });
});

test('writes an export log next to the deck, same header as the .docx log', () => {
  withDir((dir) => {
    const md = join(dir, 'deck.md');
    writeFileSync(md, '# Flow\n\n```mermaid\ngraph TD\n A --> B\n```\n');
    execFileSync('node', [cli, md, '-o', join(dir, 'deck.pptx')], { encoding: 'utf8' });
    const log = readFileSync(join(dir, 'deck.log'), 'utf8');
    assert.match(log, /^md2nativedocx export log/);
    assert.match(log, /^Warnings: 0$/m);
    assert.match(log, /^Slides: 1$/m);
  });
});
