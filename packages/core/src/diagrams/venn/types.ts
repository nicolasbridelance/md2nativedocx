/**
 * Intermediate AST for a Mermaid `venn-beta` diagram
 * (`docs/smartart-full-catalog-cross-mermaid.md` archetype #11, "Venn").
 * `venn-beta` is one of Mermaid's "New 🔥" types (added after this project's
 * base knowledge, syntax verified only at "general structure + one example"
 * depth — see `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md`'s header
 * warning); this module's parser scope is deliberately conservative because
 * of that (see `parser.ts`'s doc comment).
 */

/** One declared `set` (a circle). */
export interface VennSet {
  id: string;
  /** Display label — the bracket label if given, `id` otherwise. */
  label: string;
  /** Fill color (hex, no `#`) from `style <id> fill:#RRGGBB`, if given. */
  fill?: string;
  /** Labels of the `text` nodes attached to this set (drawn inside the circle). */
  items: string[];
}

/** One declared `union` (an overlap region between 2+ sets). */
export interface VennUnion {
  /** The set ids this union overlaps, in declaration order. */
  setIds: string[];
  /** Display label from the bracket syntax (`union A,B["Shared"]`), if any. */
  label?: string;
  /** Labels of the `text` nodes attached to this union (drawn in the overlap). */
  items: string[];
}

export interface VennChart {
  title?: string;
  sets: VennSet[];
  unions: VennUnion[];
}
