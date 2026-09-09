/**
 * Intermediate AST for a Mermaid `stateDiagram`/`stateDiagram-v2` (Family B,
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §3). Grammar verified
 * against mermaid.js.org/syntax/stateDiagram.html (fetched 2026-09-09).
 *
 * V1 scope, deliberately (see `parser.ts`'s doc comment for the full list):
 * flat state machine only — a composite state's `{ ... }` block is
 * recognized and its contents still parsed (states/transitions flattened
 * into the same top-level lists), but the nesting/containment itself is not
 * represented in this AST or rendered as a nested box.
 */

/**
 * `'normal'` is an ordinary state (Mermaid's rounded rectangle). The other 4
 * are pseudo-states with their own distinct shape:
 * - `'start'`/`'end'`: one per `[*]` occurrence in the source (each gets its
 *   own synthesized id — see `parser.ts` — since Mermaid allows many),
 *   rendered as a small filled circle (`'end'` additionally ringed).
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
}

export interface StateTransition {
  from: string;
  to: string;
  label?: string;
}

export interface StateDiagram {
  direction: 'TD' | 'LR' | 'BT' | 'RL';
  states: StateNode[];
  transitions: StateTransition[];
}
