#!/usr/bin/env node
/**
 * Round 4 (2026-09-05) -- new hypothesis found by directly comparing our
 * CYCLE_LAYOUT_XML against handmade_samples/cycle-simple.docx's real
 * layout1.xml line by line, after round 3 isolated the problem to our
 * data.xml + layout.xml specifically (cycle-isolate-a.docx failed;
 * cycle-isolate-b.docx, colors/quickStyle only, opened fine).
 *
 * Every `dgm:layoutNode` in the real file includes `presOf`, `constrLst`,
 * and `ruleLst` -- even when empty/self-closed (e.g. the real "sibTrans"
 * connector node has `<dgm:presOf axis="self"/>` and `<dgm:ruleLst/>`, not
 * just an `alg`+`shape`). Our own `CYCLE_LAYOUT_XML` (and, checked at the
 * same time, `CHAIN_LAYOUT_XML`/`TREE_LAYOUT_XML` -- same authoring pattern
 * throughout) OMITS these elements entirely on every non-leaf layoutNode
 * ("root", "composite", "sibTrans"), only ever including them on the one
 * leaf node that actually presents text ("Main"). If `dgm:layoutNode`'s
 * schema (CT_LayoutNode) requires these as mandatory children (content can
 * be empty, but the element itself must be present), that is exactly the
 * kind of structural validity gap Word's strict OOXML parser would reject
 * outright while LibreOffice's lenient one silently tolerates -- consistent
 * with every observation so far (fails in Word, always rendered fine in
 * LibreOffice).
 *
 * Two test files, to get two bits of information per round trip:
 *
 *   - cycle-round4-graft.docx: our FIXED data.xml + layout.xml grafted into
 *     the real Word file (same isolate-a methodology as round 3), colors/
 *     quickStyle real, no drawing part. Cleanest possible isolation.
 *   - cycle-round4-standalone.docx: a COMPLETE diagram built by our own
 *     unmodified CLI pipeline (own reference.docx, own colors/quickStyle,
 *     own document.xml assembly), with ONLY the layoutDef/data patched to
 *     add the missing elements. If this alone opens in Word, the ENTIRE
 *     Milestone 1 plan (a whole new dsp:drawing geometry engine) becomes
 *     unnecessary -- this schema gap was the real, much smaller problem all
 *     along.
 *
 * Usage: node build-round4.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..', '..');
const cliBin = join(repoRoot, 'packages', 'cli', 'bin', 'md2nativedocx.mjs');
const realSample = join(repoRoot, 'handmade_samples', 'cycle-simple.docx');
const mdInput = join(here, '..', 'cycle.md');

/**
 * Patch a generated CYCLE_LAYOUT_XML string to add the missing `presOf`/
 * `constrLst`/`ruleLst` elements on the "root" and "composite" layoutNodes
 * (schema order: alg, shape, presOf, constrLst, ruleLst, then children) --
 * "Main" already has all three, untouched.
 */
function patchLayoutXml(xml) {
  let out = xml;
  const rootBefore = out;
  out = out.replace(
    '<dgm:alg type="cycle"/><dgm:shape/><dgm:constrLst>',
    '<dgm:alg type="cycle"/><dgm:shape/><dgm:presOf/><dgm:constrLst>',
  );
  if (out === rootBefore) throw new Error('root layoutNode: expected pattern not found');

  const ruleLstBefore = out;
  out = out.replace(
    '</dgm:constrLst><dgm:forEach name="nodesForEach"',
    '</dgm:constrLst><dgm:ruleLst/><dgm:forEach name="nodesForEach"',
  );
  if (out === ruleLstBefore) throw new Error('root layoutNode ruleLst insertion point not found');

  const compositeBefore = out;
  out = out.replace(
    '<dgm:alg type="composite"/><dgm:shape/><dgm:layoutNode name="Main"',
    '<dgm:alg type="composite"/><dgm:shape/><dgm:presOf/><dgm:constrLst/><dgm:ruleLst/><dgm:layoutNode name="Main"',
  );
  if (out === compositeBefore) throw new Error('composite layoutNode: expected pattern not found');

  return out;
}

