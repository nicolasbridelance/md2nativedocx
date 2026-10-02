/**
 * Small helpers shared by every CLI entry path (the Pandoc/.docx path in `bin/md2nativedocx.mjs` and
 * the .pptx path in `pptxExport.mjs`).
 */

import { resolve, isAbsolute } from 'node:path';

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
  // Reject relative paths that escape the working directory via `..`.
  if (!isAbsolute(rawPath)) {
    const root = resolve(cwd);
    if (!abs.startsWith(root + '/') && abs !== root) {
      throw new CliError(`Path escapes the working directory: ${rawPath}`, 2);
    }
  }
  return abs;
}
