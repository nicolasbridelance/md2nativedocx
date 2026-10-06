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
  // Settings are grouped into sections (an array), each with its own `properties`.
  const sections = pkg.contributes.configuration as Array<{ properties: Record<string, { enum?: string[] }> }>;
  const style = sections.map((section) => section.properties['md2nativedocx.smartArt.style']).find(Boolean);
  assert.deepEqual(style?.enum, coreProfileNames());
});

test('every command a menu or the palette refers to is declared in contributes.commands', () => {
  // VS Code reports an undeclared one at startup ("Menu item references a command … not defined") —
  // this happened once (md2nativedocx.enableSetting) and no other test noticed.
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf8'));
  const declared = new Set((pkg.contributes.commands as Array<{ command: string }>).map((c) => c.command));
  const menus = pkg.contributes.menus as Record<string, Array<{ command?: string }>>;
  for (const [place, items] of Object.entries(menus)) {
    for (const item of items) if (item.command) assert.ok(declared.has(item.command), `${place}: ${item.command} is not declared`);
  }
});
