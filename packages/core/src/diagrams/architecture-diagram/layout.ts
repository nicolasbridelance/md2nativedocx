/**
 * Layout of an `architecture-beta` diagram, on the model Mermaid 12.3 uses (its renderer read against the
 * official examples; the code here is this project's own). Mermaid does not rank the graph: it reads a
 * grid out of the ports. `db:L -- R:server` puts `server` to the left of `db`, in the same row;
 * `disk:T -- B:server` puts `server` above `disk`, in the same column. Mermaid hands that grid to a force
 * layout (fcose) as alignment and placement constraints; here the constraints are solved directly.
 *
 * **Constraints, per axis.** An edge whose two ports face each other (`R`–`L`, `T`–`B`) puts its ends in
 * the same row (or column) and orders them along it. An edge that turns (`R`–`T`…) orders its ends on both
 * axes: `a:R -- T:b` puts `b` to the right of `a` (it leaves `a` rightwards) and below it (it enters `b`
 * from above). Mermaid gives such an edge no constraint at all, which leaves `b` wherever the forces drop
 * it; the reading here is the one its ports describe. `align row a b c` puts its members in one row, left
 * to right; `align column` in one column, top to bottom. As in Mermaid, an `align` overrides what the
 * edges said about the nodes it names: their edge alignments are dropped, the order of consecutive
 * members comes from the `align`.
 *
 * **Solving.** Equalities merge nodes into rows and columns; orders between them form a graph whose
 * longest paths give each row and column its index. A constraint that contradicts the others (a cycle)
 * is dropped with a warning: Mermaid stops on it. A node no order reaches on an axis takes the mean of
 * its neighbours' positions there (how Mermaid's forces centre `mcp` beside the column it is linked to).
 * Two nodes that end up in the same cell are moved apart, across the way the moved one's edges come in:
 * a node reached from the side goes under the other (two services linked to the same side of a third end
 * up in a column), one reached from above or below goes beside it, so no line runs behind an icon it
 * does not belong to. Separate parts of the diagram
 * (nothing links them, no group holds both) are laid out on their own and placed side by side.
 *
 * **Sizes.** Rows and columns are `iconSize + gap` apart; where frames end or start between two of them,
 * the distance grows to fit each frame's padding plus a clearance, as Mermaid's frames push their
 * neighbours away. A group's frame encloses its members (their labels included) and its nested groups,
 * with `padding` all around, the title in the top padding.
 */

import { DiagramTooLargeError, DEFAULT_MAX_EDGES, DEFAULT_MAX_NODES, type GraphLimits } from '../../layout/graph-limits.js';
import type { ArchitectureDiagram, ArchitectureNode, ArchitectureSide } from './types.js';

/** Sizes the layout works with, in px. */
export interface ArchitectureMetrics {
  iconSize: number;
  /** Space between two icons in the same frame, along a row or a column. */
  gap: number;
  /** A frame's margin around what it holds. */
  padding: number;
  /** Space between a frame and what lies outside it. */
  clearance: number;
  /** Height of the label under a service (0 for none). */
  labelHeight(node: ArchitectureNode): number;
  /** Width of the label under a service (0 for none). */
  labelWidth(node: ArchitectureNode): number;
  /** Width a group's frame needs for its icon and title. */
  headerWidth(group: ArchitectureNode): number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A service or junction, by the centre of its icon. */
export interface PlacedNode {
  node: ArchitectureNode;
  cx: number;
  cy: number;
}

export interface ArchitectureLayout {
  nodes: Map<string, PlacedNode>;
  /** Group frames by id, outermost first. */
  frames: Map<string, Box>;
  width: number;
  height: number;
  warnings: string[];
}

type Axis = 'x' | 'y';

/** Unit step of a side, y pointing down. */
const STEP: Readonly<Record<ArchitectureSide, { x: number; y: number }>> = {
  L: { x: -1, y: 0 },
  R: { x: 1, y: 0 },
  T: { x: 0, y: -1 },
  B: { x: 0, y: 1 },
};
const axisOf = (side: ArchitectureSide): Axis => (side === 'L' || side === 'R' ? 'x' : 'y');

/** `after` sits at least one step past `before` on an axis. */
interface Order {
  before: string;
  after: string;
  why: string;
}

/** Constraints on one axis. */
interface AxisConstraints {
  /** Pairs on the same line (same column for `x`, same row for `y`). */
  equal: Array<[string, string]>;
  order: Order[];
}

/** Disjoint sets over node ids. */
class UnionFind {
  private readonly parent = new Map<string, string>();

