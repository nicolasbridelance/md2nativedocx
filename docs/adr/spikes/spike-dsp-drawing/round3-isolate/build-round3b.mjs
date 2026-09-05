#!/usr/bin/env node
/**
 * Round 3, test B (2026-09-05) -- companion to build-round3.mjs (test A).
 * Where test A swaps in our data.xml+layout.xml (keeping real colors/
 * quickStyle), test B swaps in our colors1.xml+quickStyle1.xml only,
 * keeping the real data1.xml/layout1.xml/drawing1.xml untouched.
 *
 * Known confound, disclosed rather than hidden: the real data1.xml's
 * connector presentation points reference `presStyleLbl="sibTrans2D1"`,
 * a styleLbl our own colors/quickStyle don't define at all (we don't draw
 * cycle connectors -- documented limitation). If this test fails, it is
 * NOT decisive proof that our colors/quickStyle content is structurally
 * invalid -- it could just be Word refusing an unresolvable style
 * reference, a different (and much easier to fix -- just add a matching
 * styleLbl) problem than a fundamentally broken colors/quickStyle schema.
 * If it OPENS fine despite that gap, colors/quickStyle content is cleared
 * as a suspect with no caveat.
 *
 * Usage: node build-round3b.mjs
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
const output = join(here, 'cycle-isolate-b.docx');

console.log('1. Extracting our own generated colors1.xml/quickStyle1.xml (Milestone 0 spike)...');
const oursDir = mkdtempSync(join(tmpdir(), 'md2nativedocx-r3b-ours-'));
execFileSync('unzip', ['-o', '-q', join(spikeDir, 'cycle-base.docx'), 'word/diagrams/colors1.xml', 'word/diagrams/quickStyle1.xml', '-d', oursDir], { stdio: 'pipe' });

console.log('2. Extracting the real Word-authored file...');
const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-r3b-'));
try {
  execFileSync('unzip', ['-o', '-q', realSample, '-d', dir], { stdio: 'pipe' });

  console.log('3. Swapping in our colors1.xml + quickStyle1.xml (data/layout/drawing stay real)...');
  copyFileSync(join(oursDir, 'word', 'diagrams', 'colors1.xml'), join(dir, 'word', 'diagrams', 'colors1.xml'));
  copyFileSync(join(oursDir, 'word', 'diagrams', 'quickStyle1.xml'), join(dir, 'word', 'diagrams', 'quickStyle1.xml'));

  copyFileSync(realSample, output);
  execFileSync('zip', ['-q', '-X', output, 'word/diagrams/colors1.xml', 'word/diagrams/quickStyle1.xml'], { cwd: dir, stdio: 'pipe' });
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(oursDir, { recursive: true, force: true });
}

console.log('4. Sanity checks...');
execFileSync('unzip', ['-t', output], { stdio: 'pipe' });
console.log('   ZIP OK.');
execFileSync('soffice', ['--headless', '--convert-to', 'png', '--outdir', here, output], { stdio: 'pipe' });
console.log('   LibreOffice render OK (see cycle-isolate-b.png).');

console.log(`\n${output}\nis the file for round 3 test B.`);
