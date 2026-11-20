#!/usr/bin/env node
// Installs this repository's git hooks (scripts/git-hooks/) into the local clone: `npm run hooks:install`.
//
// The hooks are copied into .git/hooks/, deliberately not wired with `core.hooksPath` pointing at the
// versioned folder. With core.hooksPath, checking out a branch whose hook was changed (an external PR under
// review) would run that branch's version on the next commit, the same risk AGENTS.md describes for
// .devcontainer/ and .vscode/. A copy stays what was installed until someone runs this script again, after
// reading the diff.
//
// An existing hook that differs from ours is left alone unless --force is given.
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('./git-hooks/', import.meta.url));
const force = process.argv.includes('--force');
const hooksDir = resolve(execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { encoding: 'utf8' }).trim());

let failed = false;
for (const name of readdirSync(source)) {
  const from = join(source, name);
  const to = join(hooksDir, name);
  if (existsSync(to) && !readFileSync(to).equals(readFileSync(from)) && !force) {
    console.error(`hooks: ${to} already exists and differs from scripts/git-hooks/${name}; left as is (use --force to replace it).`);
    failed = true;
    continue;
  }
  copyFileSync(from, to);
  chmodSync(to, 0o755);
  console.log(`hooks: installed ${name}`);
}

try {
  execFileSync('gitleaks', ['version'], { stdio: 'ignore' });
} catch {
  // Not an error: the hook itself says so on each commit, and CI scans at push.
  console.warn('hooks: gitleaks is not on PATH, so the pre-commit hook cannot scan yet: https://github.com/gitleaks/gitleaks#installing');
}
process.exitCode = failed ? 1 : 0;
