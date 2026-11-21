/**
 * Intermediate AST for a Mermaid `treeView-beta` diagram (grammar: `@mermaid-js/parser`'s
 * `treeView.langium`, mermaid@12.3.0, see `parser.ts`).
 */

export interface TreeViewNode {
  /**
   * The name as Mermaid shows it: quotes removed, and for a directory without its trailing `/`
   * (`src/` is shown `src`, in bold).
   */
  label: string;
  /** Directory: the name ended with `/` (rendered bold). */
  isDirectory: boolean;
  /** Text after `##`, rendered italic in a column to the right of the names. */
  description?: string;
  /** The `:::class` annotation, as written. Only `highlight` is drawn (see {@link highlighted}). */
  className?: string;
  /** `className` is `highlight`: a yellow band behind the row, as in Mermaid. */
  highlighted: boolean;
  /**
   * The `icon(…)` annotation, as written (`logos:react`); `'none'` for `icon(none)` or `icon()`, which
   * remove an icon. Kept, not drawn: an icon comes from an icon pack the page running Mermaid registers.
   */
  icon?: string;
  /** Nesting depth, 0 for roots. */
  depth: number;
  /** Index of the parent in {@link TreeViewDiagram.nodes}, or -1 for roots. */
  parent: number;
}

export interface TreeViewDiagram {
  /** Nodes in document order (a parent always precedes its children). */
  nodes: TreeViewNode[];
  /** `title …` after the header, drawn above the tree. */
  title?: string;
  /** `accTitle: …`, the drawing's name when there is no title. */
  accTitle?: string;
  /** `accDescr: …` or `accDescr { … }`, the drawing's description. */
  accDescr?: string;
}
