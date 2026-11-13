/**
 * OOXML translator for a Mermaid `timeline`. Family D strategy (calculated
 * shapes on a `wpc:wpc` canvas): one column per period, left to right in
 * declaration order. From top: optional section bands spanning their periods'
 * columns, the period boxes, a thin axis bar, then each period's events as
 * lighter boxes stacked downward. Every section (or, with no sections, every
 * period) gets its own palette color, as Mermaid does. Text wraps by word to
 * the column width; `<br>` (already `\n` in the AST) forces a break.
 */

import type { TimelineChart } from './types.js';
import { boxShape, noteParagraph, scalePt, tint, wrapText, type BoxStyle } from '../../translator/boxes.js';
import {
  createIdAllocator,
  scaledExtent,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';

const COL_W = 160;
const COL_GAP = 12;
const PAD = 30;
const TITLE_HEIGHT = 44;
const SECTION_H = 34;
const AXIS_H = 6;
const FONT_PX = 13;
const LINE_H = 17;
const BOX_PAD_Y = 10;
const BOX_GAP = 8;
const WRAP_W = COL_W - 16;
const PALETTE = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '7030A0', '5B9BD5', 'C00000', '2E8B8B'];

const wrapLines = (text: string): string[] => wrapText(text, FONT_PX, WRAP_W);

function boxHeight(lines: string[]): number {
  return lines.length * LINE_H + BOX_PAD_Y * 2;
}

/** Translate a parsed timeline into a self-contained WordprocessingML paragraph. */
export function translateTimelineToOoxml(chart: TimelineChart, options: CanvasOptions = {}): string {
  if (chart.periods.length === 0) return noteParagraph('This timeline has no periods to render.');

  const nextId = createIdAllocator();
  const n = chart.periods.length;
  const hasSections = chart.periods.some((p) => p.sectionIndex >= 0);
  const colorOf = (periodIndex: number): string => {
    const period = chart.periods[periodIndex];
    const key = hasSections ? Math.max(0, period?.sectionIndex ?? 0) : periodIndex;
    return PALETTE[key % PALETTE.length] ?? '4472C4';
  };

  const periodLines = chart.periods.map((p) => wrapLines(p.label));
  const periodH = Math.max(...periodLines.map(boxHeight));
  const eventLines = chart.periods.map((p) => p.events.map(wrapLines));
  const eventsH = Math.max(
    0,
    ...eventLines.map((col) => col.reduce((sum, lines) => sum + boxHeight(lines) + BOX_GAP, 0)),
  );

  const topMargin = chart.title ? TITLE_HEIGHT : 0;
  const sectionRow = hasSections ? SECTION_H + BOX_GAP : 0;
  const canvasW = PAD * 2 + n * COL_W + (n - 1) * COL_GAP;
  const canvasH = PAD * 2 + topMargin + sectionRow + periodH + AXIS_H + BOX_GAP + eventsH;
  const { scale: s } = scaledExtent(canvasW, canvasH, options);
  const colX = (i: number): number => PAD + i * (COL_W + COL_GAP);

  const parts: string[] = [];
  if (chart.title) {
    parts.push(box(nextId(), 0, scalePt(PAD / 2, s), scalePt(canvasW, s), scalePt(TITLE_HEIGHT, s), [chart.title], { color: '000000', bold: true }, s));
  }

  let y = PAD + topMargin;
  if (hasSections) {
    let i = 0;
    while (i < n) {
      const sectionIndex = chart.periods[i]?.sectionIndex ?? -1;
      let j = i;
      while (j + 1 < n && (chart.periods[j + 1]?.sectionIndex ?? -1) === sectionIndex) j++;
      const label = sectionIndex >= 0 ? (chart.sections[sectionIndex] ?? '') : '';
      const w = colX(j) + COL_W - colX(i);
      parts.push(
        box(nextId(), scalePt(colX(i), s), scalePt(y, s), scalePt(w, s), scalePt(SECTION_H, s), label ? label.split('\n') : [''], { fill: colorOf(i), color: 'FFFFFF', bold: true }, s),
      );
      i = j + 1;
    }
    y += sectionRow;
  }

  chart.periods.forEach((_, i) => {
    const fill = colorOf(i);
    parts.push(
      box(nextId(), scalePt(colX(i), s), scalePt(y, s), scalePt(COL_W, s), scalePt(periodH, s), periodLines[i] ?? [''], { fill: tint(fill, 0.15), color: '000000', bold: true }, s),
    );
  });
  y += periodH;

  parts.push(box(nextId(), scalePt(PAD, s), scalePt(y, s), scalePt(canvasW - PAD * 2, s), scalePt(AXIS_H, s), [], { fill: '7F7F7F', color: '000000', bold: false }, s));
  y += AXIS_H + BOX_GAP;

  eventLines.forEach((col, i) => {
    let ey = y;
    const fill = tint(colorOf(i), 0.75);
    col.forEach((lines) => {
      const h = boxHeight(lines);
      parts.push(box(nextId(), scalePt(colX(i), s), scalePt(ey, s), scalePt(COL_W, s), scalePt(h, s), lines, { fill, color: '000000', bold: false }, s));
      ey += h + BOX_GAP;
    });
  });

  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), chart.title ?? 'Timeline', options);
}

function box(id: number, x: number, y: number, w: number, h: number, lines: string[], style: BoxStyle, scale: number): string {
  return boxShape(id, x, y, w, h, lines, style, FONT_PX, scale);
}
