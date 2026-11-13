/**
 * OOXML translator for a Mermaid `xychart-beta`. Family D strategy (calculated
 * shapes on a `wpc:wpc` canvas): light gridlines at "nice" value ticks, tick
 * labels, category labels, one filled rectangle per bar, one open polyline
 * per line series (with its point labels), axis titles and a legend when any
 * series is named. `horizontal` swaps the axes through one category/value
 * geometry. Differences from Mermaid: bar series sit side by side inside each
 * category band, a numeric x-axis range is drawn as evenly spaced labels, and
 * `config.xyChart` styling is ignored.
 */

import type { XyChart } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { boxShape, fitFont, noteParagraph, scalePt } from '../../translator/boxes.js';
import { pathShape } from '../../translator/path-shape.js';
import {
  createIdAllocator,
  scaledExtent,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';

const FONT_PX = 12;
const PAD = 24;
const TITLE_H = 36;
const LEGEND_H = 26;
const AXIS_TITLE_H = 22;
const TICK_COUNT = 5;
const PALETTE = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '7030A0', '5B9BD5', 'C00000', '2E8B8B'];
const GRID = 'D9D9D9';
const AXIS = '595959';

/** A step of 1, 2 or 5 times a power of ten near `raw`. */
function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}

function formatTick(v: number, step: number): string {
  const decimals = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step)));
  return v.toFixed(decimals);
}

