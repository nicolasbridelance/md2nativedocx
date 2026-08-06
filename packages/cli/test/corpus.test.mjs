import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const sourceDir = join(root, 'test-corpus', 'source');
const outputDir = join(root, 'test-corpus', 'output');
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

/** Convert a diagram to a .docx via the real CLI, writing into outputDir. */
function convert(name, markdown) {
  const mdPath = join(outputDir, `${name}.md`);
  const docxPath = join(outputDir, `${name}.docx`);
  writeFileSync(mdPath, markdown);
  execFileSync('node', [cli, mdPath, '-o', docxPath], { stdio: ['ignore', 'ignore', 'pipe'] });
  return docxPath;
}

/** Assert the .docx is a valid ZIP whose document.xml has the schema-required
 * OOXML hierarchy (spec §5.3): w:p -> w:r -> w:drawing -> wp:inline ->
 * a:graphic -> a:graphicData -> wpg:wgp, with wps:wsp shapes. */
function assertConformantDocx(docxPath, name) {
  // Valid ZIP.
  execFileSync('unzip', ['-t', docxPath], { stdio: 'pipe' });
  const xml = execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], {
    encoding: 'utf8',
  });
  const ctx = `corpus file ${name}.docx`;
  assert.ok(xml.includes('<wpg:wgp'), `${ctx}: missing wpg:wgp`);
  assert.ok(xml.includes('<w:drawing>'), `${ctx}: missing w:drawing`);
  assert.ok(xml.includes('<wp:inline '), `${ctx}: missing wp:inline`);
  assert.ok(xml.includes('<wp:extent '), `${ctx}: missing wp:extent`);
  assert.ok(xml.includes('<wp:docPr '), `${ctx}: missing wp:docPr`);
  assert.ok(xml.includes('<a:graphicData '), `${ctx}: missing a:graphicData`);
  assert.ok(xml.includes('<wps:wsp>'), `${ctx}: missing wps:wsp shapes`);
  // The wpg:wgp must be nested inside a:graphicData, not a bare child of body.
  const wgp = xml.indexOf('<wpg:wgp');
  const graphicData = xml.indexOf('<a:graphicData ');
  assert.ok(wgp > graphicData, `${ctx}: wpg:wgp must be nested inside a:graphicData`);
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

test('corpus: every source diagram regenerates a conformant .docx in output/', () => {
  const files = readdirSync(sourceDir).filter((f) => f.endsWith('.mmd') || f.endsWith('.md'));
  assert.ok(files.length > 0, 'no corpus sources found');
  mkdirSync(outputDir, { recursive: true });
  for (const file of files) {
    const diagram = extractDiagram(join(sourceDir, file));
    const name = basename(file, '.mmd').replace(/\.md$/, '');
    const docx = convert(name, wrapMarkdown(diagram));
    assertConformantDocx(docx, name);
  }
});
