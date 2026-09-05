#!/usr/bin/env node
/**
 * Round 3 (2026-09-05) -- Round 2's graft (our 5 diagram parts inside a real
 * Word document) ALSO failed to open in real Word, with the same error.
 * That proves the problem is inside our diagram content itself, not in how
 * our CLI pipeline assembles the surrounding document (ADR 0006).
 *
 * This narrows further: which of our parts is actually the problem? data.xml
 * and layout.xml are tightly coupled (data's presentation points reference
 * layout.xml's layoutNode names by `presName`) so they can't be swapped
 * independently of each other; colors.xml/quickStyle.xml are only coupled to
 * data.xml by a shared `presStyleLbl` NAME ("node1"), which happens to match
 * our own convention -- so they CAN be swapped independently.
 *
 * cycle-isolate-a.docx: real cycle-simple.docx, but OUR data1.xml + OUR
 * layout1.xml, keeping the REAL colors1.xml/quickStyle1.xml untouched. No
 * drawing part at all (removed cleanly: file, relationship, content-type
 * override) to avoid an unrelated confound -- the real drawing1.xml's shapes
 * reference GUIDs from the real data1.xml that would no longer exist once
 * data1.xml is replaced.
 *   - Opens fine -> our data/layout are NOT the problem; colors/quickStyle
 *     content (or something about the specific data+layout+colors+
 *     quickStyle+drawing COMBINATION only) is implicated instead.
 *   - Still fails -> our data.xml and/or layout.xml (most likely the custom
 *     dgm:layoutDef, per TODO.md's original suspicion) is the real problem.
 *
 * Usage: node build-round3.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const spikeDir = join(here, '..');
const repoRoot = join(here, '..', '..', '..', '..', '..');
const realSample = join(repoRoot, 'handmade_samples', 'cycle-simple.docx');
const output = join(here, 'cycle-isolate-a.docx');

console.log('1. Extracting our own generated data1.xml/layout1.xml (Milestone 0 spike)...');
const oursDir = mkdtempSync(join(tmpdir(), 'md2nativedocx-r3-ours-'));
execFileSync('unzip', ['-o', '-q', join(spikeDir, 'cycle-base.docx'), 'word/diagrams/data1.xml', 'word/diagrams/layout1.xml', '-d', oursDir], { stdio: 'pipe' });

console.log('2. Extracting the real Word-authored file...');
const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-r3-'));
try {
  execFileSync('unzip', ['-o', '-q', realSample, '-d', dir], { stdio: 'pipe' });

  console.log('3. Swapping in our data1.xml + layout1.xml (colors1.xml/quickStyle1.xml stay real)...');
  copyFileSync(join(oursDir, 'word', 'diagrams', 'data1.xml'), join(dir, 'word', 'diagrams', 'data1.xml'));
  copyFileSync(join(oursDir, 'word', 'diagrams', 'layout1.xml'), join(dir, 'word', 'diagrams', 'layout1.xml'));

  console.log('4. Removing the drawing part cleanly (file + relationship + content-type)...');
  rmSync(join(dir, 'word', 'diagrams', 'drawing1.xml'));

  const relsPath = join(dir, 'word', '_rels', 'document.xml.rels');
  let relsXml = readFileSync(relsPath, 'utf8');
  const relsBefore = relsXml;
  relsXml = relsXml.replace(/<Relationship Id="rId8"[^>]*diagramDrawing[^>]*\/>/, '');
  if (relsXml === relsBefore) throw new Error('expected to find and remove the rId8 diagramDrawing relationship');
  writeFileSync(relsPath, relsXml, 'utf8');

  const ctPath = join(dir, '[Content_Types].xml');
  let ctXml = readFileSync(ctPath, 'utf8');
  const ctBefore = ctXml;
  ctXml = ctXml.replace(/<Override PartName="\/word\/diagrams\/drawing1\.xml"[^>]*\/>/, '');
  if (ctXml === ctBefore) throw new Error('expected to find and remove the drawing1.xml content-type override');
  writeFileSync(ctPath, ctXml, 'utf8');

  copyFileSync(realSample, output);
  execFileSync('zip', ['-q', '-X', output, 'word/diagrams/data1.xml', 'word/diagrams/layout1.xml'], { cwd: dir, stdio: 'pipe' });
  execFileSync('zip', ['-q', '-X', '-d', output, 'word/diagrams/drawing1.xml'], { stdio: 'pipe' });
  execFileSync('zip', ['-q', '-X', output, '[Content_Types].xml', 'word/_rels/document.xml.rels'], { cwd: dir, stdio: 'pipe' });
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(oursDir, { recursive: true, force: true });
}

console.log('5. Sanity checks...');
execFileSync('unzip', ['-t', output], { stdio: 'pipe' });
console.log('   ZIP OK.');
execFileSync('soffice', ['--headless', '--convert-to', 'png', '--outdir', here, output], { stdio: 'pipe' });
console.log('   LibreOffice render OK (see cycle-isolate-a.png).');

console.log(`\n${output}\nis the file for round 3's bisection test.`);
