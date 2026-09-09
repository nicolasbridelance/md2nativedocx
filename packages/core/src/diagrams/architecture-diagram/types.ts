/**
 * Intermediate AST for a Mermaid `architecture-beta` diagram (Family B,
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §3: "structurellement un
 * graphe de nœuds avec icônes, proche famille B malgré son nom"). Grammar
 * verified against mermaid.js.org/syntax/architecture.html (fetched
 * 2026-09-09) — one of Mermaid's "New 🔥" types, syntax confirmed only at
 * "structure + a few examples" depth (see `FUTURE_full_mermaid_coverage_SPEC.md`'s
 * header warning).
 *
 * V1 scope, deliberately (see `parser.ts`'s doc comment for the rest):
 * `group`/`service`/`junction` declarations (id, optional icon, optional
 * title, optional `in <parent>`) and edges with directional ports (`L`/`R`/
 * `T`/`B`) and optional arrowheads on either end. `in <parent>` is parsed
 * into `parent` but **not** rendered as visual containment in v1 — see
 * `translator.ts`'s doc comment.
 */

export type ArchitectureSide = 'L' | 'R' | 'T' | 'B';
export type ArchitectureNodeKind = 'service' | 'group' | 'junction';

export interface ArchitectureNode {
  id: string;
  kind: ArchitectureNodeKind;
  icon?: string;
  title?: string;
  /** The `in <parentId>` group this node was declared inside, if any. Not
   * rendered as containment in v1 (see `translator.ts`). */
  parent?: string;
}

export interface ArchitectureEdge {
  from: string;
  fromSide: ArchitectureSide;
  to: string;
  toSide: ArchitectureSide;
  arrowAtFrom: boolean;
  arrowAtTo: boolean;
}

export interface ArchitectureDiagram {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}
