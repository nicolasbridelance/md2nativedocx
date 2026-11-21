/**
 * Intermediate AST for a Mermaid `requirementDiagram` (Family B,
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §3). Grammar read from
 * Mermaid's own (`requirementDiagram.jison` and `requirementDb.ts`,
 * mermaid@12.3.0, the version the official corpus is pinned to); see
 * `parser.ts`.
 */

/** The 6 requirement type keywords Mermaid recognizes as a block opener
 * (`<type> name { ... }`), case-insensitive, in their canonical spelling.
 * `Requirement.type` stays a free-form `string`: an unknown keyword is kept
 * (and warned about) rather than losing the block. */
export const REQUIREMENT_TYPES = [
  'requirement',
  'functionalRequirement',
  'interfaceRequirement',
  'performanceRequirement',
  'physicalRequirement',
  'designConstraint',
] as const;

/** Colours and emphasis from `style`, `classDef` / `class` / `:::`, and `classDef default`. */
export interface RequirementBoxStyle {
  /** Box fill (hex, no `#`). */
  fill?: string;
  /** Border and divider colour (hex, no `#`). */
  stroke?: string;
  /** Colour of every text in the box (hex, no `#`), from `color:`. */
  textColor?: string;
  /** `font-weight` of every text in the box (the name is bold anyway, as in Mermaid). */
  bold?: boolean;
  /** `font-style` of every text in the box. */
  italic?: boolean;
}

export interface Requirement extends RequirementBoxStyle {
  /** The block's own name (`<type> name { ... }`), quotes removed — the id relationships
   * reference. Displayed as Markdown, as Mermaid does. */
  name: string;
  /** The type keyword in its canonical spelling (one of {@link REQUIREMENT_TYPES}), or the
   * keyword as written when it is not one of them. */
  type: string;
  id?: string;
  text?: string;
  /** `Low`, `Medium` or `High` as Mermaid displays them, or the value as written otherwise. */
  risk?: string;
  /** `Analysis`, `Demonstration`, `Inspection` or `Test` as Mermaid displays them, or the value as written otherwise. */
  verifyMethod?: string;
}

export interface RequirementElement extends RequirementBoxStyle {
  name: string;
  type?: string;
  docRef?: string;
}

/** The 7 relationship type keywords from mermaid.js.org's syntax table. */
export type RequirementRelationType = 'contains' | 'copies' | 'derives' | 'satisfies' | 'verifies' | 'refines' | 'traces';

export interface RequirementRelationship {
  from: string;
  to: string;
  type: RequirementRelationType;
}

export interface RequirementDiagram {
  requirements: Requirement[];
  elements: RequirementElement[];
  relationships: RequirementRelationship[];
  /** `direction TB|BT|LR|RL`; absent means top to bottom (`TB` is stored as `TD`, as for the class diagram). */
  direction?: 'TD' | 'BT' | 'LR' | 'RL';
}
