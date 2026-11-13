/**
 * OOXML translator for a Mermaid `treemap-beta` diagram. Family D strategy
 * (calculated shapes on a `wpc:wpc` canvas): a squarified treemap (Bruls et
 * al.) — rectangles proportional to value, children sorted by descending value
 * as Mermaid/d3 do. A section is a tinted rectangle with a header strip
 * holding its label, its children tiled in the padded interior; a leaf shows
 * its label and value. Top-level sections each take a palette color, nested
 * levels are tinted lighter; `:::class` + `classDef fill/color/stroke`
 * override per node. Labels that don't fit are wrapped, then clipped to the
 * lines that do, and dropped when the box is too small.
 */

import type { TreemapDiagram, TreemapNode } from './types.js';
import { boxShape, fitFont, noteParagraph, scalePt, tint, wrapText } from '../../translator/boxes.js';
import {
  createIdAllocator,
  scaledExtent,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';
import { validateHexColor } from '../../translator/xml-escape.js';

const CANVAS_W = 640;
const CANVAS_H = 420;
const PAD = 16;
const HEADER_H = 22;
const INNER_PAD = 4;
const FONT_PX = 12;
const LINE_H = 15;
const MIN_FONT_PX = 7;
const PALETTE = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '7030A0', '5B9BD5', 'C00000', '2E8B8B'];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Sized {
  node: TreemapNode;
  value: number;
  children: Sized[];
}

function size(node: TreemapNode): Sized {
  const children = node.children.map(size).filter((c) => c.value > 0);
  const value = node.children.length > 0 ? children.reduce((s, c) => s + c.value, 0) : (node.value ?? 0);
  children.sort((a, b) => b.value - a.value);
  return { node, value, children };
}

/** Squarified layout of `items` (already sorted descending) into `rect`. */
function squarify(items: Sized[], rect: Rect): Rect[] {
  const out: Rect[] = new Array<Rect>(items.length);
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return out;
  let free = { ...rect };
  let freeValue = total;
  let start = 0;

  const worst = (row: Sized[], rowValue: number, side: number): number => {
    const area = (rowValue / freeValue) * free.w * free.h;
    const thickness = area / side;
    let w = 0;
    for (const item of row) {
      const len = ((item.value / rowValue) * area) / thickness;
      w = Math.max(w, len / thickness, thickness / len);
    }
    return w;
  };

  while (start < items.length) {
    const side = Math.min(free.w, free.h);
    let end = start + 1;
    let rowValue = items[start]?.value ?? 0;
    let score = worst(items.slice(start, end), rowValue, side);
    while (end < items.length) {
      const nextValue = rowValue + (items[end]?.value ?? 0);
      const nextScore = worst(items.slice(start, end + 1), nextValue, side);
      if (nextScore > score) break;
      rowValue = nextValue;
      score = nextScore;
      end++;
    }
    const row = items.slice(start, end);
    const rowArea = (rowValue / freeValue) * free.w * free.h;
    const horizontal = free.w >= free.h; // lay the row as a column on the left
    const thickness = horizontal ? rowArea / free.h : rowArea / free.w;
    let offset = 0;
    row.forEach((item, k) => {
      const len = (item.value / rowValue) * (horizontal ? free.h : free.w);
      out[start + k] = horizontal
        ? { x: free.x, y: free.y + offset, w: thickness, h: len }
        : { x: free.x + offset, y: free.y, w: len, h: thickness };
      offset += len;
    });
    free = horizontal
      ? { x: free.x + thickness, y: free.y, w: free.w - thickness, h: free.h }
      : { x: free.x, y: free.y + thickness, w: free.w, h: free.h - thickness };
    freeValue -= rowValue;
    start = end;
  }
  return out;
}

/** Translate a parsed treemap into a self-contained WordprocessingML paragraph. */
export function translateTreemapToOoxml(diagram: TreemapDiagram, options: CanvasOptions = {}): string {
  const roots = diagram.roots.map(size).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  if (roots.length === 0) return noteParagraph('This treemap has no values to render.');

  const nextId = createIdAllocator();
  const { scale: s } = scaledExtent(CANVAS_W, CANVAS_H, options);
  const parts: string[] = [];

  const emit = (rect: Rect, lines: string[], fill: string, color: string, line: string, bold: boolean): void => {
    // A word too wide for its box is shrunk to fit (no mid-word break).
    const fit = fitFont(lines, FONT_PX, rect.w - 4, MIN_FONT_PX);
    parts.push(
      boxShape(nextId(), scalePt(rect.x, s), scalePt(rect.y, s), scalePt(rect.w, s), scalePt(rect.h, s), lines, { fill, color, line, bold, noWrap: fit.shrunk }, fit.fontPx, s),
    );
  };

  const fitLines = (lines: string[], h: number): string[] => lines.slice(0, Math.max(0, Math.floor((h - 4) / LINE_H)));

  const draw = (items: Sized[], area: Rect, baseColor: (i: number) => string, depth: number): void => {
    const rects = squarify(items, area);
    items.forEach((item, i) => {
      const rect = rects[i];
      if (!rect || rect.w < 2 || rect.h < 2) return;
      const style = item.node.className ? diagram.classDefs[item.node.className] : undefined;
      const base = baseColor(i);
      const stroke = validateHexColor(style?.stroke, 'FFFFFF');
      const textColor = validateHexColor(style?.color, '000000');
      const isSection = item.children.length > 0;
      const label = item.node.label;
      if (!isSection) {
        const fill = validateHexColor(style?.fill, tint(base, Math.min(0.85, 0.35 + depth * 0.15)));
        const lines = [...wrapText(label, FONT_PX, rect.w - 8), ...(rect.h >= 40 ? [String(item.value)] : [])];
        emit(rect, rect.w >= 30 ? fitLines(lines, rect.h) : [], fill, textColor, stroke, false);
        return;
      }
      const fill = validateHexColor(style?.fill, tint(base, Math.min(0.9, 0.55 + depth * 0.12)));
      emit(rect, [], fill, textColor, stroke, false);
      const header = rect.h >= HEADER_H + 2 * INNER_PAD && rect.w >= 30;
      if (header) {
        const headerFill = validateHexColor(style?.fill, tint(base, Math.min(0.7, 0.2 + depth * 0.15)));
        emit({ x: rect.x, y: rect.y, w: rect.w, h: HEADER_H }, fitLines(wrapText(label, FONT_PX, rect.w - 8), HEADER_H + 4), headerFill, depth === 0 && !style?.color ? 'FFFFFF' : textColor, stroke, true);
      }
      const top = header ? HEADER_H : 0;
      const inner = {
        x: rect.x + INNER_PAD,
        y: rect.y + top + INNER_PAD,
        w: rect.w - 2 * INNER_PAD,
        h: rect.h - top - 2 * INNER_PAD,
      };
      if (inner.w > 4 && inner.h > 4) draw(item.children, inner, () => base, depth + 1);
    });
  };

  draw(roots, { x: PAD, y: PAD, w: CANVAS_W - 2 * PAD, h: CANVAS_H - 2 * PAD }, (i) => PALETTE[i % PALETTE.length] ?? '4472C4', 0);

  return wrapDrawingCanvas(parts.join('\n'), CANVAS_W, CANVAS_H, nextId(), 'Treemap', options);
}
