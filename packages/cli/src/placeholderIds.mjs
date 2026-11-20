/**
 * Identifiers of the out-of-band diagram parts (`SMARTART_PLACEHOLDER:<id>:…`, `CHART_PLACEHOLDER:<id>`).
 *
 * The ids come from `randomUUID()` in the Pandoc bridge (or `crypto.randomUUID()` in the browser
 * converter), but the markers are plain text in `word/document.xml`, so prose written by an author (or by
 * an AI on someone else's behalf) can contain one too. An id is therefore only trusted if it has exactly
 * the shape the bridge generates (security rule 2, TODO R3.1); on disk, the directory it names is also
 * checked to stay inside the parts directory (`resolvePartDir`, docxFiles.mjs). No Node import here: the
 * browser converter uses this module.
 */

/** Source of the RegExp that matches a lowercase UUID, as `crypto.randomUUID()` writes it. */
export const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const UUID_RE = new RegExp(`^${UUID_SOURCE}$`);

/**
 * Whether `id` has exactly the shape of a generated part id.
 * @param {string} id An id read from `document.xml`.
 * @returns {boolean}
 */
export function isPartId(id) {
  return UUID_RE.test(id);
}
