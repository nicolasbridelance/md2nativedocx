/**
 * Mermaid's interactive directives (`click`, and in class diagrams `link` and `callback`) attach a URL or
 * a JavaScript callback to a node. A document made by this project never links outside itself (AGENTS.md
 * rule 3, the Follina lesson), so they are recognized and dropped on purpose, with one warning per diagram.
 */

/** The warning given once per diagram that has interactive directives. */
export const INTERACTIVE_DIRECTIVES_IGNORED =
  'Interactive directives (`click`, `link`, `callback`) are not exported: a document made by md2nativedocx never links outside itself.';

/**
 * Whether `line` is an interactive directive: the keyword, a node id that is not an edge operator, then
 * a target (`"url"`, `href`, `call`, or a callback name). `click --> B` (a node named `click`) is not one.
 * `keywords` lists the directives the grammar has (`['click']` for flowcharts).
 */
export function isInteractiveDirective(line: string, keywords: readonly string[]): boolean {
  const m = /^([A-Za-z]+)\s+([^\s\-=.<>~|]+)\s+\S/.exec(line);
  return m !== null && keywords.includes(m[1]!.toLowerCase());
}
