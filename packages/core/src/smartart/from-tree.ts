/**
 * SmartArt for Mermaid diagram types that are already trees: `mindmap` and `treeView-beta`.
 *
 * Neither needs its own SmartArt generator. Each is turned into the {@link Flowchart} shape the tree
 * generators read (one node per item, one parent→child edge) and handed straight to them, so it gets
 * exactly the hierarchy validated in real Word for flowcharts: two levels through `tree.ts`, deeper through
 * `tree-deep.ts`, the compact org-chart layout when wide, every look profile. Not through the flowchart
 * classifier: a mindmap that happens to be a straight line is still a hierarchy, never a `chain` with
 * process arrows.
 *
 * Direction: a mindmap grows left to right (`LR`), the way a mind map reads; a file tree goes top-down
 * (`TD`), where the compact layout stacks each folder's files in a column under it, like a file explorer.
 *
 * What SmartArt cannot keep, and the shape-built translators do: the mindmap's radial layout and node
 * shapes (circle, cloud, bang…), the file tree's bold folders and italic descriptions (the description is
 * folded into the box text instead). A `treeView` with several top-level entries is not one tree and is
 * left to the shape-built translator.
 */

import type { FlowEdge, FlowNode, Flowchart } from '../types.js';
import type { MindmapChart, MindmapNode } from '../diagrams/mindmap/types.js';
import type { TreeViewDiagram } from '../diagrams/tree-view/types.js';
import type { SmartArtGenerated } from './dispatch.js';
import { MAX_TREE_DEPTH, flowchartTreeDepth } from './classify.js';
import { generateTree } from './tree.js';
import { generateDeepTree } from './tree-deep.js';
import type { SmartArtGenerateOptions } from './generate-options.js';

function node(id: string, label: string, fill?: string): FlowNode {
  return { id, label, labelRuns: [{ text: label }], shape: 'roundRect', ...(fill ? { fill } : {}) };
}

function edge(from: string, to: string): FlowEdge {
  return { from, to, type: 'line', label: null, labelRuns: null };
}

/** The flowchart-shaped tree of a mindmap (`LR`), or `null` for an empty one. */
export function mindmapToFlowchart(chart: MindmapChart): Flowchart | null {
  if (!chart.root) return null;
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  // Ids are positional: mindmap ids are optional and may repeat.
  const walk = (n: MindmapNode, parent: string | undefined): void => {
    const id = `m${nodes.length}`;
    nodes.push(node(id, n.label));
    if (parent !== undefined) edges.push(edge(parent, id));
    for (const child of n.children) walk(child, id);
  };
  walk(chart.root, undefined);
  return { direction: 'LR', nodes, edges, subgraphs: [] };
}

/** The flowchart-shaped tree of a file tree (`TD`), or `null` unless it has exactly one top-level entry. */
export function treeViewToFlowchart(diagram: TreeViewDiagram): Flowchart | null {
  if (diagram.nodes.filter((n) => n.parent === -1).length !== 1) return null;
  const nodes = diagram.nodes.map((n, i) =>
    node(`t${i}`, n.description ? `${n.label} — ${n.description}` : n.label, n.highlighted ? 'FFF2CC' : undefined)
  );
  const edges = diagram.nodes.flatMap((n, i) => (n.parent >= 0 ? [edge(`t${n.parent}`, `t${i}`)] : []));
  return { direction: 'TD', nodes, edges, subgraphs: [] };
}

/** The tree generators for a flowchart-shaped tree, or `null` below 2 nodes or past `MAX_TREE_DEPTH`. */
function treeSmartArt(flowchart: Flowchart | null, options: SmartArtGenerateOptions): SmartArtGenerated | null {
  if (!flowchart || flowchart.nodes.length < 2) return null;
  const depth = flowchartTreeDepth(flowchart);
  if (depth < 2 || depth > MAX_TREE_DEPTH) return null;
  return { layout: 'tree', ...(depth > 2 ? generateDeepTree(flowchart, options) : generateTree(flowchart, options)) };
}

/**
 * SmartArt parts for a parsed `mindmap`, or `null` when it is empty or not representable (a single
 * node, more than `MAX_TREE_DEPTH` levels): the caller then keeps the shape-built mindmap.
 */
export function generateMindmapSmartArt(chart: MindmapChart, options: SmartArtGenerateOptions = {}): SmartArtGenerated | null {
  return treeSmartArt(mindmapToFlowchart(chart), options);
}

/** SmartArt parts for a parsed `treeView-beta`, or `null` (several top-level entries, too deep…). */
export function generateTreeViewSmartArt(diagram: TreeViewDiagram, options: SmartArtGenerateOptions = {}): SmartArtGenerated | null {
  return treeSmartArt(treeViewToFlowchart(diagram), options);
}
