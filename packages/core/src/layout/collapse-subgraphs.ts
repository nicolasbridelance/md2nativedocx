/**
 * Folding of collapsed subgraphs (`S@{ view: collapsed }`) before a flowchart is laid out and drawn.
 *
 * Mermaid keeps a collapsed subgraph and its contents in the parsed diagram and folds it only when it
 * prepares the drawing; this project does the same, so `parseMermaid()` still says what the source says
 * and every renderer folds the same way.
 */

import type { FlowEdge, FlowNode, Flowchart, LabelToken, Subgraph } from '../types.js';

/** Second line of a folded subgraph: its contents are there, not shown. */
export const FOLDED_MARK = '• • •';

/**
 * The flowchart to draw when some subgraphs are {@link Subgraph.collapsed}: each outermost collapsed
 * subgraph becomes one node of shape `collapsedGroup` (its title, then {@link FOLDED_MARK}) in its
 * parent's place; what it held (nodes and nested subgraphs) is not drawn. A link to or from something
 * inside it ends on that node, and a link that then joins the node to itself (it stayed inside) is not
 * drawn. Returns `flowchart` itself when nothing is collapsed.
 */
export function collapseSubgraphs(flowchart: Flowchart): Flowchart {
  if (!flowchart.subgraphs.some((sg) => sg.collapsed)) return flowchart;
  const byId = new Map(flowchart.subgraphs.map((sg) => [sg.id, sg]));
  const parentOf = new Map<string, Subgraph>();
  for (const sg of flowchart.subgraphs) for (const childId of sg.subgraphIds) parentOf.set(childId, sg);

  // The outermost collapsed subgraph among `id` and its ancestors: the one everything inside folds into.
  const foldedInto = (id: string): string | undefined => {
    let result: string | undefined;
    const seen = new Set<string>();
    for (let current: string | undefined = id; current !== undefined && !seen.has(current); current = parentOf.get(current)?.id) {
      seen.add(current);
      if (byId.get(current)?.collapsed) result = current;
    }
    return result;
  };

  // Hidden node or subgraph id -> the folded subgraph standing for it.
  const hostOf = new Map<string, string>();
  const folded: Subgraph[] = [];
  for (const sg of flowchart.subgraphs) {
    const host = foldedInto(sg.id);
    if (host === undefined) continue;
    if (host === sg.id) folded.push(sg);
    else hostOf.set(sg.id, host);
    for (const id of sg.nodeIds) hostOf.set(id, host);
  }
  const foldedIds = new Set(folded.map((sg) => sg.id));

  const nodes: FlowNode[] = [
    ...flowchart.nodes.filter((n) => !hostOf.has(n.id) && !foldedIds.has(n.id)),
    ...folded.map((sg): FlowNode => ({ id: sg.id, label: sg.title, labelRuns: foldedLabel(sg.title), shape: 'collapsedGroup' })),
  ];

  const subgraphs = flowchart.subgraphs
    .filter((sg) => !hostOf.has(sg.id) && !foldedIds.has(sg.id))
    .map((sg) => ({
      ...sg,
      nodeIds: [...sg.nodeIds, ...sg.subgraphIds.filter((id) => foldedIds.has(id))],
      subgraphIds: sg.subgraphIds.filter((id) => !foldedIds.has(id)),
    }));

  const edges: FlowEdge[] = [];
  for (const edge of flowchart.edges) {
    const from = hostOf.get(edge.from) ?? edge.from;
    const to = hostOf.get(edge.to) ?? edge.to;
    if (from === to && (hostOf.has(edge.from) || hostOf.has(edge.to))) continue;
    edges.push(from === edge.from && to === edge.to ? edge : { ...edge, from, to });
  }

  return { ...flowchart, nodes, edges, subgraphs };
}

/** The folded node's text: the subgraph's title, line by line, then {@link FOLDED_MARK}. */
function foldedLabel(title: string): LabelToken[] {
  const runs: LabelToken[] = [];
  for (const line of title.split('\n')) runs.push({ text: line }, { break: true });
  runs.push({ text: FOLDED_MARK });
  return runs;
}
