import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const sourceDir = join(root, 'test-corpus', 'source');
const outputDir = join(root, 'test-corpus', 'output');
const corpusDir = join(outputDir, 'corpus');
const simpleDir = join(outputDir, 'simple');
const cli = join(root, 'packages', 'cli', 'bin', 'md2nativedocx.mjs');

/**
 * Create a timestamped output directory for the simple tests, so every run is
 * auditable and repeatable (no throwaway /tmp files). Returns the directory.
 */
function createSimpleOutputDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(simpleDir, stamp);
  mkdirSync(dir, { recursive: true });
  return dir;
}

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
 * .md envelope and the .docx into dir (used by the simple tests, where keeping
 * the input alongside the output is useful for auditing). */
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
  });
}

/** Assert the .docx is a valid ZIP whose document.xml has the schema-required
 * OOXML hierarchy (spec §5.3): w:p -> w:r -> w:drawing -> wp:anchor ->
 * a:graphic -> a:graphicData -> wpc:wpc -> wpg:wgp, with wps:wsp shapes. */
function assertConformantDocx(docxPath, name) {
  // Valid ZIP.
  execFileSync('unzip', ['-t', docxPath], { stdio: 'pipe' });
  const xml = readDocumentXml(docxPath);
  const ctx = `corpus file ${name}.docx`;
  assert.ok(xml.includes('<wpg:wgp'), `${ctx}: missing wpg:wgp`);
  assert.ok(xml.includes('<w:drawing>'), `${ctx}: missing w:drawing`);
  assert.ok(xml.includes('<wp:anchor '), `${ctx}: missing wp:anchor`);
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
  // No external OOXML relationship (rule #3).
  assert.ok(!xml.includes('TargetMode="External"'), `${ctx}: external relationship`);
}

test('corpus: every source diagram regenerates a conformant .docx in output/corpus/', () => {
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
  const dir = createSimpleOutputDir();
  const docx = convertTo('# Titre\n\nUn paragraphe simple.\n\n- item 1\n- item 2\n', dir, 'plain');
  // Valid ZIP.
  execFileSync('unzip', ['-t', docx], { stdio: 'pipe' });
  const xml = readDocumentXml(docx);
  // No mermaid block -> no wpg:wgp.
  assert.ok(!xml.includes('<wpg:wgp'), 'plain markdown must not contain wpg:wgp');
  // The heading and paragraph text must be present.
  assert.ok(xml.includes('Titre'), 'heading text missing');
  assert.ok(xml.includes('Un paragraphe simple'), 'paragraph text missing');
});

test('simple: markdown with a mermaid A --> B produces a conformant docx', () => {
  const dir = createSimpleOutputDir();
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
});
