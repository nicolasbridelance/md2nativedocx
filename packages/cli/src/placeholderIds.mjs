/**
 * Identifiers of the out-of-band diagram parts (`SMARTART_PLACEHOLDER:<id>:…`, `CHART_PLACEHOLDER:<id>`).
 *
 * The ids come from `randomUUID()` in the Pandoc bridge, but the markers are plain text in
 * `word/document.xml`, so prose written by an author (or by an AI on someone else's behalf) can contain
 * one too. An id is therefore only trusted if it has exactly the shape the bridge generates, and the
 * directory it names is checked to stay inside the parts directory (security rule 2, TODO R3.1).
 */
import { resolve, sep } from 'node:path';

/** Source of the RegExp that matches a lowercase UUID, as `crypto.randomUUID()` writes it. */
export const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * `dir/id` resolved, or `null` when the id is not a UUID or the result escapes `dir`.
 * @param {string} dir The parts directory.
 * @param {string} id An id read from `document.xml`.
 * @returns {string | null}
 */
export function resolvePartDir(dir, id) {
  if (!new RegExp(`^${UUID_SOURCE}$`).test(id)) return null;
  const root = resolve(dir);
  const target = resolve(root, id);
  return target.startsWith(root + sep) ? target : null;
}
