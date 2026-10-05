import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SMARTART_STYLE_NAMES } from '../../src/exportService';

// The extension does not import the core at runtime, so its copies of the profile list (this constant and the
// settings enum in package.json) must be kept in step with it by hand — this test is what notices drift.
/** Profile names, read from the core's `STYLE_PROFILES` table (no runtime dependency on the core package). */
function coreProfileNames(): string[] {
  const src = readFileSync(join(__dirname, '..', '..', '..', '..', 'core', 'src', 'smartart', 'styles.ts'), 'utf8');
  const table = /export const STYLE_PROFILES = \{([\s\S]*?)\} as const/.exec(src)?.[1] ?? '';
  return [...table.matchAll(/^\s*'?([a-z-]+)'?: \{/gm)].map((m) => m[1] as string);
}

test('the settings enum and constant list the same SmartArt profiles as the core', () => {
  assert.deepEqual([...SMARTART_STYLE_NAMES], coreProfileNames());
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf8'));
  assert.deepEqual(pkg.contributes.configuration.properties['md2nativedocx.smartArt.style'].enum, coreProfileNames());
});
