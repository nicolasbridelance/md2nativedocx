import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

/**
 * SmartArt's pre-rendered `dsp:drawing` (fifth diagram part), end to end through the real CLI. Opt-in:
 * `MD2NATIVEDOCX_ENABLE_SMARTART=1` plus `MD2NATIVEDOCX_SMARTART_DRAWING=1`. Schema validity is
 * `npm run test:oxml-validate`'s job; this pins the wiring.
 */

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'bin', 'md2nativedocx.mjs');

function exportCycle(env) {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-smartart-test-'));
  const md = join(dir, 'c.md');
  const out = join(dir, 'c.docx');
  writeFileSync(md, '```mermaid\nflowchart TD\n  A[A] --> B[B]\n  B --> C[C]\n  C --> A\n```\n');
  const r = spawnSync('node', [cli, md, '-o', out], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { dir, out, code: r.status };
}

test('with SmartArt + drawing on: a fifth part, its internal relationship, content type and a real relId in the data model', () => {
  const { dir, out, code } = exportCycle({ MD2NATIVEDOCX_ENABLE_SMARTART: '1', MD2NATIVEDOCX_SMARTART_DRAWING: '1' });
  try {
    assert.equal(code, 0);
    const zip = new AdmZip(out);
    assert.ok(zip.getEntry('word/diagrams/drawing1.xml'));
    const rels = zip.readAsText('word/_rels/document.xml.rels');
    const drawingRel = /<Relationship Id="([^"]+)" Type="http:\/\/schemas.microsoft.com\/office\/2007\/relationships\/diagramDrawing" Target="diagrams\/drawing1.xml"/.exec(rels);
    assert.ok(drawingRel, 'diagramDrawing relationship');
    assert.doesNotMatch(rels.match(/<Relationship [^>]*diagrams\/drawing1.xml[^>]*>/)?.[0] ?? '', /TargetMode/); // rule #3
    assert.match(zip.readAsText('[Content_Types].xml'), /PartName="\/word\/diagrams\/drawing1.xml" ContentType="application\/vnd.ms-office.drawingml.diagramDrawing\+xml"/);
    const data = zip.readAsText('word/diagrams/data1.xml');
    assert.ok(data.includes(`relId="${drawingRel[1]}"`));
    assert.doesNotMatch(data + zip.readAsText('word/document.xml'), /SMARTART_PLACEHOLDER|SMARTART_DRAWING_REL/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('with SmartArt on but the drawing off (the default): the four classic parts only, no dataModelExt', () => {
  const { dir, out, code } = exportCycle({ MD2NATIVEDOCX_ENABLE_SMARTART: '1' });
  try {
    assert.equal(code, 0);
    const zip = new AdmZip(out);
    assert.ok(zip.getEntry('word/diagrams/data1.xml'));
    assert.ok(!zip.getEntry('word/diagrams/drawing1.xml'));
    assert.doesNotMatch(zip.readAsText('word/diagrams/data1.xml'), /dataModelExt/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
