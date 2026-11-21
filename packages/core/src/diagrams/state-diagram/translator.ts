/**
 * OOXML translator for a Mermaid `stateDiagram`/`stateDiagram-v2` (Family B —
 * reuses Dagre for layout, same rationale as `../class-diagram/translator.ts`'s
 * module doc comment for why `dagre` is used directly rather than
 * `../../layout/layout.ts`'s own `layout()`). Shares its node/connector shape
 * primitives (`rect`/`ellipse`/`diamond`/`textBoxLines`/`connector`/
 * `edgePoint`) with that module via `../../translator/graph-shapes.ts`.
 *
 * Unlike `classDiagram`'s 8 relationship types, every `stateDiagram`
 * transition renders identically (solid line, one triangle arrowhead at the
 * target end) — no per-type marker/dash table needed here.
 *
 * Pseudo-state shapes follow standard UML state-machine notation: a filled
 * circle for `start`, a filled circle inside a ring for `end`, a diamond for
 * `choice`, and a thin filled bar for `fork`/`join` (oriented perpendicular
 * to its block's flow direction — a horizontal bar for `TD`/`BT`, a
 * vertical one for `LR`/`RL`).
 *
 * Composite states are laid out from the inside out, one Dagre graph per block: a composite's content is
 * laid out alone, in the composite's own direction (Mermaid's default, top to bottom, when it declares
 * none), and the composite then enters its parent's graph as one box of that size. Mermaid lays out a
 * composite the same way when no transition crosses its border. Laying out each block alone, rather than
 * one compound Dagre graph, keeps clear of Dagre's failures on clusters holding cycles (see `layout.ts`),
 * which state machines are full of, and makes a transition to a composite (`A --> Composite`) an ordinary
 * edge. A transition that does cross a border (`Outside --> Inner`) is laid out as a link between the
 * boxes holding its ends at the level where they meet, and drawn straight to the inner state.
 *
 * Concurrent regions (`--`) are laid out one by one too, then placed side by side across the composite's
 * flow (in a row for a top-to-bottom composite, in a column for a left-to-right one), dashed lines between.
 */

