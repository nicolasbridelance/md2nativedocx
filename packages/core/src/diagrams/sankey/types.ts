/**
 * Intermediate AST for a Mermaid `sankey-beta` (CSV body of `source,target,value`
 * records, grammar checked against `mermaid-js/mermaid`'s `docs/syntax/sankey.md`).
 */

export interface SankeyLink {
  source: string;
  target: string;
  /** Strictly positive, finite. */
  value: number;
}

export interface SankeyDiagram {
  /** Node names in first-seen order. */
  nodes: string[];
  /** Acyclic: links that would close a cycle are dropped by the parser. */
  links: SankeyLink[];
}
