#!/usr/bin/env node
/**
 * Corpus generator: source Mermaid diagrams -> .docx files.
 *
 * Reads every diagram source under `test-corpus/corpus/source/`, wraps it in a
 * minimal Markdown document with a ```mermaid block, and converts it to a
 * .docx in `test-corpus/corpus/generated/` using the md2nativedocx CLI.
 *
 * This is the corpus for human validation in Word (spec §9) and for the future
 * test:visual pipeline (LibreOffice-headless render + pixel-diff).
 *
 * Sources come from the official Mermaid repository (mermaid-js/mermaid) and
 * documentation — NOT authored by this project, so they exercise real-world
 * syntax rather than what we'd write ourselves.
 *
 * Usage: node scripts/generate-corpus.mjs [--only name.mmd]
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const sourceDir = join(root, 'test-corpus', 'corpus', 'source');
const outputDir = join(root, 'test-corpus', 'corpus', 'generated');
const cli = join(root, 'packages', 'cli', 'bin', 'md2nativedocx.mjs');

const only = process.argv.indexOf('--only') >= 0 ? process.argv[process.argv.indexOf('--only') + 1] : null;

mkdirSync(outputDir, { recursive: true });

/** Extract the Mermaid diagram text from a source file (strip YAML frontmatter). */
function extractDiagram(filePath) {
  let text = readFileSync(filePath, 'utf8');
  // Strip YAML frontmatter (--- ... ---) at the top, common in Mermaid docs.
  text = text.replace(/^---[\s\S]*?---\s*\n/, '');
  return text.trim();
}

/** Wrap a diagram in a minimal Markdown document with a ```mermaid block. */
function wrapMarkdown(diagram) {
  return `# ${'Diagramme de test'}\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n`;
}

/** Build the Markdown document to convert for a given source file. `.mmd`
 * sources are bare diagrams, wrapped in a minimal envelope; `.md` sources are
 * already complete documents (rich text + embedded mermaid blocks) and are
 * used as-is. */
function toMarkdown(file, diagram) {
  return file.endsWith('.md') ? diagram : wrapMarkdown(diagram);
}

function convert(name, markdown) {
  // The .md envelope is a transient input to the CLI, derived from the .mmd
  // source. Write it to a temp dir (not persisted) so corpus/generated/ only
  // contains the .docx artifacts.
  const mdPath = join(tmpdir(), `${name}.md`);
  const docxPath = join(outputDir, `${name}.docx`);
  writeFileSync(mdPath, markdown);
  try {
    execFileSync('node', [cli, mdPath, '-o', docxPath], { stdio: ['ignore', 'ignore', 'pipe'] });
    return { ok: true, docx: docxPath };
  } catch (err) {
    return { ok: false, error: err.stderr?.toString() ?? String(err) };
  }
}

const files = readdirSync(sourceDir).filter((f) => f.endsWith('.mmd') || f.endsWith('.md'));
const results = { ok: [], failed: [] };

for (const file of files) {
  if (only && !file.includes(only)) continue;
  const diagram = extractDiagram(join(sourceDir, file));
  const name = basename(file, '.mmd').replace(/\.md$/, '');
  const res = convert(name, toMarkdown(file, diagram));
  if (res.ok) {
    results.ok.push(name);
    console.log(`✅ ${name}.docx (${diagram.length} chars)`);
  } else {
    results.failed.push({ name, error: res.error });
    console.log(`❌ ${name}: ${res.error?.split('\n')[0] ?? 'failed'}`);
  }
}

console.log(`\n=== Résultat: ${results.ok.length} OK, ${results.failed.length} échecs ===`);
if (results.failed.length > 0) {
  console.log('\nÉchecs (pour information — le corpus de validation humaine doit montrer ce qui passe ET ce qui ne passe pas):');
  for (const f of results.failed) console.log(`  - ${f.name}`);
}
