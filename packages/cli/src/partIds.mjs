/**
 * Part identifiers carried by the `SMARTART_PLACEHOLDER:<id>:…` and `CHART_PLACEHOLDER:<id>` markers.
 *
 * The markers travel through Pandoc inside the document text, so prose in the Markdown can contain
 * look-alikes (`SMARTART_PLACEHOLDER:../../x:dm`, or a document that documents this project). The
 * bridge only ever issues `randomUUID()` ids; anything else is not ours and is left untouched.
 */
import { existsSync, realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';

/** The canonical lowercase UUID text produced by `crypto.randomUUID()`. */
export const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * The ids from `ids` that name an existing part directory directly under `baseDir`.
 * An id that is not a UUID, that does not exist there, or whose resolved path leaves `baseDir`
 * (a symlink, for instance) is dropped: its marker stays in the document as plain text and the
 * export carries on.
 *
 * @param {Iterable<string>} ids
 * @param {string} baseDir directory the core bridge wrote one `<id>/` subdirectory per part into
 * @returns {string[]}
 */
export function existingPartIds(ids, baseDir) {
  const known = [];
  const uuid = new RegExp(`^${UUID_PATTERN}$`);
  for (const id of ids) {
    if (!uuid.test(id)) continue;
    const dir = join(baseDir, id);
    if (!existsSync(dir)) continue;
    const rel = relative(realpathSync(baseDir), realpathSync(dir));
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) continue;
    known.push(id);
  }
  return known;
}
