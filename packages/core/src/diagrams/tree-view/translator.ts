/**
 * OOXML translator for a Mermaid `treeView-beta`. Family D strategy
 * (calculated shapes on a `wpc:wpc` canvas): one row per node, indented by
 * depth, with thin connector bars (vertical from a parent down to its last
 * child, horizontal stub into each child). Directories are bold, descriptions
 * italic gray beside the label, `highlight` gets a yellow background.
 */

import type { TreeViewDiagram } from './types.js';
import { boxShape, noteParagraph, scalePt, type BoxStyle } from '../../translator/boxes.js';
import {
  createIdAllocator,
  scaledExtent,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';
import { estimateTextWidth } from '../../layout/layout.js';

const PAD = 24;
const INDENT = 26;
const ROW_H = 26;
const FONT_PX = 14;
const LINE = 2;
const STUB = 12;
const TEXT_PAD = 10;
const LINE_COLOR = '7F7F7F';

/** Translate a parsed tree view into a self-contained WordprocessingML paragraph. */
export function translateTreeViewToOoxml(diagram: TreeViewDiagram, options: CanvasOptions = {}): string {
  const { nodes } = diagram;
  if (nodes.length === 0) return noteParagraph('This tree view has no nodes to render.');

  const nextId = createIdAllocator();
  const labelW = nodes.map((nd) => Math.ceil(estimateTextWidth(nd.label, FONT_PX)) + TEXT_PAD * 2);
  const descW = nodes.map((nd) => (nd.description ? Math.ceil(estimateTextWidth(nd.description, FONT_PX)) + TEXT_PAD * 2 : 0));
  const textX = (d: number): number => PAD + d * INDENT + STUB + 4;

  let canvasW = PAD * 2;
  nodes.forEach((nd, i) => {
    canvasW = Math.max(canvasW, textX(nd.depth) + (labelW[i] ?? 0) + (descW[i] ?? 0) + PAD);
  });
  const canvasH = PAD * 2 + nodes.length * ROW_H;
  const { scale: s } = scaledExtent(canvasW, canvasH, options);

  const box = (x: number, y: number, w: number, h: number, lines: string[], style: BoxStyle): string =>
    boxShape(nextId(), scalePt(x, s), scalePt(y, s), scalePt(w, s), scalePt(h, s), lines, style, FONT_PX, s);
  const bar = (x: number, y: number, w: number, h: number): string => box(x, y, w, h, [], { fill: LINE_COLOR, color: '000000' });

  const rowY = (i: number): number => PAD + i * ROW_H;
  const lastChild = new Map<number, number>();
  nodes.forEach((nd, i) => {
    if (nd.parent >= 0) lastChild.set(nd.parent, i);
  });

  const parts: string[] = [];
  nodes.forEach((nd, i) => {
    const y = rowY(i);
    const x = textX(nd.depth);
    if (nd.parent >= 0) {
      parts.push(bar(x - STUB - 4, y + ROW_H / 2 - LINE / 2, STUB, LINE));
    }
    const last = lastChild.get(i);
    if (last !== undefined) {
      const vx = textX(nd.depth + 1) - STUB - 4;
      const top = y + ROW_H - 4;
      parts.push(bar(vx, top, LINE, rowY(last) + ROW_H / 2 - top + LINE / 2));
    }
    parts.push(
      box(x, y + 2, labelW[i] ?? 0, ROW_H - 4, [nd.label], {
        ...(nd.highlighted ? { fill: 'FFF2CC', line: 'BF9000' } : {}),
        color: '000000',
        bold: nd.isDirectory,
        align: 'left',
        noWrap: true,
      }),
    );
    if (nd.description) {
      parts.push(
        box(x + (labelW[i] ?? 0), y + 2, descW[i] ?? 0, ROW_H - 4, [nd.description], {
          color: '595959',
          italic: true,
          align: 'left',
          noWrap: true,
        }),
      );
    }
  });

  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), 'Tree view', options);
}
