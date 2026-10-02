/**
 * OOXML translator for a Mermaid `sankey-beta`. Family D strategy (calculated
 * shapes on a `wpc:wpc` canvas): nodes are layered by longest path from a
 * source (pure sinks pushed to the last column, like d3-sankey's "justify"),
 * drawn as bars whose height is proportional to the flow through them, joined
 * by filled ribbons (cubic S-curves sampled as polygons) whose thickness is the
 * link value and whose color follows the source node. Labels show the node name
 * and its value, to the right of the node in the left half and to the left in
 * the right half. Differences from Mermaid: ribbons are polygon approximations
 * and `config` / theme styling (colors, `linkColor`, `nodeAlignment`) is ignored.
 */

import type { SankeyDiagram } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { boxShape, noteParagraph, scalePt } from '../../translator/boxes.js';
import { createIdAllocator, scaledExtent, scaledLineWidthEmu, wrapDrawingCanvas } from '../../translator/canvas.js';
import { pathShape } from '../../translator/path-shape.js';

const FONT_PX = 12;
const PAD = 20;
const NODE_W = 14;
const NODE_GAP = 30;
const LABEL_H = 30;
const MIN_PLOT_H = 320;
const MIN_COL_GAP = 220;
const CURVE_STEPS = 16;
const PALETTE = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '7030A0', '5B9BD5', 'C00000', '2E8B8B'];

interface NodeBox {
  name: string;
  index: number;
  col: number;
  value: number;
  x: number;
  y: number;
  h: number;
  /** Next free offset along the node's right (out) / left (in) edge. */
  outY: number;
  inY: number;
}

function formatValue(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** Translate a parsed Sankey diagram into a self-contained WordprocessingML paragraph. */
export function translateSankeyToOoxml(diagram: SankeyDiagram): string {
  const { nodes, links } = diagram;
  if (links.length === 0) return noteParagraph('A Sankey diagram needs at least one link to render.');

  // Layering: longest path from a source, relaxed at most |nodes| times (the AST is acyclic).
  const col = new Map<string, number>(nodes.map((n) => [n, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const l of links) {
      const want = (col.get(l.source) ?? 0) + 1;
      if (want > (col.get(l.target) ?? 0)) {
        col.set(l.target, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const hasOut = new Set(links.map((l) => l.source));
  const lastCol = Math.max(...col.values());
  const boxes = new Map<string, NodeBox>();
  nodes.forEach((name, index) => {
    const inSum = links.filter((l) => l.target === name).reduce((a, l) => a + l.value, 0);
    const outSum = links.filter((l) => l.source === name).reduce((a, l) => a + l.value, 0);
    boxes.set(name, { name, index, col: hasOut.has(name) ? (col.get(name) ?? 0) : lastCol, value: Math.max(inSum, outSum), x: 0, y: 0, h: 0, outY: 0, inY: 0 });
  });

  const columns: NodeBox[][] = Array.from({ length: lastCol + 1 }, () => []);
  for (const b of boxes.values()) (columns[b.col] as NodeBox[]).push(b);
  const maxCount = Math.max(...columns.map((c) => c.length));
  const plotH = Math.max(MIN_PLOT_H, maxCount * (NODE_GAP + 10));
  let k = Infinity;
  for (const c of columns) {
    if (c.length === 0) continue;
    const sum = c.reduce((a, b) => a + b.value, 0);
    k = Math.min(k, (plotH - NODE_GAP * (c.length - 1)) / sum);
  }

  const colGap = Math.max(MIN_COL_GAP, ...nodes.map((n) => Math.ceil(estimateTextWidth(n, FONT_PX)) + 90));
  const plotW = lastCol * colGap;
  const canvasW = plotW + NODE_W + 2 * PAD;
  const canvasH = plotH + 2 * PAD;
  for (const c of columns) {
    const stack = c.reduce((a, b) => a + Math.max(1, b.value * k), 0) + NODE_GAP * Math.max(0, c.length - 1);
    let y = PAD + (plotH - stack) / 2;
    for (const b of c) {
      b.x = PAD + b.col * colGap;
      b.h = Math.max(1, b.value * k);
      b.y = y;
      b.outY = y;
      b.inY = y;
      y += b.h + NODE_GAP;
    }
  }

  const { scale: s } = scaledExtent(canvasW, canvasH);
  const emu = (v: number): number => scalePt(v, s);
  const nextId = createIdAllocator();
  const parts: string[] = [];
  const thin = scaledLineWidthEmu(3175, s);

  // Ribbons: stack each node's ports in the order of the node at the other end, to limit crossings.
  const outgoing = [...links].sort((a, b) => (boxes.get(a.target)?.y ?? 0) - (boxes.get(b.target)?.y ?? 0));
  const inPort = new Map<(typeof links)[number], number>();
  for (const l of [...links].sort((a, b) => (boxes.get(a.source)?.y ?? 0) - (boxes.get(b.source)?.y ?? 0))) {
    const t = boxes.get(l.target) as NodeBox;
    inPort.set(l, t.inY);
    t.inY += l.value * k;
  }
  for (const l of outgoing) {
    const a = boxes.get(l.source) as NodeBox;
    const b = boxes.get(l.target) as NodeBox;
    const th = l.value * k;
    const x0 = a.x + NODE_W;
    const x1 = b.x;
    const y0 = a.outY;
    const y1 = inPort.get(l) ?? b.y;
    a.outY += th;
    const xm = (x0 + x1) / 2;
    // Cubic Bezier with horizontal tangents at both ends, sampled.
    const curve = (ya: number, yb: number): Array<{ x: number; y: number }> =>
      Array.from({ length: CURVE_STEPS + 1 }, (_, i) => {
        const t = i / CURVE_STEPS;
        const u = 1 - t;
        return {
          x: u * u * u * x0 + 3 * u * u * t * xm + 3 * u * t * t * xm + t * t * t * x1,
          y: u * u * u * ya + 3 * u * u * t * ya + 3 * u * t * t * yb + t * t * t * yb,
        };
      });
    const top = curve(y0, y1);
    const bottom = curve(y0 + th, y1 + th).reverse();
    const color = PALETTE[a.index % PALETTE.length] as string;
    parts.push(pathShape(nextId(), [...top, ...bottom].map((p) => ({ x: emu(p.x), y: emu(p.y) })), true, color, 45, color, thin));
  }

  for (const b of boxes.values()) {
    const color = PALETTE[b.index % PALETTE.length] as string;
    parts.push(boxShape(nextId(), emu(b.x), emu(b.y), emu(NODE_W), emu(b.h), [], { fill: color, color: '000000' }, FONT_PX, s));
  }
  for (const b of boxes.values()) {
    const w = Math.ceil(Math.max(estimateTextWidth(b.name, FONT_PX), estimateTextWidth(formatValue(b.value), FONT_PX))) + 12;
    const right = b.x < canvasW / 2;
    const x = right ? b.x + NODE_W + 4 : b.x - 4 - w;
    parts.push(
      boxShape(nextId(), emu(x), emu(b.y + b.h / 2 - LABEL_H / 2), emu(w), emu(LABEL_H), [b.name, formatValue(b.value)], { color: '000000', align: right ? 'left' : 'right', noWrap: true }, FONT_PX - 1, s),
    );
  }

  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), 'Sankey diagram');
}
