/**
 * Intermediate AST for a Mermaid `ishikawa-beta` (fishbone) diagram (grammar
 * verified against `mermaid-js/mermaid`'s `docs/syntax/ishikawa.md`, 2026-10-02).
 */

export interface IshikawaCause {
  label: string;
  /** Nesting below the category: 1 = direct cause, 2 = sub-cause, ... */
  depth: number;
}

export interface IshikawaCategory {
  label: string;
  /** All descendants in document order, flattened with their depth. */
  causes: IshikawaCause[];
}

export interface IshikawaDiagram {
  /** The effect (problem) at the fish head; empty when the diagram has no lines. */
  effect: string;
  categories: IshikawaCategory[];
}
