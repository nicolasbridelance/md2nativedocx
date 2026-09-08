import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Regression test for the 2026-09-08 incident: a colleague had a `pandoc
// 3.9.0.2` on PATH (WinGet, for unrelated reasons) that crashes with a
// Windows access violation in its embedded Lua runtime on every export —
// while this project's pinned PANDOC_VERSION never exercises that code path
// at all (see md2nativedocx.lua's make_temp_path()). ensurePandoc() used to
// check PATH *first*, using an arbitrary, unverified system pandoc over the
// pinned/tested build whenever one happened to exist — flipped so the pinned
// build always wins when it can be provisioned at all, PATH only as a last
// resort (missing_pandoc_bugfix.md §8, previously left undecided).
//
// Mocks `node:child_process`'s `execFile` — `pandoc --version` always
// succeeds (a PATH pandoc exists); every other command (tar/curl, the
// provisioning path's own subprocess calls) fails, so a from-scratch
// provisioning attempt fails deterministically without touching the
// network. Own file for the same reason every other module-mock test here
// has one.
// ---------------------------------------------------------------------------

mock.module('node:child_process', {
  namedExports: {
    execFile: (command: string, ...rest: unknown[]) => {
      const callback = rest[rest.length - 1] as (err: Error | null) => void;
      if (command === 'pandoc') {
        callback(null); // "pandoc --version" succeeds: a PATH pandoc exists.
        return;
      }
      callback(new Error('ENOENT: simulated — no tar/curl in this test'));
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ensurePandoc, getPlatformKey, sha256File, PANDOC_VERSION } = require('../../src/pandocProvisioner');

test('a valid cached/pinned build wins over a PATH pandoc, not the other way around', async () => {
  const platformKey = getPlatformKey();
  assert.ok(platformKey, 'this test needs a supported platform to build a fake cache for');

  const cacheRoot = mkdtempSync(join(tmpdir(), 'md2nativedocx-path-priority-test-'));
  try {
    const dir = join(cacheRoot, 'pandoc', PANDOC_VERSION, platformKey);
    mkdirSync(dir, { recursive: true });
    const binPath = join(dir, platformKey.startsWith('win32') ? 'pandoc.exe' : 'pandoc');
    writeFileSync(binPath, '#!/bin/sh\necho fake-pandoc\n');
    writeFileSync(join(dir, '.verified'), await sha256File(binPath));

    const resolved = await ensurePandoc(cacheRoot);
    assert.equal(resolved, binPath, 'must use the pinned/cached build, not fall through to the PATH pandoc');
    assert.notEqual(resolved, 'pandoc');
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test('falls back to a PATH pandoc, without throwing, when the pinned build cannot be provisioned at all', async () => {
  const cacheRoot = mkdtempSync(join(tmpdir(), 'md2nativedocx-path-priority-fallback-test-'));
  try {
    // Mocked fetch fails immediately; mocked execFile fails for anything but
    // "pandoc --version" (so the curl fallback and tar extraction both fail
    // too) — provisioning a from-scratch cache is guaranteed to fail here
    // without ever touching the real network.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error('network disabled for this test'))) as typeof fetch;
    try {
      const resolved = await ensurePandoc(cacheRoot);
      assert.equal(resolved, 'pandoc', 'must fall back to the PATH pandoc once provisioning is exhausted');
    } finally {
      globalThis.fetch = realFetch;
    }
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});
