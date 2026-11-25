#!/usr/bin/env node
/**
 * Connector persistence check in real Word, the `.docx` counterpart of test:odf-connectors. Every
 * flowchart of the visual corpus is converted by the real CLI (SmartArt off, so each one is shapes and
 * connectors) into one `.docx`; `scripts/word-connector-check.ps1` then has desktop Word save three
 * copies: nothing moved, the shape each connector starts from moved, and that copy reopened with the
 * shape each connector ends on moved. Comparing what Word wrote shows, for every connector:
 *   - Word keeps its attachment to both shapes when it saves the document (`stCxn`/`endCxn`);
 *   - Word redraws it when either shape moves, before and after a save and reopen;
 *   - Word, reopening its own save, still reports it attached at both ends.
 * A static render (test:visual) or the schema validator cannot show any of this.
 *
 * Requires Windows with desktop Word; skips with exit 0 otherwise, same convention as test:visual.
 * Manual, not in CI (no Word on the runners).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdmZip, readZipEntry } from '../packages/cli/src/zipUtils.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function wordInstalled() {
  if (process.platform !== 'win32') return false;
  // Word.Application is registered as a COM class by every desktop Word install.
  return spawnSync('reg', ['query', 'HKCR\\Word.Application\\CLSID'], { stdio: 'pipe' }).status === 0;
}

/**
 * The shapes of each drawing canvas of a `.docx`, read with patterns rather than an XML parser: the
 * input is this project's output or Word's re-save of it, and only a few attributes are needed.
 * @returns {Array<Map<string, { geometry: string, freeform: boolean, start?: string, end?: string }>>} per canvas, by shape id
 */
function canvasShapes(docxPath) {
  const xml = readZipEntry(new AdmZip(docxPath), 'word/document.xml');
  return xml
    .split('<wpc:wpc')
    .slice(1)
    .map((canvas) => {
      const shapes = new Map();
      for (const [shape] of canvas.split('</wpc:wpc>')[0].matchAll(/<wps:wsp>[\s\S]*?<\/wps:wsp>/g)) {
        const id = /<wps:cNvPr id="(\d+)"/.exec(shape)?.[1];
        const xfrm = /<a:xfrm([^>]*)>\s*<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>\s*<a:ext cx="(\d+)" cy="(\d+)"/.exec(shape);
        if (id === undefined || xfrm === null) continue;
        const flips = [...xfrm[1].matchAll(/flip([HV])="(?:1|true)"/g)].map((m) => m[1]).join('');
        const start = /<a:stCxn id="(\d+)" idx="(\d+)"/.exec(shape);
        const end = /<a:endCxn id="(\d+)" idx="(\d+)"/.exec(shape);
        shapes.set(id, {
          geometry: `${xfrm[2]},${xfrm[3]},${xfrm[4]},${xfrm[5]},${flips}`,
          freeform: shape.includes('<a:custGeom>'),
          ...(start ? { start: `${start[1]}:${start[2]}` } : {}),
          ...(end ? { end: `${end[1]}:${end[2]}` } : {}),
        });
      }
      return shapes;
    });
}

const connectorsOf = (shapes) => [...shapes].filter(([, s]) => s.start !== undefined && s.end !== undefined);
/**
 * Detours drawn as a free-form path, the fallback when no elbow route stays clear of the nodes: Word
 * loads them as plain shapes and drops their attachments (`translator/elbow-connector.ts`). Counted and
 * reported, not failed: that is the documented limit of the fallback, not a regression.
 */
const freeformOf = (shapes) => connectorsOf(shapes).filter(([, s]) => s.freeform);
const shapeId = (cxn) => cxn.split(':')[0];

