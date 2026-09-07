import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Robustness tests for pandocProvisioner.ts (missing_pandoc_bugfix.md §2/§9).
//
// §2 — a transient lock on the temp dir during cleanup (an EDR/antivirus
//       scanning the freshly-extracted binary) must never make a *successful*
//       provisioning throw: the `finally { rmSync }` is best-effort.
// §9 — a cached binary that was quarantined/truncated *after* being written
//       must be detected (re-hash against the sentinel) and re-provisioned,
//       not trusted blindly.
//
// These need to mock `node:fs`'s `rmSync` (to simulate the transient lock) and
// the global `fetch` (to serve a fake archive locally), so they live in their
// own file — the mock is module-scoped and would leak into the plain
// `pandocProvisioner.test.ts` if they shared a file.
// ---------------------------------------------------------------------------

// The real fs must be captured *before* the mock, otherwise we can't delegate
// to it. A plain `import` would be hoisted above this capture, so an explicit
// require is the only way to get the un-mocked module.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const realFs = require('node:fs');

// Mock `node:fs` so `rmSync` throws only for the provisioning temp dir
// (simulating a transient EDR lock), delegating everything else to the real
// implementation. Must be registered before the module under test is loaded.
mock.module('node:fs', {
  namedExports: {
    rmSync: (p: string, opts?: unknown) => {
      if (String(p).includes('md2nativedocx-pandoc-')) {
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
const { provisionForPlatform, isCachedBinaryIntact, PANDOC_MANIFEST } = require('../../src/pandocProvisioner');

/** Build a fake Pandoc release archive (a `.tar.gz` containing the binary at
 * the manifest's `binaryPathInArchive`) inside `destDir` and return its
 * SHA-256, so the test can pass it as the `override.sha256` and have the
 * checksum verification pass. Returns `{ archivePath, sha256 }`. */
function buildFakeArchive(platformKey: string, destDir: string): { archivePath: string; sha256: string } {
  const spec = PANDOC_MANIFEST[platformKey];
  const work = mkdtempSync(join(tmpdir(), 'md2nativedocx-fake-archive-'));
  try {
    const binPath = join(work, spec.binaryPathInArchive);
    mkdirSync(join(binPath, '..'), { recursive: true });
    writeFileSync(binPath, '#!/bin/sh\necho fake pandoc\n');
    const archivePath = join(destDir, 'fake-pandoc.tar.gz');
    execFileSync('tar', ['-czf', archivePath, '-C', work, spec.binaryPathInArchive.split('/')[0]]);
    const hash = createHash('sha256');
    hash.update(readFileSync(archivePath));
    return { archivePath, sha256: hash.digest('hex') };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

test('§2: a transient rmSync failure during cleanup does not lose a successful provisioning', async () => {
  const platformKey = 'linux-x64';
  const cacheRoot = mkdtempSync(join(tmpdir(), 'md2nativedocx-cache-'));
  try {
    const { archivePath, sha256 } = buildFakeArchive(platformKey, cacheRoot);
    // Serve the fake archive over a local file:// URL via a mocked fetch.
    const archiveBytes = readFileSync(archivePath);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      assert.ok(url.endsWith('fake-pandoc.tar.gz'), `unexpected URL: ${url}`);
      return new Response(new Uint8Array(archiveBytes), { status: 200 });
    };
    try {
      const binPath = await provisionForPlatform(cacheRoot, platformKey, undefined, {
        downloadUrl: 'https://mirror.example/fake-pandoc.tar.gz',
        sha256,
      });
      // The provisioning succeeded and returned the binary path despite the
      // temp-dir cleanup throwing (simulated EDR lock).
      assert.ok(existsSync(binPath), 'binary must exist on disk');
      const sentinelPath = join(cacheRoot, 'pandoc', '3.1.3', platformKey, '.verified');
      assert.ok(existsSync(sentinelPath), 'sentinel must exist on disk');
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test('§9: a cached binary truncated after write is detected as not intact', async () => {
  const platformKey = 'linux-x64';
  const cacheRoot = mkdtempSync(join(tmpdir(), 'md2nativedocx-cache-'));
  try {
    const dir = join(cacheRoot, 'pandoc', '3.1.3', platformKey);
    mkdirSync(dir, { recursive: true });
    const binPath = join(dir, 'pandoc');
    const sentinelPath = join(dir, '.verified');
    writeFileSync(binPath, '#!/bin/sh\necho fake pandoc\n');
    const hash = createHash('sha256');
    hash.update(readFileSync(binPath));
    writeFileSync(sentinelPath, hash.digest('hex'));

    // Intact: matches the sentinel.
    assert.equal(await isCachedBinaryIntact(binPath, sentinelPath), true);

    // Truncate the binary (simulating an EDR quarantine/truncation after the
    // sentinel was written) — now it must be detected as not intact.
    writeFileSync(binPath, '');
    assert.equal(await isCachedBinaryIntact(binPath, sentinelPath), false);
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test('§9: a cached binary whose sentinel is missing is not intact', async () => {
  const platformKey = 'linux-x64';
  const cacheRoot = mkdtempSync(join(tmpdir(), 'md2nativedocx-cache-'));
  try {
    const dir = join(cacheRoot, 'pandoc', '3.1.3', platformKey);
    mkdirSync(dir, { recursive: true });
    const binPath = join(dir, 'pandoc');
    writeFileSync(binPath, '#!/bin/sh\necho fake pandoc\n');
    // No sentinel written — must be treated as not intact.
    assert.equal(await isCachedBinaryIntact(binPath, join(dir, '.verified')), false);
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});
