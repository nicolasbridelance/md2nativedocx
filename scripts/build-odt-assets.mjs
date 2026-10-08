#!/usr/bin/env node
/**
 * Build the two files the CLI hands Pandoc for a `.odt` (ADR 0013, AGENTS.md rule 7):
 *
 * - `packages/cli/assets/reference.odt`, from the hand-written parts in
 *   `packages/cli/reference-odt-src/` (CC0, written by this project, never Pandoc's own reference.odt,
 *   which is GPL-2+). Its `styles.xml` carries the arrow markers and dash pattern the diagram styles
 *   refer to (`ODF_GRAPHIC_DEFINITIONS` in `@md2nativedocx/core`, checked by the CLI tests).
 * - `packages/cli/assets/md2nativedocx.opendocument`, Pandoc's `opendocument` template with one
 *   variable added inside `office:automatic-styles`, which the Lua filter fills with the diagram
 *   styles. Pandoc's templates are dual-licensed GPL-2+ or BSD-3-Clause; this derived one ships under
 *   BSD-3-Clause with Pandoc's notice (packages/cli/THIRD_PARTY_NOTICES.md). Derived from the Pandoc
 *   version the project pins (3.1.3); refused with any other.
 *
 *   node scripts/build-odt-assets.mjs
 *
 * Reproducible: fixed timestamps, `mimetype` first and stored, as the ODF packaging rules require.
 */

import AdmZip from 'adm-zip';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'packages', 'cli');
const srcDir = join(cli, 'reference-odt-src');
const referenceOut = join(cli, 'assets', 'reference.odt');
const templateOut = join(cli, 'assets', 'md2nativedocx.opendocument');

const PANDOC_VERSION = '3.1.3';
const FIXED_DATE = new Date('2026-10-08T00:00:00Z');

/** The line of Pandoc's template after which the diagram styles go. */
const ANCHOR = '    $automatic-styles$\n';
const ADDED = '$for(md2n-automatic-styles)$\n    $md2n-automatic-styles$\n$endfor$\n';
const HEADER = [
  '$-- md2nativedocx: Pandoc\'s opendocument template (Pandoc 3.1.3), with one addition: the',
  '$-- md2n-automatic-styles loop in office:automatic-styles, filled by the md2nativedocx Lua filter.',
  '$-- Copyright (c) 2014-2023, John MacFarlane. BSD-3-Clause, see THIRD_PARTY_NOTICES.md.',
  '',
].join('\n');

/** The derived template text, from Pandoc's own (exported so the CLI tests can compare). */
export function deriveTemplate(pandocTemplate) {
  const at = pandocTemplate.indexOf(ANCHOR);
  if (at < 0 || pandocTemplate.indexOf(ANCHOR, at + 1) >= 0) {
    throw new Error('Pandoc template layout changed: the $automatic-styles$ line is not found exactly once');
  }
  const end = at + ANCHOR.length;
  return HEADER + pandocTemplate.slice(0, end) + ADDED + pandocTemplate.slice(end);
}

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** The `reference.odt` bytes, built from `reference-odt-src/` (exported for the CLI tests). */
export function referenceOdtBuffer() {
  const parts = listFiles(srcDir)
    .map((path) => relative(srcDir, path).split(sep).join('/'))
    .sort((a, b) => (a === 'mimetype' ? -1 : b === 'mimetype' ? 1 : a.localeCompare(b)));
  // noSort: AdmZip otherwise writes the entries alphabetically, which would move mimetype off first place.
  const zip = new AdmZip({ noSort: true });
  for (const part of parts) {
    zip.addFile(part, readFileSync(join(srcDir, ...part.split('/'))));
    const entry = zip.getEntry(part);
    entry.header.time = FIXED_DATE;
    // ODF: the mimetype entry is first and uncompressed, so a reader can sniff it at a fixed offset.
    if (part === 'mimetype') entry.header.method = 0;
  }
  return zip.toBuffer();
}

function buildReference() {
  writeFileSync(referenceOut, referenceOdtBuffer());
  console.log(`Wrote ${relative(process.cwd(), referenceOut)}`);
}

function buildTemplate() {
  const version = execFileSync('pandoc', ['--version'], { encoding: 'utf8' }).split('\n')[0];
  if (version.trim() !== `pandoc ${PANDOC_VERSION}`) {
    throw new Error(`template must be derived from pandoc ${PANDOC_VERSION}, found "${version.trim()}"`);
  }
  const pandocTemplate = execFileSync('pandoc', ['-D', 'opendocument'], { encoding: 'utf8' });
  writeFileSync(templateOut, deriveTemplate(pandocTemplate));
  console.log(`Wrote ${relative(process.cwd(), templateOut)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildReference();
  buildTemplate();
}
