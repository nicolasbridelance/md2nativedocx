/**
 * OOXML translator for a Mermaid `treeView-beta`. Family D strategy (calculated shapes on a `wpc:wpc`
 * canvas), laid out as Mermaid draws it (its `treeView/renderer.ts` and `styles.ts`, mermaid@12.3.0):
 * one row per node under the implicit `/` root, indented by depth; a thin black line runs down from
 * each directory to its last child, with a stub into each child; directories in bold, without their
 * trailing `/`; descriptions in green italics, in one column to the right of the longest name; a
 * `highlight` row on an amber band that runs to the right edge of the tree.
 */

import type { TreeViewDiagram } from './types.js';
import { withImplicitRoot } from './implicit-root.js';
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
const LINE = 1;
const STUB = 12;
const TEXT_PAD = 10;
/** Gap between the longest name and the description column. */
const DESC_GAP = 6;
/** How far the highlight band runs past the widest text. */
const BAND_OVERHANG = 8;
/** Mermaid's tree view colours (`styles.ts`): black lines, green descriptions, amber highlight. */
const LINE_COLOR = '000000';
const DESCRIPTION_COLOR = '6A9955';
/** `rgba(255, 193, 7, 0.15)` over white. */
const HIGHLIGHT_FILL = 'FFF6DA';
const HIGHLIGHT_STROKE = 'FFC107';

/** Translate a parsed tree view into a self-contained WordprocessingML paragraph. */
export function translateTreeViewToOoxml(diagram: TreeViewDiagram, options: CanvasOptions = {}): string {
  if (diagram.nodes.length === 0) return noteParagraph('This tree view has no nodes to render.');
  const rows = withImplicitRoot(diagram);

  const nextId = createIdAllocator();
  const textX = (d: number): number => PAD + d * INDENT + STUB + 4;
  const labelW = rows.map((nd) => Math.ceil(estimateTextWidth(nd.label, FONT_PX)) + TEXT_PAD * 2);
  const descW = rows.map((nd) => (nd.description ? Math.ceil(estimateTextWidth(nd.description, FONT_PX)) + TEXT_PAD * 2 : 0));
  const labelRight = Math.max(...rows.map((nd, i) => textX(nd.depth) + (labelW[i] ?? 0)));
  const hasDescriptions = descW.some((w) => w > 0);
  const descX = labelRight + DESC_GAP;
  const textRight = hasDescriptions ? Math.max(...descW.map((w) => (w > 0 ? descX + w : 0))) : labelRight;
  const bandRight = textRight + (rows.some((nd) => nd.highlighted) ? BAND_OVERHANG : 0);

  const canvasW = bandRight + PAD;
  const canvasH = PAD * 2 + rows.length * ROW_H;
  const { scale: s } = scaledExtent(canvasW, canvasH, options);

  const box = (x: number, y: number, w: number, h: number, lines: string[], style: BoxStyle): string =>
    boxShape(nextId(), scalePt(x, s), scalePt(y, s), scalePt(w, s), scalePt(h, s), lines, style, FONT_PX, s);
  const bar = (x: number, y: number, w: number, h: number): string => box(x, y, w, h, [], { fill: LINE_COLOR, color: LINE_COLOR });

  const rowY = (i: number): number => PAD + i * ROW_H;
  const lastChild = new Map<number, number>();
  rows.forEach((nd, i) => {
    if (nd.parent >= 0) lastChild.set(nd.parent, i);
  });

  const parts: string[] = [];
  rows.forEach((nd, i) => {
    const y = rowY(i);
    const x = textX(nd.depth);
    if (nd.highlighted) {
      // Behind the row's text, from the name to the right edge of the tree, as in Mermaid.
      parts.push(box(x, y + 1, bandRight - x, ROW_H - 2, [], { fill: HIGHLIGHT_FILL, line: HIGHLIGHT_STROKE, color: '000000', prst: 'roundRect', cornerAdj: 12000 }));
    }
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
        color: '000000',
        bold: nd.isDirectory,
        align: 'left',
        noWrap: true,
      }),
    );
    if (nd.description) {
      parts.push(
        box(descX, y + 2, descW[i] ?? 0, ROW_H - 4, [nd.description], {
          color: DESCRIPTION_COLOR,
          italic: true,
          align: 'left',
          noWrap: true,
        }),
      );
    }
  });

  const name = diagram.title ?? diagram.accTitle ?? 'Tree view';
  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), name, options);
}
