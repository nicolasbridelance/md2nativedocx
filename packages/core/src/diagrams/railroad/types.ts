/**
 * Intermediate AST for railroad (syntax) diagrams, whatever the dialect of the source (`railroad-beta`,
 * `railroad-ebnf-beta`, `railroad-abnf-beta`, `railroad-peg-beta`): the textbook building blocks of a grammar
 * (terminal, rule reference, sequence, alternatives, option, repetition) plus free text.
 */

/** A literal the grammar matches as is (drawn in a rounded box). */
export interface RailroadTerminal {
  type: 'terminal';
  value: string;
}

/** A reference to another rule (drawn in a square box). */
export interface RailroadNonTerminal {
  type: 'nonterminal';
  name: string;
}

/** Elements one after another. */
export interface RailroadSequence {
  type: 'sequence';
  elements: RailroadNode[];
}

/** One of several alternatives. */
export interface RailroadChoice {
  type: 'choice';
  alternatives: RailroadNode[];
}

/** An element that may be skipped. */
export interface RailroadOptional {
  type: 'optional';
  element: RailroadNode;
}

/** An element repeated `min` to `max` times (`max` is `Infinity` when unbounded). */
export interface RailroadRepeat {
  type: 'repeat';
  element: RailroadNode;
  min: number;
  max: number;
}

/** Free text: an EBNF `? ... ?` special sequence, a PEG lookahead or `.`. */
export interface RailroadSpecial {
  type: 'special';
  text: string;
}

/** Any node of a rule's definition. */
export type RailroadNode =
  | RailroadTerminal
  | RailroadNonTerminal
  | RailroadSequence
  | RailroadChoice
  | RailroadOptional
  | RailroadRepeat
  | RailroadSpecial;

/** One grammar rule: `name = definition ;`. */
export interface RailroadRule {
  name: string;
  definition: RailroadNode;
}

/** Which header the diagram used. */
export type RailroadDialect = 'ir' | 'ebnf' | 'abnf' | 'peg';

/** A parsed railroad diagram: one track per rule, top to bottom. */
export interface RailroadDiagram {
  dialect: RailroadDialect;
  title?: string;
  /** `accTitle:` text, the drawing's name when there is no title. */
  accTitle?: string;
  /** `accDescr` text, the drawing's description. */
  accDescr?: string;
  rules: RailroadRule[];
}
