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
 * to the diagram's flow direction — a horizontal bar for `TD`/`BT`, a
 * vertical one for `LR`/`RL`).
 */

import dagre from 'dagre';
import { layoutWithinLimits, nodeKey } from '../../layout/graph-limits.js';
import type { StateDiagram, StateNode } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import {
  createIdAllocator,
  scaledExtent,
  scaledFontSizeHalfPt,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';
import { connector, diamond, edgePoint, ellipse, rect, scalePt, textBoxLines } from '../../translator/graph-shapes.js';

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

  const sizes = new Map<string, NodeSize>();
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: RANKDIR[chart.direction], nodesep: 40, ranksep: 60, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of chart.states) {
    const size = sizeForNode(node, chart.direction);
    sizes.set(node.id, size);
    g.setNode(nodeKey(node.id), { width: size.width, height: size.height });
  }
  for (const t of chart.transitions) {
    if (g.hasNode(nodeKey(t.from)) && g.hasNode(nodeKey(t.to))) g.setEdge(nodeKey(t.from), nodeKey(t.to));
  }
  layoutWithinLimits(g, options);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  // Self-transitions are drawn as a loop on the right of the state, with the label beyond it: room for both.
  const loopRoom = new Map<string, number>();
  for (const t of chart.transitions) {
    if (t.from !== t.to) continue;
    const room = SELF_LOOP_W + (t.label ? estimateTextWidth(t.label, 8) + 8 : 0);
    loopRoom.set(t.from, Math.max(loopRoom.get(t.from) ?? 0, room));
  }
  for (const node of chart.states) {
    const n = g.node(nodeKey(node.id)) as { x: number; y: number };
    const size = sizes.get(node.id)!;
    minX = Math.min(minX, n.x - size.width / 2);
    maxX = Math.max(maxX, n.x + size.width / 2 + (loopRoom.get(node.id) ?? 0));
    minY = Math.min(minY, n.y - size.height / 2);
    maxY = Math.max(maxY, n.y + size.height / 2);
  }
  const PAD = 24;
  const canvasW = maxX - minX + 2 * PAD;
  const canvasH = maxY - minY + 2 * PAD;
  const dx = -minX + PAD;
  const dy = -minY + PAD;
  const { scale: s } = scaledExtent(canvasW, canvasH, options);

  const nextId = createIdAllocator();
  const parts: string[] = [];

  for (const t of chart.transitions) {
    const nFrom = g.node(nodeKey(t.from)) as { x: number; y: number } | undefined;
    const nTo = g.node(nodeKey(t.to)) as { x: number; y: number } | undefined;
    if (!nFrom || !nTo) continue;
    const sizeFrom = sizes.get(t.from)!;
    const sizeTo = sizes.get(t.to)!;
    if (t.from === t.to) {
      parts.push(...selfLoop(nextId, nFrom.x + dx, nFrom.y + dy, sizeFrom, t.label, s));
      continue;
    }
    const p1 = edgePoint(nFrom.x, nFrom.y, sizeFrom.width / 2, sizeFrom.height / 2, nTo.x, nTo.y);
    const p2 = edgePoint(nTo.x, nTo.y, sizeTo.width / 2, sizeTo.height / 2, nFrom.x, nFrom.y);
    parts.push(
      connector(
        nextId(),
        scalePt(p1.x + dx, s),
        scalePt(p1.y + dy, s),
        scalePt(p2.x + dx, s),
        scalePt(p2.y + dy, s),
        LINE_COLOR,
        scaledLineWidthEmu(9525, s),
        'solid',
        'none',
        MARKER_SIZE,
        'triangle',
        MARKER_SIZE,
      ),
    );
    if (t.label) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const labelWidth = estimateTextWidth(t.label, 8) + 12;
      // Beside a slanted line rather than across it: on the side the line heads to, so the labels of two
      // transitions that diverge from one state end up on either side instead of on top of each other.
      const slope = p2.x - p1.x;
      const side = Math.abs(slope) < 4 ? 0 : Math.sign(slope);
      const x = side === 0 ? midX - labelWidth / 2 : side > 0 ? midX + 4 : midX - labelWidth - 4;
      parts.push(
        textBoxLines(
          nextId(),
          scalePt(x + dx, s),
          scalePt(midY + dy - 10, s),
          scalePt(labelWidth, s),
          scalePt(20, s),
          [t.label],
          scaledFontSizeHalfPt(EDGE_LABEL_SIZE_HALFPT, s),
          // Left of the line, the box is sized to the text, so centring in it reads as right-aligned.
          { align: side > 0 ? 'l' : 'ctr' },
        ),
      );
    }
  }

  for (const node of chart.states) {
    const n = g.node(nodeKey(node.id)) as { x: number; y: number };
    const size = sizes.get(node.id)!;
    parts.push(...nodeShapes(nextId, node, size, n.x - size.width / 2 + dx, n.y - size.height / 2 + dy, s));
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, 'State diagram', options);
}
