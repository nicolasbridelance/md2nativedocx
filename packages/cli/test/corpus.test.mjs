import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const sourceDir = join(root, 'test-corpus', 'corpus', 'source');
const corpusDir = join(root, 'test-corpus', 'corpus', 'generated');
const cli = join(root, 'packages', 'cli', 'bin', 'md2nativedocx.mjs');

/** Extract the Mermaid diagram text from a source file (strip YAML frontmatter). */
function extractDiagram(filePath) {
  let text = readFileSync(filePath, 'utf8');
  text = text.replace(/^---[\s\S]*?---\s*\n/, '');
  return text.trim();
}

/** Wrap a diagram in a minimal Markdown document with a ```mermaid block. */
function wrapMarkdown(diagram) {
  return `# ${'Diagramme de test'}\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n`;
}

/** Convert a markdown string to a .docx via the real CLI, writing both the
 * .md envelope and the .docx into dir (an ephemeral temp dir for the simple
 * tests — the assertions below are on the generated XML, not something a
 * human needs to revisit later, so nothing here is meant to persist). */
function convertTo(markdown, dir, name) {
  const mdPath = join(dir, `${name}.md`);
  const docxPath = join(dir, `${name}.docx`);
  writeFileSync(mdPath, markdown);
  execFileSync('node', [cli, mdPath, '-o', docxPath], { stdio: ['ignore', 'ignore', 'pipe'] });
  return docxPath;
}

/** Convert a diagram to a .docx via the real CLI. The .md envelope is a
 * transient input derived from the .mmd source, so it is written to a temp dir
 * (not persisted); only the .docx artifact is kept in corpusDir. */
function convert(name, markdown) {
  const mdPath = join(tmpdir(), `${name}.md`);
  const docxPath = join(corpusDir, `${name}.docx`);
  writeFileSync(mdPath, markdown);
  execFileSync('node', [cli, mdPath, '-o', docxPath], { stdio: ['ignore', 'ignore', 'pipe'] });
  return docxPath;
}

