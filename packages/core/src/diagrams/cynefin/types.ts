/**
 * Intermediate AST for a Mermaid `cynefin-beta` diagram. Grammar verified
 * against the real `mermaid-js/mermaid` docs source
 * (`docs/syntax/cynefin.md`, fetched 2026-09-11 via raw.githubusercontent.com
 * — same reason as every other module's doc comment citing this fetch
 * method: the rendered mermaid.js.org page loads its examples into an
 * interactive editor a text-only fetch can't read).
 *
 * `FUTURE_full_mermaid_coverage_SPEC.md` guessed (2026-09-04, before this
 * grammar was actually checked) that this type might be "reusable with
 * `quadrantChart`" purely from both being "2x2"-shaped. Turned out **not**
 * true once the real grammar was read: `quadrantChart` plots arbitrary
 * `[x, y]`-coordinate points on a chart; Cynefin has five **fixed, named**
 * domains (Complex/Complicated/Clear/Chaotic + a center Confusion region)
 * holding lists of plain text-badge items, plus an optional directed
 * transition graph between domains — structurally closer to a small,
 * fixed-position node graph than to a scatter chart. Own dedicated module,
 * not a `quadrantChart` variant.
 *
 * V1 scope, deliberately (see `translator.ts`'s doc comment for the
 * rendering side):
 * - No frontmatter/`config:`/theme-variable support (`width`/`height`/
 *   `padding`/`boundaryAmplitude`/`seed`/`*Bg`/... ) — same project-wide
 *   scope boundary as every other module here (grep confirms zero
 *   frontmatter precedent anywhere in this codebase).
 * - `accTitle`/`accDescr` are recognized and warned once, never silently
 *   dropped, but have no OOXML equivalent (same treatment `../gantt/
 *   parser.ts` gives `accTitle`/`accDescription`).
 * - All 5 domains are always rendered as fixed regions regardless of
 *   whether the source ever mentions them (matches the docs' own "Empty
 *   framework" example: "the domains themselves render even with no
 *   items") — `CynefinDiagram.items` always has all 5 keys, empty arrays
 *   for a domain never declared.
 */

export type CynefinDomain = 'complex' | 'complicated' | 'clear' | 'chaotic' | 'confusion';

export interface CynefinTransition {
  from: CynefinDomain;
  to: CynefinDomain;
  label?: string;
}

export interface CynefinDiagram {
  title?: string;
  items: Record<CynefinDomain, string[]>;
  transitions: CynefinTransition[];
}
