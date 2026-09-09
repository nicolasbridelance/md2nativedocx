/**
 * Intermediate AST for a Mermaid `requirementDiagram` (Family B,
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §3). Grammar verified
 * against mermaid.js.org/syntax/requirementDiagram.html (fetched 2026-09-09).
 */

/** The 6 requirement type keywords Mermaid recognizes as a block opener
 * (`<type> name { ... }`). Kept as free-form `string`, not a union, in
 * `Requirement.type` below — see `parser.ts`'s doc comment for why an
 * unrecognized type keyword is still accepted rather than rejected. */
export const REQUIREMENT_TYPES = [
  'requirement',
  'functionalRequirement',
  'interfaceRequirement',
  'performanceRequirement',
  'physicalRequirement',
  'designConstraint',
] as const;

export interface Requirement {
  /** The block's own name (`<type> name { ... }`) — the id relationships
   * reference. */
  name: string;
  type: string;
  id?: string;
  text?: string;
  risk?: string;
  verifyMethod?: string;
}

export interface RequirementElement {
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
}
