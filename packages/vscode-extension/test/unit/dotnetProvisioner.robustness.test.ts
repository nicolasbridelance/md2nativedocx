import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Robustness tests for dotnetProvisioner.ts (missing_pandoc_bugfix.md §2/§9).
//
// §2 — a transient lock on the temp dir during cleanup (an EDR/antivirus
//       scanning the freshly-extracted files) must never make a *successful*
//       provisioning throw: the `finally { rmSync }` is best-effort.
// §9 — a cached host executable that was quarantined/truncated *after* being
//       written must be detected (re-hash against the sentinel) and
//       re-provisioned, not trusted blindly.
//
// Same mock strategy as `pandocProvisioner.robustness.test.ts` — module-scoped
// `node:fs` mock, so it lives in its own file.
// ---------------------------------------------------------------------------

// The real fs must be captured *before* the mock masks `node:fs`, so we can
// delegate every other function to it. A plain `import` would be hoisted above
// this capture, so an explicit require is the only way to get the un-mocked
// module.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const realFs = require('node:fs');

// Mock `node:fs` so `rmSync` throws only for the provisioning temp dir
// (simulating a transient EDR lock), delegating everything else to the real
// implementation. Must be registered before the module under test is loaded.
mock.module('node:fs', {
  namedExports: {
    rmSync: (p: string, opts?: unknown) => {
      if (String(p).includes('md2nativedocx-dotnet-')) {
        throw new Error('EBUSY: resource busy or locked (simulated EDR scan)');
      }
      return realFs.rmSync(p, opts);
    },
    existsSync: realFs.existsSync,
    mkdirSync: realFs.mkdirSync,
    mkdtempSync: realFs.mkdtempSync,
    writeFileSync: realFs.writeFileSync,
    readFileSync: realFs.readFileSync,
    statSync: realFs.statSync,
    copyFileSync: realFs.copyFileSync,
    chmodSync: realFs.chmodSync,
    createWriteStream: realFs.createWriteStream,
    createReadStream: realFs.createReadStream,
  },
});

// Load the module under test *after* the fs mock is registered. A plain
// `import` can't be hoisted after the mock call, so this is an explicit
// runtime require — the only `require` this file legitimately needs.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { provisionForPlatform, isCachedRuntimeIntact } = require('../../src/dotnetProvisioner');

/** Build a fake .NET runtime archive (a `.tar.gz` containing a `dotnet` host
 * executable at the archive root, matching how the real runtime is laid out)
 * inside `destDir` and return its SHA-512, so the test can pass it as the
 * `override.sha512` and have the checksum verification pass. */
function buildFakeArchive(platformKey: string, destDir: string): { archivePath: string; sha512: string } {
  const work = mkdtempSync(join(tmpdir(), 'md2nativedocx-fake-dotnet-'));
  try {
    const hostName = platformKey.startsWith('win32') ? 'dotnet.exe' : 'dotnet';
    writeFileSync(join(work, hostName), '#!/bin/sh\necho fake dotnet\n');
    const archivePath = join(destDir, 'fake-dotnet.tar.gz');
    execFileSync('tar', ['-czf', archivePath, '-C', work, hostName]);
    const hash = createHash('sha512');
    hash.update(readFileSync(archivePath));
    return { archivePath, sha512: hash.digest('hex') };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

test('§2: a transient rmSync failure during cleanup does not lose a successful provisioning', async () => {
  const platformKey = 'linux-x64';
  const cacheRoot = mkdtempSync(join(tmpdir(), 'md2nativedocx-cache-'));
  try {
    const { archivePath, sha512 } = buildFakeArchive(platformKey, cacheRoot);
    const archiveBytes = readFileSync(archivePath);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      assert.ok(url.endsWith('fake-dotnet.tar.gz'), `unexpected URL: ${url}`);
      return new Response(new Uint8Array(archiveBytes), { status: 200 });
    };
    try {
      const hostPath = await provisionForPlatform(cacheRoot, platformKey, undefined, {
        downloadUrl: 'https://mirror.example/fake-dotnet.tar.gz',
        sha512,
      });
      // The provisioning succeeded and returned the host path despite the
      // temp-dir cleanup throwing (simulated EDR lock).
      assert.ok(existsSync(hostPath), 'host executable must exist on disk');
      const sentinelPath = join(cacheRoot, 'dotnet-runtime', '10.0.4', platformKey, '.verified');
      assert.ok(existsSync(sentinelPath), 'sentinel must exist on disk');
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test('§9: a cached host executable truncated after write is detected as not intact', async () => {
  const platformKey = 'linux-x64';
  const cacheRoot = mkdtempSync(join(tmpdir(), 'md2nativedocx-cache-'));
  try {
    const dir = join(cacheRoot, 'dotnet-runtime', '10.0.4', platformKey);
    mkdirSync(dir, { recursive: true });
    const hostPath = join(dir, 'dotnet');
    const sentinelPath = join(dir, '.verified');
    writeFileSync(hostPath, '#!/bin/sh\necho fake dotnet\n');
    const hash = createHash('sha512');
    hash.update(readFileSync(hostPath));
    writeFileSync(sentinelPath, hash.digest('hex'));

    // Intact: matches the sentinel.
    assert.equal(await isCachedRuntimeIntact(hostPath, sentinelPath), true);

    // Truncate the host executable (simulating an EDR quarantine/truncation
    // after the sentinel was written) — now it must be detected as not intact.
    writeFileSync(hostPath, '');
    assert.equal(await isCachedRuntimeIntact(hostPath, sentinelPath), false);
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test('§9: a cached host executable whose sentinel is missing is not intact', async () => {
  const platformKey = 'linux-x64';
  const cacheRoot = mkdtempSync(join(tmpdir(), 'md2nativedocx-cache-'));
  try {
    const dir = join(cacheRoot, 'dotnet-runtime', '10.0.4', platformKey);
    mkdirSync(dir, { recursive: true });
    const hostPath = join(dir, 'dotnet');
    writeFileSync(hostPath, '#!/bin/sh\necho fake dotnet\n');
    // No sentinel written — must be treated as not intact.
    assert.equal(await isCachedRuntimeIntact(hostPath, join(dir, '.verified')), false);
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});
