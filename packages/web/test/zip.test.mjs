import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { crc32, openZip, storedZip, ZipFormatError } from '../src/zip.mjs';

const REFERENCE_DOCX = fileURLToPath(new URL('../../cli/assets/reference.docx', import.meta.url));

test('crc32 matches the published check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('openZip reads every entry of an archive written by another zip library', async () => {
  const bytes = readFileSync(REFERENCE_DOCX);
  const archive = await openZip(new Uint8Array(bytes));
  const reference = new AdmZip(bytes);
  assert.deepEqual(archive.pkg.names().sort(), reference.getEntries().map((e) => e.entryName).sort());
  assert.equal(archive.pkg.readText('word/document.xml'), reference.readAsText('word/document.xml'));
  assert.throws(() => archive.pkg.readText('word/missing.xml'), /missing word\/missing\.xml/);
});

test('toBytes keeps unchanged entries and writes changed and new ones, readable by another library', async () => {
  const archive = await openZip(new Uint8Array(readFileSync(REFERENCE_DOCX)));
  archive.pkg.write('word/document.xml', '<changed é/>');
  archive.pkg.write('word/new/part.xml', new TextEncoder().encode('<new/>'));
  const written = await archive.toBytes();
  const check = new AdmZip(Buffer.from(written));
  assert.equal(check.readAsText('word/document.xml'), '<changed é/>');
  assert.equal(check.readAsText('word/new/part.xml'), '<new/>');
  assert.equal(check.readAsText('word/styles.xml'), new AdmZip(readFileSync(REFERENCE_DOCX)).readAsText('word/styles.xml'));
  // and by this module again
  const again = await openZip(written);
  assert.equal(again.pkg.readText('word/document.xml'), '<changed é/>');
});

test('storedZip writes an archive other libraries read', () => {
  const bytes = storedZip([['a.xml', '<a/>'], ['dir/b.xml', '<b>ü</b>']]);
  const check = new AdmZip(Buffer.from(bytes));
  assert.equal(check.readAsText('a.xml'), '<a/>');
  assert.equal(check.readAsText('dir/b.xml'), '<b>ü</b>');
});

test('openZip refuses what it does not read rather than half-reading it', async () => {
  await assert.rejects(openZip(new TextEncoder().encode('not a zip at all, just text')), ZipFormatError);
  const bytes = storedZip([['a.xml', '<a/>']]);
  const corrupt = bytes.slice();
  corrupt[30 + 'a.xml'.length] ^= 0xff; // flip the first content byte: the CRC no longer matches
  await assert.rejects(openZip(corrupt), /corrupt entry a\.xml/);
  const truncated = bytes.slice(0, bytes.length - 5);
  await assert.rejects(openZip(truncated), ZipFormatError);
});
