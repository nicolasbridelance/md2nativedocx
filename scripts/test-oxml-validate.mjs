#!/usr/bin/env node
/**
 * Open XML schema validation (AGENTS.md → "Diagnosing 'Word won't open the
 * file'"): validates real generated `.docx` files against the exact schema
 * real Word enforces, via Microsoft's own Open XML SDK
 * (`scripts/oxml-validator/`, `DocumentFormat.OpenXml.Validation.OpenXmlValidator`).
 *
 * This exists because neither well-formed-XML checks nor LibreOffice (which
 * performs no schema validation at all) can catch a schema violation Word
 * rejects outright — exactly what cost 7 rounds of manually-compared,
 * individually-disproven hypotheses in the SmartArt "cycle" corruption
 * incident before this tool found the real cause in one pass (an invalid
 * `modelId` scheme — see `docs/adr/0006-dsp-drawing-fallback-spike.md`,
 * round 9).
 *
 * Errors are split into two buckets:
 *   - `/word/diagrams/*` (our own SmartArt translator's output) — must be
 *     zero, this is what this test actually gates on.
 *   - Everything else — known pre-existing schema noise inherited from
 *     `packages/cli/assets/reference.docx` (styles.xml/numbering.xml/
 *     settings.xml), present even without SmartArt and already tolerated by
 *     real Word today (tracked separately in TODO.md, not this test's job
 *     to fix). Printed for visibility, never failed on.
 *
 * Requires the .NET SDK (`dotnet` on PATH); skips with exit 0 when
 * unavailable, matching how `test-visual.mjs` skips without LibreOffice and
 * `run-extension-host-tests.mjs` skips without a display/`xvfb-run`.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const cli = join(repoRoot, 'packages', 'cli', 'bin', 'md2nativedocx.mjs');
const validatorDir = join(here, 'oxml-validator');
const visualFixturesDir = join(repoRoot, 'test-corpus', 'visual', 'fixtures');

/** SmartArt-eligible shapes (chain/tree/cycle) — the code path this test
 * exists for, since the diagram-part schema violations this tool was built
 * to catch only ever occur when a diagram is SmartArt, not the default
 * `wpc:wpc` canvas shapes. */
const SMARTART_FIXTURES = [
  { name: 'oxml-cycle', mermaid: 'graph TD\n  A --> B\n  B --> C\n  C --> A\n' },
  { name: 'oxml-chain', mermaid: 'graph LR\n  A --> B --> C\n' },
  { name: 'oxml-tree', mermaid: 'graph TD\n  A --> B\n  A --> C\n  A --> D\n' },
];

/** A couple of ordinary (non-SmartArt) fixtures too, reusing the existing
 * visual-regression corpus — regresses on any future schema issue in the
 * base translator/reference.docx path, not just SmartArt. */
const PLAIN_FIXTURE_NAMES = ['minimal', 'decision'];

function findDotnet() {
  try {
    execFileSync('dotnet', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function buildDocx(workDir, name, mermaid, { smartArt }) {
  const mdPath = join(workDir, `${name}.md`);
  writeFileSync(mdPath, `# ${name}\n\n\`\`\`mermaid\n${mermaid}\`\`\`\n`);
  const docxPath = join(workDir, `${name}.docx`);
  const env = smartArt ? { ...process.env, MD2NATIVEDOCX_ENABLE_SMARTART: '1' } : process.env;
  execFileSync('node', [cli, mdPath, '-o', docxPath], { stdio: 'pipe', env });
  return docxPath;
}

/** Run the validator against one `.docx`, returning `{ diagramErrors,
 * otherErrors }` (each an array of `{part, path, description}`). */
function validate(docxPath) {
  let stdout;
  try {
    stdout = execFileSync('dotnet', ['run', '--project', validatorDir, '--', docxPath, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    // Non-zero exit still prints the JSON report on stdout (exit code just
    // signals "errorCount > 0"); only a genuinely missing stdout means the
    // validator itself failed to run.
    stdout = err.stdout?.toString();
    if (!stdout) throw err;
  }
  const report = JSON.parse(stdout.trim().split('\n').pop());
  const diagramErrors = report.errors.filter((e) => e.Part?.startsWith('/word/diagrams/'));
  const otherErrors = report.errors.filter((e) => !e.Part?.startsWith('/word/diagrams/'));
  return { diagramErrors, otherErrors };
}

function main() {
  if (!findDotnet()) {
    console.log('test:oxml-validate: .NET SDK (dotnet) not found on PATH — skipping (see AGENTS.md).');
    process.exit(0);
  }

  console.log('test:oxml-validate: building the validator (dotnet build)...');
  execFileSync('dotnet', ['build', validatorDir], { stdio: 'pipe' });

  const workDir = mkdtempSync(join(tmpdir(), 'md2nativedocx-oxml-'));
  let failures = 0;
  let knownOtherErrorTotal = 0;

  try {
    for (const { name, mermaid } of SMARTART_FIXTURES) {
      const docxPath = buildDocx(workDir, name, mermaid, { smartArt: true });
      const { diagramErrors, otherErrors } = validate(docxPath);
      knownOtherErrorTotal += otherErrors.length;
      if (diagramErrors.length > 0) {
        failures++;
        console.error(`✖ ${name}: ${diagramErrors.length} schema error(s) under word/diagrams/`);
        for (const e of diagramErrors) {
          console.error(`    ${e.Path}: ${e.Description}`);
        }
      } else {
        console.log(`✔ ${name}: 0 schema errors under word/diagrams/ (${otherErrors.length} pre-existing, tracked separately)`);
      }
    }

    const availablePlainFixtures = new Set(readdirSync(visualFixturesDir).map((f) => basename(f, '.mmd')));
    for (const name of PLAIN_FIXTURE_NAMES) {
      if (!availablePlainFixtures.has(name)) continue;
      const mermaid = readFixtureSource(visualFixturesDir, name);
      const docxPath = buildDocx(workDir, `oxml-plain-${name}`, mermaid, { smartArt: false });
      const { diagramErrors, otherErrors } = validate(docxPath);
      knownOtherErrorTotal += otherErrors.length;
      if (diagramErrors.length > 0) {
        failures++;
        console.error(`✖ oxml-plain-${name}: ${diagramErrors.length} schema error(s) under word/diagrams/`);
      } else {
        console.log(`✔ oxml-plain-${name}: 0 schema errors under word/diagrams/`);
      }
    }
  } finally {
    if (failures === 0) rmSync(workDir, { recursive: true, force: true });
    else console.error(`(generated .docx files kept at ${workDir} for inspection)`);
  }

  if (knownOtherErrorTotal > 0) {
    console.log(
      `test:oxml-validate: ${knownOtherErrorTotal} pre-existing schema error(s) outside word/diagrams/ ` +
        `(reference.docx template, not this test's scope — see TODO.md).`,
    );
  }

  if (failures > 0) {
    console.error(`test:oxml-validate: ${failures} fixture(s) have schema errors in generated diagram content.`);
    process.exit(1);
  }
  console.log('test:oxml-validate: all fixtures have 0 schema errors under word/diagrams/.');
}

function readFixtureSource(dir, name) {
  return readFileSync(join(dir, `${name}.mmd`), 'utf8');
}

main();
