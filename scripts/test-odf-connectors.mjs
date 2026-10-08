#!/usr/bin/env node
/**
 * Connector attachment check of the `.odt` output (ADR 0013, spec 05 §6 end criterion): every flowchart
 * of the visual corpus is converted by the real CLI into one `.odt`, then
 * `scripts/odf-connector-check.py` opens it in headless LibreOffice through UNO and checks that every
 * connector is bound to both its shapes, and still on its glue point after a shape is moved. A static
 * render (test:visual) cannot show either.
 *
 * Requires LibreOffice and the system Python with `uno` (`python3-uno`); skips with exit 0 when either is
 * missing, same convention as test:visual.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const python = process.env.MD2NATIVEDOCX_UNO_PYTHON ?? '/usr/bin/python3';

function available(command, args) {
  return spawnSync(command, args, { stdio: 'pipe' }).status === 0;
}

if (!available('soffice', ['--version'])) {
  console.log('test:odf-connectors skipped: LibreOffice (soffice) not found on PATH.');
  process.exit(0);
}
if (!available(python, ['-c', 'import uno'])) {
  console.log(`test:odf-connectors skipped: ${python} cannot import uno (install python3-uno).`);
  process.exit(0);
}

const fixturesDir = join(repoRoot, 'test-corpus', 'visual', 'fixtures');
const markdown = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.mmd'))
  .sort()
  .map((f) => ({ f, src: readFileSync(join(fixturesDir, f), 'utf8') }))
  .filter(({ src }) => /^\s*(graph|flowchart)\b/.test(src.split('\n').find((l) => l.trim() && !l.trim().startsWith('%%')) ?? ''))
  .map(({ f, src }) => `## ${f}\n\n\`\`\`mermaid\n${src.endsWith('\n') ? src : `${src}\n`}\`\`\`\n`)
  .join('\n');

const work = mkdtempSync(join(tmpdir(), 'odf-connectors-'));
try {
  writeFileSync(join(work, 'corpus.md'), markdown);
  execFileSync(process.execPath, [join(repoRoot, 'packages', 'cli', 'bin', 'md2nativedocx.mjs'), 'corpus.md', '-o', 'corpus.odt'], {
    cwd: work,
    stdio: 'pipe',
  });
  const check = spawnSync(python, [join(repoRoot, 'scripts', 'odf-connector-check.py'), join(work, 'corpus.odt')], {
    encoding: 'utf8',
    timeout: 300_000,
  });
  const rows = (check.stdout ?? '').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const failed = rows.filter((row) => !row.ok);
  for (const row of failed) console.error(`✖ ${row.group}: ${JSON.stringify(row)}`);
  const connectors = rows.reduce((sum, row) => sum + row.connectors, 0);
  if (check.status !== 0 || rows.length === 0 || failed.length > 0) {
    if (rows.length === 0) console.error(check.stderr);
    console.error(`test:odf-connectors: ${failed.length}/${rows.length} diagram(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`test:odf-connectors: ${rows.length} diagrams, ${connectors} connectors attached and following a moved shape.`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
