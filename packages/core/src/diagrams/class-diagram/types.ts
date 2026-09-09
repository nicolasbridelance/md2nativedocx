/**
 * Intermediate AST for a Mermaid `classDiagram` (Family B,
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §3: "graphe nœuds/arêtes,
 * réutilise Dagre + traducteur étendu" — new parser and node rendering, but
 * the same layout engine as flowchart). Grammar verified against
 * mermaid.js.org/syntax/classDiagram.html (fetched 2026-09-09).
 *
 * V1 scope, deliberately (see `parser.ts`'s doc comment for the full list of
 * what degrades to "recognized and warned" rather than parsed): member lines
 * are kept as their raw display text (visibility marker stripped into its
 * own field, everything else verbatim) rather than dissected into
 * name/type/parameters — good enough to render a faithful-looking
 * compartment box without a full UML member grammar.
 */

/** One member line inside a class box (attribute or method — see
 * `ClassBox.attributes`/`methods`). */
export interface ClassMember {
  /** Leading `+`/`-`/`#`/`~` visibility marker, if the line had one. */
  visibility?: '+' | '-' | '#' | '~';
  /** The rest of the member line verbatim (trimmed), visibility marker
   * removed. E.g. `"name: String"`, `"getName() String"`. */
  text: string;
}

export interface ClassBox {
  id: string;
  /** Display label — the bracket label if given, `id` otherwise. */
  label: string;
  attributes: ClassMember[];
  methods: ClassMember[];
}

/**
 * The 8 relationship arrow families from mermaid.js.org's syntax table
 * (`<|--`/`--|>`, `*--`/`--*`, `o--`/`--o`, `-->`/`<--`, `--`, `..>`/`<..`,
 * `..|>`/`|>..`, `..`). Which physical end (`from` or `to`) carries the
 * type's marker is `ClassRelationship.markerEnd`, not encoded here — Mermaid
 * lets an author write either `A <|-- B` or `B --|> A` for the same
 * relationship.
 */
export type ClassRelationType =
  | 'inheritance'
  | 'realization'
  | 'composition'
  | 'aggregation'
  | 'association'
  | 'dependency'
  | 'link'
  | 'dashedLink';

export interface ClassRelationship {
  from: string;
  to: string;
  type: ClassRelationType;
  /** Which endpoint carries the marker (triangle/diamond/oval) that
   * distinguishes `type` — `'none'` for `link`/`dashedLink`, which have no
   * marker at either end. */
  markerEnd: 'from' | 'to' | 'none';
  label?: string;
}

export interface ClassDiagram {
  direction: 'TD' | 'LR' | 'BT' | 'RL';
  classes: ClassBox[];
  relationships: ClassRelationship[];
}
