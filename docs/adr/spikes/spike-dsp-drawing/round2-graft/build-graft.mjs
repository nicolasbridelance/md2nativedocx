#!/usr/bin/env node
/**
 * Round 2 (2026-09-05) -- ADR 0006's dsp:drawing hypothesis was tested and
 * DISPROVEN: cycle-with-drawing.docx (Milestone 0's spike, one directory up)
 * still fails to open in real Word with the exact same error as the
 * original incident. This is a decisive bisection to find out WHERE the
 * real problem actually is:
 *
 *   - Take handmade_samples/cycle-simple.docx (a real Word-authored cycle,
 *     known to open fine -- it's what Word itself produced).
 *   - Replace ONLY its 5 diagram parts (word/diagrams/{data,layout,colors,
 *     quickStyle,drawing}1.xml) with OUR generator's equivalent output for
 *     the exact same A-->B-->C-->A cycle.
 *   - Leave EVERYTHING else byte-for-byte as real Word wrote it:
 *     document.xml, _rels/document.xml.rels, [Content_Types].xml, styles,
 *     settings, theme, etc. No re-numbering needed -- the real file already
 *     uses rId4-rId8 for data/layout/quickStyle/colors/drawing respectively,
 *     the exact same slots our own content needs to fill.
 *
 * Two possible outcomes once opened in a real Word:
 *   - Opens fine -> the problem is in something OUR PIPELINE assembles
 *     around the diagram (document.xml root declarations, mc:Ignorable,
 *     settings.xml, the generated reference.docx, ...), not in the diagram
 *     content itself.
 *   - Still fails -> the problem is inside OUR diagram XML content itself
 *     (most likely the custom `dgm:layoutDef`) -- dsp:drawing presence was
 *     never the fix, something else about the data/layout is structurally
 *     wrong in a way real Word validates strictly and LibreOffice doesn't.
 *
 * Usage: node build-graft.mjs
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
const output = join(here, 'cycle-graft.docx');

console.log('1. Extracting our own generated diagram parts (from Milestone 0\'s spike)...');
const oursDir = mkdtempSync(join(tmpdir(), 'md2nativedocx-graft-ours-'));
execFileSync('unzip', ['-o', '-q', join(spikeDir, 'cycle-with-drawing.docx'), 'word/diagrams/data1.xml', 'word/diagrams/layout1.xml', 'word/diagrams/colors1.xml', 'word/diagrams/quickStyle1.xml', 'word/diagrams/drawing1.xml', '-d', oursDir], { stdio: 'pipe' });

console.log('2. Extracting the real Word-authored file (structure to keep untouched)...');
const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-graft-'));
try {
  execFileSync('unzip', ['-o', '-q', realSample, '-d', dir], { stdio: 'pipe' });

  console.log('3. Grafting: overwrite the real file\'s 5 diagram parts with ours (same filenames, same rIds already wired)...');
  for (const name of ['data1.xml', 'layout1.xml', 'colors1.xml', 'quickStyle1.xml', 'drawing1.xml']) {
    const oursPath = join(oursDir, 'word', 'diagrams', name);
    const realPath = join(dir, 'word', 'diagrams', name);
    copyFileSync(oursPath, realPath);
    console.log(`   ${name}: ${readFileSync(oursPath, 'utf8').length} bytes (ours) replacing real Word's own`);
  }

  // Our data1.xml's dsp:dataModelExt was minted for a fresh rId (whatever
  // our own postprocess.mjs numbering produced in cycle-with-drawing.docx)
  // -- must point at rId8 here, the id the REAL file's rels already use for
  // the diagramDrawing relationship (kept untouched in this graft).
  const dataPath = join(dir, 'word', 'diagrams', 'data1.xml');
  let dataXml = readFileSync(dataPath, 'utf8');
  const before = dataXml;
  dataXml = dataXml.replace(/relId="rId\d+"(\s*minVer="http:\/\/schemas\.openxmlformats\.org\/drawingml\/2006\/diagram")/, 'relId="rId8"$1');
  if (dataXml === before) throw new Error('expected to find and rewrite a dsp:dataModelExt relId in our data1.xml');
  writeFileSync(dataPath, dataXml, 'utf8');
  console.log('   data1.xml: dsp:dataModelExt relId rewritten to rId8 (the real file\'s existing diagramDrawing relationship)');

  copyFileSync(realSample, output);
  execFileSync('zip', ['-q', '-X', output, 'word/diagrams/data1.xml', 'word/diagrams/layout1.xml', 'word/diagrams/colors1.xml', 'word/diagrams/quickStyle1.xml', 'word/diagrams/drawing1.xml'], { cwd: dir, stdio: 'pipe' });
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(oursDir, { recursive: true, force: true });
}

console.log('4. Sanity checks...');
execFileSync('unzip', ['-t', output], { stdio: 'pipe' });
console.log('   ZIP OK.');
execFileSync('soffice', ['--headless', '--convert-to', 'png', '--outdir', here, output], { stdio: 'pipe' });
console.log('   LibreOffice render OK (see cycle-graft.png).');

console.log(`\n${output}\nis the file for the real-Word bisection test.`);
