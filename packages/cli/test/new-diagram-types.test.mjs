import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pipeline-integration coverage (TESTING.md chapter 2) for the three
 * non-flowchart diagram types shipped 2026-09-04 (quadrantChart, venn-beta,
 * mindmap) — exercises the real CLI end to end (Markdown -> Pandoc -> Lua
 * filter -> core -> .docx), not just packages/core's parser/translator
 * functions in isolation. Each had unit coverage from day one; this file
 * closes the gap noticed during the handover audit: nothing above the unit
 * level had ever run these three types through the actual pipeline.
 */

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'bin', 'md2nativedocx.mjs');

function runCli(args, opts = {}) {
  const result = spawnSync('node', [cli, ...args], { encoding: 'utf8', ...opts });
  return { code: result.status, out: result.stdout ?? '', err: result.stderr ?? '' };
}

function readDocumentXml(docxPath) {
  return execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], { encoding: 'utf8' });
}

/** Same conformance shape as corpus.test.mjs's assertConformantDocx, kept
 * local rather than imported cross-file (matches this file's own existing
 * convention of small self-contained helpers, e.g. cli.test.mjs). */
function assertConformantDocx(docxPath, label) {
  execFileSync('unzip', ['-t', docxPath], { stdio: 'pipe' });
  const xml = readDocumentXml(docxPath);
  assert.ok(xml.includes('<w:drawing>'), `${label}: missing w:drawing`);
  assert.ok(xml.includes('<wp:inline '), `${label}: missing wp:inline`);
  assert.ok(!xml.includes('<wp:anchor '), `${label}: drawing must not be anchored`);
  assert.ok(xml.includes('<wpc:wpc '), `${label}: missing wpc:wpc canvas`);
  assert.ok(xml.includes('<wps:wsp>'), `${label}: missing wps:wsp shapes`);
  return xml;
}

function exportFixture(name, mermaidSource) {
  const dir = mkdtempSync(join(tmpdir(), `md2nativedocx-${name}-`));
  const md = join(dir, 'doc.md');
  const docx = join(dir, 'doc.docx');
  writeFileSync(md, `# T\n\n\`\`\`mermaid\n${mermaidSource}\`\`\`\n`);
  const result = runCli([md, '-o', docx]);
  return { dir, md, docx, ...result };
}

const QUADRANT = `quadrantChart
  title Reach and engagement
  x-axis Low --> High
  y-axis Low --> High
  quadrant-1 Expand
  quadrant-2 Promote
  quadrant-3 Re-evaluate
  quadrant-4 Improve
  Campaign A: [0.3, 0.6]
`;

const VENN = `venn-beta
  set A
  set B
  union A,B
    text ["Overlap"]
`;

const MINDMAP = `mindmap
  root((Central))
    [Branch A]
      Leaf 1
    Branch B
`;

test('cli exports a quadrantChart end to end, no warnings on clean input', () => {
  const { code, out, err, docx, dir } = exportFixture('quadrant', QUADRANT);
  try {
    assert.equal(code, 0, err || out);
    assert.ok(existsSync(docx));
    assert.ok(!out.includes('Warnings:'), 'no summary line expected on a clean export');
    const xml = assertConformantDocx(docx, 'quadrant');
    assert.ok(xml.includes('Expand'));
    assert.ok(xml.includes('Campaign A'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli exports a venn-beta diagram end to end, no warnings on clean input', () => {
  const { code, out, err, docx, dir } = exportFixture('venn', VENN);
  try {
    assert.equal(code, 0, err || out);
    assert.ok(existsSync(docx));
    assert.ok(!out.includes('Warnings:'), 'no summary line expected on a clean export');
    const xml = assertConformantDocx(docx, 'venn');
    assert.ok(xml.includes('Overlap'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli exports a mindmap end to end, no warnings on clean input', () => {
  const { code, out, err, docx, dir } = exportFixture('mindmap', MINDMAP);
  try {
    assert.equal(code, 0, err || out);
    assert.ok(existsSync(docx));
    assert.ok(!out.includes('Warnings:'), 'no summary line expected on a clean export');
    const xml = assertConformantDocx(docx, 'mindmap');
    assert.ok(xml.includes('Central'));
    assert.ok(xml.includes('Branch A'));
    // A mindmap's branch lines are drawn as wps:wsp + wps:cNvCnPr connectors
    // (real bug found+fixed 2026-09-04: wps:cxnSp silently doesn't render
    // under LibreOffice in this canvas) -- locked here so a regression back
    // to that element would fail the pipeline test, not just a unit test.
    assert.ok(xml.includes('<wps:cNvCnPr'), 'mindmap must draw real connector shapes');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli surfaces a quadrantChart parser warning through stdout/.log, same mechanism as flowchart (spec §10)', () => {
  const { code, out, dir } = exportFixture('quadrant-warn', 'quadrantChart\n  this is not a valid statement\n');
  try {
    assert.equal(code, 0, out);
    assert.match(out, /^Warnings: 1 \(see doc\.log\)$/m);
    const log = readFileSync(join(dir, 'doc.log'), 'utf8');
    assert.match(log, /Unsupported line ignored/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a recognized-but-unimplemented type (e.g. sequenceDiagram) still gets the guard-rail note, not a quadrant/venn/mindmap misparse', () => {
  const { code, out, docx, dir } = exportFixture('sequence', 'sequenceDiagram\n  Alice->>Bob: Hi\n');
  try {
    assert.equal(code, 0, out);
    const xml = readDocumentXml(docx);
    assert.ok(xml.includes('not yet supported'));
    assert.ok(!xml.includes('<wpc:wpc'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
