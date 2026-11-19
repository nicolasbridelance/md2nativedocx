/**
 * Small helpers shared by every CLI entry path (the Pandoc/.docx path in `bin/md2nativedocx.mjs` and
 * the .pptx path in `pptxExport.mjs`).
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
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

/**
 * Refuse an output that names the input file itself, however the two paths are spelled (`./a.md` and
 * `a.md`, a different case on Windows/macOS, a symlink): the export would replace the source.
 */
export function assertNotSameFile(input, output) {
  const canonical = (p) => {
    let full = resolve(p);
    if (existsSync(full)) {
      try {
        full = realpathSync.native(full);
      } catch {
        // Unreadable link or permission issue: compare the resolved path as is.
      }
    }
    return process.platform === 'win32' || process.platform === 'darwin' ? full.toLowerCase() : full;
  };
  if (canonical(input) === canonical(output)) {
    throw new CliError(`The output would overwrite the input file: ${output}`, 2);
  }
}

/** This CLI's own version (not the VS Code extension's), from the package.json next to `bin/`. */
export function cliVersion() {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version ?? 'unknown';
  } catch {
    // A bundled copy without its package.json: still answer --version rather than crash.
    return 'unknown';
  }
}
