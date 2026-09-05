import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDotnetPlatformKey, sha512File, DOTNET_RUNTIME_MANIFEST } from '../../src/dotnetProvisioner';

test('getDotnetPlatformKey resolves every platform/arch pair present in the manifest', () => {
  for (const key of Object.keys(DOTNET_RUNTIME_MANIFEST)) {
    const dash = key.indexOf('-');
    const platform = key.slice(0, dash);
    const arch = key.slice(dash + 1);
    assert.equal(getDotnetPlatformKey(platform, arch), key);
  }
});

test('getDotnetPlatformKey returns null for an unsupported platform/arch pair', () => {
  assert.equal(getDotnetPlatformKey('freebsd', 'x64'), null);
});

test('win32-arm64 has its own native asset (unlike Pandoc, which has none and reuses win32-x64)', () => {
  const arm64 = DOTNET_RUNTIME_MANIFEST['win32-arm64'];
  assert.ok(arm64);
  assert.notDeepEqual(arm64, DOTNET_RUNTIME_MANIFEST['win32-x64']);
  assert.ok(arm64.url.includes('win-arm64'));
});

test('every manifest entry has a 128-hex-character SHA-512 (not accidentally a SHA-256)', () => {
  for (const [key, spec] of Object.entries(DOTNET_RUNTIME_MANIFEST)) {
    assert.match(spec.sha512, /^[0-9a-f]{128}$/, `${key}: expected a 128-hex-char SHA-512`);
  }
});

test('sha512File matches a known digest', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-sha512-test-'));
  try {
    const filePath = join(dir, 'hello.txt');
    writeFileSync(filePath, 'hello world\n');
    const digest = await sha512File(filePath);
    // sha512("hello world\n"), cross-checked with `sha512sum`
    assert.equal(
      digest,
      'db3974a97f2407b7cae1ae637c0030687a11913274d578492558e39c16c017de84eacdc8c62fe34ee4e12b4b1428817f09b6a2760c3f8a664ceae94d2434a593',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sha512File differs for different content', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-sha512-test-'));
  try {
    const fileA = join(dir, 'a.txt');
    const fileB = join(dir, 'b.txt');
    writeFileSync(fileA, 'hello world\n');
    writeFileSync(fileB, 'not hello world\n');
    const digestA = await sha512File(fileA);
    const digestB = await sha512File(fileB);
    assert.notEqual(digestA, digestB);
    assert.match(digestA, /^[0-9a-f]{128}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