  find(id: string): string {
    let root = id;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cursor = id;
    while (cursor !== root) {
      const next = this.parent.get(cursor) ?? root;
      this.parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/** Positions on one axis, in steps (fractional for a node centred between others). */
function solveAxis(ids: string[], constraints: AxisConstraints, neighbours: Map<string, string[]>, warnings: string[]): Map<string, number> {
  const uf = new UnionFind();
  for (const [a, b] of constraints.equal) uf.union(a, b);
  const classes = [...new Set(ids.map((id) => uf.find(id)))];
  const succ = new Map<string, Set<string>>(classes.map((c) => [c, new Set<string>()]));
  const pred = new Map<string, Set<string>>(classes.map((c) => [c, new Set<string>()]));

  const reaches = (from: string, to: string): boolean => {
    const stack = [from];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const c = stack.pop()!;
      if (c === to) return true;
      if (seen.has(c)) continue;
      seen.add(c);
      for (const n of succ.get(c)!) stack.push(n);
    }
    return false;
  };
  for (const o of constraints.order) {
    const a = uf.find(o.before);
    const b = uf.find(o.after);
    if (succ.get(a)!.has(b)) continue;
    if (a === b || reaches(b, a)) {
      warnings.push(`Placement of ${o.why} contradicts the other edges and align lines; not applied.`);
      continue;
    }
    succ.get(a)!.add(b);
    pred.get(b)!.add(a);
  }

  // Longest path from the sources, in topological order.
  const level = new Map<string, number>();
  const indegree = new Map(classes.map((c) => [c, pred.get(c)!.size]));
  const queue = classes.filter((c) => indegree.get(c) === 0);
  const topo: string[] = [];
  while (queue.length > 0) {
    const c = queue.shift()!;
    topo.push(c);
    const l = Math.max(0, ...[...pred.get(c)!].map((p) => level.get(p)! + 1));
    level.set(c, l);
    for (const n of succ.get(c)!) {
      indegree.set(n, indegree.get(n)! - 1);
      if (indegree.get(n) === 0) queue.push(n);
    }
  }
  // A source sits right before its nearest successor, not at the far end of the axis.
  for (const c of [...topo].reverse()) {
    if (pred.get(c)!.size === 0 && succ.get(c)!.size > 0) level.set(c, Math.min(...[...succ.get(c)!].map((n) => level.get(n)!)) - 1);
  }

  // Classes no order reaches: the mean of their neighbours, refined a few times; 0 when nothing anchors them.
  const free = classes.filter((c) => pred.get(c)!.size === 0 && succ.get(c)!.size === 0);
  const members = new Map<string, string[]>();
  for (const id of ids) members.set(uf.find(id), [...(members.get(uf.find(id)) ?? []), id]);
  for (const c of free) level.delete(c);
  for (let pass = 0; pass < 8; pass++) {
    for (const c of free) {
      const around = members
        .get(c)!
        .flatMap((id) => neighbours.get(id) ?? [])
        .map((id) => uf.find(id))
        .filter((n) => n !== c && level.has(n));
      if (around.length > 0) level.set(c, around.reduce((sum, n) => sum + level.get(n)!, 0) / around.length);
    }
  }
  for (const c of free) if (!level.has(c)) level.set(c, 0);

  // Start at 0.
  const min = Math.min(...[...level.values()]);
  const out = new Map<string, number>();
  for (const id of ids) out.set(id, level.get(uf.find(id))! - min);
  return out;
}

/** The constraints the edges and `align` lines put on the nodes of one part of the diagram. */
function constraintsOf(chart: ArchitectureDiagram, ids: Set<string>): Record<Axis, AxisConstraints> {
  const out: Record<Axis, AxisConstraints> = { x: { equal: [], order: [] }, y: { equal: [], order: [] } };
  const alignments = (chart.alignments ?? []).filter((a) => a.members.every((m) => ids.has(m)));
  const aligned = new Set(alignments.flatMap((a) => a.members));
  const declaredPairs = new Set<string>();
  for (const a of alignments) {
    const along: Axis = a.direction === 'row' ? 'x' : 'y';
    const across: Axis = along === 'x' ? 'y' : 'x';
    a.members.forEach((m, i) => {
      const next = a.members[i + 1];
      if (next === undefined) return;
      declaredPairs.add(`${m}|${next}`).add(`${next}|${m}`);
      out[across].equal.push([m, next]);
      out[along].order.push({ before: m, after: next, why: `align ${a.direction} ${m} ${next}` });
    });
  }
  const push = (axis: Axis, from: string, to: string, sign: number, why: string): void => {
    if (sign > 0) out[axis].order.push({ before: from, after: to, why });
    else if (sign < 0) out[axis].order.push({ before: to, after: from, why });
  };
  for (const e of chart.edges) {
    if (e.from === e.to || !ids.has(e.from) || !ids.has(e.to)) continue;
    const why = `${e.from}:${e.fromSide} -- ${e.toSide}:${e.to}`;
    const declared = declaredPairs.has(`${e.from}|${e.to}`);
    const fromAxis = axisOf(e.fromSide);
    const toAxis = axisOf(e.toSide);
    if (fromAxis === toAxis) {
      // Ports facing each other; `R -- R` and the like say nothing (Mermaid ignores them too).
      if (e.fromSide === e.toSide) continue;
      const across: Axis = fromAxis === 'x' ? 'y' : 'x';
      if (!aligned.has(e.from) && !aligned.has(e.to)) out[across].equal.push([e.from, e.to]);
      if (!declared) push(fromAxis, e.from, e.to, STEP[e.fromSide][fromAxis], why);
    } else if (!declared) {
      // A turn: away from `from` along its port, and towards `to`'s port on the other axis.
      push(fromAxis, e.from, e.to, STEP[e.fromSide][fromAxis], why);
      push(toAxis, e.from, e.to, -STEP[e.toSide][toAxis], why);
    }
  }
  return out;
}

/** Steps on both axes for one part of the diagram; two nodes never share a cell. */
function solveGrid(chart: ArchitectureDiagram, ids: string[], neighbours: Map<string, string[]>, warnings: string[]): Map<string, { x: number; y: number }> {
  const base = constraintsOf(chart, new Set(ids));
  // How many of each node's edge ends are on a left/right side (`x`) or a top/bottom side (`y`).
  const portCount = new Map<string, Record<Axis, number>>();
  for (const e of chart.edges) {
    for (const [id, side] of [[e.from, e.fromSide], [e.to, e.toSide]] as const) {
      const count = portCount.get(id) ?? { x: 0, y: 0 };
      count[axisOf(side)]++;
      portCount.set(id, count);
    }
  }
  // Nodes taken out of their row (`y`) or column (`x`) to resolve a collision, and the extra orders that do it.
  const detached: Record<Axis, Set<string>> = { x: new Set(), y: new Set() };
  const extra: Record<Axis, Order[]> = { x: [], y: [] };
  let grid = new Map<string, { x: number; y: number }>();
  const maxPasses = 2 * ids.length + 2;
  for (let pass = 0; pass < maxPasses; pass++) {
    const solved = {} as Record<Axis, Map<string, number>>;
    const sameLine = {} as Record<Axis, UnionFind>;
    for (const axis of ['x', 'y'] as const) {
      const equal = base[axis].equal.filter(([a, b]) => !detached[axis].has(a) && !detached[axis].has(b));
      // A contradiction is reported once, on the first pass.
      solved[axis] = solveAxis(ids, { equal, order: [...base[axis].order, ...extra[axis]] }, neighbours, pass === 0 ? warnings : []);
      sameLine[axis] = new UnionFind();
      for (const [a, b] of equal) sameLine[axis].union(a, b);
    }
    grid = new Map(ids.map((id) => [id, { x: solved.x.get(id)!, y: solved.y.get(id)! }]));
    const cells = new Map<string, string[]>();
    for (const id of ids) {
      const p = grid.get(id)!;
      const key = `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
      cells.set(key, [...(cells.get(key) ?? []), id]);
    }
    const crowded = [...cells.values()].filter((list) => list.length > 1);
    if (crowded.length === 0) return grid;
    for (const list of crowded) {
      const [first, ...others] = list;
      let previous = first!;
      for (const id of others) {
        const why = `${id} (moved off ${previous}, they landed on the same spot)`;
        // Move it across the way its edges come in: a node reached from the side goes under the other one,
        // so its horizontal edges do not run behind it; one reached from above or below goes beside it.
        const axis: Axis = (portCount.get(id)?.x ?? 0) > (portCount.get(id)?.y ?? 0) ? 'y' : 'x';
        if (sameLine[axis].find(id) === sameLine[axis].find(previous)) detached[axis].add(id);
        extra[axis].push({ before: previous, after: id, why });
        previous = id;
      }
    }
  }
  warnings.push('Some services could not be given a place of their own and overlap.');
  return grid;
}

/** Ids of the services and junctions in each separate part: linked by an edge, an `align` or a common group. */
function parts(chart: ArchitectureDiagram, ids: string[], groupOf: (id: string) => string | undefined): string[][] {
  const uf = new UnionFind();
  for (const e of chart.edges) uf.union(e.from, e.to);
  for (const a of chart.alignments ?? []) for (const m of a.members.slice(1)) uf.union(a.members[0]!, m);
  // Every node joins its outermost group.
  for (const id of ids) {
    let top = groupOf(id);
    if (top === undefined) continue;
    const seen = new Set<string>();
    for (let g: string | undefined = top; g !== undefined && !seen.has(g); g = groupOf(g)) {
      seen.add(g);
      top = g;
    }
    uf.union(id, `group:${top}`);
  }
  const byRoot = new Map<string, string[]>();
  for (const id of ids) byRoot.set(uf.find(id), [...(byRoot.get(uf.find(id)) ?? []), id]);
  return [...byRoot.values()];
}

/** Lay out a parsed diagram. @throws {DiagramTooLargeError} past the node or edge limit. */
export function layoutArchitecture(chart: ArchitectureDiagram, m: ArchitectureMetrics, limits: GraphLimits = {}): ArchitectureLayout {
  const maxNodes = limits.maxNodes ?? DEFAULT_MAX_NODES;
  const maxEdges = limits.maxEdges ?? DEFAULT_MAX_EDGES;
  if (chart.nodes.length > maxNodes) throw new DiagramTooLargeError('nodes', chart.nodes.length, maxNodes);
  if (chart.edges.length > maxEdges) throw new DiagramTooLargeError('edges', chart.edges.length, maxEdges);

  const warnings: string[] = [];
  const byId = new Map(chart.nodes.map((n) => [n.id, n]));
  const groups = chart.nodes.filter((n) => n.kind === 'group');
  const placeable = chart.nodes.filter((n) => n.kind !== 'group');
  // A parent that is not a group (or a loop of groups) is left out; the parser already said so.
  const groupOf = (id: string): string | undefined => {
    const parent = byId.get(id)?.parent;
    return parent !== undefined && byId.get(parent)?.kind === 'group' ? parent : undefined;
  };
  const ancestors = (id: string): string[] => {
    const out: string[] = [];
    for (let g = groupOf(id); g !== undefined && !out.includes(g); g = groupOf(g)) out.push(g);
    return out;
  };
  const neighbours = new Map<string, string[]>();
  for (const e of chart.edges) {
    neighbours.set(e.from, [...(neighbours.get(e.from) ?? []), e.to]);
    neighbours.set(e.to, [...(neighbours.get(e.to) ?? []), e.from]);
  }

  const nodes = new Map<string, PlacedNode>();
  const frames = new Map<string, Box>();
  const labelBelow = (n: ArchitectureNode): number => (n.kind === 'service' ? m.labelHeight(n) : 0);
  /** A node's box: its icon and the label under it. */
  const nodeBox = (p: PlacedNode): Box => {
    const lw = Math.max(m.iconSize, p.node.kind === 'service' ? m.labelWidth(p.node) : 0);
    return { x: p.cx - lw / 2, y: p.cy - m.iconSize / 2, w: lw, h: m.iconSize + labelBelow(p.node) };
  };

  let cursorX = 0;
  for (const ids of parts(chart, placeable.map((n) => n.id), groupOf)) {
    const grid = solveGrid(chart, ids, neighbours, warnings);
    const partGroups = groups.filter((g) => ids.some((id) => ancestors(id).includes(g.id)));

    // Distance between consecutive grid lines, widened where frames end or start between them.
    const coords = (axis: Axis): Map<number, number> => {
      const values = ids.map((id) => grid.get(id)![axis]);
      const lo = Math.floor(Math.min(...values));
      const hi = Math.ceil(Math.max(...values));
      const spans = partGroups.map((g) => {
        const inside = ids.filter((id) => ancestors(id).includes(g.id)).map((id) => grid.get(id)![axis]);
        return { min: Math.min(...inside), max: Math.max(...inside) };
      });
      const pos = new Map<number, number>([[lo, 0]]);
      for (let k = lo; k < hi; k++) {
        const borders = spans.filter((s) => (s.max >= k && s.max < k + 1) || (s.min > k && s.min <= k + 1)).length;
        const row = ids.filter((id) => grid.get(id)![axis] >= k && grid.get(id)![axis] < k + 1);
        const next = ids.filter((id) => grid.get(id)![axis] > k && grid.get(id)![axis] <= k + 1);
        let step: number;
        if (axis === 'x') {
          const half = (list: string[]): number => Math.max(m.iconSize, ...list.map((id) => m.labelWidth(byId.get(id)!))) / 2;
          step = Math.max(m.iconSize + Math.max(m.gap, borders * m.padding + (borders > 0 ? m.clearance : 0)), half(row) + half(next) + m.gap / 3);
        } else {
          const label = Math.max(0, ...row.map((id) => labelBelow(byId.get(id)!)));
          step = m.iconSize + Math.max(m.gap, label + (borders > 0 ? borders * m.padding + m.clearance : m.gap / 3));
        }
        pos.set(k + 1, pos.get(k)! + step);
      }
      return pos;
    };
    const px = coords('x');
    const py = coords('y');
    const at = (pos: Map<number, number>, v: number): number => {
      const k = Math.floor(v);
      const base = pos.get(k)!;
      return v === k ? base : base + (v - k) * (pos.get(k + 1)! - base);
    };
    const placed = ids.map((id): PlacedNode => ({ node: byId.get(id)!, cx: at(px, grid.get(id)!.x), cy: at(py, grid.get(id)!.y) }));

    // Frames, innermost first: members' boxes and nested frames, plus the padding and room for the header.
    const partFrames = new Map<string, Box>();
    const depth = (g: string): number => ancestors(g).length;
    for (const g of [...partGroups].sort((a, b) => depth(b.id) - depth(a.id))) {
      const boxes = [
        ...placed.filter((p) => groupOf(p.node.id) === g.id).map(nodeBox),
        ...partGroups.filter((c) => groupOf(c.id) === g.id).map((c) => partFrames.get(c.id)!),
      ].filter((b): b is Box => b !== undefined);
      if (boxes.length === 0) continue;
      const x = Math.min(...boxes.map((b) => b.x)) - m.padding;
      const y = Math.min(...boxes.map((b) => b.y)) - m.padding;
      const right = Math.max(...boxes.map((b) => b.x + b.w)) + m.padding;
      const bottom = Math.max(...boxes.map((b) => b.y + b.h)) + m.padding;
      partFrames.set(g.id, { x, y, w: Math.max(right - x, m.headerWidth(g)), h: bottom - y });
    }

    // Place this part to the right of the previous one, tops aligned.
    const extent = [...placed.map(nodeBox), ...partFrames.values()];
    const left = Math.min(...extent.map((b) => b.x));
    const top = Math.min(...extent.map((b) => b.y));
    const right = Math.max(...extent.map((b) => b.x + b.w));
    const dx = cursorX - left;
    const dy = -top;
    for (const p of placed) nodes.set(p.node.id, { ...p, cx: p.cx + dx, cy: p.cy + dy });
    for (const [id, b] of partFrames) frames.set(id, { ...b, x: b.x + dx, y: b.y + dy });
    cursorX += right - left + m.gap;
  }

  // Outermost first, so an inner frame is drawn over its parent.
  const ordered = new Map([...frames].sort(([a], [b]) => ancestors(a).length - ancestors(b).length));
  const all = [...[...nodes.values()].map(nodeBox), ...ordered.values()];
  const width = all.length > 0 ? Math.max(...all.map((b) => b.x + b.w)) : 0;
  const height = all.length > 0 ? Math.max(...all.map((b) => b.y + b.h)) : 0;
  return { nodes, frames: ordered, width, height, warnings };
}
