/**
 * OOXML translator for a Mermaid `kanban` board. Family D strategy
 * (calculated shapes on a `wpc:wpc` canvas): one fixed-width column per
 * stage left to right — a header box, then one outlined card per task,
 * stacked top to bottom. A card shows its wrapped title and, when present,
 * a final line `ticket · assigned`; priority is conveyed by the card's
 * thick left-edge stripe (Very High red, High orange, Low blue, Very Low
 * light blue), the same cue Mermaid uses. Tickets are plain text, never links.
 */

import type { KanbanBoard, KanbanPriority } from './types.js';
import { boxShape, noteParagraph, scalePt, tint, wrapText } from '../../translator/boxes.js';
import { createIdAllocator, scaledExtent, wrapDrawingCanvas } from '../../translator/canvas.js';

const COL_W = 200;
const COL_GAP = 14;
const PAD = 24;
const HEADER_H = 36;
const FONT_PX = 13;
const LINE_H = 17;
const CARD_PAD_Y = 10;
const CARD_GAP = 8;
const STRIPE_W = 5;
const WRAP_W = COL_W - 46;
const HEADER_COLORS = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '7030A0', '5B9BD5', 'C00000', '2E8B8B'];
const PRIORITY_COLORS: Record<KanbanPriority, string> = {
  'Very High': 'C00000',
  High: 'ED7D31',
  Low: '5B9BD5',
  'Very Low': 'BDD7EE',
};

/** Translate a parsed kanban board into a self-contained WordprocessingML paragraph. */
export function translateKanbanToOoxml(board: KanbanBoard): string {
  if (board.columns.length === 0) return noteParagraph('This kanban board has no columns to render.');

  const nextId = createIdAllocator();
  const cardLines = board.columns.map((col) =>
    col.cards.map((card) => {
      const lines = wrapText(card.title, FONT_PX, WRAP_W);
      const meta = [card.ticket, card.assigned].filter((v): v is string => Boolean(v)).join(' · ');
      return { lines, meta };
    }),
  );
  const heightOf = (c: { lines: string[]; meta: string }): number =>
    (c.lines.length + (c.meta ? 1 : 0)) * LINE_H + CARD_PAD_Y * 2;
  const headerLines = board.columns.map((col) => wrapText(col.title, FONT_PX, WRAP_W));
  const headerH = Math.max(HEADER_H, ...headerLines.map((l) => l.length * LINE_H + CARD_PAD_Y * 2));
  const bodyH = Math.max(
    CARD_GAP,
    ...cardLines.map((col) => col.reduce((sum, c) => sum + heightOf(c) + CARD_GAP, CARD_GAP)),
  );

  const n = board.columns.length;
  const canvasW = PAD * 2 + n * COL_W + (n - 1) * COL_GAP;
  const canvasH = PAD * 2 + headerH + bodyH;
  const { scale: s } = scaledExtent(canvasW, canvasH);
  const parts: string[] = [];

  board.columns.forEach((column, i) => {
    const x = PAD + i * (COL_W + COL_GAP);
    const color = HEADER_COLORS[i % HEADER_COLORS.length] ?? '4472C4';
    // Column lane (light backdrop) then header on top of it.
    parts.push(boxShape(nextId(), scalePt(x, s), scalePt(PAD, s), scalePt(COL_W, s), scalePt(headerH + bodyH, s), [], { fill: tint(color, 0.88), color: '000000' }, FONT_PX, s));
    parts.push(boxShape(nextId(), scalePt(x, s), scalePt(PAD, s), scalePt(COL_W, s), scalePt(headerH, s), headerLines[i] ?? [''], { fill: color, color: 'FFFFFF', bold: true }, FONT_PX, s));

    let y = PAD + headerH + CARD_GAP;
    column.cards.forEach((card, j) => {
      const info = cardLines[i]?.[j];
      if (!info) return;
      const h = heightOf(info);
      const lines = info.meta ? [...info.lines, info.meta] : info.lines;
      const cardX = x + CARD_GAP / 2;
      const cardW = COL_W - CARD_GAP;
      parts.push(boxShape(nextId(), scalePt(cardX, s), scalePt(y, s), scalePt(cardW, s), scalePt(h, s), lines, { fill: 'FFFFFF', color: '000000', line: 'BFBFBF', align: 'left' }, FONT_PX, s));
      if (card.priority) {
        parts.push(boxShape(nextId(), scalePt(cardX, s), scalePt(y, s), scalePt(STRIPE_W, s), scalePt(h, s), [], { fill: PRIORITY_COLORS[card.priority], color: '000000' }, FONT_PX, s));
      }
      y += h + CARD_GAP;
    });
  });

  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), 'Kanban board');
}
