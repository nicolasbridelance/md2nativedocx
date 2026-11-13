import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existingPartIds } from '../src/partIds.mjs';
import { injectChartParts } from '../src/chartParts.mjs';
import { AdmZip } from '../src/zipUtils.mjs';

const GOOD = '44444444-4444-4444-8444-444444444444';

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'part-ids-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('existingPartIds keeps only UUID ids whose directory exists', () => {
  withDir((dir) => {
    mkdirSync(join(dir, 'parts', GOOD), { recursive: true });
    mkdirSync(join(dir, 'parts', 'abc'), { recursive: true });
    mkdirSync(join(dir, 'outside'), { recursive: true });
    const ids = [GOOD, 'abc', '../outside', '..', '.', '', '/etc', `${GOOD}/..`, '55555555-5555-4555-8555-555555555555'];
    assert.deepEqual(existingPartIds(ids, join(dir, 'parts')), [GOOD]);
  });
});

test('existingPartIds drops an id that is a symlink leaving the base directory', (t) => {
  withDir((dir) => {
    mkdirSync(join(dir, 'parts'), { recursive: true });
    mkdirSync(join(dir, 'outside'), { recursive: true });
    try {
      symlinkSync(join(dir, 'outside'), join(dir, 'parts', GOOD), 'dir');
    } catch {
      t.skip('symlinks not permitted here'); // Windows without developer mode
      return;
    }
    assert.deepEqual(existingPartIds([GOOD], join(dir, 'parts')), []);
  });
});

test('injectChartParts leaves a look-alike marker in prose alone', () => {
  withDir((dir) => {
    const docx = join(dir, 'prose.docx');
    const zip = new AdmZip();
    zip.addFile('[Content_Types].xml', Buffer.from('<Types xmlns="x"></Types>'));
    zip.addFile('word/_rels/document.xml.rels', Buffer.from('<Relationships xmlns="x"></Relationships>'));
    zip.addFile(
      'word/document.xml',
      Buffer.from('<w:document><w:body><w:p><w:r><w:t>CHART_PLACEHOLDER:../../x CHART_PLACEHOLDER:abc</w:t></w:r></w:p></w:body></w:document>'),
    );
    zip.writeZip(docx);
    mkdirSync(join(dir, 'charts'), { recursive: true });
    injectChartParts(docx, join(dir, 'charts'));
    const out = new AdmZip(docx).readFile('word/document.xml').toString('utf8');
    assert.match(out, /CHART_PLACEHOLDER:\.\.\/\.\.\/x CHART_PLACEHOLDER:abc/);
  });
});
