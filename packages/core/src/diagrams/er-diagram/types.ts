/**
 * Intermediate AST for a Mermaid `erDiagram` (Family B,
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §3). Grammar verified
 * against mermaid.js.org/syntax/entityRelationshipDiagram.html (fetched
 * 2026-09-09).
 *
 * V1 scope, deliberately (see `parser.ts`'s doc comment for the full list):
 * entities with a flat attribute list (type/name/key markers/comment) and
 * relationships with crow's-foot cardinality on both ends plus the
 * identifying (`--`) vs non-identifying (`..`) line style, and an entity
 * alias (`p[Person]`), whose syntax Mermaid's official examples confirm.
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
  /** The name relationships refer to. */
  id: string;
  /** The alias drawn instead of the id (`p[Person]` gives id `p`, label `Person`); absent when none was given. */
  label?: string;
  attributes: ErAttribute[];
  /** The group (`subgraph`) drawn around it; absent at the top level. */
  group?: string;
  /** Box fill (hex, no `#`) from `style`, `classDef` (through `:::` or `class`) or `classDef default`. */
  fill?: string;
  /** Border and divider colour (hex, no `#`), same sources as `fill`. */
  stroke?: string;
  /** Text colour (hex, no `#`) from `color:`, same sources; otherwise black or white to suit the fill. */
  textColor?: string;
}

/** A `subgraph` group: a titled box around its entities and the groups inside it. */
export interface ErGroup {
  /** The name relationships and `style` refer to (`subgraph id [Title]`), unique among groups. */
  id: string;
  /** Title drawn at the top of the box; the id when none was given. */
  label: string;
  /** The enclosing group; absent at the top level. */
  parent?: string;
  /** Flow inside the group (`direction` within it); absent means the enclosing block's. */
  direction?: 'TD' | 'BT' | 'LR' | 'RL';
  /** Box fill and border (hex, no `#`) from `style` or `class`. */
  fill?: string;
  stroke?: string;
}

export interface ErRelationship {
  /** An entity id, or a group id: a relationship to a group ends on its box. */
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
  /** `direction TB|TD|BT|LR|RL`, TB written TD as for flowcharts; absent means top to bottom. */
  direction?: 'TD' | 'BT' | 'LR' | 'RL';
  entities: ErEntity[];
  relationships: ErRelationship[];
  /** `subgraph` groups, an enclosing group before the groups inside it; absent when there are none. */
  groups?: ErGroup[];
}
