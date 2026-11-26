#!/usr/bin/env node
/**
 * Pagination check in real Word. A long generated handbook (about thirty pages: headings, a footnote,
 * an 80-row table with a caption, small diagrams and one taller than a page) is converted by the real
 * CLI twice, on the default page and on A4 with the table in its own landscape section
 * (`MD2NATIVEDOCX_LANDSCAPE_TABLES`). `scripts/word-pagination-check.ps1` has desktop Word repaginate
 * each one and report where everything landed. The check fails when, in Word:
 *   - a heading ends a page while the paragraph after it starts the next one;
 *   - the table does not span pages, or its header row does not repeat on each of them;
 *   - a drawing (canvas, SmartArt) is larger than the usable area of its section, or not on one page;
 *   - the landscape section is missing, or does not hold the whole table, or the page after it is not
 *     back to portrait;
 *   - a heading, the footnote or the caption is missing.
 * Neither test:visual (LibreOffice paginates differently) nor the schema validator can show any of this.
 *
 * Requires Windows with desktop Word; skips with exit 0 otherwise, same convention as test:visual.
 * Manual, not in CI (no Word on the runners). `--keep <dir>` keeps each variant's .docx, Word's PDF
 * export and the measurements there, for a person to look at.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function wordInstalled() {
  if (process.platform !== 'win32') return false;
  // Word.Application is registered as a COM class by every desktop Word install.
  return spawnSync('reg', ['query', 'HKCR\\Word.Application\\CLSID'], { stdio: 'pipe' }).status === 0;
}

const SECTIONS = 24;
const CAPTION = 'Register of handover records.';
const FILLER =
  'The duty desk receives the handover record, verifies that the recorded details match the inventory, ' +
  'and registers exceptions in the service ledger. Staff record the assigned owner and the next review date. ' +
  'The supervisor checks the completed record before the next shift. Records are retained with the task ' +
  'identifier so that the receiving team can retrieve the correct version.';

/** A branch and a merge: drawn as shapes and connectors on a canvas, SmartArt cannot take it. */
const CANVAS_DIAGRAM = 'flowchart LR\n  A[Receive record] --> B[Validate record]\n  A --> C[Log exception]\n  B --> D[File record]\n  C --> D\n';
/** A plain chain: SmartArt by default. */
const SMARTART_DIAGRAM = 'flowchart LR\n  A[Archive packet] --> B[Confirm index] --> C[Close shift]\n';
/** Thirty steps top to bottom, far taller than any page: must be scaled down to the usable area. */
const TALL_DIAGRAM = `flowchart TD\n${Array.from({ length: 29 }, (_, i) => `  S${i + 1}[Step ${i + 1}] --> S${i + 2}[Step ${i + 2}]`).join('\n')}\n  S1 --> S30\n`;

/** The handbook. The register gets its own heading right before the table, which is what the landscape option keys on. */
function handbook() {
  const parts = ['# Operations handbook', 'This handbook describes routine handover review.[^record]'];
  for (let s = 1; s <= SECTIONS; s++) {
    const n = String(s).padStart(2, '0');
    parts.push(`## Section ${n}`);
    for (let e = 1; e <= 10; e++) parts.push(`Record ${n}.${String(e).padStart(2, '0')}. ${FILLER}`);
    if (s === 3) parts.push('```mermaid\n' + CANVAS_DIAGRAM + '```');
    if (s === 8) parts.push('```mermaid\n' + TALL_DIAGRAM + '```');
    if (s === 11) {
      const rows = ['| Record | Owner | Status |', '| --- | --- | --- |'];
      for (let r = 1; r <= 80; r++) rows.push(`| Record ${String(r).padStart(2, '0')} | Operations desk | Pending review |`);
      parts.push('### Register', rows.join('\n'), `: ${CAPTION}`);
    }
    if (s === 20) parts.push('```mermaid\n' + SMARTART_DIAGRAM + '```');
  }
  parts.push('[^record]: Retain the most recent completed record.');
  return `${parts.join('\n\n')}\n`;
}

const VARIANTS = [
  { name: 'default', env: {} },
  { name: 'a4-landscape-table', env: { MD2NATIVEDOCX_PAGE_SIZE: 'A4', MD2NATIVEDOCX_LANDSCAPE_TABLES: '1' } },
];
/** Word reports sizes in points with float noise; half a point is far below anything a reader sees. */
const SLACK_PT = 0.5;

