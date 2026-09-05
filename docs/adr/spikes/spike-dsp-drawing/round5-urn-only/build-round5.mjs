#!/usr/bin/env node
/**
 * Round 5 (2026-09-05) -- rounds 1 (dsp:drawing) and 4 (presOf/constrLst/
 * ruleLst) both disproven: adding either to our own content did not make
 * Word accept it. Round 3 already isolated the problem to data.xml/
 * layout.xml specifically (colors/quickStyle cleared).
 *
 * This is the single-variable test that should have come right after round
 * 3: take the real Word-authored file, change NOTHING except the one thing
 * that makes our layoutDef "ours" instead of Word's own -- the `uniqueId`/
 * `loTypeId` URN (`urn:microsoft.com/office/officeart/.../cycle2` ->
 * `urn:md2nativedocx/smartart-layout/cycle1`, this project's own scheme,
 * ADR 0004's licensing decision not to reuse Microsoft's). Everything else
 * (every element, every attribute, the entire structure) stays exactly
 * what real Word wrote.
 *
 *   - Opens fine -> the URN string itself is irrelevant; Word doesn't care
 *     whether it recognizes it. The real cause is still somewhere in the
 *     structural differences between our from-scratch layoutDef and Word's
 *     own (a much bigger diff surface -- dgm:choose/dgm:if conditionals,
 *     dgm:varLst, a shape's `r:blip=""` attribute, connector handling...).
 *   - Still fails -> Word maintains a closed allowlist of recognized layout
 *     URNs and refuses anything else outright, regardless of how
 *     structurally valid the content is. That would be a hard, likely
 *     unfixable blocker for any self-authored (non-Microsoft) layoutDef --
 *     a materially different, much more serious conclusion than "we're
 *     missing an element somewhere."
 *
 * Usage: node build-round5.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..', '..');
const realSample = join(repoRoot, 'handmade_samples', 'cycle-simple.docx');
const output = join(here, 'cycle-urn-only.docx');

const REAL_URN = 'urn:microsoft.com/office/officeart/2005/8/layout/cycle2';
const OUR_URN = 'urn:md2nativedocx/smartart-layout/cycle1'; // CYCLE_LAYOUT_URN, packages/core/src/smartart/cycle.ts

console.log('Extracting the real Word-authored file...');
const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-r5-'));
try {
  execFileSync('unzip', ['-o', '-q', realSample, '-d', dir], { stdio: 'pipe' });

  const layoutPath = join(dir, 'word', 'diagrams', 'layout1.xml');
  let layoutXml = readFileSync(layoutPath, 'utf8');
  const layoutBefore = layoutXml;
  layoutXml = layoutXml.replace(`uniqueId="${REAL_URN}"`, `uniqueId="${OUR_URN}"`);
  if (layoutXml === layoutBefore) throw new Error('layout1.xml: expected uniqueId not found');
  writeFileSync(layoutPath, layoutXml, 'utf8');
  console.log(`layout1.xml: uniqueId ${REAL_URN} -> ${OUR_URN}`);

  const dataPath = join(dir, 'word', 'diagrams', 'data1.xml');
  let dataXml = readFileSync(dataPath, 'utf8');
  const dataBefore = dataXml;
  dataXml = dataXml.replace(`loTypeId="${REAL_URN}"`, `loTypeId="${OUR_URN}"`);
  if (dataXml === dataBefore) throw new Error('data1.xml: expected loTypeId not found');
  writeFileSync(dataPath, dataXml, 'utf8');
  console.log(`data1.xml: loTypeId ${REAL_URN} -> ${OUR_URN}`);
  console.log('Nothing else touched: same elements, same attributes, same colors1.xml/quickStyle1.xml/drawing1.xml, same document.xml.');

  copyFileSync(realSample, output);
  execFileSync('zip', ['-q', '-X', output, 'word/diagrams/data1.xml', 'word/diagrams/layout1.xml'], { cwd: dir, stdio: 'pipe' });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('\nSanity checks...');
execFileSync('unzip', ['-t', output], { stdio: 'pipe' });
console.log('ZIP OK.');
execFileSync('soffice', ['--headless', '--convert-to', 'png', '--outdir', here, output], { stdio: 'pipe' });
console.log('LibreOffice render OK.');

console.log(`\n${output}\nis the file for round 5's single-variable test.`);
