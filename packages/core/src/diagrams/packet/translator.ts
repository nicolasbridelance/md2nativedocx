/**
 * OOXML translator for a Mermaid `packet` diagram. Family D strategy
 * (calculated shapes on a `wpc:wpc` canvas) with Mermaid's defaults: 32 bits
 * per row, bit 0 on the left, bit numbers shown. Each row is a strip of field
 * boxes whose width is proportional to the field's bit count; a field that
 * crosses a row boundary is split into one labelled segment per row. The
 * first and last bit of each segment are printed above it (the end bit is
 * omitted for 1-bit and very narrow segments, where the two numbers would
 * collide).
 */

import type { PacketDiagram } from './types.js';
import { boxShape, noteParagraph, scalePt, tint, wrapText } from '../../translator/boxes.js';
import {
  createIdAllocator,
  scaledExtent,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';
import { estimateTextWidth } from '../../layout/layout.js';

const BITS_PER_ROW = 32;
const BIT_W = 18;
const ROW_H = 36;
const NUM_H = 16;
const ROW_GAP = 8;
const PAD = 24;
const TITLE_H = 40;
const FONT_PX = 13;
const NUM_FONT_PX = 10;
const MIN_FONT_PX = 7;
const MIN_WIDTH_FOR_END_NUMBER = 3 * BIT_W;
const PALETTE = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '7030A0', '5B9BD5', 'C00000', '2E8B8B'];

/** Translate a parsed packet diagram into a self-contained WordprocessingML paragraph. */
export function translatePacketToOoxml(diagram: PacketDiagram, options: CanvasOptions = {}): string {
  if (diagram.fields.length === 0) return noteParagraph('This packet diagram has no fields to render.');

  const nextId = createIdAllocator();
  const lastBit = Math.max(...diagram.fields.map((f) => f.end));
  const rowCount = Math.floor(lastBit / BITS_PER_ROW) + 1;
  const topMargin = diagram.title ? TITLE_H : 0;
  const rowW = BITS_PER_ROW * BIT_W;
  const canvasW = PAD * 2 + rowW;
  const canvasH = PAD * 2 + topMargin + rowCount * (NUM_H + ROW_H + ROW_GAP);
  const { scale: s } = scaledExtent(canvasW, canvasH, options);
  const parts: string[] = [];

  if (diagram.title) {
    parts.push(boxShape(nextId(), 0, scalePt(PAD / 2, s), scalePt(canvasW, s), scalePt(TITLE_H, s), [diagram.title], { color: '000000', bold: true }, 18, s));
  }

  diagram.fields.forEach((field, index) => {
    const fill = tint(PALETTE[index % PALETTE.length] ?? '4472C4', 0.7);
    for (let row = Math.floor(field.start / BITS_PER_ROW); row <= Math.floor(field.end / BITS_PER_ROW); row++) {
      const segStart = Math.max(field.start, row * BITS_PER_ROW);
      const segEnd = Math.min(field.end, row * BITS_PER_ROW + BITS_PER_ROW - 1);
      const x = PAD + (segStart - row * BITS_PER_ROW) * BIT_W;
      const w = (segEnd - segStart + 1) * BIT_W;
      const rowY = PAD + topMargin + row * (NUM_H + ROW_H + ROW_GAP);
      const numbersW = Math.max(w, estimateTextWidth(String(segStart), NUM_FONT_PX) + 8);

      parts.push(
        boxShape(nextId(), scalePt(x, s), scalePt(rowY, s), scalePt(numbersW, s), scalePt(NUM_H, s), [String(segStart)], { color: '595959', align: 'left', noWrap: true }, NUM_FONT_PX, s),
      );
      if (segEnd > segStart && w >= MIN_WIDTH_FOR_END_NUMBER) {
        parts.push(
          boxShape(nextId(), scalePt(x, s), scalePt(rowY, s), scalePt(w, s), scalePt(NUM_H, s), [String(segEnd)], { color: '595959', align: 'right', noWrap: true }, NUM_FONT_PX, s),
        );
      }
      // A label that cannot wrap into its (narrow) box is shrunk to fit on one
      // line instead of breaking mid-word (e.g. the 1-bit TCP flags).
      const oneLineW = estimateTextWidth(field.label, FONT_PX);
      const unbreakable = !/\s/.test(field.label) && oneLineW > w - 4;
      const fontPx = unbreakable ? Math.max(MIN_FONT_PX, Math.floor((FONT_PX * (w - 4)) / oneLineW)) : FONT_PX;
      const lines = unbreakable ? [field.label] : wrapText(field.label, FONT_PX, Math.max(BIT_W, w - 12));
      parts.push(
        boxShape(nextId(), scalePt(x, s), scalePt(rowY + NUM_H, s), scalePt(w, s), scalePt(ROW_H, s), lines, { fill, color: '000000', line: '7F7F7F', noWrap: unbreakable }, fontPx, s),
      );
    }
  });

  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), diagram.title ?? 'Packet diagram', options);
}
