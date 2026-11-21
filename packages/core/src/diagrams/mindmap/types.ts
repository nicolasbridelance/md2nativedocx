/**
 * Intermediate AST for a Mermaid `mindmap` diagram
 * (`docs/smartart-full-catalog-cross-mermaid.md` archetype #5, "Radial /
 * étoile") — the first fix for the exact motivating bug from
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §1: `root((mindmap))`
 * used to silently misparse as a real (fake) flowchart node, `((...))`
 * coincidentally being valid flowchart circle syntax.
 */

import type { LabelToken } from '../../types.js';

export type MindmapShape = 'default' | 'square' | 'rounded' | 'circle' | 'bang' | 'cloud' | 'hexagon';

export interface MindmapNode {
  id: string;
  /** The label as plain text (a line break becomes a space). */
  label: string;
  /**
   * The label as rich text: Mermaid reads every mindmap label as Markdown, so `**bold**`, `*italic*`,
   * `<br/>` and a newline inside a quoted label are kept here. Absent on a node built by hand: then
   * `label` is drawn as it is.
   */
  labelRuns?: LabelToken[];
  shape: MindmapShape;
  /**
   * The icon set by a `::icon(...)` line, as written (`fa fa-book`). Kept, not drawn: it names a glyph
   * of an icon font the page running Mermaid loads, which a document does not carry.
   */
  icon?: string;
  /**
   * The classes set by a `:::` line, as written (`urgent large`). Kept, not applied: they refer to the
   * stylesheet of the page running Mermaid, which a document does not have.
   */
  className?: string;
  children: MindmapNode[];
}

export interface MindmapChart {
  /** `null` only for a diagram with no content at all past the header. */
  root: MindmapNode | null;
}
