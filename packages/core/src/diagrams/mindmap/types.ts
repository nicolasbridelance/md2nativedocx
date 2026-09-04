/**
 * Intermediate AST for a Mermaid `mindmap` diagram
 * (`docs/smartart-full-catalog-cross-mermaid.md` archetype #5, "Radial /
 * étoile") — the first fix for the exact motivating bug from
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §1: `root((mindmap))`
 * used to silently misparse as a real (fake) flowchart node, `((...))`
 * coincidentally being valid flowchart circle syntax.
 */

export type MindmapShape = 'default' | 'square' | 'rounded' | 'circle' | 'bang' | 'cloud' | 'hexagon';

export interface MindmapNode {
  id: string;
  label: string;
  shape: MindmapShape;
  children: MindmapNode[];
}

export interface MindmapChart {
  /** `null` only for a diagram with no content at all past the header. */
  root: MindmapNode | null;
}
