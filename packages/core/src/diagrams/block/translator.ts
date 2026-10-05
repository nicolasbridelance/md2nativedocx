/**
 * OOXML translator for a Mermaid `block-beta`. Family D strategy (calculated
 * shapes on a `wpc:wpc` canvas): a column grid where every block takes `span`
 * columns and wraps to the next row when the row is full, nested groups laying
 * out their own inner grid, then links drawn on top as straight connectors
 * between block borders (with an optional label chip). Differences from
 * Mermaid: links are straight lines (they can cross intermediate blocks), the
 * cylinder / hexagon / parallelogram / arrow-block shapes are drawn as
 * rectangles, every row is one uniform height unless a nested group makes it
 * taller, and `config` / theme styling is ignored (only `style`, `classDef`
 * and `class` colors are honored).
 */

import type { BlockCell, BlockDiagram } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { boxShape, fitFont, noteParagraph } from '../../translator/boxes.js';
import {
  createIdAllocator,
  scaledExtent,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';
import { connector, diamond, edgePoint, ellipse, rect, scalePt } from '../../translator/graph-shapes.js';

const FONT_PX = 13;
const PAD = 20;
const GAP = 12;
const BLOCK_H = 56;
const GROUP_PAD = 10;
const MIN_CELL_W = 110;
const BLOCK_FILL = 'DAE8FC';
const BLOCK_STROKE = '6C8EBF';
const GROUP_FILL = 'F5F5F5';
const GROUP_STROKE = 'BFBFBF';
const LINK_COLOR = '404040';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Placed extends Rect {
  cell: BlockCell;
}

/** Columns used by a group: explicit, else every child on one row. */
function columnsOf(group: BlockCell): number {
  const total = group.children.reduce((n, c) => n + c.span, 0);
  return Math.max(1, Math.min(24, group.columns ?? total));
}

/**
 * Lay out `group`'s children inside a box `innerW` wide starting at `(ox, oy)`.
 * Appends to `out` (skipped when `out` is undefined, i.e. a measuring pass) and
 * returns the total inner height.
 */
function layoutGroup(group: BlockCell, innerW: number, ox: number, oy: number, out: Placed[] | undefined): number {
  const cols = columnsOf(group);
  const cw = (innerW - (cols - 1) * GAP) / cols;
  const rows: Array<Array<{ cell: BlockCell; col: number; span: number }>> = [];
  let col = 0;
  for (const cell of group.children) {
    const span = Math.min(cell.span, cols);
    if (col + span > cols || rows.length === 0) {
      rows.push([]);
      col = 0;
    }
    (rows[rows.length - 1] as Array<{ cell: BlockCell; col: number; span: number }>).push({ cell, col, span });
    col += span;
  }
  const widthOf = (span: number): number => span * cw + (span - 1) * GAP;
  let y = oy;
  rows.forEach((row, ri) => {
    const heights = row.map(({ cell, span }) =>
      cell.kind === 'group' ? layoutGroup(cell, widthOf(span) - 2 * GROUP_PAD, 0, 0, undefined) + 2 * GROUP_PAD : BLOCK_H,
    );
    const rowH = Math.max(BLOCK_H, ...heights);
    for (const { cell, col: c, span } of row) {
      const box: Placed = { cell, x: ox + c * (cw + GAP), y, w: widthOf(span), h: rowH };
      if (cell.kind === 'space') continue;
      out?.push(box);
      if (cell.kind === 'group') layoutGroup(cell, box.w - 2 * GROUP_PAD, box.x + GROUP_PAD, box.y + GROUP_PAD, out);
    }
    y += rowH + (ri < rows.length - 1 ? GAP : 0);
  });
  return y - oy;
}

/** Widest per-column width any leaf label needs, so text rarely has to shrink. */
function neededCellWidth(group: BlockCell): number {
  let need = MIN_CELL_W;
  for (const c of group.children) {
    if (c.kind === 'group') need = Math.max(need, neededCellWidth(c));
    else if (c.kind === 'block') need = Math.max(need, (estimateTextWidth(c.label, FONT_PX) + 28 - (c.span - 1) * GAP) / c.span);
  }
  return Math.min(need, 320);
}

/** Translate a parsed block diagram into a self-contained WordprocessingML paragraph. */
export function translateBlockToOoxml(diagram: BlockDiagram, options: CanvasOptions = {}): string {
  const root = diagram.root;
  if (!root.children.some((c) => c.kind !== 'space')) return noteParagraph('A block diagram needs at least one block to render.');

  const cols = columnsOf(root);
  const cellW = Math.ceil(neededCellWidth(root));
  const innerW = cols * cellW + (cols - 1) * GAP;
  const placed: Placed[] = [];
  const innerH = layoutGroup(root, innerW, PAD, PAD, placed);
  const canvasW = innerW + 2 * PAD;
  const canvasH = innerH + 2 * PAD;

  const { scale: s } = scaledExtent(canvasW, canvasH, options);
  const emu = (v: number): number => scalePt(v, s);
  const nextId = createIdAllocator();
  const parts: string[] = [];
  const byId = new Map<string, Rect>();

  for (const p of placed) {
    if (p.cell.id) byId.set(p.cell.id, p);
    const st = p.cell.style;
    if (p.cell.kind === 'group') {
      parts.push(rect(nextId(), emu(p.x), emu(p.y), emu(p.w), emu(p.h), st.fill ?? GROUP_FILL, st.stroke ?? GROUP_STROKE, `Group ${p.cell.id ?? ''}`.trim(), true));
      continue;
    }
    const fill = st.fill ?? BLOCK_FILL;
    const stroke = st.stroke ?? BLOCK_STROKE;
    const [x, y, w, h] = [emu(p.x), emu(p.y), emu(p.w), emu(p.h)] as const;
    if (p.cell.shape === 'circle') parts.push(ellipse(nextId(), x, y, w, h, fill, stroke));
    else if (p.cell.shape === 'diamond') parts.push(diamond(nextId(), x, y, w, h, fill, stroke));
    else parts.push(rect(nextId(), x, y, w, h, fill, stroke, `Block ${p.cell.id ?? ''}`.trim(), p.cell.shape !== 'rect'));
    const inset = p.cell.shape === 'diamond' || p.cell.shape === 'circle' ? 0.3 : 0.06;
    const fit = fitFont([p.cell.label], FONT_PX, p.w * (1 - 2 * inset), 8);
    parts.push(boxShape(nextId(), x, y, w, h, [p.cell.label], { color: st.color ?? '000000', noWrap: true }, fit.fontPx, s));
  }

  for (const link of diagram.links) {
    const a = byId.get(link.from);
    const b = byId.get(link.to);
    if (!a || !b || a === b) continue;
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const p1 = edgePoint(ac.x, ac.y, a.w / 2, a.h / 2, bc.x, bc.y);
    const p2 = edgePoint(bc.x, bc.y, b.w / 2, b.h / 2, ac.x, ac.y);
    parts.push(
      connector(nextId(), emu(p1.x), emu(p1.y), emu(p2.x), emu(p2.y), LINK_COLOR, scaledLineWidthEmu(12700, s), link.dashed ? 'dash' : 'solid', 'none', 'sm', link.arrow ? 'triangle' : 'none', 'sm'),
    );
    if (link.label) {
      const w = Math.ceil(estimateTextWidth(link.label, FONT_PX - 2)) + 12;
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      parts.push(boxShape(nextId(), emu(mx - w / 2), emu(my - 9), emu(w), emu(18), [link.label], { fill: 'FFFFFF', color: '000000', noWrap: true }, FONT_PX - 2, s));
    }
  }

  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), 'Block diagram', options);
}
