import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { buildWorkbookXlsx } from '../src/chartParts.mjs';

/**
 * Native Word charts (ADR 0011): the opt-in pie chart + embedded workbook, end to end through the
 * real CLI (Markdown -> Pandoc -> core bridge -> post-processing). Schema validity of the result is
 * `npm run test:oxml-validate`'s job; this file pins the wiring.
 */

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'bin', 'md2nativedocx.mjs');

function exportPie(extraEnv) {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-chart-test-'));
  const md = join(dir, 'pie.md');
  const out = join(dir, 'pie.docx');
  writeFileSync(md, '# P\n\n```mermaid\npie showData\n  title Pets & <co>\n  "Dogs" : 386\n  "Cats" : 85.5\n```\n');
  const r = spawnSync('node', [cli, md, '-o', out], { encoding: 'utf8', env: { ...process.env, ...extraEnv } });
  return { dir, out, code: r.status, stderr: r.stderr };
}

test('opt-in: MD2NATIVEDOCX_NATIVE_CHARTS=1 produces a chart part, an internal workbook relationship and a real rId', () => {
  const { dir, out, code } = exportPie({ MD2NATIVEDOCX_NATIVE_CHARTS: '1' });
  try {
    assert.equal(code, 0);
    const zip = new AdmZip(out);
    const names = zip.getEntries().map((e) => e.entryName);
    assert.ok(names.includes('word/charts/chart1.xml'));
    assert.ok(names.includes('word/charts/_rels/chart1.xml.rels'));
    assert.ok(names.includes('word/embeddings/Microsoft_Excel_Sheet1.xlsx'));
    const doc = zip.readAsText('word/document.xml');
    assert.doesNotMatch(doc, /CHART_PLACEHOLDER/);
    assert.match(doc, /<c:chart [^>]*r:id="rIdChart1"/);
    assert.match(zip.readAsText('word/_rels/document.xml.rels'), /relationships\/chart" Target="charts\/chart1.xml"/);
    assert.match(zip.readAsText('[Content_Types].xml'), /Extension="xlsx"/);
    const rels = zip.readAsText('word/charts/_rels/chart1.xml.rels');
    assert.match(rels, /relationships\/package/);
    assert.doesNotMatch(rels, /TargetMode/); // rule #3: the workbook is internal
    assert.doesNotMatch(zip.readAsText('word/_rels/document.xml.rels').match(/<Relationship [^>]*charts\/chart1.xml[^>]*>/)?.[0] ?? '', /TargetMode/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('default off: without the variable the pie stays shape-built and no chart part exists', () => {
  const { dir, out, code } = exportPie({});
  try {
    assert.equal(code, 0);
    const names = new AdmZip(out).getEntries().map((e) => e.entryName);
    assert.ok(!names.some((n) => n.startsWith('word/charts/') || n.startsWith('word/embeddings/')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MD2NATIVEDOCX_CHART_WORKBOOK=0 keeps cached values only (no workbook, no externalData)', () => {
  const { dir, out, code } = exportPie({ MD2NATIVEDOCX_NATIVE_CHARTS: '1', MD2NATIVEDOCX_CHART_WORKBOOK: '0' });
  try {
    assert.equal(code, 0);
    const zip = new AdmZip(out);
    assert.ok(zip.getEntry('word/charts/chart1.xml'));
    assert.ok(!zip.getEntry('word/embeddings/Microsoft_Excel_Sheet1.xlsx'));
    assert.doesNotMatch(zip.readAsText('word/charts/chart1.xml'), /externalData/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the workbook builder escapes labels, writes numbers as numbers, and rejects a non-finite value', () => {
  const xlsx = new AdmZip(buildWorkbookXlsx({ sheetName: 'Sheet1', header: ['Category', 'Value'], rows: [['a & <b> "q"', 12.5]] }));
  const sheet = xlsx.readAsText('xl/worksheets/sheet1.xml');
  assert.match(sheet, /a &amp; &lt;b&gt; &quot;q&quot;/);
  assert.match(sheet, /<c r="B2"><v>12.5<\/v><\/c>/);
  assert.throws(() => buildWorkbookXlsx({ sheetName: 'S', header: ['a', 'b'], rows: [['x', Number.NaN]] }), /finite/);
});

test('xychart and radar become native charts too; an unconvertible one falls back to shapes with a warning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-chart-test-'));
  try {
    const md = join(dir, 'c.md');
    const out = join(dir, 'c.docx');
    writeFileSync(
      md,
      [
        '```mermaid\nxychart-beta\n  x-axis [a, b]\n  bar [1, 2]\n  line [2, 1]\n```',
        '```mermaid\nradar-beta\n  axis a["A"], b["B"], c["C"]\n  curve x["X"]{1, 2, 3}\n```',
        '```mermaid\nxychart-beta horizontal\n  x-axis [a, b]\n  bar [1, 2]\n  line [2, 1]\n```',
      ].join('\n\n'),
    );
    const r = spawnSync('node', [cli, md, '-o', out], { encoding: 'utf8', env: { ...process.env, MD2NATIVEDOCX_NATIVE_CHARTS: '1' } });
    assert.equal(r.status, 0);
    assert.match(r.stderr, /native chart not used, drawn as shapes instead: a horizontal xychart with a line series/);
    const zip = new AdmZip(out);
    const charts = zip.getEntries().filter((e) => /^word\/charts\/chart\d+\.xml$/.test(e.entryName));
    assert.equal(charts.length, 2); // the horizontal bar+line one stayed shapes
    const sheet = new AdmZip(zip.getEntry('word/embeddings/Microsoft_Excel_Sheet1.xlsx').getData()).readAsText('xl/worksheets/sheet1.xml');
    assert.match(sheet, /<c r="C2"><v>2<\/v><\/c>/); // second series lands in column C
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the workbook builder writes empty cells for missing values and names columns past Z', () => {
  const header = ['Category', ...Array.from({ length: 27 }, (_, i) => `S${i + 1}`)];
  const rows = [['a', ...Array.from({ length: 27 }, (_, i) => (i === 1 ? undefined : i))]];
  const sheet = new AdmZip(buildWorkbookXlsx({ sheetName: 'Sheet1', header, rows })).readAsText('xl/worksheets/sheet1.xml');
  assert.match(sheet, /<c r="AB1" t="inlineStr">/); // 28th column
  assert.doesNotMatch(sheet, /<c r="C2"/); // the undefined value
  assert.match(sheet, /<c r="B2"><v>0<\/v><\/c>/);
});

test('a type list (MD2NATIVEDOCX_NATIVE_CHARTS=pie) charts the pie but keeps a radar as shapes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-chart-list-'));
  try {
    const md = join(dir, 'c.md');
    const out = join(dir, 'c.docx');
    writeFileSync(md, '```mermaid\npie\n  "A" : 1\n  "B" : 2\n```\n\n```mermaid\nradar-beta\n  axis a, b, c\n  curve x{1, 2, 3}\n```\n');
    const r = spawnSync('node', [cli, md, '-o', out], { encoding: 'utf8', env: { ...process.env, MD2NATIVEDOCX_NATIVE_CHARTS: 'pie' } });
    assert.equal(r.status, 0, r.stderr);
    const listing = execFileSync('unzip', ['-l', out], { encoding: 'utf8' });
    assert.equal((listing.match(/word\/charts\/chart\d+\.xml/g) ?? []).length, 1, 'only the pie becomes a chart');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