import dagre from 'dagre';
import { assertWithinLimits, layoutWithinLimits, nodeKey } from '../../layout/graph-limits.js';
import type { StateDiagram, StateNode, StateNote, StateRegion } from './types.js';
import { boxShape } from '../../translator/boxes.js';
import { estimateTextWidth } from '../../layout/layout.js';
import {
  createIdAllocator,
  scaledExtent,
  scaledFontSizeHalfPt,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';
import { connector, diamond, edgePoint, ellipse, parallelEdgeOffset, perpendicularUnit, rect, scalePt, shiftPoint, textBoxLines } from '../../translator/graph-shapes.js';

const LINE_COLOR = '2F5496';
const FILL = 'D9E2F3';
const LABEL_FONT_PX = 11;
const LABEL_SIZE_HALFPT = 18;
const EDGE_LABEL_SIZE_HALFPT = 16;
const NORMAL_H = 36;
/** Description lines under a state's label (PlantUML `State : text`). */
const DESC_FONT_PX = 10;
const DESC_SIZE_HALFPT = 16;
const DESC_LINE_H = 15;
const DESC_PAD = 6;
const PAD_X = 12;

/** Composite state: title band height, padding around its content, inset of the white content area. */
const COMPOSITE_TITLE_H = 28;
const COMPOSITE_PAD = 14;
const COMPOSITE_INSET = 4;
/** A composite's corner radius, fixed: Word's default grows with the box and uncovers the content area's corners. */
const COMPOSITE_RADIUS = 8;
/** Gap between two concurrent regions, the dashed divider in its middle. */
const REGION_GAP = 24;
/** Note: the class diagram's look (Mermaid's default note colours, folded corner, left-aligned lines). */
const NOTE_FILL = 'FFF5AD';
const NOTE_LINE = 'AAAA33';
const NOTE_FONT_PX = 11;
const NOTE_LINE_H = 18;
const NOTE_PAD = 10;
/** Gap between a state and its notes, and between two notes on the same side. */
const NOTE_GAP = 16;
const NOTE_STACK_GAP = 8;
/** Gap between two transitions joining the same pair of states (`A --> B`, `B --> A`). */
const PARALLEL_GAP = 14;

const START_END_SIZE = 18;
const END_OUTER_SIZE = 26;
const CHOICE_SIZE = 34;
const FORK_LENGTH = 50;
const FORK_THICKNESS = 8;

const RANKDIR: Readonly<Record<StateDiagram['direction'], 'TB' | 'BT' | 'LR' | 'RL'>> = {
  TD: 'TB',
  BT: 'BT',
  LR: 'LR',
  RL: 'RL',
};

interface NodeSize {
  width: number;
  height: number;
}

function sizeForNode(node: StateNode, direction: StateDiagram['direction']): NodeSize {
  switch (node.kind) {
    case 'start':
      return { width: START_END_SIZE, height: START_END_SIZE };
    case 'end':
      return { width: END_OUTER_SIZE, height: END_OUTER_SIZE };
    case 'choice':
      return { width: CHOICE_SIZE, height: CHOICE_SIZE };
    case 'fork':
    case 'join':
      return direction === 'LR' || direction === 'RL'
        ? { width: FORK_THICKNESS, height: FORK_LENGTH }
        : { width: FORK_LENGTH, height: FORK_THICKNESS };
    default: {
      const lines = node.description ?? [];
      const widest = Math.max(estimateTextWidth(node.label, LABEL_FONT_PX), ...lines.map((l) => estimateTextWidth(l, DESC_FONT_PX)));
      return { width: Math.max(70, widest + PAD_X * 2), height: NORMAL_H + (lines.length > 0 ? lines.length * DESC_LINE_H + DESC_PAD : 0) };
    }
  }
}

function nodeShapes(nextId: () => number, node: StateNode, size: NodeSize, x: number, y: number, s: number): string[] {
  const bx = scalePt(x, s);
  const by = scalePt(y, s);
  const w = scalePt(size.width, s);
  const h = scalePt(size.height, s);

  switch (node.kind) {
    case 'start':
      return [ellipse(nextId(), bx, by, w, h, '000000')];
    case 'end': {
      const innerPad = Math.round(w * 0.28);
      return [
        ellipse(nextId(), bx, by, w, h, 'FFFFFF', '000000'),
        ellipse(nextId(), bx + innerPad, by + innerPad, w - 2 * innerPad, h - 2 * innerPad, '000000'),
      ];
    }
    case 'choice':
      return [diamond(nextId(), bx, by, w, h, FILL, LINE_COLOR)];
    case 'fork':
    case 'join':
      return [rect(nextId(), bx, by, w, h, '000000', undefined, node.id)];
    default: {
      const lines = node.description ?? [];
      if (lines.length === 0) {
        return [
          rect(nextId(), bx, by, w, h, FILL, LINE_COLOR, node.label, true),
          textBoxLines(nextId(), bx, by, w, h, [node.label], scaledFontSizeHalfPt(LABEL_SIZE_HALFPT, s), { align: 'ctr' }),
        ];
      }
      // Label in the top band, description lines below it, inside the same rounded box.
      const titleH = scalePt(NORMAL_H, s);
      return [
        rect(nextId(), bx, by, w, h, FILL, LINE_COLOR, node.label, true),
        textBoxLines(nextId(), bx, by, w, titleH, [node.label], scaledFontSizeHalfPt(LABEL_SIZE_HALFPT, s), { align: 'ctr', bold: true }),
        textBoxLines(nextId(), bx + scalePt(PAD_X / 2, s), by + titleH, w - scalePt(PAD_X, s), h - titleH, lines, scaledFontSizeHalfPt(DESC_SIZE_HALFPT, s)),
      ];
    }
  }
}

/** How far a self-transition's loop reaches out to the right of its state. */
const SELF_LOOP_W = 22;

/** A transition from a state to itself: out of the right side, down, and back in with the arrowhead, the
 * label beyond the loop. A straight connector would have zero length there. */
function selfLoop(nextId: () => number, cx: number, cy: number, size: NodeSize, label: string | undefined, s: number): string[] {
  const x0 = cx + size.width / 2;
  const x1 = x0 + SELF_LOOP_W;
  const y1 = cy - size.height / 4;
  const y2 = cy + size.height / 4;
  const width = scaledLineWidthEmu(9525, s);
  const segment = (ax: number, ay: number, bx: number, by: number, head: boolean): string =>
    connector(nextId(), scalePt(ax, s), scalePt(ay, s), scalePt(bx, s), scalePt(by, s), LINE_COLOR, width, 'solid', 'none', MARKER_SIZE, head ? 'triangle' : 'none', MARKER_SIZE);
  const parts = [segment(x0, y1, x1, y1, false), segment(x1, y1, x1, y2, false), segment(x1, y2, x0, y2, true)];
  if (label) {
    const labelWidth = estimateTextWidth(label, 8) + 12;
    parts.push(
      textBoxLines(nextId(), scalePt(x1 + 4, s), scalePt(cy - 10, s), scalePt(labelWidth, s), scalePt(20, s), [label], scaledFontSizeHalfPt(EDGE_LABEL_SIZE_HALFPT, s), {
        align: 'l',
      }),
    );
  }
  return parts;
}

/** Every transition renders the same way: a solid line, one triangle
 * arrowhead at the `to` end — unlike `classDiagram`'s 8 relationship types,
 * `stateDiagram` has no per-type marker/dash variation to encode. */
const MARKER_SIZE = 'sm';

/** A box, top-left corner and size, in the coordinates of the block it was laid out in. */
interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A laid-out block (the diagram, a composite's content or one region): everything in it, at any depth. */
interface BlockLayout {
  width: number;
  height: number;
  /** Every state in the block, composites included, at any depth. */
  frames: Map<string, Frame>;
  /** Dashed lines between regions. */
  dividers: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  /** Centre of the room Dagre kept for a transition's label, by the transition's index. */
  labels: Map<number, { x: number; y: number }>;
  /** Every note in the block, at any depth, by the note's index in `StateDiagram.notes`. */
  notes: Map<number, Frame>;
}

function centre(f: Frame): { x: number; y: number } {
  return { x: f.x + f.width / 2, y: f.y + f.height / 2 };
}

function offsetFrame(f: Frame, dx: number, dy: number): Frame {
  return { x: f.x + dx, y: f.y + dy, width: f.width, height: f.height };
}

/** Copy `inner`'s frames into `outer`, shifted by (`dx`, `dy`). */
function mergeInto(outer: BlockLayout, inner: BlockLayout, dx: number, dy: number): void {
  for (const [id, f] of inner.frames) outer.frames.set(id, offsetFrame(f, dx, dy));
  for (const d of inner.dividers) outer.dividers.push({ x1: d.x1 + dx, y1: d.y1 + dy, x2: d.x2 + dx, y2: d.y2 + dy });
  for (const [i, p] of inner.labels) outer.labels.set(i, { x: p.x + dx, y: p.y + dy });
  for (const [i, f] of inner.notes) outer.notes.set(i, offsetFrame(f, dx, dy));
}

function emptyLayout(): BlockLayout {
  return { width: 0, height: 0, frames: new Map(), dividers: [], labels: new Map(), notes: new Map() };
}

/** The diagram's nesting: what each block holds. The key of the diagram itself is `undefined`. */
class Nesting {
  readonly children = new Map<string | undefined, StateNode[]>();
  readonly regions = new Map<string, StateRegion[]>();
  private readonly parentOf = new Map<string, string | undefined>();

  constructor(chart: StateDiagram) {
    const regionIds = new Set((chart.regions ?? []).map((r) => r.id));
    const stateIds = new Set(chart.states.map((s) => s.id));
    for (const node of chart.states) {
      // A parent that names nothing drawn (hand-built AST) puts the state at the top level.
      const parent = node.parent !== undefined && (stateIds.has(node.parent) || regionIds.has(node.parent)) && node.parent !== node.id ? node.parent : undefined;
      this.parentOf.set(node.id, parent);
      const list = this.children.get(parent) ?? [];
      list.push(node);
      this.children.set(parent, list);
    }
    for (const region of chart.regions ?? []) {
      // An empty region has nothing to draw; a region of a state that does not exist is dropped.
      if (!this.children.has(region.id) || !stateIds.has(region.parent)) continue;
      this.parentOf.set(region.id, region.parent);
      const list = this.regions.get(region.parent) ?? [];
      list.push(region);
      this.regions.set(region.parent, list);
    }
    // A cycle of parents (only a hand-built AST can have one) would recurse for ever: cut it at the top level.
    for (const node of chart.states) {
      const seen = new Set<string>();
      for (let at: string | undefined = node.id; at !== undefined; at = this.parentOf.get(at)) {
        if (seen.has(at)) {
          this.detach(node.id);
          break;
        }
        seen.add(at);
      }
    }
  }

  private detach(id: string): void {
    const parent = this.parentOf.get(id);
    const list = this.children.get(parent) ?? [];
    const node = list.find((n) => n.id === id);
    this.children.set(parent, list.filter((n) => n.id !== id));
    this.parentOf.set(id, undefined);
    if (node) this.children.set(undefined, [...(this.children.get(undefined) ?? []), node]);
  }

  isComposite(id: string): boolean {
    return (this.children.get(id)?.length ?? 0) > 0 || this.regions.has(id);
  }

  /** The member of block `block` that holds `id` (`id` itself when it is one), or `undefined` if none does. */
  memberOf(id: string, block: string | undefined): string | undefined {
    for (let at: string | undefined = id; at !== undefined; at = this.parentOf.get(at)) {
      if (this.parentOf.get(at) === block && this.parentOf.has(at)) return at;
    }
    return undefined;
  }
}

/** Room a self-transition's loop and label take on the right of its state. */
function selfLoopRooms(chart: StateDiagram): Map<string, number> {
  const rooms = new Map<string, number>();
  for (const t of chart.transitions) {
    if (t.from !== t.to) continue;
    const room = SELF_LOOP_W + (t.label ? estimateTextWidth(t.label, 8) + 8 : 0);
    rooms.set(t.from, Math.max(rooms.get(t.from) ?? 0, room));
  }
  return rooms;
}

/** A note's box: its longest line, its line count, padding, and the folded corner's room. */
function noteSize(note: StateNote): NodeSize {
  const widest = Math.max(0, ...note.lines.map((line) => estimateTextWidth(line, NOTE_FONT_PX)));
  return { width: Math.max(60, widest + 2 * NOTE_PAD + 12), height: Math.max(1, note.lines.length) * NOTE_LINE_H + 2 * NOTE_PAD };
}

/**
 * What one member of a block takes in its Dagre graph: the state, its self-loop's room on its right, and its
 * notes on their sides (stacked when several share a side). Dagre then keeps the notes clear of every other
 * box, as it does the state. Positions are relative to the member's box, the box around all of them.
 *
 * Transitions are straight lines to the state's centre, and they come in along the block's flow: from above
 * and below in a top-to-bottom block, from the sides in a left-to-right one. A note on such a side is moved
 * off the state's axis (to the right of it above or below, beneath it on the left or right), so the lines
 * coming in along the flow pass beside it instead of through it. A note on a side across the flow stays
 * centred on the state.
 */
interface MemberBox {
  width: number;
  height: number;
  state: { x: number; y: number };
  notes: Array<{ index: number; frame: Frame }>;
}

function memberBox(size: NodeSize, loopRoom: number, notes: Array<{ index: number; note: StateNote }>, direction: StateDiagram['direction']): MemberBox {
  const vertical = direction === 'TD' || direction === 'BT';
  const bySide = (side: StateNote['side']) => notes.filter(({ note }) => note.side === side).map(({ index, note }) => ({ index, size: noteSize(note) }));
  const stackH = (list: Array<{ size: NodeSize }>): number => list.reduce((h, n) => h + n.size.height, 0) + Math.max(0, list.length - 1) * NOTE_STACK_GAP;
  // Everything placed around the state, its top-left corner at (0, 0); the box is then fitted around it all.
  const placed: Array<{ index: number; frame: Frame }> = [];
  const cx = size.width / 2;
  const cy = size.height / 2;
  const stack = (list: ReturnType<typeof bySide>, x: (w: number) => number, top: number): void => {
    let y = top;
    for (const n of list) {
      placed.push({ index: n.index, frame: { x: x(n.size.width), y, width: n.size.width, height: n.size.height } });
      y += n.size.height + NOTE_STACK_GAP;
    }
  };
  const left = bySide('left');
  const right = bySide('right');
  const top = bySide('top');
  const bottom = bySide('bottom');
  // Left and right: centred on the state, or beneath its axis in a left-to-right block.
  const sideTop = (list: ReturnType<typeof bySide>): number => (vertical ? cy - stackH(list) / 2 : cy + NOTE_STACK_GAP);
  stack(left, (w) => -NOTE_GAP - w, sideTop(left));
  stack(right, () => size.width + loopRoom + NOTE_GAP, sideTop(right));
  // Above and below: centred on the state, or right of its axis in a top-to-bottom block.
  const across = (w: number): number => (vertical ? cx + NOTE_STACK_GAP : cx - w / 2);
  stack(top, across, -NOTE_GAP - stackH(top));
  stack(bottom, across, size.height + NOTE_GAP);

  let minX = 0;
  let minY = 0;
  let maxX = size.width + loopRoom;
  let maxY = size.height;
  for (const { frame: f } of placed) {
    minX = Math.min(minX, f.x);
    minY = Math.min(minY, f.y);
    maxX = Math.max(maxX, f.x + f.width);
    maxY = Math.max(maxY, f.y + f.height);
  }
  return {
    width: maxX - minX,
    height: maxY - minY,
    state: { x: -minX, y: -minY },
    notes: placed.map(({ index, frame }) => ({ index, frame: offsetFrame(frame, -minX, -minY) })),
  };
}

/** Lays the diagram out block by block, from the inside out (see the module doc comment). */
class StateLayout {
  private readonly loopRooms: Map<string, number>;
  private readonly notesOf = new Map<string, Array<{ index: number; note: StateNote }>>();

  constructor(
    private readonly chart: StateDiagram,
    private readonly nesting: Nesting,
    private readonly options: CanvasOptions,
  ) {
    this.loopRooms = selfLoopRooms(chart);
    (chart.notes ?? []).forEach((note, index) => {
      const list = this.notesOf.get(note.for) ?? [];
      list.push({ index, note });
      this.notesOf.set(note.for, list);
    });
  }

  /** The members of `block` laid out in one Dagre graph, in `direction`. */
  layoutBlock(block: string | undefined, direction: StateDiagram['direction']): BlockLayout {
    const out = emptyLayout();
    const members = this.nesting.children.get(block) ?? [];
    if (members.length === 0) return out;

    // Each member's own box: a composite's from its laid-out content, any other state's from its text.
    const inner = new Map<string, BlockLayout>();
    const sizes = new Map<string, NodeSize>();
    for (const node of members) {
      if (this.nesting.isComposite(node.id)) {
        const content = this.layoutComposite(node);
        inner.set(node.id, content);
        sizes.set(node.id, { width: content.width, height: content.height });
      } else {
        sizes.set(node.id, sizeForNode(node, direction));
      }
    }

    const boxes = new Map<string, MemberBox>();
    for (const node of members) boxes.set(node.id, memberBox(sizes.get(node.id)!, this.loopRooms.get(node.id) ?? 0, this.notesOf.get(node.id) ?? [], direction));

    const g = new dagre.graphlib.Graph({ multigraph: true });
    g.setGraph({ rankdir: RANKDIR[direction], nodesep: 40, ranksep: 60, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const node of members) {
      const box = boxes.get(node.id)!;
      g.setNode(nodeKey(node.id), { width: box.width, height: box.height });
    }
    // A transition joins, at this level, the two members holding its ends; one inside a single member is laid
    // out with that member's content. A label tells Dagre the room it takes, as the class diagram does.
    this.chart.transitions.forEach((t, i) => {
      const a = this.nesting.memberOf(t.from, block);
      const b = this.nesting.memberOf(t.to, block);
      if (a === undefined || b === undefined || a === b) return;
      const room = t.label ? { width: estimateTextWidth(t.label, 8) + 12, height: 20, labelpos: 'c' } : {};
      g.setEdge(nodeKey(a), nodeKey(b), room, String(i));
    });
    layoutWithinLimits(g, this.options);

    for (const node of members) {
      const n = g.node(nodeKey(node.id)) as { x: number; y: number };
      const size = sizes.get(node.id)!;
      const box = boxes.get(node.id)!;
      const left = n.x - box.width / 2;
      const top = n.y - box.height / 2;
      const frame = { x: left + box.state.x, y: top + box.state.y, width: size.width, height: size.height };
      out.frames.set(node.id, frame);
      for (const { index, frame: f } of box.notes) out.notes.set(index, offsetFrame(f, left, top));
      const content = inner.get(node.id);
      if (content) mergeInto(out, content, frame.x, frame.y);
    }
    // Where Dagre put each label: a spot it kept clear of every box, beside the transition's route.
    for (const e of g.edges()) {
      const label = g.edge(e) as { x?: number; y?: number; width?: number };
      if (label.width !== undefined && label.x !== undefined && label.y !== undefined) out.labels.set(Number(e.name), { x: label.x, y: label.y });
    }
    const graph = g.graph() as { width?: number; height?: number };
    out.width = graph.width ?? 0;
    out.height = graph.height ?? 0;
    return out;
  }

  /** A composite state's box: title band, then its content (its states, or its regions side by side). */
  private layoutComposite(node: StateNode): BlockLayout {
    // Mermaid lays a composite's content out top to bottom unless the composite says otherwise.
    const direction = node.direction ?? 'TD';
    const regions = this.nesting.regions.get(node.id);
    const content = regions ? this.layoutRegions(regions, direction) : this.layoutBlock(node.id, direction);
    const titleWidth = estimateTextWidth(node.label, LABEL_FONT_PX) + 2 * PAD_X;
    const width = Math.max(content.width + 2 * COMPOSITE_PAD, titleWidth, 70);
    const height = COMPOSITE_TITLE_H + content.height + 2 * COMPOSITE_PAD;
    const out = emptyLayout();
    mergeInto(out, content, (width - content.width) / 2, COMPOSITE_TITLE_H + COMPOSITE_PAD);
    out.width = width;
    out.height = height;
    return out;
  }

  /** Regions laid out one by one, then side by side across the flow, a divider in each gap. */
  private layoutRegions(regions: StateRegion[], direction: StateDiagram['direction']): BlockLayout {
    const laid = regions.map((r) => ({ layout: this.layoutBlock(r.id, direction) }));
    const inRow = direction === 'TD' || direction === 'BT';
    const across = Math.max(...laid.map(({ layout }) => (inRow ? layout.height : layout.width)));
    const out = emptyLayout();
    let at = 0;
    laid.forEach(({ layout }, i) => {
      if (i > 0) {
        const mid = at - REGION_GAP / 2;
        out.dividers.push(inRow ? { x1: mid, y1: 0, x2: mid, y2: across } : { x1: 0, y1: mid, x2: across, y2: mid });
      }
      // Centred in its slot across the row (or column), as wide (or tall) as the widest region.
      const dx = inRow ? at : (across - layout.width) / 2;
      const dy = inRow ? (across - layout.height) / 2 : at;
      mergeInto(out, layout, dx, dy);
      at += (inRow ? layout.width : layout.height) + REGION_GAP;
    });
    const along = at - REGION_GAP;
    out.width = inRow ? along : across;
    out.height = inRow ? across : along;
    return out;
  }
}

/** Height of a transition label's text box. */
const LABEL_H = 20;
/** Gap between a label and the line it names. */
const LABEL_GAP = 4;

/**
 * Where a transition label goes (top-left corner, alignment), from the centre Dagre kept for it. Dagre keeps
 * that room on its own route, which the straight line drawn here does not follow: left there, a label floats
 * away from its line or sits across it. So the spot is projected onto the drawn line (kept off its ends) and
 * the label set against the line at that point, on the side Dagre chose, just far enough that its box does
 * not touch the line: the box's half-extent along the line's normal, plus a gap. A line spread from a twin
 * (`A --> B`, `B --> A`) takes its label to the side away from the twin, `away` (the perpendicular offset it
 * was drawn with), whatever Dagre chose.
 */
function labelBeside(
  kept: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  width: number,
  away: { x: number; y: number },
): { x: number; y: number; align: 'l' | 'ctr' } {
  const lx = p2.x - p1.x;
  const ly = p2.y - p1.y;
  const length = Math.hypot(lx, ly);
  if (length === 0) return { x: kept.x - width / 2, y: kept.y - LABEL_H / 2, align: 'ctr' };
  // Unit normal, turned to the right or, on a horizontal line, upwards: the default side.
  let nx = -ly / length;
  let ny = lx / length;
  if (nx < -1e-9 || (Math.abs(nx) <= 1e-9 && ny > 0)) [nx, ny] = [-nx, -ny];
  const t = Math.min(0.8, Math.max(0.2, ((kept.x - p1.x) * lx + (kept.y - p1.y) * ly) / (length * length)));
  const q = { x: p1.x + t * lx, y: p1.y + t * ly };
  const twin = away.x * nx + away.y * ny;
  const chosen = (kept.x - q.x) * nx + (kept.y - q.y) * ny;
  const side = Math.abs(twin) > 1 ? Math.sign(twin) : Math.abs(chosen) > 1 ? Math.sign(chosen) : 1;
  const clearance = (width / 2) * Math.abs(nx) + (LABEL_H / 2) * Math.abs(ny) + LABEL_GAP;
  const cx = q.x + side * nx * clearance;
  const cy = q.y + side * ny * clearance;
  // Right of a near-vertical line, the text starts at the line; elsewhere it is centred in a box sized to it.
  return { x: cx - width / 2, y: cy - LABEL_H / 2, align: side * nx > 0.9 ? 'l' : 'ctr' };
}

/** The shapes of a composite state: its box and title band, the white content area below the title. */
function compositeShapes(nextId: () => number, node: StateNode, f: Frame, dx: number, dy: number, s: number): string[] {
  const x = scalePt(f.x + dx, s);
  const y = scalePt(f.y + dy, s);
  const w = scalePt(f.width, s);
  const h = scalePt(f.height, s);
  const titleH = scalePt(COMPOSITE_TITLE_H, s);
  const inset = scalePt(COMPOSITE_INSET, s);
  return [
    rect(nextId(), x, y, w, h, FILL, LINE_COLOR, node.label, true, (COMPOSITE_RADIUS / Math.max(1, Math.min(f.width, f.height))) * 100000),
    rect(nextId(), x + inset, y + titleH, w - 2 * inset, h - titleH - inset, 'FFFFFF', LINE_COLOR, `${node.label} content`),
    textBoxLines(nextId(), x, y, w, titleH, [node.label], scaledFontSizeHalfPt(LABEL_SIZE_HALFPT, s), { align: 'ctr', bold: true }),
  ];
}

/** Translate a parsed state diagram into a self-contained WordprocessingML
 * paragraph. An empty diagram renders a visible note, matching the other
 * Family B/C translators' zero-content convention — never a silent blank
 * canvas. */
export function translateStateDiagramToOoxml(chart: StateDiagram, options: CanvasOptions = {}): string {
  if (chart.states.length === 0) {
    return [
      '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '  <w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>',
      '  <w:r>',
      '    <w:rPr><w:i/><w:color w:val="808080"/><w:sz w:val="18"/></w:rPr>',
      '    <w:t xml:space="preserve">This state diagram has no content to render.</w:t>',
      '  </w:r>',
      '</w:p>',
    ].join('\n');
  }

  // The whole diagram is checked against the limits once, as one graph, before any block is laid out: the
  // blocks are each small, but together they are the diagram the caps are about.
  const whole = new dagre.graphlib.Graph({ multigraph: true });
  for (const node of chart.states) whole.setNode(nodeKey(node.id), {});
  chart.transitions.forEach((t, i) => {
    if (whole.hasNode(nodeKey(t.from)) && whole.hasNode(nodeKey(t.to))) whole.setEdge(nodeKey(t.from), nodeKey(t.to), {}, String(i));
  });
  assertWithinLimits(whole, options);

  const nesting = new Nesting(chart);
  const laid = new StateLayout(chart, nesting, options).layoutBlock(undefined, chart.direction);
  const frames = laid.frames;

  const PAD = 24;
  const canvasW = laid.width + 2 * PAD;
  const canvasH = laid.height + 2 * PAD;
  const dx = PAD;
  const dy = PAD;
  const { scale: s } = scaledExtent(canvasW, canvasH, options);

  const nextId = createIdAllocator();
  const parts: string[] = [];
  const lineWidth = scaledLineWidthEmu(9525, s);

  // Composites first, outer before inner (a composite is listed before what it holds), so they stay behind;
  // then the region dividers, the transitions, and the other states on top.
  for (const node of chart.states) {
    const f = frames.get(node.id);
    if (f && nesting.isComposite(node.id)) parts.push(...compositeShapes(nextId, node, f, dx, dy, s));
  }
  // Notes: the dotted line to their state first, then the note itself.
  for (const [index, f] of laid.notes) {
    const note = chart.notes![index]!;
    const target = frames.get(note.for);
    if (target) {
      const nc = centre(f);
      const tc = centre(target);
      const a = edgePoint(nc.x, nc.y, f.width / 2, f.height / 2, tc.x, tc.y);
      const b = edgePoint(tc.x, tc.y, target.width / 2, target.height / 2, nc.x, nc.y);
      parts.push(connector(nextId(), scalePt(a.x + dx, s), scalePt(a.y + dy, s), scalePt(b.x + dx, s), scalePt(b.y + dy, s), NOTE_LINE, lineWidth, 'dash', 'none', 'sm', 'none', 'sm'));
    }
    parts.push(
      boxShape(
        nextId(),
        scalePt(f.x + dx, s),
        scalePt(f.y + dy, s),
        scalePt(f.width, s),
        scalePt(f.height, s),
        note.lines.length > 0 ? note.lines : [''],
        { fill: NOTE_FILL, line: NOTE_LINE, color: '000000', align: 'left', prst: 'foldedCorner' },
        NOTE_FONT_PX,
        s,
      ),
    );
  }
  for (const d of laid.dividers) {
    parts.push(connector(nextId(), scalePt(d.x1 + dx, s), scalePt(d.y1 + dy, s), scalePt(d.x2 + dx, s), scalePt(d.y2 + dy, s), LINE_COLOR, lineWidth, 'dash', 'none', 'sm', 'none', 'sm'));
  }

  // Transitions joining the same two states (`A --> B` and `B --> A`) are spread apart, not drawn on top of
  // each other: an offset per transition within its pair, along one perpendicular per pair.
  const pairKey = (t: StateDiagram['transitions'][number]): string => [t.from, t.to].sort().join('\u0000');
  const pairCount = new Map<string, number>();
  for (const t of chart.transitions) if (t.from !== t.to) pairCount.set(pairKey(t), (pairCount.get(pairKey(t)) ?? 0) + 1);
  const pairSeen = new Map<string, number>();

  for (const [transitionIndex, t] of chart.transitions.entries()) {
    const fFrom = frames.get(t.from);
    const fTo = frames.get(t.to);
    if (!fFrom || !fTo) continue;
    const cFrom = centre(fFrom);
    const cTo = centre(fTo);
    if (t.from === t.to) {
      parts.push(...selfLoop(nextId, cFrom.x + dx, cFrom.y + dy, fFrom, t.label, s));
      continue;
    }
    const key = pairKey(t);
    const index = pairSeen.get(key) ?? 0;
    pairSeen.set(key, index + 1);
    const offset = parallelEdgeOffset(index, pairCount.get(key) ?? 1, PARALLEL_GAP);
    // One perpendicular per pair, from the pair's sorted order (see `perpendicularUnit`).
    const [first, second] = t.from < t.to ? [cFrom, cTo] : [cTo, cFrom];
    const { ux, uy } = perpendicularUnit(first, second);
    const from = shiftPoint(cFrom, ux, uy, offset);
    const to = shiftPoint(cTo, ux, uy, offset);
    const p1 = edgePoint(from.x, from.y, fFrom.width / 2, fFrom.height / 2, to.x, to.y);
    const p2 = edgePoint(to.x, to.y, fTo.width / 2, fTo.height / 2, from.x, from.y);
    parts.push(
      connector(nextId(), scalePt(p1.x + dx, s), scalePt(p1.y + dy, s), scalePt(p2.x + dx, s), scalePt(p2.y + dy, s), LINE_COLOR, lineWidth, 'solid', 'none', MARKER_SIZE, 'triangle', MARKER_SIZE),
    );
    if (t.label) {
      // In the room Dagre kept for it, set against the drawn line (`labelBeside`). A transition no single block
      // laid out (between two regions of one composite) starts from the middle of its line instead.
      const kept = laid.labels.get(transitionIndex) ?? { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const labelWidth = estimateTextWidth(t.label, 8) + 12;
      const at = labelBeside(kept, p1, p2, labelWidth, { x: ux * offset, y: uy * offset });
      parts.push(
        textBoxLines(nextId(), scalePt(at.x + dx, s), scalePt(at.y + dy, s), scalePt(labelWidth, s), scalePt(LABEL_H, s), [t.label], scaledFontSizeHalfPt(EDGE_LABEL_SIZE_HALFPT, s), {
          align: at.align,
        }),
      );
    }
  }

  for (const node of chart.states) {
    const f = frames.get(node.id);
    if (!f || nesting.isComposite(node.id)) continue;
    parts.push(...nodeShapes(nextId, node, f, f.x + dx, f.y + dy, s));
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, 'State diagram', options);
}
