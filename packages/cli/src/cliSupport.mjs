/**
 * Small helpers shared by every CLI entry path (the Pandoc/.docx path in `bin/md2nativedocx.mjs` and
 * the .pptx path in `pptxExport.mjs`).
 */

import { resolve, isAbsolute, relative, sep } from 'node:path';

/** Typed error for CLI-level failures. */
export class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

/** Resolve and validate a path (anti path traversal via `..`). */
export function resolveSafePath(rawPath, cwd) {
  const abs = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
  // Reject relative paths that escape the working directory via `..`. Compared through
  // path.relative, not a `root + '/'` prefix: that never matched a Windows path (`\`), so every
  // relative path was refused there (found 2026-10-08 by the .odt CLI tests on the Windows runner).
  if (!isAbsolute(rawPath)) {
    const rel = relative(resolve(cwd), abs);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new CliError(`Path escapes the working directory: ${rawPath}`, 2);
    }
  }
  return abs;
}
