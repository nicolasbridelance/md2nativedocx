import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Regression test for the 2026-09-08 corporate-Windows incident: runCli()
// used to classify *any* stderr containing the substring "ENOENT" as
// PandocMissingError. On a from-scratch Windows machine, buildReferenceDoc()
// shelling out to a missing `unzip` produced `spawnSync unzip ENOENT` deep in
// an unrelated step — misclassified as "Pandoc missing" even though Pandoc
// had been fully auto-provisioned (confirmed via the on-disk cache) and had
// never even run yet. Fixed by keying off the CLI's own controlled
// `md2nativedocx: Pandoc failed (exit ENOENT)` marker instead of a bare
// substring search — these two tests lock in both sides of that fix.
//
// Own mock.module file, same reasoning as exportService.robustness.test.ts:
// module-scoped mocks would otherwise leak into sibling test files.
// ---------------------------------------------------------------------------

let mockErr: Error | null = null;
let mockStderr = '';

mock.module('node:child_process', {
  namedExports: {
    execFile: (
      _command: string,
      _args: readonly string[],
      _options: unknown,
      callback: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(mockErr, '', mockStderr);
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exportMermaidFile, PandocMissingError, PandocBlockedByPolicyError, ExportFailedError } = require('../../src/exportService');

function withTempMmd(fn: (mmdPath: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-enoent-classification-test-'));
  const mmdPath = join(dir, 'flow.mmd');
  writeFileSync(mmdPath, 'graph TD\n  A --> B\n');
  return fn(mmdPath).finally(() => rmSync(dir, { recursive: true, force: true }));
}

test('an unrelated ENOENT inside the CLI (e.g. a missing `unzip`) is not misclassified as Pandoc missing', () =>
  withTempMmd(async (mmdPath) => {
    mockErr = new Error('Command failed');
    mockStderr =
      "md2nativedocx: reference document setup failed: spawnSync unzip ENOENT\n" +
      "    at Object.spawnSync (node:internal/child_process:1143:20)\n";
    await assert.rejects(
      () => exportMermaidFile(mmdPath, ''),
      (err: unknown) => {
        assert.ok(!(err instanceof PandocMissingError), 'must not be classified as PandocMissingError');
        assert.ok(err instanceof ExportFailedError, 'should fall through to the generic ExportFailedError path');
        return true;
      },
    );
  }));

test('the CLI\'s own "Pandoc failed (exit ENOENT)" marker is still classified as Pandoc missing', () =>
  withTempMmd(async (mmdPath) => {
    mockErr = new Error('Command failed');
    mockStderr = 'md2nativedocx: Pandoc failed (exit ENOENT)\n';
    await assert.rejects(
      () => exportMermaidFile(mmdPath, ''),
      (err: unknown) => {
        assert.ok(err instanceof PandocMissingError);
        return true;
      },
    );
  }));

// Same bug class, same fix shape, for isBlockedByPolicy(): its text-based
// signals used to scan the *whole* stderr blob for "EACCES"/"EPERM"/"1260",
// which would also fire on an unrelated internal CLI failure (e.g. a
// transient antivirus file lock during an unrelated step, missing_pandoc_
// bugfix.md §2 — explicitly retryable) even though this branch never offers
// a "Retry" action. Fixed by gating those signals on the CLI's own
// `md2nativedocx: Pandoc failed (exit ...)` marker actually being present.

test('an unrelated EACCES inside the CLI is not misclassified as Pandoc blocked by policy', () =>
  withTempMmd(async (mmdPath) => {
    mockErr = new Error('Command failed');
    mockStderr =
      "md2nativedocx: reference document setup failed: EACCES: permission denied, open 'C:\\\\Temp\\\\reference.docx'\n";
    await assert.rejects(
      () => exportMermaidFile(mmdPath, ''),
      (err: unknown) => {
        assert.ok(!(err instanceof PandocBlockedByPolicyError), 'must not be classified as blocked by policy');
        assert.ok(err instanceof ExportFailedError, 'should fall through to the generic ExportFailedError path');
        return true;
      },
    );
  }));

test('the CLI\'s own "Pandoc failed (exit EACCES)" marker is still classified as blocked by policy', () =>
  withTempMmd(async (mmdPath) => {
    mockErr = new Error('Command failed');
    mockStderr = 'md2nativedocx: Pandoc failed (exit EACCES)\n';
    await assert.rejects(
      () => exportMermaidFile(mmdPath, ''),
      (err: unknown) => {
        assert.ok(err instanceof PandocBlockedByPolicyError);
        return true;
      },
    );
  }));