console.log('1. Loading our own generated data1.xml/layout1.xml and patching layout1.xml...');
const coreDist = join(repoRoot, 'packages', 'core', 'dist');
const { parseMermaid } = await import(join(coreDist, 'index.js'));
const { generateCycle } = await import(join(coreDist, 'smartart', 'cycle.js'));
const { ast } = parseMermaid('graph TD\n  A --> B\n  B --> C\n  C --> A\n');
const generated = generateCycle(ast);
const patchedLayoutXml = patchLayoutXml(generated.layoutXml);
console.log('   Patched: added <dgm:presOf/>/<dgm:constrLst/>/<dgm:ruleLst/> to "root" and "composite" layoutNodes.');

// --- Test 1: graft into the real Word file (cleanest isolation) ---
console.log('\n2. Building cycle-round4-graft.docx (patched data+layout grafted into the real file)...');
{
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-r4-graft-'));
  try {
    execFileSync('unzip', ['-o', '-q', realSample, '-d', dir], { stdio: 'pipe' });
    writeFileSync(join(dir, 'word', 'diagrams', 'data1.xml'), generated.dataXml, 'utf8');
    writeFileSync(join(dir, 'word', 'diagrams', 'layout1.xml'), patchedLayoutXml, 'utf8');
    rmSync(join(dir, 'word', 'diagrams', 'drawing1.xml'));

    const relsPath = join(dir, 'word', '_rels', 'document.xml.rels');
    let relsXml = readFileSync(relsPath, 'utf8');
    relsXml = relsXml.replace(/<Relationship Id="rId8"[^>]*diagramDrawing[^>]*\/>/, '');
    writeFileSync(relsPath, relsXml, 'utf8');

    const ctPath = join(dir, '[Content_Types].xml');
    let ctXml = readFileSync(ctPath, 'utf8');
    ctXml = ctXml.replace(/<Override PartName="\/word\/diagrams\/drawing1\.xml"[^>]*\/>/, '');
    writeFileSync(ctPath, ctXml, 'utf8');

    const output = join(here, 'cycle-round4-graft.docx');
    copyFileSync(realSample, output);
    execFileSync('zip', ['-q', '-X', output, 'word/diagrams/data1.xml', 'word/diagrams/layout1.xml'], { cwd: dir, stdio: 'pipe' });
    execFileSync('zip', ['-q', '-X', '-d', output, 'word/diagrams/drawing1.xml'], { stdio: 'pipe' });
    execFileSync('zip', ['-q', '-X', output, '[Content_Types].xml', 'word/_rels/document.xml.rels'], { cwd: dir, stdio: 'pipe' });
    execFileSync('unzip', ['-t', output], { stdio: 'pipe' });
    execFileSync('soffice', ['--headless', '--convert-to', 'png', '--outdir', here, output], { stdio: 'pipe' });
    console.log('   OK:', output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- Test 2: fully standalone, our own pipeline end to end ---
console.log('\n3. Building cycle-round4-standalone.docx (our own CLI, layoutDef patched in place)...');
{
  const output = join(here, 'cycle-round4-standalone.docx');
  execFileSync('node', [cliBin, mdInput, '-o', output], {
    env: { ...process.env, MD2NATIVEDOCX_ENABLE_SMARTART: '1' },
    stdio: 'pipe',
  });
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-r4-standalone-'));
  try {
    execFileSync('unzip', ['-o', '-q', output, 'word/diagrams/layout1.xml'], { cwd: dir, stdio: 'pipe' });
    const ownLayoutXml = readFileSync(join(dir, 'word', 'diagrams', 'layout1.xml'), 'utf8');
    writeFileSync(join(dir, 'word', 'diagrams', 'layout1.xml'), patchLayoutXml(ownLayoutXml), 'utf8');
    execFileSync('zip', ['-q', '-X', output, 'word/diagrams/layout1.xml'], { cwd: dir, stdio: 'pipe' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  execFileSync('unzip', ['-t', output], { stdio: 'pipe' });
  execFileSync('soffice', ['--headless', '--convert-to', 'png', '--outdir', here, output], { stdio: 'pipe' });
  console.log('   OK:', output);
}

console.log('\nDone -- both files are for the real-Word test.');
