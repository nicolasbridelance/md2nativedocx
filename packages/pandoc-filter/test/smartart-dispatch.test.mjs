import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const coreBin = join(here, '..', 'bin', 'md2nativedocx-core.mjs');

/** Run the core bridge directly (bypassing Pandoc/Lua) on `mermaidText`. */
function runCore(mermaidText, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-core-'));
  const mmd = join(dir, 'diagram.mmd');
  writeFileSync(mmd, mermaidText);
  try {
    const xml = execFileSync('node', [coreBin, mmd], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    return xml;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('without MD2NATIVEDOCX_SMARTART_DIR, a chain-eligible diagram still uses wpc:wpc shapes', () => {
  const xml = runCore('graph TD\n  A --> B\n  B --> C\n');
  assert.ok(xml.includes('<wpc:wpc'));
  assert.ok(!xml.includes('dgm:relIds'));
});

test('with MD2NATIVEDOCX_SMARTART_DIR set, a chain-eligible diagram dispatches to SmartArt', () => {
  const smartArtDir = mkdtempSync(join(tmpdir(), 'md2nativedocx-smartart-'));
  try {
    const xml = runCore('graph TD\n  A --> B\n  B --> C\n', { MD2NATIVEDOCX_SMARTART_DIR: smartArtDir });
    assert.ok(xml.includes('<dgm:relIds'), 'expected a SmartArt dgm:relIds reference');
    assert.ok(!xml.includes('<wpc:wpc'), 'must not also emit wpc:wpc shapes');
    assert.ok(xml.includes('SMARTART_PLACEHOLDER:'), 'relIds must be placeholders, not real rIds -- this script cannot mint those');

    // Exactly one diagram id directory was written, with all 4 parts.
    const ids = readdirSync(smartArtDir);
    assert.equal(ids.length, 1, 'expected exactly one diagram directory');
    const parts = readdirSync(join(smartArtDir, ids[0])).sort();
    assert.deepEqual(parts, ['colors.xml', 'data.xml', 'layout.xml', 'quickStyle.xml']);
    const dataXml = readFileSync(join(smartArtDir, ids[0], 'data.xml'), 'utf8');
    assert.ok(dataXml.includes('<a:t>A</a:t>'), 'data.xml must contain the actual node text');

    // The placeholder ids embedded in the XML must reference that same directory.
    for (const kind of ['dm', 'lo', 'qs', 'cs']) {
      assert.ok(xml.includes(`SMARTART_PLACEHOLDER:${ids[0]}:${kind}`), `missing placeholder for ${kind}`);
    }
  } finally {
    rmSync(smartArtDir, { recursive: true, force: true });
  }
});

test('with MD2NATIVEDOCX_SMARTART_DIR set, a merge-after-branch diagram still falls back to wpc:wpc', () => {
  const smartArtDir = mkdtempSync(join(tmpdir(), 'md2nativedocx-smartart-'));
  try {
    const xml = runCore(
      'graph TD\n  A --> B\n  A --> C\n  B --> D\n  C --> D\n',
      { MD2NATIVEDOCX_SMARTART_DIR: smartArtDir },
    );
    assert.ok(xml.includes('<wpc:wpc'));
    assert.ok(!xml.includes('dgm:relIds'));
    assert.deepEqual(readdirSync(smartArtDir), [], 'nothing should be written for a diagram that falls back');
    // spec §10.3: a diagram that was actually attempted for SmartArt and
    // rejected gets a small note explaining why, right after the shapes.
    assert.ok(xml.includes('merge detected between'), 'expected the spec §10.3 fallback note');
    assert.ok(xml.includes('<w:i/>'), 'note must be italic (spec §10.3 discreet style)');
  } finally {
    rmSync(smartArtDir, { recursive: true, force: true });
  }
});

test('without MD2NATIVEDOCX_SMARTART_DIR, a merge-after-branch diagram gets no fallback note (never attempted)', () => {
  const xml = runCore('graph TD\n  A --> B\n  A --> C\n  B --> D\n  C --> D\n');
  assert.ok(xml.includes('<wpc:wpc'));
  assert.ok(!xml.includes('merge detected between'));
});

test('parser warnings are written to stderr, prefixed for the CLI to surface (spec §10)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-core-'));
  const mmd = join(dir, 'diagram.mmd');
  writeFileSync(mmd, 'graph TD\n  A --> B\n  style X fill:#fff\n');
  try {
    const result = spawnSync('node', [coreBin, mmd], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /^md2nativedocx: warning: /m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('with MD2NATIVEDOCX_SMARTART_DIR set, a tree-shaped diagram dispatches to SmartArt too', () => {
  const smartArtDir = mkdtempSync(join(tmpdir(), 'md2nativedocx-smartart-'));
  try {
    const xml = runCore('graph TD\n  A --> B\n  A --> C\n', { MD2NATIVEDOCX_SMARTART_DIR: smartArtDir });
    assert.ok(xml.includes('<dgm:relIds'));
    const ids = readdirSync(smartArtDir);
    const layoutXml = readFileSync(join(smartArtDir, ids[0], 'layout.xml'), 'utf8');
    assert.ok(layoutXml.includes('urn:md2nativedocx/smartart-layout/tree1'));
  } finally {
    rmSync(smartArtDir, { recursive: true, force: true });
  }
});
