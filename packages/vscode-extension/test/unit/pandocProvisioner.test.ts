import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPlatformKey, sha256File, PANDOC_MANIFEST } from '../../src/pandocProvisioner';

test('getPlatformKey resolves every platform/arch pair present in the manifest', () => {
  for (const key of Object.keys(PANDOC_MANIFEST)) {
    const dash = key.indexOf('-');
    const platform = key.slice(0, dash);
    const arch = key.slice(dash + 1);
    assert.equal(getPlatformKey(platform, arch), key);
  }
});

test('getPlatformKey returns null for an unsupported platform/arch pair', () => {
  assert.equal(getPlatformKey('freebsd', 'x64'), null);
});

test('win32-arm64 reuses the win32-x64 asset (no native 3.1.3 build)', () => {
  assert.deepEqual(PANDOC_MANIFEST['win32-arm64'], PANDOC_MANIFEST['win32-x64']);
});

test('sha256File matches a known digest', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-sha256-test-'));
  try {
    const filePath = join(dir, 'hello.txt');
    writeFileSync(filePath, 'hello world\n');
    const digest = await sha256File(filePath);
    // sha256("hello world\n")
    assert.equal(digest, 'a948904f2f0f479b8f8197694b30184b0d2ed1c1cd2a1ec0fb85d299a192a447');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sha256File differs for different content', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-sha256-test-'));
  try {
    const filePath = join(dir, 'other.txt');
    writeFileSync(filePath, 'not hello world\n');
    const digest = await sha256File(filePath);
    assert.notEqual(digest, 'a948904f2f0f479b8f8197694b30184b0d2ed1c1cd2a1ec0fb85d299a192a447');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
