import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Regression test: runCli() must spawn the editor's own bundled Node/Electron
// binary (`process.execPath`), never a bare "node" resolved from the system
// PATH. A locked-down corporate workstation with no dev tools installed has
// no reason to have `node` on PATH — that spawn then fails with an
// undiagnosable "spawn node ENOENT" (no child stderr, since the process never
// started) despite Pandoc/.NET being fully and correctly provisioned.
//
// Mocks `node:child_process`'s `execFile` to capture what command was
// actually invoked, so lives in its own file — the mock is module-scoped and
// would leak into the plain `exportService.test.ts` (whose other tests run
// the real CLI) if they shared a file.
// ---------------------------------------------------------------------------

let capturedCommand: string | undefined;
let capturedEnv: NodeJS.ProcessEnv | undefined;

mock.module('node:child_process', {
  namedExports: {
    execFile: (
      command: string,
      _args: readonly string[],
      options: { env?: NodeJS.ProcessEnv },
      callback: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      capturedCommand = command;
      capturedEnv = options.env;
      callback(null, '', '');
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exportMermaidFile } = require('../../src/exportService');

test('runCli spawns process.execPath (the editor\'s own Node), not a bare "node" from PATH', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-execpath-test-'));
  try {
    const mmdPath = join(dir, 'flow.mmd');
    writeFileSync(mmdPath, 'graph TD\n  A --> B\n');
    await exportMermaidFile(mmdPath, '');
    assert.equal(capturedCommand, process.execPath);
    assert.notEqual(capturedCommand, 'node');
    assert.equal(capturedEnv?.ELECTRON_RUN_AS_NODE, '1');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
