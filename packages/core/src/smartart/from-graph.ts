/**
 * SmartArt for three Mermaid diagram types whose small, simple cases are a chain, a cycle or a tree — turned
 * into the {@link Flowchart} shape the validated generators read, then classified like a flowchart:
 *
 * - `gitGraph` with only the main branch (no branch, no cherry-pick): a process, one box per commit (its id in
 *   bold, its tag under it). Lost: the commit dots and their types (highlight, reverse).
 * - `stateDiagram` whose states form a chain or a loop, once the `[*]` start/end markers are set aside (no
 *   choice/fork/join): a process or a cycle, transition labels folded into the box text (`label : state`).
 *   Lost: the start/end markers. A tree-shaped state machine is not turned into an org chart.
 * - `classDiagram` made only of inheritance forming a single tree: a hierarchy, superclass on top, each box
 *   holding the class name in bold then its attributes and methods. Lost: the UML compartments' separators.
 *
 * Anything else keeps its shape-built rendering.
 */

import type { FlowEdge, FlowNode, Flowchart, LabelToken } from '../types.js';
import type { GitGraphDiagram } from '../diagrams/git-graph/types.js';
import type { StateDiagram } from '../diagrams/state-diagram/types.js';
import type { ClassDiagram, ClassMember } from '../diagrams/class-diagram/types.js';
import { classifyTopology, type SmartArtLayout } from './classify.js';
import { generateSmartArt, type SmartArtGenerated } from './dispatch.js';
import { treeSmartArt } from './from-tree.js';
import type { SmartArtGenerateOptions } from './generate-options.js';

function node(id: string, labelRuns: LabelToken[]): FlowNode {
  const label = labelRuns.map((t) => ('break' in t ? ' ' : t.text)).join('');
  return { id, label, labelRuns, shape: 'roundRect' };
}

function edge(from: string, to: string, label?: string): FlowEdge {
  return { from, to, type: 'arrow', label: label ?? null, labelRuns: label ? [{ text: label }] : null };
}

/** Bold first line, then plain lines. */
function lines(title: string, rest: string[]): LabelToken[] {
  const tokens: LabelToken[] = [{ text: title, bold: true }];
  for (const line of rest) tokens.push({ break: true }, { text: line });
  return tokens;
}

/** The chain of a main-branch-only git history, or `null`. */
export function gitGraphToFlowchart(diagram: GitGraphDiagram): Flowchart | null {
  if (diagram.branches.length !== 1 || diagram.commits.length < 2) return null;
  if (diagram.commits.some((c) => c.cherryPickFrom !== undefined || c.parents.length > 1)) return null;
  const commits = [...diagram.commits].sort((a, b) => a.seq - b.seq);
  const nodes = commits.map((c, i) => node(`c${i}`, lines(c.id, c.tag ? [c.tag] : [])));
  const edges = nodes.slice(1).map((n, i) => edge(`c${i}`, n.id));
  const direction = diagram.orientation === 'TB' ? 'TD' : diagram.orientation;
  return { direction, nodes, edges, subgraphs: [] };
}

/** The graph of a state machine's ordinary states (start/end markers set aside), or `null` with a choice/fork/join. */
export function stateDiagramToFlowchart(diagram: StateDiagram): Flowchart | null {
  if (diagram.states.some((s) => s.kind === 'choice' || s.kind === 'fork' || s.kind === 'join')) return null;
  const normal = diagram.states.filter((s) => s.kind === 'normal');
  const ids = new Set(normal.map((s) => s.id));
  const nodes = normal.map((s) => node(s.id, [{ text: s.label }]));
  const edges = diagram.transitions.filter((t) => ids.has(t.from) && ids.has(t.to)).map((t) => edge(t.from, t.to, t.label));
  return { direction: diagram.direction, nodes, edges, subgraphs: [] };
}

function member(m: ClassMember): string {
  return `${m.visibility ?? ''}${m.text}`;
}

/** The superclass → subclass tree of an inheritance-only class diagram, or `null` with any other relation. */
export function classDiagramToFlowchart(diagram: ClassDiagram): Flowchart | null {
  if (diagram.relationships.length === 0 || diagram.relationships.some((r) => r.type !== 'inheritance')) return null;
  const nodes = diagram.classes.map((c) => node(c.id, lines(c.label, [...c.attributes, ...c.methods].map(member))));
  // The triangle marks the superclass: `Animal <|-- Duck` has its marker on `from`.
  const edges = diagram.relationships.map((r) => (r.markerEnd === 'to' ? edge(r.to, r.from, r.label) : edge(r.from, r.to, r.label)));
  return { direction: diagram.direction, nodes, edges, subgraphs: [] };
}

/** The SmartArt layout `flowchart` would get, restricted to `allowed`, or `null`. */
function layoutOf(flowchart: Flowchart | null, allowed: SmartArtLayout[]): SmartArtLayout | null {
  if (!flowchart || flowchart.nodes.length < 2) return null;
  const c = classifyTopology(flowchart);
  return c.eligible && allowed.includes(c.layout) ? c.layout : null;
}

const GIT_LAYOUTS: SmartArtLayout[] = ['chain'];
const STATE_LAYOUTS: SmartArtLayout[] = ['chain', 'cycle'];
const CLASS_LAYOUTS: SmartArtLayout[] = ['chain', 'tree'];

/** SmartArt layout a git graph gets (`chain`), or `null`. */
export function gitGraphSmartArtLayout(diagram: GitGraphDiagram): SmartArtLayout | null {
  return layoutOf(gitGraphToFlowchart(diagram), GIT_LAYOUTS);
}

/** SmartArt layout a state diagram gets (`chain` or `cycle`), or `null`. */
export function stateDiagramSmartArtLayout(diagram: StateDiagram): SmartArtLayout | null {
  return layoutOf(stateDiagramToFlowchart(diagram), STATE_LAYOUTS);
}

/**
 * SmartArt layout a class diagram gets (`tree`), or `null`. A single line of inheritance (`A <|-- B <|-- C`) is a
 * chain to the flowchart classifier, but still a hierarchy here, as a straight-line mindmap is.
 */
export function classDiagramSmartArtLayout(diagram: ClassDiagram): SmartArtLayout | null {
  return layoutOf(classDiagramToFlowchart(diagram), CLASS_LAYOUTS) ? 'tree' : null;
}

/** SmartArt parts for a main-branch-only `gitGraph`, or `null`. */
export function generateGitGraphSmartArt(diagram: GitGraphDiagram, options: SmartArtGenerateOptions = {}): SmartArtGenerated | null {
  const flowchart = gitGraphToFlowchart(diagram);
  return flowchart && layoutOf(flowchart, GIT_LAYOUTS) ? generateSmartArt(flowchart, options) : null;
}

/** SmartArt parts for a chain- or loop-shaped `stateDiagram`, or `null`. */
export function generateStateDiagramSmartArt(diagram: StateDiagram, options: SmartArtGenerateOptions = {}): SmartArtGenerated | null {
  const flowchart = stateDiagramToFlowchart(diagram);
  return flowchart && layoutOf(flowchart, STATE_LAYOUTS) ? generateSmartArt(flowchart, options) : null;
}

/** SmartArt parts for an inheritance-tree `classDiagram`, or `null`. */
export function generateClassDiagramSmartArt(diagram: ClassDiagram, options: SmartArtGenerateOptions = {}): SmartArtGenerated | null {
  const flowchart = classDiagramToFlowchart(diagram);
  return flowchart && layoutOf(flowchart, CLASS_LAYOUTS) ? treeSmartArt(flowchart, options) : null;
}
