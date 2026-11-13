/**
 * Intermediate AST for a Mermaid `treeView-beta` diagram (grammar verified
 * against `mermaid-js/mermaid`'s `docs/syntax/treeView.md`, 2026-10-02).
 */

export interface TreeViewNode {
  /** Label text with surrounding quotes removed. */
  label: string;
  /** Directory: the label ended with `/` (rendered bold). */
  isDirectory: boolean;
  /** Text after `##`, rendered italic next to the label. */
  description?: string;
  /** Only the built-in `highlight` class is honoured; others are dropped. */
  highlighted: boolean;
  /** Nesting depth, 0 for roots. */
  depth: number;
  /** Index of the parent in {@link TreeViewDiagram.nodes}, or -1 for roots. */
  parent: number;
}

export interface TreeViewDiagram {
  /** Nodes in document order (a parent always precedes its children). */
  nodes: TreeViewNode[];
}
