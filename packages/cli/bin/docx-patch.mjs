/**
 * Post-process the `document.xml` of a Pandoc-generated .docx to declare the
 * extended OOXML namespaces (`wpc`, `wpg`, `wps`, `w14`, `wp14`, `mc`) on the
 * root `<w:document>` element, plus `mc:Ignorable`.
 *
 * Why this is needed: Pandoc does not declare these Microsoft extension
 * namespaces on the document root. Without them (and without `mc:Ignorable`),
 * Word falls back to "compatibility mode" and silently drops our `wpc:wpc` /
 * `wpg:wgp` drawing on save. Word itself always declares them on the root.
 *
 * This is a targeted XML correction, NOT a reimplementation of .docx ZIP
 * manipulation (AGENTS.md rule #7 delegates ZIP handling to Pandoc; this only
 * patches the root element of one part to make the output schema-conformant).
 *
 * Security (AGENTS.md):
 * - The XML is parsed with DTD/external-entity resolution disabled (rule #5).
 * - No external OOXML relationship is introduced (rule #3).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

/** The extended namespaces Word requires on the document root. */
export const EXTENDED_NAMESPACES = {
  'xmlns:wpc': 'http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas',
  'xmlns:mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  'xmlns:wpg': 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
  'xmlns:wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
  'xmlns:w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
  'xmlns:wp14': 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
};

/** The prefixes listed in `mc:Ignorable` (only those we actually emit). */
const IGNORABLE = 'w14 wp14';

/**
 * Patch the root `<w:document>` element of a document.xml string to add the
 * extended namespaces and `mc:Ignorable`, if not already present.
 *
 * @param xml - The raw `document.xml` content.
 * @returns The patched XML string.
 */
export function patchDocumentRoot(xml) {
  // Only patch when we actually emitted a canvas/group (wpc/wpg present),
  // to avoid touching plain documents that Pandoc generates unchanged.
  if (!xml.includes('<wpc:wpc') && !xml.includes('<wpg:wgp')) {
    return xml;
  }

  // Find the root element open tag (the first `<w:document` occurrence).
  const rootStart = xml.indexOf('<w:document');
  if (rootStart < 0) return xml;
  const tagEnd = xml.indexOf('>', rootStart);
  if (tagEnd < 0) return xml;
  const openTag = xml.slice(rootStart, tagEnd + 1);

  // Build the new open tag with the missing namespace declarations.
  const missing = Object.entries(EXTENDED_NAMESPACES).filter(
    ([attr]) => !openTag.includes(`${attr}=`),
  );
  if (missing.length === 0) return xml;

  const additions = missing.map(([attr, value]) => ` ${attr}="${value}"`).join('');
  const ignorable = openTag.includes('mc:Ignorable=') ? '' : ` mc:Ignorable="${IGNORABLE}"`;
  const newOpenTag = openTag.slice(0, -1) + additions + ignorable + '>';

  return xml.slice(0, rootStart) + newOpenTag + xml.slice(tagEnd + 1);
}

/**
 * Patch the `document.xml` inside a .docx file (a ZIP). Reads the part,
 * patches the root element, and writes it back.
 *
 * NOTE: this uses `zip`/`unzip` CLI tools to update a single entry of the
 * archive. It is a targeted, minimal correction of one XML part — not a
 * reimplementation of .docx packaging (rule #7 delegates packaging to Pandoc;
 * this only adds the namespace declarations that Pandoc omits).
 *
 * @param docxPath - Path to the .docx file to patch (in place).
 */
export function patchDocx(docxPath) {
  const { execFileSync } = require('node:child_process');
  // Extract document.xml to a temp location, patch it, and re-zip it back.
  const tmp = `${docxPath}.doc.xml`;
  execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], { stdio: ['ignore', 'ignore', 'ignore'] });
  // unzip -p writes to stdout; redirect to a file instead.
  const { spawnSync } = require('node:child_process');
  const { writeFileSync: write, readFileSync: read } = require('node:fs');
  const out = spawnSync('unzip', ['-p', docxPath, 'word/document.xml'], { encoding: 'utf8' });
  if (out.status !== 0) throw new Error(`Failed to read document.xml from ${basename(docxPath)}`);
  const patched = patchDocumentRoot(out.stdout);
  if (patched === out.stdout) return; // nothing to patch
  write(tmp, patched);
  // Replace the entry in the archive.
  execFileSync('zip', ['-j', docxPath, tmp], { stdio: 'ignore' });
  // Clean up the temp file.
  try { require('node:fs').unlinkSync(tmp); } catch { /* best effort */ }
  // Re-read to confirm.
  const verify = spawnSync('unzip', ['-p', docxPath, 'word/document.xml'], { encoding: 'utf8' });
  if (!verify.stdout.includes('xmlns:wpg=')) {
    throw new Error(`Failed to patch ${basename(docxPath)}: wpg namespace not found after patch`);
  }
}

/**
 * Patch a .docx file in place using the `zip`/`unzip` CLI tools.
 * Exported for tests; the CLI calls this after Pandoc produces the file.
 *
 * @param docxPath - Path to the .docx file.
 */
export function patchDocxFile(docxPath) {
  const { spawnSync } = require('node:child_process');
  const out = spawnSync('unzip', ['-p', docxPath, 'word/document.xml'], { encoding: 'utf8' });
  if (out.status !== 0) throw new Error(`Failed to read document.xml from ${basename(docxPath)}`);
  const patched = patchDocumentRoot(out.stdout);
  if (patched === out.stdout) return;
  const tmp = `${docxPath}.patch.xml`;
  writeFileSync(tmp, patched);
  try {
    // zip -j stores with the basename of the added file, so name the temp file
    // `document.xml` inside a temp dir to keep the correct archive path.
    const { mkdtempSync, rmSync, copyFileSync } = require('node:fs');
    const { tmpdir } = require('node:os');
    const { join } = require('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-patch-'));
    const entry = join(dir, 'document.xml');
    copyFileSync(tmp, entry);
    execFileSync('zip', ['-j', docxPath, entry], { stdio: 'ignore' });
    rmSync(dir, { recursive: true, force: true });
  } finally {
    try { unlinkSync(tmp); } catch { /* best effort */ }
  }
}
