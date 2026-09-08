/**
 * Small AdmZip helpers shared by `referenceDocBuilder.mjs` and
 * `postprocess.mjs` — both patch a handful of named entries inside an
 * existing `.docx` (itself a zip archive) while leaving every other part
 * byte-for-byte untouched.
 *
 * Replaces this project's former `execFileSync('unzip'/'zip', ...)` calls:
 * neither binary exists on stock Windows, and since `md2nativedocx.
 * layout.pageSize`/`.orientation` default to non-empty values
 * (`buildReferenceDoc`'s `needsSectPr`), that path ran on *every* export —
 * confirmed 2026-09-08 by a from-scratch Windows test machine where the
 * very first export crashed with `spawnSync unzip ENOENT`, misclassified as
 * "Pandoc missing" (see exportService.ts's `runCli` for that separate fix).
 */
import AdmZip from 'adm-zip';

export { AdmZip };

/** Read a text entry from `zip`, throwing a clear error if it's missing —
 * mirrors the old code's behaviour of a `readFileSync` on a temp file that
 * `unzip` had failed to extract. */
export function readZipEntry(zip, entryName) {
  const buf = zip.readFile(entryName);
  if (!buf) throw new Error(`md2nativedocx: missing ${entryName} in the .docx archive`);
  return buf.toString('utf8');
}

/** Add `entryName` if it isn't already present, otherwise replace its
 * content. `AdmZip#updateFile` silently no-ops on an entry that doesn't
 * exist yet, so a plain `updateFile` isn't safe for entries this project
 * adds for the first time (e.g. `word/footer1.xml`, new SmartArt diagram
 * parts) — found while porting away from `zip`, which handles both cases
 * transparently. */
export function setZipEntry(zip, entryName, content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  if (zip.getEntry(entryName)) zip.updateFile(entryName, buf);
  else zip.addFile(entryName, buf);
}
