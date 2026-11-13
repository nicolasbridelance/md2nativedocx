/**
 * Intermediate AST for a Mermaid `sequenceDiagram`. Mermaid's sequence grammar
 * is a hand-written jison lexer inside the `mermaid` package (it is NOT part of
 * `@mermaid-js/parser`), so it was transcribed from the official syntax docs
 * (`docs/syntax/sequenceDiagram.md`).
 */

/** Arrowhead drawn at the receiving end of a message. */
export type SequenceHead = 'none' | 'arrow' | 'cross' | 'open';

export interface SequenceParticipant {
  /** Identifier used in messages. */
  id: string;
  /** Display text (the `as` alias when given, otherwise the id). */
  label: string;
  /** Drawn as a stick-figure box (`actor`) rather than a plain `participant` box. */
  actor: boolean;
}

export type SequenceBlockKind = 'loop' | 'alt' | 'opt' | 'par' | 'critical' | 'break' | 'rect';

export type SequenceItem =
  | {
      type: 'message';
      from: string;
      to: string;
      text: string;
      dashed: boolean;
      head: SequenceHead;
      /** `<<->>` / `<<-->>`: arrowheads at both ends. */
      both: boolean;
      /** `->>+B`: activate the receiver. */
      activate: boolean;
      /** `->>-B`: deactivate the sender. */
      deactivate: boolean;
      /** Set when `autonumber` is on. */
      number?: number;
    }
  | { type: 'note'; placement: 'left' | 'right' | 'over'; actors: string[]; text: string }
  | { type: 'activate' | 'deactivate'; actor: string }
  | { type: 'create' | 'destroy'; actor: string }
  | { type: 'blockStart'; kind: SequenceBlockKind; label: string; color?: string }
  /** `else` / `and` / `option` divider inside a block. */
  | { type: 'blockElse'; label: string }
  | { type: 'blockEnd' };

export interface SequenceDiagram {
  title?: string;
  /** In order of declaration / first appearance (the left-to-right column order). */
  participants: SequenceParticipant[];
  items: SequenceItem[];
}
