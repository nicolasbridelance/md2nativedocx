import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { npmPackagesInBundle, ThirdPartyLicenseError } from './third-party-licenses.mjs';

/** A fake node_modules with the given packages, and a metafile naming one file of each. */
function fixture(packages) {
  const root = mkdtempSync(join(tmpdir(), 'md2nativedocx-licenses-'));
  const inputs = {};
  for (const { name, pkg, licenseFile } of packages) {
    const dir = join(root, 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...pkg }));
    if (licenseFile) writeFileSync(join(dir, 'LICENSE'), licenseFile);
    inputs[`node_modules/${name}/index.js`] = {};
  }
  inputs['packages/core/dist/index.js'] = {};
  return { root, metafile: { inputs } };
}

test('lists each bundled package once, scoped ones included, with its own license file', (t) => {
  const { root, metafile } = fixture([
    { name: 'dagre', pkg: { license: 'MIT' }, licenseFile: 'Copyright (c) Chris Pettitt' },
    { name: '@scope/lib', pkg: { license: 'ISC' }, licenseFile: 'ISC text' },
  ]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  metafile.inputs['node_modules/dagre/lib/other.js'] = {};
  const found = npmPackagesInBundle(metafile, root);
  assert.deepEqual(found.map((p) => [p.name, p.license]), [['@scope/lib', 'ISC'], ['dagre', 'MIT']]);
  assert.equal(found[1].text, 'Copyright (c) Chris Pettitt');
});

test('an MIT package without a license file gets the MIT text with its declared author', (t) => {
  const { root, metafile } = fixture([{ name: 'bare', pkg: { license: 'MIT', author: 'Jane Doe (https://example.org)' } }]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const [entry] = npmPackagesInBundle(metafile, root);
  assert.match(entry.text, /Copyright \(c\) Jane Doe\n/);
  assert.match(entry.text, /Permission is hereby granted/);
});

test('a copyleft or undeclared license fails the build instead of shipping', (t) => {
  for (const pkg of [{ license: 'GPL-3.0-only' }, {}]) {
    const { root, metafile } = fixture([{ name: 'copyleft', pkg, licenseFile: 'text' }]);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.throws(() => npmPackagesInBundle(metafile, root), ThirdPartyLicenseError);
  }
});

test('a non-MIT package with no license file to copy fails the build', (t) => {
  const { root, metafile } = fixture([{ name: 'bsd', pkg: { license: 'BSD-3-Clause' } }]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => npmPackagesInBundle(metafile, root), /ships no license file/);
});
