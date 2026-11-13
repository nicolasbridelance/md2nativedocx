/**
 * Intermediate AST for a Mermaid `eventmodeling` diagram (grammar checked
 * against the real `@mermaid-js/parser` 1.2.1, `EventModeling` grammar).
 */

/** Canonical entity kinds (the short and long keywords map to the same kind). */
export type EventModelingKind = 'ui' | 'cmd' | 'evt' | 'rmo' | 'pcr';

export interface EventModelingFrame {
  /** Frame number as written (1-3 digits, e.g. `01`); the timeline follows source order. */
  id: string;
  /** `rf` / `resetframe`: interrupts the implicit link to the previous frame. */
  reset: boolean;
  kind: EventModelingKind;
  /** Display name (last segment of a qualified `Namespace.Name`). */
  name: string;
  /** Namespace (everything before the last dot), when qualified. */
  namespace?: string;
  /** Ids of the frames this one receives input from (`->> 01 ->> 02`). */
  sources: string[];
  /** Name of a `data` entity referenced with `[[name]]`. */
  dataRef?: string;
  /** Inline data text (the optional trailing `{...}` / `"..."` / `'...'`). */
  inlineData?: string;
}

export interface EventModelingNote {
  /** Frame id the note is attached to. */
  frame: string;
  text: string;
}

export interface EventModelingStatement {
  kind: EventModelingKind;
  name: string;
}

export interface EventModelingScenario {
  /** Frame id the scenario is attached to. */
  frame: string;
  given: EventModelingStatement[];
  when: EventModelingStatement[];
  then: EventModelingStatement[];
}

export interface EventModelingDiagram {
  frames: EventModelingFrame[];
  /** `data` entities by name (block text, as written between the braces). */
  data: Map<string, string>;
  notes: EventModelingNote[];
  scenarios: EventModelingScenario[];
}
