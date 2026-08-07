#!/usr/bin/env node
/**
 * Runs the real Extension Development Host tests (`test/suite/`) via
 * `@vscode/test-cli`, which downloads a real VS Code build and launches it —
 * needing a display. Wrapped in `xvfb-run` when available (mirrors
 * `scripts/test-visual.mjs`'s "skip cleanly, exit 0, print why" pattern for
 * an optional environment dependency — LibreOffice there, Xvfb here — rather
 * than failing the whole test run for something CI/dev machines may not have
 * provisioned).
 *
 * Xvfb is not currently pinned/provisioned by `.devcontainer/setup.sh` —
 * installed ad hoc in this session the same way LibreOffice was (see
 * TODO.md), not a devcontainer change (that requires human review per
 * AGENTS.md → Codespaces).
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const vscodeTestBin = join(pkgRoot, '..', '..', 'node_modules', '.bin', 'vscode-test');

function hasXvfbRun() {
  try {
    execFileSync('xvfb-run', ['--help'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: pkgRoot, stdio: 'inherit' });
}

if (process.env.DISPLAY) {
  // A real or already-forwarded display is available — no Xvfb needed.
  run(vscodeTestBin, []);
} else if (hasXvfbRun()) {
  run('xvfb-run', ['-a', vscodeTestBin]);
} else {
  console.log(
    'md2nativedocx: skipping extension-host tests — no DISPLAY and xvfb-run not on PATH ' +
      '(install xvfb, or run with a real display). Unit tests (`npm test`) already cover the ' +
      'VS Code-API-free logic; this suite additionally verifies real activation/CodeLens wiring.',
  );
  process.exit(0);
}
