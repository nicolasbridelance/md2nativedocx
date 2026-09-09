/**
 * Intermediate AST for a Mermaid `erDiagram` (Family B,
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §3). Grammar verified
 * against mermaid.js.org/syntax/entityRelationshipDiagram.html (fetched
 * 2026-09-09).
 *
 * V1 scope, deliberately (see `parser.ts`'s doc comment for the full list):
 * entities with a flat attribute list (type/name/key markers/comment) and
 * relationships with crow's-foot cardinality on both ends plus the
 * identifying (`--`) vs non-identifying (`..`) line style. Entity aliasing
 * is not implemented — no confirmed literal syntax example was found on the
 * source page, and this project does not guess undocumented grammar (see
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md`'s header warning about
 * "New 🔥" types applying equally here to an unconfirmed feature).
 */

/** The 4 crow's-foot cardinality states, independent of which literal
 * token spelling (`|o`/`o|`, `||`, `}o`/`o{`, `}|`/`|{`) appeared on which
 * side of the relationship line. */
export type ErCardinality = 'zero-or-one' | 'exactly-one' | 'zero-or-many' | 'one-or-many';

export interface ErAttribute {
  type: string;
  name: string;
  /** `PK`/`FK`/`UK`, uppercased, in source order. Empty if none given. */
  keys: string[];
  comment?: string;
}

export interface ErEntity {
  id: string;
  attributes: ErAttribute[];
}

export interface ErRelationship {
  from: string;
  to: string;
  fromCardinality: ErCardinality;
  toCardinality: ErCardinality;
  /** `true` for a solid `--` (identifying) relationship, `false` for a
   * dashed `..` (non-identifying) one. */
  identifying: boolean;
  label?: string;
}

export interface ErDiagram {
  entities: ErEntity[];
  relationships: ErRelationship[];
}
