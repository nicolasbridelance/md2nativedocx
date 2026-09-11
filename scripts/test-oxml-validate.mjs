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
 *   - Everything else — schema noise confirmed (2026-09-06, see TODO.md) to come from Pandoc's
 *     own `.docx` writer itself, not this project: identical errors (styles.xml/settings.xml
 *     ordering, numbering.xml nsid length, document.xml pStyle/table property quirks) appear in
 *     Pandoc's own unmodified default reference.docx and even in a bare `pandoc foo.md -o
 *     foo.docx` with zero involvement of this codebase. Already tolerated by real Word today.
 *     Printed for visibility, never failed on — not this test's job to fix.
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
 * base translator/reference.docx path, not just SmartArt. `quadrant`/`venn`/
 * `mindmap` added 2026-09-06 after a real Word test found all 3 produced a
 * `.docx` Word outright refused to open (`<w:jc w:val="l"/"ctr"/"r">` —
 * DrawingML-shorthand alignment codes written into a WordprocessingML
 * `ST_Jc` attribute, which has no such members) — LibreOffice performs no
 * schema validation, so `test:visual` alone never had a chance to catch
 * this, and this test never previously ran against these 3 diagram types'
 * own output. Exactly the gap this addition closes. */
const PLAIN_FIXTURE_NAMES = [
  'minimal',
  'decision',
  'quadrant',
  'venn',
  'mindmap',
  'swimlane',
  'class-diagram',
  'state-diagram',
  'er-diagram',
  'requirement-diagram',
  'architecture-diagram',
  'gantt',
  'c4',
  'git-graph',
];

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
  // "This project's own diagram output" isn't only SmartArt's separate
  // `word/diagrams/*.xml` parts — the plain (non-SmartArt) OOXML canvas
  // (`wpc:wpc`/`wps:`/flowchart, quadrant, venn, mindmap alike) is inlined
  // straight into `word/document.xml` instead. A real bug (2026-09-06:
  // quadrant/venn/mindmap writing DrawingML-shorthand alignment codes into
  // a WordprocessingML `w:jc`, corrupting the file for real Word) lived
  // entirely inside a `wpc:wpc` element and would have been silently
  // bucketed as "known Pandoc noise" by a `/word/diagrams/`-only filter —
  // exactly the class of regression this widened check exists to catch.
  const isOwnDiagramOutput = (e) => e.Part?.startsWith('/word/diagrams/') || e.Path?.includes('wpc:wpc');
  const diagramErrors = report.errors.filter(isOwnDiagramOutput);
  const otherErrors = report.errors.filter((e) => !isOwnDiagramOutput(e));
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
        `(Pandoc's own .docx writer, not this project — see TODO.md).`,
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
