#!/usr/bin/env node
/**
 * Clean-room verification for the 3 packages published to npm (core,
 * pandoc-filter, cli): `npm pack` each one, install the tarballs into a
 * fresh directory *outside* this workspace (no symlinks, no hoisting this
 * repo's own node_modules could paper over), and run the real installed
 * `md2nativedocx` binary end to end.
 *
 * Exists because a real `npm install -g @md2nativedocx/cli` lays out
 * node_modules differently from both this monorepo's dev workspace and the
 * VS Code extension's vendored bundle — bin/md2nativedocx.mjs used to guess
 * that layout with two hardcoded relative-path candidates that covered
 * neither case, found only by actually doing this by hand (2026-09-08, see
 * TODO.md). Fixed with import.meta.resolve(), and this script is what keeps
 * that fix honest on every future change to the package boundaries.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const packages = ['core', 'pandoc-filter', 'cli'].map((name) => join(root, 'packages', name));

console.log('verify-npm-packages: building packages/core...');
execFileSync('npm', ['run', 'build', '--workspace=@md2nativedocx/core'], { cwd: root, stdio: 'inherit' });

const workDir = mkdtempSync(join(tmpdir(), 'md2nativedocx-npm-verify-'));
const tarballDir = join(workDir, 'tarballs');
const cleanroomDir = join(workDir, 'cleanroom');
mkdirSync(tarballDir, { recursive: true });
mkdirSync(cleanroomDir, { recursive: true });

try {
  console.log('verify-npm-packages: npm pack (core, pandoc-filter, cli)...');
  const tarballs = packages.map((pkgDir) => {
    const out = execFileSync('npm', ['pack', '--pack-destination', tarballDir, '--json'], { cwd: pkgDir, encoding: 'utf8' });
    const [{ filename }] = JSON.parse(out);
    return join(tarballDir, filename);
  });

  console.log('verify-npm-packages: installing the tarballs into a clean, out-of-workspace directory...');
  writeFileSync(join(cleanroomDir, 'package.json'), '{"name":"cleanroom","private":true}\n');
  execFileSync('npm', ['install', '--no-audit', '--no-fund', ...tarballs], { cwd: cleanroomDir, stdio: 'inherit' });

  console.log('verify-npm-packages: running the installed CLI end to end...');
  const mdPath = join(cleanroomDir, 'smoke.md');
  const docxPath = join(cleanroomDir, 'smoke.docx');
  writeFileSync(mdPath, '# Smoke\n\n```mermaid\ngraph TD\n  A --> B --> C\n```\n');
  execFileSync(join(cleanroomDir, 'node_modules', '.bin', 'md2nativedocx'), [mdPath, '-o', docxPath], {
    cwd: cleanroomDir,
    stdio: 'inherit',
  });

  // Confirms the diagram actually rendered (a broken filter/core-bridge
  // resolution fails *inside* Pandoc — the CLI can still exit 0 with a
  // .docx that silently kept the raw ```mermaid text instead of a drawing).
  const AdmZip = (await import('adm-zip')).default;
  const documentXml = new AdmZip(docxPath).readFile('word/document.xml').toString('utf8');
  if (!documentXml.includes('<w:drawing>')) {
    throw new Error('The installed CLI produced a .docx with no <w:drawing> — the diagram was not rendered.');
  }

  console.log('verify-npm-packages: OK — the installed CLI renders a real diagram end to end.');
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
