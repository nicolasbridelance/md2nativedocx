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
import type { StateDiagram, StateNode } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import {
  createIdAllocator,
  scaledExtent,
  scaledFontSizeHalfPt,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
} from '../../translator/canvas.js';
import { connector, diamond, edgePoint, ellipse, rect, scalePt, textBoxLines } from '../../translator/graph-shapes.js';

const LINE_COLOR = '2F5496';
const FILL = 'D9E2F3';
const LABEL_FONT_PX = 11;
const LABEL_SIZE_HALFPT = 18;
const EDGE_LABEL_SIZE_HALFPT = 16;
const NORMAL_H = 36;
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
    default:
      return { width: Math.max(70, estimateTextWidth(node.label, LABEL_FONT_PX) + PAD_X * 2), height: NORMAL_H };
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
    default:
      return [
        rect(nextId(), bx, by, w, h, FILL, LINE_COLOR, node.label, true),
        textBoxLines(nextId(), bx, by, w, h, [node.label], scaledFontSizeHalfPt(LABEL_SIZE_HALFPT, s), { align: 'ctr' }),
      ];
  }
}

/** Every transition renders the same way: a solid line, one triangle
 * arrowhead at the `to` end — unlike `classDiagram`'s 8 relationship types,
 * `stateDiagram` has no per-type marker/dash variation to encode. */
const MARKER_SIZE = 'sm';

/** Translate a parsed state diagram into a self-contained WordprocessingML
 * paragraph. An empty diagram renders a visible note, matching the other
 * Family B/C translators' zero-content convention — never a silent blank
 * canvas. */
export function translateStateDiagramToOoxml(chart: StateDiagram): string {
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
    g.setNode(node.id, { width: size.width, height: size.height });
  }
  for (const t of chart.transitions) {
    if (g.hasNode(t.from) && g.hasNode(t.to)) g.setEdge(t.from, t.to);
  }
  dagre.layout(g);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of chart.states) {
    const n = g.node(node.id) as { x: number; y: number };
    const size = sizes.get(node.id)!;
    minX = Math.min(minX, n.x - size.width / 2);
    maxX = Math.max(maxX, n.x + size.width / 2);
    minY = Math.min(minY, n.y - size.height / 2);
    maxY = Math.max(maxY, n.y + size.height / 2);
  }
  const PAD = 24;
  const canvasW = maxX - minX + 2 * PAD;
  const canvasH = maxY - minY + 2 * PAD;
  const dx = -minX + PAD;
  const dy = -minY + PAD;
  const { scale: s } = scaledExtent(canvasW, canvasH);

  const nextId = createIdAllocator();
  const parts: string[] = [];

  for (const t of chart.transitions) {
    const nFrom = g.node(t.from) as { x: number; y: number } | undefined;
    const nTo = g.node(t.to) as { x: number; y: number } | undefined;
    if (!nFrom || !nTo) continue;
    const sizeFrom = sizes.get(t.from)!;
    const sizeTo = sizes.get(t.to)!;
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
      parts.push(
        textBoxLines(
          nextId(),
          scalePt(midX + dx - labelWidth / 2, s),
          scalePt(midY + dy - 10, s),
          scalePt(labelWidth, s),
          scalePt(20, s),
          [t.label],
          scaledFontSizeHalfPt(EDGE_LABEL_SIZE_HALFPT, s),
          { align: 'ctr' },
        ),
      );
    }
  }

  for (const node of chart.states) {
    const n = g.node(node.id) as { x: number; y: number };
    const size = sizes.get(node.id)!;
    parts.push(...nodeShapes(nextId, node, size, n.x - size.width / 2 + dx, n.y - size.height / 2 + dy, s));
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, 'State diagram');
}
