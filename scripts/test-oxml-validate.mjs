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
import AdmZip from 'adm-zip';
import { writeFileSync, readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyValidatorErrors, PANDOC_SIGNATURES_VERSION as PANDOC_VERSION_LABEL } from '../packages/cli/src/wordCheck.mjs';

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
  'cynefin',
  'pie',
  'timeline',
  'kanban',
  'packet',
  'treemap',
  'journey',
  'tree-view',
  'radar',
  'ishikawa',
  'xychart',
  'block',
  'sankey',
  'wardley',
  'eventmodeling',
  'sequence',
  'zenuml',
];

function findDotnet() {
  try {
    execFileSync('dotnet', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function buildDocx(workDir, name, mermaid, { smartArt, nativeCharts = false, smartArtDrawing = false, smartArtStyle }) {
  const mdPath = join(workDir, `${name}.md`);
  writeFileSync(mdPath, `# ${name}\n\n\`\`\`mermaid\n${mermaid}\`\`\`\n`);
  const docxPath = join(workDir, `${name}.docx`);
  // SmartArt, charts and the cached drawing are on by default: each fixture states what it wants.
  const env = { ...process.env };
  env.MD2NATIVEDOCX_ENABLE_SMARTART = smartArt ? '1' : '0';
  env.MD2NATIVEDOCX_NATIVE_CHARTS = nativeCharts ? '1' : '0';
  env.MD2NATIVEDOCX_SMARTART_DRAWING = smartArtDrawing ? '1' : '0';
  if (smartArtStyle) env.MD2NATIVEDOCX_SMARTART_STYLE = smartArtStyle;
  execFileSync('node', [cli, mdPath, '-o', docxPath], { stdio: 'pipe', env });
  return docxPath;
}

/** Run the validator against one file, returning `{ diagramErrors, pandocErrors, otherErrors }` (each an
 * array of `{Part, Path, Description}`). */
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
  // One classifier for CI and for the CLI's Word check (packages/cli/src/wordCheck.mjs, R1.7): own output
  // (diagram, chart and workbook parts, and the drawing elements inside document.xml: a bug there, such
  // as the 2026-09-06 `w:jc` shorthand codes, must never be bucketed as Pandoc noise), the closed list of
  // known Pandoc 3.1.3 gaps, and everything else.
  const { own, pandoc, other } = classifyValidatorErrors(report.errors);
  const diagramErrors = own;
  const pandocErrors = pandoc;
  const otherErrors = other;
  return { diagramErrors, pandocErrors, otherErrors };
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
  let knownOtherErrorTotal = 0; // Pandoc's known gaps, tolerated
  const unclassified = []; // neither ours nor a known Pandoc gap: reported, not failed on

  try {
    for (const { name, mermaid } of SMARTART_FIXTURES) {
      const docxPath = buildDocx(workDir, name, mermaid, { smartArt: true });
      const { diagramErrors, pandocErrors, otherErrors } = validate(docxPath);
      knownOtherErrorTotal += pandocErrors.length;
      unclassified.push(...otherErrors.map((e) => ({ file: basename(docxPath), ...e })));
      if (diagramErrors.length > 0) {
        failures++;
        console.error(`✖ ${name}: ${diagramErrors.length} schema error(s) under word/diagrams/`);
        for (const e of diagramErrors) {
          console.error(`    ${e.Path}: ${e.Description}`);
        }
      } else {
        console.log(`✔ ${name}: 0 schema errors under word/diagrams/ (${pandocErrors.length} known Pandoc, ${otherErrors.length} unclassified)`);
      }
    }

    // SmartArt with the pre-rendered dsp:drawing (fifth part) in every look profile: the colour/style
    // definitions and the drawing are this project's output too.
    for (const style of ['simple', 'colorful', 'intense']) {
      for (const { name, mermaid } of SMARTART_FIXTURES) {
        const label = `${name}+drawing+${style}`;
        const docxPath = buildDocx(workDir, `${name}-drawing-${style}`, mermaid, { smartArt: true, smartArtDrawing: true, smartArtStyle: style });
        const hasDrawing = new AdmZip(docxPath).getEntries().some((e) => /^word\/diagrams\/drawing\d+\.xml$/.test(e.entryName));
        const { diagramErrors, pandocErrors, otherErrors } = validate(docxPath);
        knownOtherErrorTotal += pandocErrors.length;
        unclassified.push(...otherErrors.map((e) => ({ file: basename(docxPath), ...e })));
        if (!hasDrawing || diagramErrors.length > 0) {
          failures++;
          console.error(`✖ ${label}: drawing part ${hasDrawing ? 'present' : 'MISSING'}, ${diagramErrors.length} schema error(s) under word/diagrams/`);
          for (const e of diagramErrors) console.error(`    ${e.Path}: ${e.Description}`);
        } else {
          console.log(`✔ ${label}: dsp:drawing present, 0 schema errors under word/diagrams/`);
        }
      }
    }

    const availablePlainFixtures = new Set(readdirSync(visualFixturesDir).map((f) => basename(f, '.mmd')));
    for (const name of PLAIN_FIXTURE_NAMES) {
      if (!availablePlainFixtures.has(name)) continue;
      const mermaid = readFixtureSource(visualFixturesDir, name);
      const docxPath = buildDocx(workDir, `oxml-plain-${name}`, mermaid, { smartArt: false });
      const { diagramErrors, pandocErrors, otherErrors } = validate(docxPath);
      knownOtherErrorTotal += pandocErrors.length;
      unclassified.push(...otherErrors.map((e) => ({ file: basename(docxPath), ...e })));
      if (diagramErrors.length > 0) {
        failures++;
        console.error(`✖ oxml-plain-${name}: ${diagramErrors.length} schema error(s) under word/diagrams/`);
      } else {
        console.log(`✔ oxml-plain-${name}: 0 schema errors under word/diagrams/`);
      }
    }

    // Native charts (ADR 0011): the chart part is this project's output, and so is the embedded
    // workbook — validated as its own package, where any schema error fails the run.
    const NATIVE_CHARTS = [
      ['pie', 'pie showData\n  title Pets\n  "Dogs" : 386\n  "Cats" : 85.5\n'],
      ['xychart', 'xychart-beta\n  title "Sales"\n  x-axis [jan, feb, mar]\n  y-axis "Revenue" 0 --> 10\n  bar [5, 6, 7]\n  line [4, 6, 8]\n'],
      ['radar', 'radar-beta\n  title Grades\n  axis m["Math"], s["Science"], e["English"]\n  curve a["Alice"]{85, 90, 80}\n  curve b["Bob"]{70, 75, 85}\n  max 100\n'],
    ];
    for (const [kind, mermaid] of NATIVE_CHARTS) {
      const label = `oxml-native-${kind}`;
      const docxPath = buildDocx(workDir, label, mermaid, { smartArt: false, nativeCharts: true });
      const zip = new AdmZip(docxPath);
      const workbook = zip.getEntries().find((e) => /^word\/embeddings\/.*\.xlsx$/.test(e.entryName));
      const chartPart = zip.getEntry('word/charts/chart1.xml');
      const { diagramErrors, pandocErrors, otherErrors } = validate(docxPath);
      knownOtherErrorTotal += pandocErrors.length;
      unclassified.push(...otherErrors.map((e) => ({ file: basename(docxPath), ...e })));
      let workbookErrors = [];
      if (workbook) {
        const xlsxPath = join(workDir, `${label}-workbook.xlsx`);
        writeFileSync(xlsxPath, workbook.getData());
        const result = validate(xlsxPath);
        workbookErrors = [...result.diagramErrors, ...result.pandocErrors, ...result.otherErrors];
      }
      if (!chartPart || !workbook || diagramErrors.length > 0 || workbookErrors.length > 0) {
        failures++;
        console.error(
          `✖ ${label}: chart part ${chartPart ? 'present' : 'MISSING'}, workbook ${workbook ? 'present' : 'MISSING'}, ` +
            `${diagramErrors.length} chart/diagram error(s), ${workbookErrors.length} workbook error(s)`,
        );
        for (const e of [...diagramErrors, ...workbookErrors].slice(0, 20)) console.error(`    ${e.Path}: ${e.Description}`);
      } else {
        console.log(`✔ ${label}: chart part + embedded workbook, 0 schema errors`);
      }
    }

    // packages/pptx: one deck holding every visual fixture. Unlike the .docx (where Pandoc's own
    // writer contributes known noise), every part of the .pptx is this project's output, so ANY
    // schema error fails the run.
    const deckMd = [...availablePlainFixtures]
      .sort()
      .map((name) => `# ${name}\n\n\`\`\`mermaid\n${readFixtureSource(visualFixturesDir, name)}\n\`\`\`\n`)
      .join('\n');
    const deckMdPath = join(workDir, 'oxml-pptx-all.md');
    const deckPath = join(workDir, 'oxml-pptx-all.pptx');
    writeFileSync(deckMdPath, deckMd);
    execFileSync('node', [cli, deckMdPath, '-o', deckPath], { stdio: 'pipe' });
    const deck = validate(deckPath);
    const deckErrors = [...deck.diagramErrors, ...deck.pandocErrors, ...deck.otherErrors];
    if (deckErrors.length > 0) {
      failures++;
      console.error(`✖ oxml-pptx-all: ${deckErrors.length} schema error(s)`);
      for (const e of deckErrors.slice(0, 20)) console.error(`    ${e.Part} ${e.Path}: ${e.Description}`);
    } else {
      console.log(`✔ oxml-pptx-all: 0 schema errors (${availablePlainFixtures.size} slides)`);
    }
  } finally {
    if (failures === 0) rmSync(workDir, { recursive: true, force: true });
    else console.error(`(generated .docx files kept at ${workDir} for inspection)`);
  }

  if (knownOtherErrorTotal > 0) {
    console.log(
      `test:oxml-validate: ${knownOtherErrorTotal} known Pandoc ${PANDOC_VERSION_LABEL} schema error(s) ` +
        `(its own .docx writer, not this project; closed list in packages/cli/src/wordCheck.mjs).`,
    );
  }
  if (unclassified.length > 0) {
    console.log(`test:oxml-validate: ${unclassified.length} error(s) neither ours nor a known Pandoc gap (not failing):`);
    for (const e of unclassified.slice(0, 15)) console.log(`    ${e.file} ${e.Part} ${e.Path}: ${e.Description}`);
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