/** Every problem Word's pagination of one variant shows. */
function problemsOf(variant, m) {
  const problems = [];
  for (const h of m.headings) {
    if (h.nextPage !== null && h.nextPage !== h.page) {
      problems.push(`heading "${h.text}" ends page ${h.page}, the paragraph after it starts page ${h.nextPage}`);
    }
  }
  for (let s = 1; s <= SECTIONS; s++) {
    const title = `Section ${String(s).padStart(2, '0')}`;
    if (!m.headings.some((h) => h.text === title)) problems.push(`heading "${title}" not found`);
  }
  if (m.footnotes !== 1) problems.push(`${m.footnotes} footnote(s), expected 1`);
  if (!m.text.includes(CAPTION)) problems.push('table caption not found');

  const table = m.tables[0];
  if (m.tables.length !== 1) problems.push(`${m.tables.length} table(s), expected 1`);
  if (table) {
    if (table.rows !== 81) problems.push(`table has ${table.rows} rows, expected 81`);
    if (!table.headerRepeats) problems.push('table header row does not repeat on each page');
    if (table.endPage <= table.startPage) problems.push(`table fits on page ${table.startPage}: the fixture no longer spans pages`);
  }

  const drawings = [
    ...m.canvases.map((d) => ({ ...d, kind: 'canvas' })),
    ...m.inlineShapes.map((d) => ({ ...d, kind: `inline shape (type ${d.type})` })),
  ];
  if (m.canvases.length !== 2) problems.push(`${m.canvases.length} canvas(es), expected 2 (branch-merge, tall chain)`);
  if (m.inlineShapes.length !== 1) problems.push(`${m.inlineShapes.length} inline shape(s), expected 1 (SmartArt chain)`);
  for (const d of drawings) {
    const where = `${d.kind} on page ${d.startPage}`;
    if (d.endPage !== d.startPage) problems.push(`${where} ends on page ${d.endPage}`);
    if (d.width > d.usableWidth + SLACK_PT) problems.push(`${where} is ${d.width.toFixed(1)} pt wide, usable ${d.usableWidth.toFixed(1)} pt`);
    if (d.height > d.usableHeight + SLACK_PT) problems.push(`${where} is ${d.height.toFixed(1)} pt high, usable ${d.usableHeight.toFixed(1)} pt`);
  }
  const tallest = Math.max(...m.canvases.map((c) => c.height / c.usableHeight));
  if (!(tallest > 0.5)) problems.push('no canvas reaches half the page height: the tall diagram no longer tests the height cap');

  if (variant.env.MD2NATIVEDOCX_LANDSCAPE_TABLES === '1') {
    const landscape = m.sections.filter((s) => s.landscape);
    if (m.sections.length !== 3 || landscape.length !== 1 || m.sections[1] !== landscape[0]) {
      problems.push(`sections ${m.sections.map((s) => (s.landscape ? 'landscape' : 'portrait')).join(', ')}; expected portrait, landscape, portrait`);
    } else if (table && (table.startPage < landscape[0].startPage || table.endPage > landscape[0].endPage)) {
      problems.push(`table on pages ${table.startPage}-${table.endPage}, landscape section on ${landscape[0].startPage}-${landscape[0].endPage}`);
    }
    const a4 = m.sections.every((s) => Math.abs(Math.min(s.pageWidth, s.pageHeight) - 595.3) < 1);
    if (!a4) problems.push('a section is not A4');
  } else if (m.sections.length !== 1 || m.sections[0].landscape) {
    problems.push(`${m.sections.length} section(s), expected one portrait section`);
  }
  return problems;
}

if (!wordInstalled()) {
  console.log('test:word-pagination skipped: needs Windows with desktop Word.');
  process.exit(0);
}

const keepAt = process.argv.indexOf('--keep');
const keep = keepAt > 0 && process.argv[keepAt + 1] ? resolve(process.argv[keepAt + 1]) : null;
if (keep) mkdirSync(keep, { recursive: true });

const work = mkdtempSync(join(tmpdir(), 'word-pagination-'));
let failed = 0;
try {
  writeFileSync(join(work, 'handbook.md'), handbook());
  for (const variant of VARIANTS) {
    const docx = join(work, `${variant.name}.docx`);
    const pdf = keep ? ['-Pdf', join(keep, `${variant.name}.pdf`)] : [];
    execFileSync(process.execPath, [join(repoRoot, 'packages', 'cli', 'bin', 'md2nativedocx.mjs'), 'handbook.md', '-o', docx], {
      cwd: work,
      stdio: 'pipe',
      env: { ...process.env, ...variant.env },
    });
    const check = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(repoRoot, 'scripts', 'word-pagination-check.ps1'), '-Docx', docx, ...pdf],
      { encoding: 'utf8', timeout: 600_000 },
    );
    if (check.status !== 0) {
      console.error(check.stderr);
      console.error(`test:word-pagination: Word did not finish (${variant.name}).`);
      process.exit(1);
    }
    const measures = JSON.parse(check.stdout);
    if (keep) {
      copyFileSync(docx, join(keep, `${variant.name}.docx`));
      writeFileSync(join(keep, `${variant.name}.json`), `${JSON.stringify({ ...measures, text: undefined }, null, 2)}\n`);
    }
    const problems = problemsOf(variant, measures);
    const table = measures.tables[0];
    const summary = `${measures.pages} pages, table on pages ${table?.startPage}-${table?.endPage}, drawings on pages ${[...measures.canvases, ...measures.inlineShapes].map((d) => d.startPage).sort((a, b) => a - b).join(', ')}`;
    if (problems.length > 0) {
      failed++;
      console.error(`✖ ${variant.name} (${summary})\n    ${problems.join('\n    ')}`);
    } else {
      console.log(`✔ ${variant.name}: ${summary}`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (failed > 0) {
  console.error(`test:word-pagination: ${failed}/${VARIANTS.length} variant(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`test:word-pagination: ${VARIANTS.length} variants paginated by Word with no orphaned heading, a repeating table header and every drawing on one page within its section.`);
}
