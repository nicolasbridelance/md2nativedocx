#!/usr/bin/env node
/**
 * Visual regression tests (spec §9): render each fixture in
 * `test-corpus/visual/fixtures/` to a `.docx` through the real CLI, convert it
 * to PNG with LibreOffice headless, and pixel-diff it against the checked-in
 * baseline in `test-corpus/visual/baseline/`.
 *
 * This exists because structural XML conformance (the other test suites) does
 * not catch actual rendering defects: several of the connector-geometry bugs
 * fixed in this codebase (arrow heads landing inside a shape's fill and so
 * rendering invisible, an edge label overlapping an unrelated node) passed
 * every XML-level test while being visibly broken. Pixel-diffing a real render
 * is the only check that would have caught them.
 *
 * A baseline is deliberately not auto-generated on first run: accepting
 * whatever the current renderer produces as "correct" the first time it runs
 * would silently canonize a bug (as the two examples above demonstrate). Pass
 * `--update-baseline` to (re)generate baselines after visually reviewing the
 * rendered PNG yourself — see the printed path.
 *
 * Requires LibreOffice headless (`soffice`/`libreoffice` on PATH); skips with
 * exit 0 when unavailable, matching how `ci.yml` only runs this job on a
 * schedule / release branches (LibreOffice is not pinned or guaranteed present
 * everywhere — see TODO.md → "pinning LibreOffice").
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, diffImages } from './lib/png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const cli = join(repoRoot, 'packages', 'cli', 'bin', 'md2nativedocx.mjs');
const fixturesDir = join(repoRoot, 'test-corpus', 'visual', 'fixtures');
const baselineDir = join(repoRoot, 'test-corpus', 'visual', 'baseline');

// Pin the substitution used for fonts no Linux distro ships (Word's Aptos/
// Aptos Display, plus Calibri/Cambria) so renders don't drift across
// environments just because ambient font availability/order differs — see
// test-corpus/visual/fontconfig/fonts.conf for the full rationale.
const fontconfigFile = join(repoRoot, 'test-corpus', 'visual', 'fontconfig', 'fonts.conf');
const sofficeEnv = { ...process.env, FONTCONFIG_FILE: fontconfigFile };

/** Fraction (0..1) of pixels allowed to differ before a fixture fails. */
const DIFF_THRESHOLD = 0.01;

const updateBaseline = process.argv.includes('--update-baseline');

function findLibreOffice() {
  for (const bin of ['soffice', 'libreoffice']) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'pipe' });
      return bin;
    } catch {
      // Not on PATH under this name; try the next one.
    }
  }
  return null;
}

/** Render one fixture's Mermaid source to a PNG via the CLI + LibreOffice. */
function renderFixture(sofficeBin, mmdPath, workDir) {
  const name = basename(mmdPath, '.mmd');
  const source = readFileSync(mmdPath, 'utf8');
  const mdPath = join(workDir, `${name}.md`);
  writeFileSync(mdPath, `# ${name}\n\n\`\`\`mermaid\n${source}\`\`\`\n`);

  const docxPath = join(workDir, `${name}.docx`);
  execFileSync('node', [cli, mdPath, '-o', docxPath], { stdio: 'pipe' });

  execFileSync(sofficeBin, ['--headless', '--convert-to', 'png', '--outdir', workDir, docxPath], {
    stdio: 'pipe',
    timeout: 60_000,
    env: sofficeEnv,
  });
  const pngPath = join(workDir, `${name}.png`);
  if (!existsSync(pngPath)) {
    throw new Error(`LibreOffice did not produce ${pngPath}`);
  }
  return pngPath;
}

function main() {
  const sofficeBin = findLibreOffice();
  if (!sofficeBin) {
    console.log('test:visual: LibreOffice headless not found on PATH — skipping (see TODO.md).');
    process.exit(0);
  }

  const fixtures = readdirSync(fixturesDir).filter((f) => f.endsWith('.mmd')).sort();
  if (fixtures.length === 0) {
    console.log('test:visual: no fixtures in test-corpus/visual/fixtures/, nothing to do.');
    process.exit(0);
  }

  const workDir = mkdtempSync(join(tmpdir(), 'md2nativedocx-visual-'));
  let failures = 0;
  let created = 0;

  try {
    for (const fixture of fixtures) {
      const name = basename(fixture, '.mmd');
      const renderedPng = renderFixture(sofficeBin, join(fixturesDir, fixture), workDir);
      const baselinePng = join(baselineDir, `${name}.png`);

      if (!existsSync(baselinePng)) {
        if (updateBaseline) {
          copyFileSync(renderedPng, baselinePng);
          console.log(`+ ${name}: baseline created (${baselinePng})`);
          created++;
        } else {
          console.error(`✖ ${name}: no baseline yet. Review ${renderedPng} then re-run with --update-baseline.`);
          failures++;
        }
        continue;
      }

      if (updateBaseline) {
        copyFileSync(renderedPng, baselinePng);
        console.log(`+ ${name}: baseline updated (${baselinePng})`);
        created++;
        continue;
      }

      const baseline = decodePng(readFileSync(baselinePng));
      const rendered = decodePng(readFileSync(renderedPng));
      const diff = diffImages(baseline, rendered);
      if (!diff.equalDimensions) {
        console.error(
          `✖ ${name}: dimensions changed (baseline ${baseline.width}x${baseline.height}, ` +
            `rendered ${rendered.width}x${rendered.height})`,
        );
        failures++;
      } else if (diff.diffFraction > DIFF_THRESHOLD) {
        console.error(
          `✖ ${name}: ${(diff.diffFraction * 100).toFixed(2)}% of pixels differ ` +
            `(threshold ${(DIFF_THRESHOLD * 100).toFixed(2)}%). Rendered: ${renderedPng}`,
        );
        failures++;
      } else {
        console.log(`✔ ${name}: ${(diff.diffFraction * 100).toFixed(3)}% pixels differ`);
      }
    }
  } finally {
    // On failure, leave the work dir behind so the rendered PNGs referenced in
    // the error messages above are still there to inspect; clean up on success.
    if (failures === 0) rmSync(workDir, { recursive: true, force: true });
    else console.error(`(rendered PNGs kept at ${workDir} for inspection)`);
  }

  if (updateBaseline) {
    console.log(`test:visual: ${created} baseline(s) written.`);
    process.exit(0);
  }
  if (failures > 0) {
    console.error(`test:visual: ${failures}/${fixtures.length} fixture(s) failed.`);
    process.exit(1);
  }
  console.log(`test:visual: ${fixtures.length}/${fixtures.length} fixture(s) passed.`);
}

main();