/** Problems found between two saves of one canvas, after Word moved the `side` shape of each connector. */
function compare(before, after, side, pass) {
  const problems = [];
  for (const [id, connector] of connectorsOf(before)) {
    if (connector.freeform) continue;
    const now = after.get(id);
    if (now?.start !== connector.start || now?.end !== connector.end) {
      problems.push(`${pass}: connector ${id} attachments ${connector.start}→${connector.end} became ${now?.start}→${now?.end}`);
      continue;
    }
    if (side === null) continue;
    const moved = shapeId(side === 'start' ? connector.start : connector.end);
    if (before.get(moved)?.geometry === after.get(moved)?.geometry) {
      problems.push(`${pass}: shape ${moved} did not move, connector ${id} not measured`);
    } else if (now.geometry === connector.geometry) {
      problems.push(`${pass}: connector ${id} did not follow shape ${moved}`);
    }
  }
  return problems;
}

if (!wordInstalled()) {
  console.log('test:word-connectors skipped: needs Windows with desktop Word.');
  process.exit(0);
}

const fixturesDir = join(repoRoot, 'test-corpus', 'visual', 'fixtures');
const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.mmd'))
  .sort()
  .map((f) => ({ f, src: readFileSync(join(fixturesDir, f), 'utf8') }))
  .filter(({ src }) => /^\s*(graph|flowchart)\b/.test(src.split('\n').find((l) => l.trim() && !l.trim().startsWith('%%')) ?? ''));
const markdown = fixtures.map(({ f, src }) => `## ${f}\n\n\`\`\`mermaid\n${src.endsWith('\n') ? src : `${src}\n`}\`\`\`\n`).join('\n');

const work = mkdtempSync(join(tmpdir(), 'word-connectors-'));
const file = (name) => join(work, name);
try {
  writeFileSync(file('corpus.md'), markdown);
  execFileSync(process.execPath, [join(repoRoot, 'packages', 'cli', 'bin', 'md2nativedocx.mjs'), 'corpus.md', '-o', 'corpus.docx'], {
    cwd: work,
    stdio: 'pipe',
    env: { ...process.env, MD2NATIVEDOCX_ENABLE_SMARTART: '0' },
  });
  const check = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(repoRoot, 'scripts', 'word-connector-check.ps1'),
      '-Docx', file('corpus.docx'), '-Still', file('still.docx'), '-Moved', file('moved.docx'), '-Again', file('again.docx')],
    { encoding: 'utf8', timeout: 600_000 },
  );
  if (check.status !== 0) {
    console.error(check.stderr);
    console.error('test:word-connectors: Word did not finish.');
    process.exit(1);
  }
  const reopened = check.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const [original, still, moved, again] = ['corpus', 'still', 'moved', 'again'].map((n) => canvasShapes(file(`${n}.docx`)));

  let failed = 0;
  let connectors = 0;
  let freeform = 0;
  const counts = [original, still, moved, again, reopened].map((list) => list.length);
  if (counts.some((n) => n !== fixtures.length)) {
    console.error(`✖ expected ${fixtures.length} drawing canvases, found ${counts.join(' / ')} (generated / still / moved / again / reopened).`);
    failed++;
  } else {
    fixtures.forEach(({ f }, i) => {
      const problems = [
        ...compare(original[i], still[i], null, 'save'),
        ...compare(still[i], moved[i], 'start', 'move start'),
        ...compare(moved[i], again[i], 'end', 'reopen, move end'),
      ];
      const count = connectorsOf(original[i]).length - freeformOf(original[i]).length;
      connectors += count;
      freeform += freeformOf(original[i]).length;
      if (reopened[i].connectors !== count || reopened[i].attached !== count) {
        problems.push(`reopen: Word sees ${reopened[i].attached}/${reopened[i].connectors} connectors attached, ${count} generated`);
      }
      if (problems.length > 0) {
        failed++;
        console.error(`✖ ${f}\n    ${problems.join('\n    ')}`);
      }
    });
  }
  if (failed > 0) {
    console.error(`test:word-connectors: ${failed}/${fixtures.length} diagram(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(
      `test:word-connectors: ${fixtures.length} diagrams, ${connectors} connectors kept attached by Word's save and redrawn when either shape moves, before and after reopening.`,
    );
  }
  if (freeform > 0) {
    console.log(`  plus ${freeform} free-form detour(s), which Word loads as plain shapes, detached: the known limit of that fallback (translator/elbow-connector.ts).`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
