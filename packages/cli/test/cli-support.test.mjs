import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve, sep } from 'node:path';
import { CliError, resolveSafePath } from '../src/cliSupport.mjs';

const cwd = resolve('work-root');

test('resolveSafePath: a relative path inside the working directory resolves, on every platform', () => {
  assert.equal(resolveSafePath('doc.md', cwd), join(cwd, 'doc.md'));
  assert.equal(resolveSafePath(`sub${sep}doc.md`, cwd), join(cwd, 'sub', 'doc.md'));
  assert.equal(resolveSafePath('..doc.md', cwd), join(cwd, '..doc.md'), 'a name starting with two dots is not a parent');
});

test('resolveSafePath: a relative path escaping through .. is a usage error', () => {
  for (const escape of ['..', `..${sep}x.md`, `sub${sep}..${sep}..${sep}x.md`]) {
    assert.throws(() => resolveSafePath(escape, cwd), (err) => err instanceof CliError && err.exitCode === 2, escape);
  }
});
