import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConversionError } from '../src/convert.mjs';
import { wordLockFileNames, writeOutputSafely } from '../src/writeOutputSafely.mjs';

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'wos-'));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const isWriteError = (err) => err instanceof ConversionError && err.stage === 'write';

test('wordLockFileNames: full-name and shortened forms', () => {
  assert.deepEqual(wordLockFileNames('flux_arcs.docx'), ['~$flux_arcs.docx', '~$ux_arcs.docx']);
});

test('writes a new file and leaves no temporary behind', () => {
  withDir((dir) => {
    const target = join(dir, 'a.docx');
    writeOutputSafely(target, Buffer.from('hello'));
    assert.equal(readFileSync(target, 'utf8'), 'hello');
    assert.deepEqual(readdirSync(dir), ['a.docx']);
  });
});

test('replaces an existing file completely', () => {
  withDir((dir) => {
    const target = join(dir, 'a.docx');
    writeFileSync(target, 'old content that is longer');
    writeOutputSafely(target, 'new');
    assert.equal(readFileSync(target, 'utf8'), 'new');
    assert.deepEqual(readdirSync(dir), ['a.docx']);
  });
});

test('refuses when either form of the Word lock file exists, target untouched', () => {
  for (const lockOf of wordLockFileNames('flux_arcs.docx')) {
    withDir((dir) => {
      const target = join(dir, 'flux_arcs.docx');
      writeFileSync(target, 'ORIGINAL');
      writeFileSync(join(dir, lockOf), '');
      assert.throws(() => writeOutputSafely(target, 'NEW'), isWriteError);
      assert.equal(readFileSync(target, 'utf8'), 'ORIGINAL');
      assert.deepEqual(readdirSync(dir).sort(), [lockOf, 'flux_arcs.docx'].sort());
    });
  }
});

test('a failed rename leaves the target intact and removes the temporary', () => {
  withDir((dir) => {
    // The target is a non-empty directory: rename of a file over it fails on every platform.
    const target = join(dir, 'a.docx');
    mkdirSync(target);
    writeFileSync(join(target, 'keep'), 'x');
    assert.throws(() => writeOutputSafely(target, 'NEW'), isWriteError);
    assert.deepEqual(readdirSync(dir), ['a.docx']);
    assert.equal(readFileSync(join(target, 'keep'), 'utf8'), 'x');
  });
});
