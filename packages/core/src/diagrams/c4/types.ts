/**
 * Intermediate AST for a Mermaid C4 diagram (`C4Context`/`C4Container`/
 * `C4Component`/`C4Dynamic`/`C4Deployment` — Family B,
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §3: "proche flowchart
 * mais notation fonctionnelle `Rel(a,b,\"...\")`"). All 5 header keywords
 * produce the same AST shape: this project has no notion of C4's "levels"
 * beyond which element types happen to appear, since layout/rendering don't
 * differ between them. Grammar verified against the real
 * `mermaid-js/mermaid` docs source (`docs/syntax/c4.md`, fetched 2026-09-11
 * via raw.githubusercontent.com — the rendered mermaid.js.org page embeds
 * its example code in an interactive editor that a text-only fetch can't
 * read) — a PlantUML-compatible function-call syntax, itself still marked
 * "experimental" by Mermaid's own docs.
 *
 * V1 scope, deliberately (see `parser.ts`'s doc comment for the rest):
 * - Every element type (`Person(_Ext)`, `System(Db/Queue)(_Ext)`,
 *   `Container(Db/Queue)(_Ext)`, `Component(Db/Queue)(_Ext)`,
 *   `Deployment_Node`/`Node`/`Node_L`/`Node_R`) collapses onto one
 *   `C4Element` shape: a `category` (person/system/container/component/
 *   node), an `external` flag, and an optional `variant` (db/queue) — the
 *   `_Ext` suffix and the `Db`/`Queue` infix are the only two orthogonal
 *   axes Mermaid's naming scheme actually varies; alignment hints
 *   (`Node_L`/`Node_R`) and sprite/tag/link decorations are parsed away
 *   with no AST effect (unsupported even in real Mermaid — see the docs'
 *   own "unfinished features" list).
 * - `Boundary`/`Enterprise_Boundary`/`System_Boundary`/`Container_Boundary`
 *   nesting, and a `Deployment_Node` used as a wrapper, are tracked only as
 *   `parent` on the elements declared inside — same flattened-with-warning
 *   shape as `architecture-beta`'s `in <parent>` and `classDiagram`'s
 *   `namespace` (see `translator.ts`'s doc comment for why real nested
 *   containment isn't v1).
 * - `Rel`/`BiRel`/`Rel_Back`/`Rel_U`/`Rel_Up`/`Rel_D`/`Rel_Down`/`Rel_L`/
 *   `Rel_Left`/`Rel_R`/`Rel_Right`/`RelIndex` all collapse onto one
 *   `C4Relationship` shape — the directional variants exist in real C4-
 *   PlantUML only as a manual-layout hint (mermaid's own docs: "there is no
 *   plan to support" `Lay_*` statements, and these `Rel_*` suffixes don't
 *   affect Mermaid's own rendering either), and `RelIndex`'s leading
 *   `index` argument is dropped (Mermaid's own docs: "ignores the index
 *   parameter").
 * - `UpdateElementStyle`/`UpdateRelStyle`/`UpdateLayoutConfig`/
 *   `AddElementTag`/`AddRelTag` are recognized and warned once, never
 *   silently dropped, but have no AST/rendering effect in v1 (pure styling/
 *   layout-density directives, not structure).
 */

export type C4Category = 'person' | 'system' | 'container' | 'component' | 'node';
export type C4Variant = 'db' | 'queue';

export interface C4Element {
  id: string;
  category: C4Category;
  external: boolean;
  variant?: C4Variant;
  label: string;
  /** The `?techn`/`?type` positional argument (technology for Container/
   * Component, OS/platform for a Deployment_Node) — same display slot for
   * every category, so one field suffices. */
  techn?: string;
  description?: string;
  /** The enclosing `Boundary`/`Enterprise_Boundary`/`System_Boundary`/
   * `Container_Boundary`/`Deployment_Node` id, if any. Not rendered as
   * visual containment in v1 — see `translator.ts`. */
  parent?: string;
}

export interface C4Relationship {
  from: string;
  to: string;
  label: string;
  techn?: string;
  bidirectional: boolean;
}

export interface C4Diagram {
  title?: string;
  elements: C4Element[];
  relationships: C4Relationship[];
}
