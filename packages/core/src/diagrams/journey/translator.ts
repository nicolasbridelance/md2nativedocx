/**
 * OOXML translator for a Mermaid `journey`. Family D strategy (calculated
 * shapes on a `wpc:wpc` canvas): one column per task, left to right. From top:
 * optional section bands, task boxes, a score row (box tinted red -> green by
 * score, text `n/5`), then one lane per actor with a colored cell wherever
 * that actor takes part. Actor names label the lanes in a left gutter.
 */

import type { JourneyChart } from './types.js';
import { boxShape, fitFont, noteParagraph, scalePt, tint, wrapText, type BoxStyle } from '../../translator/boxes.js';
import {
  createIdAllocator,
  scaledExtent,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';

const COL_W = 120;
const COL_GAP = 8;
const GUTTER_W = 110;
const PAD = 30;
const TITLE_HEIGHT = 44;
const SECTION_H = 30;
const SCORE_H = 30;
const LANE_H = 26;
const FONT_PX = 13;
const LINE_H = 17;
const BOX_PAD_Y = 10;
const ROW_GAP = 8;
const WRAP_W = COL_W - 12;
const SECTION_PALETTE = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '7030A0', '5B9BD5', 'C00000', '2E8B8B'];
const ACTOR_PALETTE = ['5B9BD5', 'ED7D31', '70AD47', 'FFC000', '7030A0', 'C00000', '2E8B8B', '4472C4'];
/** Score 1..5, red to green. */
const SCORE_COLORS = ['E06666', 'F6B26B', 'FFD966', 'B6D7A8', '6AA84F'];

/** Translate a parsed journey into a self-contained WordprocessingML paragraph. */
export function translateJourneyToOoxml(chart: JourneyChart, options: CanvasOptions = {}): string {
  if (chart.tasks.length === 0) return noteParagraph('This journey has no tasks to render.');

  const nextId = createIdAllocator();
  const n = chart.tasks.length;
  const hasSections = chart.tasks.some((t) => t.sectionIndex >= 0);
  const hasActors = chart.actors.length > 0;
  const gutter = hasActors ? GUTTER_W + COL_GAP : 0;

  const taskLines = chart.tasks.map((t) => wrapText(t.label, FONT_PX, WRAP_W));
  const taskH = Math.max(...taskLines.map((l) => l.length * LINE_H + BOX_PAD_Y * 2));

  const topMargin = chart.title ? TITLE_HEIGHT : 0;
  const sectionRow = hasSections ? SECTION_H + ROW_GAP : 0;
  const lanesH = chart.actors.length * (LANE_H + ROW_GAP);
  const canvasW = PAD * 2 + gutter + n * COL_W + (n - 1) * COL_GAP;
  const canvasH = PAD * 2 + topMargin + sectionRow + taskH + ROW_GAP + SCORE_H + ROW_GAP + lanesH;
  const { scale: s } = scaledExtent(canvasW, canvasH, options);
  const colX = (i: number): number => PAD + gutter + i * (COL_W + COL_GAP);
  const sectionColor = (i: number): string => SECTION_PALETTE[Math.max(0, i) % SECTION_PALETTE.length] ?? '4472C4';

  const box = (x: number, y: number, w: number, h: number, lines: string[], style: BoxStyle, fontPx = FONT_PX): string =>
    boxShape(nextId(), scalePt(x, s), scalePt(y, s), scalePt(w, s), scalePt(h, s), lines, style, fontPx, s);

  const parts: string[] = [];
  if (chart.title) {
    parts.push(box(0, PAD / 2, canvasW, TITLE_HEIGHT, [chart.title], { color: '000000', bold: true }));
  }

  let y = PAD + topMargin;
  if (hasSections) {
    let i = 0;
    while (i < n) {
      const sectionIndex = chart.tasks[i]?.sectionIndex ?? -1;
      let j = i;
      while (j + 1 < n && (chart.tasks[j + 1]?.sectionIndex ?? -1) === sectionIndex) j++;
      const label = sectionIndex >= 0 ? (chart.sections[sectionIndex] ?? '') : '';
      const w = colX(j) + COL_W - colX(i);
      const fit = fitFont([label], FONT_PX, w - 8, 8);
      parts.push(
        box(colX(i), y, w, SECTION_H, [label], { fill: sectionColor(sectionIndex), color: 'FFFFFF', bold: true, noWrap: fit.shrunk }, fit.fontPx),
      );
      i = j + 1;
    }
    y += sectionRow;
  }

  chart.tasks.forEach((t, i) => {
    const lines = taskLines[i] ?? [''];
    const fit = fitFont(lines, FONT_PX, WRAP_W, 8);
    parts.push(
      box(colX(i), y, COL_W, taskH, lines, { fill: tint(sectionColor(t.sectionIndex), 0.8), color: '000000', bold: true, noWrap: fit.shrunk }, fit.fontPx),
    );
  });
  y += taskH + ROW_GAP;

  chart.tasks.forEach((t, i) => {
    parts.push(box(colX(i), y, COL_W, SCORE_H, [`${t.score}/5`], { fill: SCORE_COLORS[t.score - 1] ?? 'FFD966', color: '000000', bold: true }));
  });
  y += SCORE_H + ROW_GAP;

  chart.actors.forEach((actor, a) => {
    const color = ACTOR_PALETTE[a % ACTOR_PALETTE.length] ?? '5B9BD5';
    const fit = fitFont([actor], FONT_PX, GUTTER_W - 8, 8);
    parts.push(box(PAD, y, GUTTER_W, LANE_H, [actor], { fill: color, color: 'FFFFFF', bold: true, noWrap: fit.shrunk }, fit.fontPx));
    chart.tasks.forEach((t, i) => {
      if (!t.actors.includes(actor)) return;
      parts.push(box(colX(i), y, COL_W, LANE_H, [actor], { fill: tint(color, 0.6), color: '000000' }, Math.min(FONT_PX, fitFont([actor], FONT_PX, COL_W - 8, 8).fontPx)));
    });
    y += LANE_H + ROW_GAP;
  });

  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), chart.title ?? 'User journey', options);
}
