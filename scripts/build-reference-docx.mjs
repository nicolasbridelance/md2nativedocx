#!/usr/bin/env node
/**
 * Build `packages/cli/assets/reference.docx` from the hand-written parts in
 * `packages/cli/reference-docx-src/`.
 *
 * Why it exists: the previous reference.docx was derived from Pandoc's own default one, which
 * Pandoc distributes under GPL-2+ only (its templates are dual GPL-2+/BSD-3, its other data files
 * are not), while this project is CC0. The maintainer chose to rebuild it from scratch
 * (2026-10-08, ADR 0013): every part under `reference-docx-src/` is written by this project, keeps
 * the same visual values (Aptos theme fonts, the modern Office colour scheme, sizes and spacing),
 * and contains no relationship at all to anything outside the package.
 *
 * This only assembles a template handed to Pandoc with `--reference-doc`; Pandoc still writes every
 * generated document (AGENTS.md rule 7). Run it after editing a part, then commit both:
 *
 *   node scripts/build-reference-docx.mjs
 */

import AdmZip from 'adm-zip';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'packages', 'cli', 'reference-docx-src');
const outFile = join(here, '..', 'packages', 'cli', 'assets', 'reference.docx');

/** Fixed timestamp so rebuilding unchanged parts gives a byte-identical file. */
const FIXED_DATE = new Date('2026-10-08T00:00:00Z');

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const parts = listFiles(srcDir)
  .map((path) => relative(srcDir, path).split(sep).join('/'))
  // [Content_Types].xml first, as Word and Pandoc both write it; the rest in a stable order.
  .sort((a, b) => (a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : a.localeCompare(b)));

const zip = new AdmZip();
for (const part of parts) {
  zip.addFile(part, readFileSync(join(srcDir, ...part.split('/'))));
  zip.getEntry(part).header.time = FIXED_DATE;
}
zip.writeZip(outFile);
console.log(`Wrote ${relative(process.cwd(), outFile)} (${parts.length} parts)`);