/** Read word/document.xml from a .docx. */
function readDocumentXml(docxPath) {
  return execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], {
    encoding: 'utf8',
    // The large corpus diagrams produce a document.xml well past execFileSync's
    // 1 MB default, which fails with ENOBUFS rather than a useful assertion.
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Assert the .docx is a valid ZIP whose document.xml has the schema-required
 * OOXML hierarchy (spec §5.3): w:p -> w:r -> w:drawing -> wp:inline ->
 * a:graphic -> a:graphicData -> wpc:wpc -> wpg:wgp, with wps:wsp shapes. */
function assertConformantDocx(docxPath, name) {
  // Valid ZIP.
  execFileSync('unzip', ['-t', docxPath], { stdio: 'pipe' });
  const xml = readDocumentXml(docxPath);
  const ctx = `corpus file ${name}.docx`;
  assert.ok(xml.includes('<wpg:wgp'), `${ctx}: missing wpg:wgp`);
  assert.ok(xml.includes('<w:drawing>'), `${ctx}: missing w:drawing`);
  // Inline, not anchored: the diagram flows with the text (spec §5.3).
  assert.ok(xml.includes('<wp:inline '), `${ctx}: missing wp:inline`);
  assert.ok(!xml.includes('<wp:anchor '), `${ctx}: drawing must not be anchored`);
  assert.ok(xml.includes('<wp:extent '), `${ctx}: missing wp:extent`);
  assert.ok(xml.includes('<wp:docPr '), `${ctx}: missing wp:docPr`);
  assert.ok(xml.includes('<a:graphicData '), `${ctx}: missing a:graphicData`);
  assert.ok(xml.includes('<wpc:wpc '), `${ctx}: missing wpc:wpc canvas`);
  assert.ok(xml.includes('<wps:wsp>'), `${ctx}: missing wps:wsp shapes`);
  // The wpg:wgp must be nested inside wpc:wpc, not a bare child of body.
  const wgp = xml.indexOf('<wpg:wgp');
  const wpc = xml.indexOf('<wpc:wpc ');
  assert.ok(wgp > wpc, `${ctx}: wpg:wgp must be nested inside wpc:wpc`);
  // Every wps:wsp must have a wps:cNvPr with id and name (MS-OE376).
  const cNvPrs = xml.match(/<wps:cNvPr [^>]*>/g) ?? [];
  assert.ok(cNvPrs.length > 0, `${ctx}: no wps:cNvPr found`);
  for (const c of cNvPrs) {
    assert.ok(/ id="\d+"/.test(c), `${ctx}: cNvPr missing id: ${c}`);
    assert.ok(/ name="/.test(c), `${ctx}: cNvPr missing name: ${c}`);
  }

  // The extended namespaces must be declared on the document ROOT, the way Word
  // itself emits them — the post-processing that adds them was a silent no-op
  // for a while because it searched the whole document instead of the root tag.
  const root = xml.slice(xml.indexOf('<w:document'), xml.indexOf('>', xml.indexOf('<w:document')) + 1);
  for (const prefix of ['wpc', 'wpg', 'wps']) {
    assert.ok(root.includes(`xmlns:${prefix}=`), `${ctx}: root missing xmlns:${prefix}`);
  }

  // Word treats every drawing id as one id space per document and reports the
  // file as corrupt on a collision.
  const ids = [...xml.matchAll(/<(?:wp:docPr|wpg:cNvPr|wps:cNvPr|pic:cNvPr)\s+id="(\d+)"/g)].map(
    (m) => m[1],
  );
  assert.equal(new Set(ids).size, ids.length, `${ctx}: duplicate drawing ids`);

  // Connectors must stay attached to shapes declared in their own drawing.
  for (const block of xml.match(/<w:drawing>[\s\S]*?<\/w:drawing>/g) ?? []) {
    const defined = new Set([...block.matchAll(/<wps:cNvPr\s+id="(\d+)"/g)].map((m) => m[1]));
    for (const [, ref] of block.matchAll(/<a:(?:stCxn|endCxn)\s+id="(\d+)"/g)) {
      assert.ok(defined.has(ref), `${ctx}: connector references undeclared shape id ${ref}`);
    }
  }

  // A drawing wider or taller than the usable page area is clipped by Word.
  for (const [, cx, cy] of xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)) {
    assert.ok(Number(cx) <= 5943600, `${ctx}: extent cx ${cx} exceeds the usable page width`);
    assert.ok(Number(cy) <= 8229600, `${ctx}: extent cy ${cy} exceeds the usable page height`);
  }

  // No external OOXML relationship (rule #3).
  assert.ok(!xml.includes('TargetMode="External"'), `${ctx}: external relationship`);
}

test('corpus: every source diagram regenerates a conformant .docx in corpus/generated/', () => {
  const files = readdirSync(sourceDir).filter((f) => f.endsWith('.mmd') || f.endsWith('.md'));
  assert.ok(files.length > 0, 'no corpus sources found');
  mkdirSync(corpusDir, { recursive: true });
  for (const file of files) {
    const diagram = extractDiagram(join(sourceDir, file));
    const name = basename(file, '.mmd').replace(/\.md$/, '');
    const docx = convert(name, wrapMarkdown(diagram));
    assertConformantDocx(docx, name);
  }
});

test('simple: markdown without mermaid produces a valid docx with no wpg:wgp', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-corpus-simple-'));
  try {
    const docx = convertTo('# Titre\n\nUn paragraphe simple.\n\n- item 1\n- item 2\n', dir, 'plain');
    // Valid ZIP.
    execFileSync('unzip', ['-t', docx], { stdio: 'pipe' });
    const xml = readDocumentXml(docx);
    // No mermaid block -> no wpg:wgp.
    assert.ok(!xml.includes('<wpg:wgp'), 'plain markdown must not contain wpg:wgp');
    // The heading and paragraph text must be present.
    assert.ok(xml.includes('Titre'), 'heading text missing');
    assert.ok(xml.includes('Un paragraphe simple'), 'paragraph text missing');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('simple: markdown with a mermaid A --> B produces a conformant docx', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-corpus-simple-'));
  try {
    const docx = convertTo('# Test\n\n```mermaid\ngraph TD\n  A --> B\n```\n', dir, 'ab');
    assertConformantDocx(docx, 'ab');
    const xml = readDocumentXml(docx);
    // Exactly one wpg:wgp group.
    assert.equal((xml.match(/<wpg:wgp/g) ?? []).length, 1, 'expected exactly one wpg:wgp');
    // Two node shapes (A, B) + one connector.
    assert.equal((xml.match(/<wps:cNvSpPr\/?>/g) ?? []).length, 2, 'expected 2 node shapes');
    assert.equal((xml.match(/<wps:cNvCnPr>/g) ?? []).length, 1, 'expected 1 connector');
    // The diagram must fit on a page: wp:extent within a reasonable size
    // (A4 usable width ~ 6.5in = 5943600 EMU; height ~ 9in = 8229600 EMU).
    const extent = xml.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
    assert.ok(extent, 'missing wp:extent');
    const cx = Number(extent[1]);
    const cy = Number(extent[2]);
    assert.ok(cx > 0 && cx < 5943600, `diagram width ${cx} EMU exceeds page width`);
    assert.ok(cy > 0 && cy < 8229600, `diagram height ${cy} EMU exceeds page height`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
