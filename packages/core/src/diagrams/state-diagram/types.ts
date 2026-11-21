/**
 * Intermediate AST for a Mermaid `stateDiagram`/`stateDiagram-v2` (Family B,
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §3), also produced by the PlantUML state parser.
 * Grammar verified against mermaid.js.org/syntax/stateDiagram.html (fetched 2026-09-09) and, since
 * 2026-11-21, against what Mermaid 12.3 itself parses (`tools/mermaid-differential/`).
 *
 * Nesting is a parent link: a state inside a composite state's `{ ... }` block names that state in
 * {@link StateNode.parent}; a composite is simply a state that other states (or regions) name as parent.
 */

/**
 * `'normal'` is an ordinary state (Mermaid's rounded rectangle). The other 5
 * are pseudo-states with their own distinct shape:
 * - `'start'`/`'end'`: `[*]` as a transition's source or target. As in Mermaid, one start and one end per
 *   block (the diagram, a composite state, a concurrent region): every `[*]` of that block on the same side
 *   is the same node. Rendered as a small filled circle (`'end'` additionally ringed).
 * - `'choice'`/`'fork'`/`'join'`: declared via `state id <<choice|fork|join>>`.
 */
export type StateNodeKind = 'normal' | 'choice' | 'fork' | 'join' | 'start' | 'end';

export interface StateNode {
  id: string;
  /** Display label — from `state "Label" as id` or `id : Label`, `id`
   * otherwise. Pseudo-states (`start`/`end`/`choice`/`fork`/`join`) ignore
   * this (no text is drawn inside their shape). */
  label: string;
  kind: StateNodeKind;
  /** Description lines drawn under the label, inside the state box (PlantUML `State : text`, one entry per
   * line). Absent for Mermaid, where `id : text` sets the label instead. */
  description?: string[];
  /**
   * Id of the composite state, or of the {@link StateRegion}, this state is drawn in; absent at the top
   * level. Set where the state first appears, as in Mermaid: a state named again in another block stays
   * where it was.
   */
  parent?: string;
  /**
   * A composite state's own `direction` statement, inside its block. Without one, its content is laid out
   * top to bottom whatever the diagram's direction, as Mermaid does (its database gives every composite `TB`).
   */
  direction?: StateDiagram['direction'];
}

/**
 * One concurrent region of a composite state: the part of its block before, between or after `--`
 * separators (PlantUML also `||`). Drawn side by side inside the composite, dashed lines between them.
 * Only made when the block has a separator; a composite without one holds its states directly.
 */
export interface StateRegion {
  /** Synthesized id (`__region_0`…), the {@link StateNode.parent} of the states in the region. */
  id: string;
  /** Id of the composite state the region belongs to. */
  parent: string;
}

export interface StateTransition {
  from: string;
  to: string;
  label?: string;
}

export interface StateDiagram {
  direction: 'TD' | 'LR' | 'BT' | 'RL';
  /** Every state, pseudo-states included; a composite state before the states inside it. */
  states: StateNode[];
  transitions: StateTransition[];
  /** Concurrent regions, in source order. Absent when no composite state has a `--` separator. */
  regions?: StateRegion[];
}
