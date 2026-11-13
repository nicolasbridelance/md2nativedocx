// Safe output writing (TODO §R1.1). Word keeps an exclusive handle on an open document and drops a
// `~$` lock file beside it; overwriting under it (notably on OneDrive) corrupts or loses the file.
// This module refuses in those cases, and otherwise swaps the new file in atomically so the previous
// target is never truncated.
import { closeSync, existsSync, fsyncSync, openSync, renameSync, rmSync, writeSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { ConversionError } from './convert.mjs';

/**
 * Names of the lock files Word creates for `fileName`: `~$` + the full name, and, for long names,
 * `~$` + the name without its first 2 characters.
 * @param {string} fileName
 * @returns {string[]}
 */
export function wordLockFileNames(fileName) {
  return [...new Set([`~$${fileName}`, `~$${fileName.slice(2)}`])];
}

/** @param {string} message @param {unknown} [cause] */
function writeError(message, cause) {
  return new ConversionError(message, { stage: 'write', cause });
}

/**
 * Write `data` to `target` without ever truncating an existing file.
 *
 * Refuses (throws a {@link ConversionError} with `stage: 'write'`) when a Word lock file sits beside the
 * target, or when the existing target cannot be opened for writing. Otherwise writes
 * `<target>.<pid>.tmp` in the same folder, fsyncs it, and renames it over the target; the temporary is
 * removed on failure.
 *
 * @param {string} target absolute output path
 * @param {Buffer | string} data
 */
export function writeOutputSafely(target, data) {
  const dir = dirname(target);
  const name = basename(target);

  for (const lock of wordLockFileNames(name)) {
    if (existsSync(join(dir, lock))) {
      throw writeError(`${name} is open in Word: close it or export under another name.`);
    }
  }

  if (existsSync(target)) {
    try {
      closeSync(openSync(target, 'r+'));
    } catch (err) {
      throw writeError(`${name} cannot be overwritten (it is probably open in Word or another program): close it or export under another name.`, err);
    }
  }

  const tmp = `${target}.${process.pid}.tmp`;
  let fd;
  try {
    fd = openSync(tmp, 'w');
    writeSync(fd, data);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tmp, target);
  } catch (err) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* already failing; the original error is the one to report */ }
    }
    rmSync(tmp, { force: true });
    throw writeError(`could not write ${name}: ${err instanceof Error ? err.message : String(err)}`, err);
  }
}
