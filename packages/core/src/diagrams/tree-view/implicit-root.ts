/**
 * Mermaid hangs every tree view from an implicit root directory named `/`, drawn in bold above the
 * entries the author wrote (its `treeView/db.ts` starts the tree with it; seen in its rendered SVG,
 * mermaid@12.3.0, 2026-11-21). The AST keeps only what the author wrote; both renderings (shapes and
 * SmartArt) add the root through this function, so they show the same tree Mermaid does.
 */

import type { TreeViewDiagram, TreeViewNode } from './types.js';

/** The implicit root's name, as Mermaid shows it. */
export const IMPLICIT_ROOT_LABEL = '/';

/** The rows to draw: the implicit root, then every node one level deeper, parents shifted to match. */
export function withImplicitRoot(diagram: TreeViewDiagram): TreeViewNode[] {
  const root: TreeViewNode = { label: IMPLICIT_ROOT_LABEL, isDirectory: true, highlighted: false, depth: 0, parent: -1 };
  return [root, ...diagram.nodes.map((n) => ({ ...n, depth: n.depth + 1, parent: n.parent + 1 }))];
}