/** Translate a parsed XY chart into a self-contained WordprocessingML paragraph. */
export function translateXyChartToOoxml(chart: XyChart, options: CanvasOptions = {}): string {
  const series = chart.series.filter((s) => s.values.length > 0);
  const categories = chart.xAxis.categories;
  const points = Math.max(categories?.length ?? 0, ...series.map((s) => s.values.length));
  if (series.length === 0 || points === 0) return noteParagraph('An XY chart needs at least one series with values to render.');

  // Category labels: explicit list, generated from a numeric range, or 1..n.
  const catLabels: string[] = Array.from({ length: points }, (_, i) => {
    if (categories) return categories[i] ?? '';
    if (chart.xAxis.min !== undefined && chart.xAxis.max !== undefined) {
      const t = points === 1 ? 0 : i / (points - 1);
      const v = chart.xAxis.min + (chart.xAxis.max - chart.xAxis.min) * t;
      return Number.isInteger(v) ? String(v) : v.toFixed(2);
    }
    return String(i + 1);
  });

  // Value axis range and ticks.
  const all = series.flatMap((s) => s.values);
  let lo = chart.yAxis.min ?? Math.min(0, ...all);
  let hi = chart.yAxis.max ?? Math.max(...all);
  if (hi <= lo) hi = lo + 1;
  const step = niceStep((hi - lo) / TICK_COUNT);
  if (chart.yAxis.min === undefined) lo = Math.floor(lo / step) * step;
  if (chart.yAxis.max === undefined) hi = Math.ceil(hi / step) * step;
  if (hi <= lo) hi = lo + step;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step, n = 0; v <= hi + step * 1e-9 && n < 200; v += step, n++) ticks.push(v);
  const tickLabels = ticks.map((v) => formatTick(v, step));

  const horizontal = chart.horizontal;
  const barSeries = series.filter((s) => s.kind === 'bar');
  const named = series.some((s) => s.name);
  const catTitle = chart.xAxis.title;
  const valTitle = chart.yAxis.title;
  const widestTick = Math.max(...tickLabels.map((t) => estimateTextWidth(t, FONT_PX)));
  const widestCat = Math.max(...catLabels.map((t) => estimateTextWidth(t, FONT_PX)));

  // Plot rectangle (px). Vertical: categories along x. Horizontal: along y.
  const catLen = Math.min(1100, Math.max(360, points * (horizontal ? 30 : 56)));
  const valLen = horizontal ? 420 : 300;
  const plotW = horizontal ? valLen : catLen;
  const plotH = horizontal ? catLen : valLen;
  const left = PAD + (horizontal ? Math.ceil(widestCat) + 14 : Math.ceil(widestTick) + 14);
  const aboveTitle = horizontal ? catTitle : valTitle;
  const belowTitle = horizontal ? valTitle : catTitle;
  const top = PAD + (chart.title ? TITLE_H : 0) + (named ? LEGEND_H : 0) + (aboveTitle ? AXIS_TITLE_H : 0) + 10;
  const bottomLabels = 24;
  const canvasW = left + plotW + PAD + 20;
  const canvasH = top + plotH + bottomLabels + (belowTitle ? AXIS_TITLE_H : 0) + PAD;
  const { scale: s } = scaledExtent(canvasW, canvasH, options);
  const emu = (v: number): number => scalePt(v, s);
  const pt = (x: number, y: number): { x: number; y: number } => ({ x: emu(x), y: emu(y) });
  const thin = scaledLineWidthEmu(9525, s);
  const lineW = scaledLineWidthEmu(28575, s);

  // Geometry: category centre in 0..1 of the band axis, value as a 0..1 fraction.
  const vFrac = (v: number): number => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  const place = (c: number, vf: number): { x: number; y: number } =>
    horizontal ? { x: left + vf * plotW, y: top + c * plotH } : { x: left + c * plotW, y: top + plotH - vf * plotH };
  const bandCentre = (i: number): number => (i + 0.5) / points;

  const nextId = createIdAllocator();
  const parts: string[] = [];
  const text = (x: number, y: number, w: number, h: number, str: string, opts: { bold?: boolean; align?: 'left' | 'center' | 'right'; color?: string; size?: number }): string =>
    boxShape(nextId(), emu(x), emu(y), emu(w), emu(h), [str], { color: opts.color ?? '000000', bold: opts.bold ?? false, align: opts.align ?? 'center', noWrap: true }, opts.size ?? FONT_PX, s);

  let y0 = PAD / 2;
  if (chart.title) {
    parts.push(text(0, y0, canvasW, TITLE_H, chart.title, { bold: true, size: FONT_PX + 3 }));
    y0 += TITLE_H;
  }
  if (named) {
    let lx = left;
    series.forEach((ser, si) => {
      if (!ser.name) return;
      const color = PALETTE[si % PALETTE.length] ?? '4472C4';
      const w = Math.ceil(estimateTextWidth(ser.name, FONT_PX)) + 10;
      parts.push(boxShape(nextId(), emu(lx), emu(y0 + 6), emu(12), emu(12), [], { fill: color, color: '000000' }, FONT_PX, s), text(lx + 16, y0, w, LEGEND_H - 4, ser.name, { align: 'left' }));
      lx += 16 + w + 14;
    });
    y0 += LEGEND_H;
  }
  if (aboveTitle) parts.push(text(left, y0, plotW, AXIS_TITLE_H, aboveTitle, { align: 'left', bold: true }));

  // Gridlines + value tick labels.
  ticks.forEach((v, i) => {
    const a = place(0, vFrac(v));
    const b = place(1, vFrac(v));
    parts.push(pathShape(nextId(), [pt(a.x, a.y), pt(b.x, b.y)], false, undefined, 0, GRID, thin));
    const label = tickLabels[i] ?? '';
    if (horizontal) parts.push(text(a.x - 30, top + plotH + 4, 60, 18, label, {}));
    else parts.push(text(left - 8 - 60, a.y - 9, 60, 18, label, { align: 'right' }));
  });

  // Category labels.
  const bandPx = (horizontal ? plotH : plotW) / points;
  catLabels.forEach((label, i) => {
    const c = place(bandCentre(i), 0);
    if (horizontal) {
      parts.push(text(PAD / 2, c.y - 9, left - PAD / 2 - 8, 18, label, { align: 'right' }));
    } else {
      const fit = fitFont([label], FONT_PX, bandPx - 4, 8);
      parts.push(text(c.x - bandPx / 2, top + plotH + 4, bandPx, 18, label, { size: fit.fontPx }));
    }
  });

  // Bars (side by side within a band), then lines on top.
  const groupW = bandPx * 0.7;
  const barW = barSeries.length > 0 ? groupW / barSeries.length : groupW;
  const baseVf = vFrac(Math.min(Math.max(0, lo), hi));
  series.forEach((ser, si) => {
    const color = PALETTE[si % PALETTE.length] ?? '4472C4';
    if (ser.kind !== 'bar') return;
    const bi = barSeries.indexOf(ser);
    ser.values.forEach((v, i) => {
      const offset = -groupW / 2 + bi * barW;
      const p0 = place(bandCentre(i), baseVf);
      const p1 = place(bandCentre(i), vFrac(v));
      const x = horizontal ? Math.min(p0.x, p1.x) : p0.x + offset;
      const y = horizontal ? p0.y + offset : Math.min(p0.y, p1.y);
      const w = horizontal ? Math.abs(p1.x - p0.x) : barW;
      const h = horizontal ? barW : Math.abs(p1.y - p0.y);
      if (w <= 0 || h <= 0) return;
      parts.push(boxShape(nextId(), emu(x), emu(y), emu(w), emu(h), [], { fill: color, color: '000000' }, FONT_PX, s));
    });
  });
  series.forEach((ser, si) => {
    if (ser.kind !== 'line') return;
    const color = PALETTE[si % PALETTE.length] ?? '4472C4';
    const pts = ser.values.map((v, i) => place(bandCentre(i), vFrac(v)));
    if (pts.length >= 2) parts.push(pathShape(nextId(), pts.map((p) => pt(p.x, p.y)), false, undefined, 0, color, lineW));
    pts.forEach((p, i) => {
      parts.push(boxShape(nextId(), emu(p.x - 3), emu(p.y - 3), emu(6), emu(6), [], { fill: color, color: '000000' }, FONT_PX, s));
      const label = ser.labels[i];
      if (label) {
        const w = Math.ceil(estimateTextWidth(label, FONT_PX)) + 10;
        parts.push(text(p.x - w / 2, p.y - 22, w, 16, label, { color: '404040', size: FONT_PX - 1 }));
      }
    });
  });

  // Axes drawn last so bars never cover them.
  const baseline = horizontal ? [pt(left, top), pt(left, top + plotH)] : [pt(left, top + plotH), pt(left + plotW, top + plotH)];
  parts.push(pathShape(nextId(), baseline, false, undefined, 0, AXIS, lineW));
  if (belowTitle) parts.push(text(left, top + plotH + bottomLabels, plotW, AXIS_TITLE_H, belowTitle, { bold: true }));

  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), chart.title ?? 'XY chart', options);
}
