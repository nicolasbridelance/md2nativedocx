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
  /**
   * UML annotations (stereotypes) from `<<interface>>` and the like, in source order, without the
   * brackets. Drawn as `«interface»` above the name; like Mermaid, only the first one is drawn.
   */
  annotations?: string[];
  /** Qualified id of the {@link ClassNamespace} the class was declared in, if any. */
  namespace?: string;
  /** Box fill (hex, no `#`) from `style`, `classDef` / `:::` / `cssClass`, or `classDef default`. */
  fill?: string;
  /** Border and divider colour (hex, no `#`), same sources as `fill`. */
  stroke?: string;
  /** Text colour (hex, no `#`) from `color:`, same sources; otherwise black or white to suit the fill. */
  textColor?: string;
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
   * distinguishes `type` — `'both'` for a two-way relation (`<|--|>`),
   * `'none'` for `link`/`dashedLink`, which have no marker at either end. */
  markerEnd: 'from' | 'to' | 'both' | 'none';
  label?: string;
  /** Cardinality written next to `from` (`"1"` in `A "1" --> "*" B`), drawn at that end. */
  fromCardinality?: string;
  /** Cardinality written next to `to` (`"*"` above), drawn at that end. */
  toCardinality?: string;
}

/**
 * A `namespace` block, drawn as a titled box around its classes. Ids are qualified as Mermaid qualifies
 * them: a `namespace Auth` inside `namespace Platform` is `Platform.Auth`, and a dotted name
 * (`Company.Engineering`) also stands for its ancestors (`Company`), created when not declared.
 */
export interface ClassNamespace {
  /** Qualified id (`Platform.Auth`). */
  id: string;
  /** Title: the `["label"]` of its declaration, else the last segment of its id. */
  label: string;
  /** Qualified id of the enclosing namespace, if any. */
  parent?: string;
}

/** A `note "text"`, or a `note for Class "text"` attached to a class by a dotted line. */
export interface ClassNote {
  /** Text, one line per `\n` (Mermaid's `<br>` is read as a line break). */
  text: string;
  /** Id of the class the note is for, if any; the line is drawn only when that class exists. */
  for?: string;
}

export interface ClassDiagram {
  direction: 'TD' | 'LR' | 'BT' | 'RL';
  classes: ClassBox[];
  relationships: ClassRelationship[];
  /** Namespaces, a parent before its children. Absent when the diagram declares none. */
  namespaces?: ClassNamespace[];
  /** Notes, in source order. Absent when the diagram has none. */
  notes?: ClassNote[];
}
