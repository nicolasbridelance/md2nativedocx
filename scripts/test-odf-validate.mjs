#!/usr/bin/env node
/**
 * ODF schema validation, the `.odt` counterpart of `test-oxml-validate.mjs`: LibreOffice tolerates
 * documents the ODF schema rejects, so a correct render proves nothing about validity. On its first
 * run (spike S5, `docs/adr/spikes/spike-odf-validator/`) this tool found a required `svg:viewBox`
 * missing from our `draw:connector`, which three rendering spikes had not noticed.
 *
 * Validator: the ODF Toolkit's `odfvalidator` (Apache-2.0), the one behind odfvalidator.org. The
 * jar is downloaded once from Maven Central into the user cache and checked against the SHA-256
 * pinned below; a mismatch is a failure, never a skip. Run as a separate `java` subprocess, never
 * shipped, only fed files this project produced.
 *
 * Every document must have zero errors: unlike Pandoc's `.docx`, a plain Pandoc `.odt` validates
 * cleanly, so there is no inherited noise to tolerate.
 *
 * Fixtures: a plain Pandoc document, and two documents written by the real CLI (`-o doc.odt`): one using
 * every style Pandoc's ODT writer refers to, one holding every flowchart of the visual corpus.
 *
 * Requires Java (`java` on PATH) and Pandoc; skips with exit 0 when either is missing, same
 * convention as `test-oxml-validate.mjs` without .NET.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VALIDATOR_VERSION = '0.13.0';
const VALIDATOR_SHA256 = '5684feec5cbdcd5783998978c096ac9ccea53a454e2d6ae803ce482d2336d1dc';
const VALIDATOR_URL =
  `https://repo1.maven.org/maven2/org/odftoolkit/odfvalidator/${VALIDATOR_VERSION}/` +
  `odfvalidator-${VALIDATOR_VERSION}-jar-with-dependencies.jar`;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

function has(command, args) {
  try {
    execFileSync(command, args, { stdio: 'pipe' });
    return true;
  } catch {
    // Not installed or not runnable: the caller turns this into a skip.
    return false;
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function ensureValidatorJar() {
  const cacheDir = join(homedir(), '.cache', 'md2nativedocx');
  const jar = join(cacheDir, `odfvalidator-${VALIDATOR_VERSION}.jar`);
  if (existsSync(jar) && sha256(jar) === VALIDATOR_SHA256) return jar;

  mkdirSync(cacheDir, { recursive: true });
  const response = await fetch(VALIDATOR_URL);
  if (!response.ok) throw new Error(`odfvalidator download failed: HTTP ${response.status}`);
  const partial = `${jar}.partial`;
  writeFileSync(partial, Buffer.from(await response.arrayBuffer()));
  const actual = sha256(partial);
  if (actual !== VALIDATOR_SHA256) {
    rmSync(partial, { force: true });
    throw new Error(`odfvalidator SHA-256 mismatch: expected ${VALIDATOR_SHA256}, got ${actual}`);
  }
  renameSync(partial, jar);
  return jar;
}

/** Markdown using every style Pandoc's ODT writer refers to (no `abstract`: Pandoc 3.1.3 writes it as
 * bare text outside a paragraph, invalid with its own reference.odt too, packages/cli/assets/README.md). */
const ALL_STYLES_MD = [
  '---', 'title: Title', 'subtitle: Subtitle', 'author: Author', 'date: 2026-10-08', '---', '',
  '# Heading 1', '', 'Text with **strong**, *emphasis*, `code`, a [link](#heading-2) and a note.[^1]', '',
  '## Heading 2', '', '> A quotation.', '', '### Heading 3', '', '- bullet', '  1. numbered', '',
  '#### Heading 4', '', '```python', 'def f(x):', '    return x', '```', '',
  '| Left | Right |', '|:-----|------:|', '| a | 1 |', '', ': Caption', '',
  'Term', ':   Definition.', '', '[^1]: The note.', '',
].join('\n');

/** Every flowchart of the visual corpus in one document, rendered by the real CLI. */
function flowchartCorpusMd() {
  const dir = join(repoRoot, 'test-corpus', 'visual', 'fixtures');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.mmd'))
    .sort()
    .map((f) => ({ f, src: readFileSync(join(dir, f), 'utf8') }))
    .filter(({ src }) => /^\s*(graph|flowchart)\b/.test(src.split('\n').find((l) => l.trim() && !l.trim().startsWith('%%')) ?? ''))
    .map(({ f, src }) => `## ${f}\n\n\`\`\`mermaid\n${src.endsWith('\n') ? src : `${src}\n`}\`\`\`\n`)
    .join('\n');
}

function buildFixtures(workDir) {
  const plainMd = join(workDir, 'plain.md');
  writeFileSync(plainMd, '# Plain\n\nA paragraph, a list and a table.\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
  const plain = join(workDir, 'plain.odt');
  execFileSync('pandoc', [plainMd, '-o', plain], { stdio: 'pipe' });

  const cli = join(repoRoot, 'packages', 'cli', 'bin', 'md2nativedocx.mjs');
  const viaCli = (name, markdown) => {
    writeFileSync(join(workDir, `${name}.md`), markdown);
    execFileSync(process.execPath, [cli, `${name}.md`, '-o', `${name}.odt`], { cwd: workDir, stdio: 'pipe' });
    return join(workDir, `${name}.odt`);
  };

  return [
    { name: 'plain Pandoc document', path: plain },
    { name: 'CLI: every Pandoc style, bundled reference.odt and template', path: viaCli('styles', ALL_STYLES_MD) },
    { name: 'CLI: every flowchart of the visual corpus', path: viaCli('flowcharts', flowchartCorpusMd()) },
  ];
}

function validate(jar, path) {
  try {
    const out = execFileSync('java', ['-jar', jar, '-w', path], { stdio: 'pipe', encoding: 'utf8' });
    return { ok: true, report: out };
  } catch (err) {
    // odfvalidator exits non-zero when it reports errors; its report is the useful part.
    return { ok: false, report: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

async function main() {
  if (!has('java', ['-version'])) {
    console.log('test:odf-validate skipped: `java` not found on PATH.');
    return 0;
  }
  if (!has('pandoc', ['--version'])) {
    console.log('test:odf-validate skipped: `pandoc` not found on PATH.');
    return 0;
  }

  const jar = await ensureValidatorJar();
  const workDir = mkdtempSync(join(tmpdir(), 'odf-validate-'));
  let failures = 0;
  try {
    for (const fixture of buildFixtures(workDir)) {
      const { ok, report } = validate(jar, fixture.path);
      const errors = report.split('\n').filter((line) => /\bError:/.test(line));
      if (ok && errors.length === 0) {
        console.log(`ok    ${fixture.name}`);
      } else {
        failures++;
        console.log(`FAIL  ${fixture.name}`);
        console.log(report.trim().replaceAll(workDir, '<tmp>'));
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  console.log(failures === 0 ? 'All ODF documents valid.' : `${failures} ODF document(s) invalid.`);
  return failures === 0 ? 0 : 1;
}

process.exitCode = await main();
