/**
 * Intermediate AST for a Mermaid `sequenceDiagram`. Mermaid's sequence grammar
 * is a hand-written jison lexer inside the `mermaid` package (it is NOT part of
 * `@mermaid-js/parser`), so it was transcribed from the official syntax docs
 * (`docs/syntax/sequenceDiagram.md`).
 */

/** Arrowhead drawn at the receiving end of a message. */
export type SequenceHead = 'none' | 'arrow' | 'cross' | 'open';

/**
 * A participant's UML symbol other than the plain box and the actor: Mermaid's `@{ "type": ... }` config,
 * PlantUML's `boundary X` / `database X` ... declarations.
 */
export type SequenceParticipantKind = 'boundary' | 'control' | 'entity' | 'database' | 'collections' | 'queue';

export interface SequenceParticipant {
  /** Identifier used in messages. */
  id: string;
  /** Display text (the `as` alias when given, otherwise the id). */
  label: string;
  /** Drawn as a stick figure (`actor`) rather than a plain `participant` box. */
  actor: boolean;
  /** Symbol drawn instead of the plain box; absent for a plain participant or an actor. */
  kind?: SequenceParticipantKind;
}

/** `group` comes from PlantUML: a labelled frame with no meaning of its own. */
export type SequenceBlockKind = 'loop' | 'alt' | 'opt' | 'par' | 'critical' | 'break' | 'rect' | 'group';

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
      /**
       * Central connection (Mermaid `A->>()B`, `A()->>B`, `A()->>()B`): a dot on the lifeline at that end,
       * where the message leaves or joins it. Absent when neither end has one.
       */
      central?: 'from' | 'to' | 'both';
    }
  | { type: 'note'; placement: 'left' | 'right' | 'over'; actors: string[]; text: string }
  | { type: 'activate' | 'deactivate'; actor: string }
  | { type: 'create' | 'destroy'; actor: string }
  | { type: 'blockStart'; kind: SequenceBlockKind; label: string; color?: string }
  /** `else` / `and` / `option` divider inside a block. */
  | { type: 'blockElse'; label: string }
  | { type: 'blockEnd' };

/** A participant group (Mermaid `box ... end`, PlantUML `box ... end box`): a band behind its columns. */
export interface SequenceBox {
  /** Title drawn at the top of the band; empty when the box has none. */
  label: string;
  /** Bare 6-digit hex fill; absent for a transparent box (drawn as an outline). */
  color?: string;
  /** Ids of the participants declared inside it, in column order; a box with none is not drawn. */
  participants: string[];
}

export interface SequenceDiagram {
  title?: string;
  /** In order of declaration / first appearance (the left-to-right column order). */
  participants: SequenceParticipant[];
  items: SequenceItem[];
  /** Participant groups; absent when the diagram has none. */
  boxes?: SequenceBox[];
}
