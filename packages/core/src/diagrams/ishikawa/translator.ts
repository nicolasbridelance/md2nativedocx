/**
 * OOXML translator for a Mermaid `ishikawa-beta`. Family D strategy
 * (calculated shapes on a `wpc:wpc` canvas): a horizontal spine ending in the
 * effect "head" box on the right; categories alternate above/below the spine
 * in shared columns, each a header box with a diagonal bone running to the
 * spine; every cause (at any depth, flattened) is a right-aligned text row
 * along the bone with a short tick, indented by depth.
 */

import type { IshikawaCategory, IshikawaDiagram } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { boxShape, noteParagraph, scalePt, tint } from '../../translator/boxes.js';
import { pathShape } from '../../translator/path-shape.js';
import {
  createIdAllocator,
  scaledExtent,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';

const FONT_PX = 13;
const ROW_H = 22;
const HEAD_H = 30;
const PAD = 24;
const INDENT = 14;
const COL_GAP = 16;
const EFFECT_H = 56;
const PALETTE = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '7030A0', '5B9BD5', 'C00000', '2E8B8B'];

function rowWidth(c: IshikawaCategory['causes'][number]): number {
  return estimateTextWidth(c.label, FONT_PX) + 14 + (c.depth - 1) * INDENT;
}

function textWidth(cat: IshikawaCategory): number {
  return Math.max(estimateTextWidth(cat.label, FONT_PX) + 24, ...cat.causes.map(rowWidth));
}

/** Translate a parsed Ishikawa diagram into a self-contained WordprocessingML paragraph. */
export function translateIshikawaToOoxml(diagram: IshikawaDiagram, options: CanvasOptions = {}): string {
  if (diagram.effect.length === 0) return noteParagraph('An Ishikawa diagram needs an effect on its first line.');

  const nextId = createIdAllocator();
  const cats = diagram.categories;
  // Pair k = top category 2k + bottom category 2k+1, sharing one column.
  const columns: Array<{ top?: IshikawaCategory; bottom?: IshikawaCategory; topIdx: number; width: number }> = [];
  for (let i = 0; i < cats.length; i += 2) {
    const top = cats[i];
    const bottom = cats[i + 1];
    columns.push({ ...(top ? { top } : {}), ...(bottom ? { bottom } : {}), topIdx: i, width: 0 });
  }
  const topRows = Math.max(0, ...columns.map((c) => c.top?.causes.length ?? 0));
  const bottomRows = Math.max(0, ...columns.map((c) => c.bottom?.causes.length ?? 0));
  const topH = HEAD_H + (topRows + 1) * ROW_H;
  const bottomH = HEAD_H + (bottomRows + 1) * ROW_H;
  const slantTop = topH * 0.35;
  const slantBottom = bottomH * 0.35;
  for (const col of columns) {
    const w = Math.max(col.top ? textWidth(col.top) : 0, col.bottom ? textWidth(col.bottom) : 0);
    col.width = w + Math.max(slantTop, slantBottom) + 20 + COL_GAP;
  }

  const effectW = Math.ceil(estimateTextWidth(diagram.effect, FONT_PX + 1)) + 32;
  const spineY = PAD + topH;
  const bodyW = columns.reduce((sum, c) => sum + c.width, 0) + 40;
  const canvasW = PAD + bodyW + effectW + PAD;
  const canvasH = spineY + bottomH + PAD;
  const { scale: s } = scaledExtent(canvasW, canvasH, options);
  const emu = (v: number): number => scalePt(v, s);
  const pt = (x: number, y: number): { x: number; y: number } => ({ x: emu(x), y: emu(y) });
  const thin = scaledLineWidthEmu(9525, s);
  const bone = scaledLineWidthEmu(22225, s);
  const spine = scaledLineWidthEmu(38100, s);

  const parts: string[] = [];
  const spineEndX = PAD + bodyW;
  parts.push(pathShape(nextId(), [pt(PAD, spineY), pt(spineEndX, spineY)], false, undefined, 0, '404040', spine));
  parts.push(
    boxShape(nextId(), emu(spineEndX), emu(spineY - EFFECT_H / 2), emu(effectW), emu(EFFECT_H), [diagram.effect], { fill: '404040', color: 'FFFFFF', bold: true, noWrap: true }, FONT_PX + 1, s),
  );

  const drawCategory = (cat: IshikawaCategory, idx: number, colX: number, colW: number, up: boolean, regionH: number, slant: number): void => {
    const color = PALETTE[idx % PALETTE.length] ?? '4472C4';
    const dir = up ? -1 : 1;
    const boneX1 = colX + colW - COL_GAP; // where the bone meets the spine
    const boneX0 = boneX1 - slant; // header end of the bone
    const headW = Math.ceil(estimateTextWidth(cat.label, FONT_PX)) + 24;
    const headY = up ? spineY - regionH : spineY + regionH - HEAD_H;
    const boneStartY = up ? headY + HEAD_H : headY;
    parts.push(pathShape(nextId(), [pt(boneX0, boneStartY), pt(boneX1, spineY)], false, undefined, 0, color, bone));
    parts.push(boxShape(nextId(), emu(boneX0 - headW / 2), emu(headY), emu(headW), emu(HEAD_H), [cat.label], { fill: color, color: 'FFFFFF', bold: true, noWrap: true }, FONT_PX, s));
    cat.causes.forEach((cause, r) => {
      // Rows run from the header toward the spine: top bones go down, bottom bones go up.
      const rowY = boneStartY - dir * (r + 0.5) * ROW_H;
      const f = (rowY - boneStartY) / (spineY - boneStartY);
      const bx = boneX0 + (boneX1 - boneX0) * f;
      const w = Math.ceil(estimateTextWidth(cause.label, FONT_PX)) + 14;
      const right = bx - 8 - (cause.depth - 1) * INDENT;
      parts.push(
        boxShape(nextId(), emu(right - w), emu(rowY - ROW_H / 2), emu(w), emu(ROW_H), [cause.label], cause.depth > 1 ? { color: '595959', italic: true, align: 'right', noWrap: true } : { color: '000000', align: 'right', noWrap: true }, FONT_PX, s),
        pathShape(nextId(), [pt(right, rowY), pt(bx, rowY)], false, undefined, 0, tint(color, 0.35), thin),
      );
    });
  };

  let x = PAD;
  for (const col of columns) {
    if (col.top) drawCategory(col.top, col.topIdx, x, col.width, true, topH, slantTop);
    if (col.bottom) drawCategory(col.bottom, col.topIdx + 1, x, col.width, false, bottomH, slantBottom);
    x += col.width;
  }

  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), diagram.effect, options);
}
