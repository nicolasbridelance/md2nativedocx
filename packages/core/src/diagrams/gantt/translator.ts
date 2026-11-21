/**
 * OOXML translator for a Mermaid `gantt` diagram (Family D per
 * `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md`, option (b) — plain `wps:wsp`
 * shapes positioned on a calendar grid, same `wpc:wpc` canvas primitive as
 * `../quadrant/translator.ts`/`../venn/translator.ts`, not a `c:chart`/DrawingML chart
 * part. No Dagre layout step, same reason as quadrant: task positions come straight
 * from each task's own resolved `start`/`end` on a linear day axis, so this module
 * goes straight from AST to XML.
 *
 * Real Mermaid gantt rendering does **not** draw dependency arrows between tasks
 * (`after taskX` only affects position, never a drawn connector) — confirmed against
 * the vendored reference (`docs/adr/spikes/spike-gantt-parser/`) — so this translator
 * doesn't either; no magnetic-connector geometry needed here.
 *
 * Positions come from `time-axis.ts` (a linear time scale, bounded in width) and the shaded days
 * from the parser (`GanttChart.shadedDays`: the excluded days, or the weekend when nothing is
 * excluded). A day is shaded only when the chart spans two days or more and a day is wide enough
 * to see; otherwise the shading would only grey the whole chart or draw slivers.
 *
 * As in Mermaid's renderer: a milestone is a diamond centred on the middle of its span (a
 * zero-length one on its date); a `vert` task takes no row, it is a vertical line at its start
 * across the whole chart, labelled below it.
 */

import type { GanttChart, GanttTag, GanttTask } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { escapeXml } from '../../translator/xml-escape.js';
import {
  createIdAllocator,
  EMU_PER_PX,
  scaledExtent,
  scaledFontSizeHalfPt,
  wrapDrawingCanvas,
  type CanvasOptions,
  LABEL_NAME,
  unwrappedTextFrame,
} from '../../translator/canvas.js';
import { addDays, isWeekend, MS_PER_DAY } from './date-utils.js';
import { buildTicks, timeScale, xOf, type TimeScale } from './time-axis.js';

const MIN_GUTTER = 140;
const MAX_GUTTER = 260;
const RIGHT_MARGIN = 16;

const TITLE_HEIGHT = 32;
const HEADER_HEIGHT = 26;
const ROW_HEIGHT = 24;
const SECTION_ROW_HEIGHT = 22;
const BAR_VPAD = 4;
const MIN_BAR_WIDTH = 6;
/** Width of a tick label box (four days at the base scale, as before the scale became continuous). */
const TICK_LABEL_WIDTH = 88;
/** A tick label's font (7 pt) in pixels, to measure it, and the margin added to the measure. */
const TICK_FONT_PX = 10;
const LABEL_SLACK = 6;
/** Below this many pixels a shaded day would be a sliver: no shading. */
const MIN_SHADED_DAY_WIDTH = 4;
const VERT_LABEL_HEIGHT = 20;
const VERT_LABEL_WIDTH = 120;
const VERT_COLOR = '1F3864';

const GRID_BORDER = 'BFBFBF';
const WEEKEND_FILL = 'F2F2F2';
const SECTION_FILL = 'D9D9D9';

const BAR_COLORS: { default: string; done: string; active: string; crit: string; milestone: string } = {
  default: '4472C4',
  done: 'A6A6A6',
  active: 'FFC000',
  crit: 'C00000',
  milestone: 'C00000',
};

function hasTag(tags: readonly GanttTag[], tag: GanttTag): boolean {
  return tags.includes(tag);
}

function barColor(tags: readonly GanttTag[]): string {
  if (hasTag(tags, 'crit')) return BAR_COLORS.crit;
  if (hasTag(tags, 'done')) return BAR_COLORS.done;
  if (hasTag(tags, 'active')) return BAR_COLORS.active;
  return BAR_COLORS.default;
}

function scale(px: number, factor: number): number {
  return Math.round(px * EMU_PER_PX * factor);
}

function rect(id: number, x: number, y: number, w: number, h: number, fill: string | undefined, line?: string): string {
  const fillXml = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>';
  const lineXml = line
    ? `<a:ln w="6350"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>`
    : '<a:ln><a:noFill/></a:ln>';
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Shape ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    '    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
    fillXml,
    lineXml,
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

function bar(id: number, x: number, y: number, w: number, h: number, fill: string): string {
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Task ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    '    <a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>',
    `    <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`,
    '    <a:ln w="6350"><a:solidFill><a:srgbClr val="595959"/></a:solidFill></a:ln>',
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

function milestoneDiamond(id: number, cx: number, cy: number, size: number, fill: string): string {
  const half = Math.round(size / 2);
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Milestone ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${cx - half}" y="${cy - half}"/><a:ext cx="${Math.max(1, size)}" cy="${Math.max(1, size)}"/></a:xfrm>`,
    '    <a:prstGeom prst="diamond"><a:avLst/></a:prstGeom>',
    `    <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`,
    '    <a:ln w="6350"><a:solidFill><a:srgbClr val="595959"/></a:solidFill></a:ln>',
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

interface TextOptions {
  sizeHalfPt: number;
  color: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
}

/** See `../quadrant/translator.ts`'s `WORD_JC` doc comment for why this must be a
 * real `ST_Jc` value, never a shorthand. */
function textBox(id: number, x: number, y: number, w: number, h: number, text: string, opts: TextOptions, scaleFactor: number): string {
  const boldAttr = opts.bold ? ' <w:b/>' : '';
  const sizeHalfPt = scaledFontSizeHalfPt(opts.sizeHalfPt, scaleFactor);
  const frame = unwrappedTextFrame(x, w, opts.align ?? 'left');
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="${LABEL_NAME} ${id}"/>`,
    '  <wps:cNvSpPr txBox="1"/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${frame.x}" y="${y}"/><a:ext cx="${Math.max(1, frame.w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    '    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
    '    <a:noFill/>',
    '    <a:ln><a:noFill/></a:ln>',
    '  </wps:spPr>',
    '  <wps:txbx>',
    '    <w:txbxContent>',
    `      <w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="${opts.align ?? 'left'}"/></w:pPr>` +
      `<w:r><w:rPr>${boldAttr} <w:color w:val="${opts.color}"/>` +
      `<w:sz w:val="${sizeHalfPt}"/></w:rPr>` +
      `<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`,
    '    </w:txbxContent>',
    '  </wps:txbx>',
    '  <wps:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/>',
    '</wps:wsp>',
  ].join('\n');
}

type Row = { kind: 'section'; label: string } | { kind: 'task'; task: GanttTask };

/** One row per task in declaration order, a band before each change of section. `vert` tasks take
 * no row (see the module comment). */
function buildRows(tasks: readonly GanttTask[]): Row[] {
  const rows: Row[] = [];
  let currentSection: string | undefined;
  let sawAnySection = false;
  for (const task of tasks) {
    if (hasTag(task.tags, 'vert')) continue;
    if (task.section !== undefined && (task.section !== currentSection || !sawAnySection)) {
      rows.push({ kind: 'section', label: task.section });
      currentSection = task.section;
      sawAnySection = true;
    }
    rows.push({ kind: 'task', task });
  }
  return rows;
}

/** Saturdays and Sundays of the span, for a chart built without `shadedDays`. */
function defaultShadedDays(scale: TimeScale): Date[] {
  const days: Date[] = [];
  for (let day = new Date(scale.t0); day.getTime() < scale.t1; day = addDays(day, 1)) {
    if (isWeekend(day)) days.push(day);
  }
  return days;
}

export function translateGanttToOoxml(chart: GanttChart, options: CanvasOptions = {}): string {
  const nextId = createIdAllocator();
  const hasTitle = Boolean(chart.title);
  const topMargin = (hasTitle ? TITLE_HEIGHT : 0) + HEADER_HEIGHT;

  if (chart.tasks.length === 0) {
    const canvasW = 400;
    const canvasH = topMargin + ROW_HEIGHT;
    const { scale: s } = scaledExtent(canvasW, canvasH, options);
    const parts: string[] = [];
    if (chart.title) {
      parts.push(textBox(nextId(), scale(0, s), scale(0, s), scale(canvasW, s), scale(TITLE_HEIGHT, s), chart.title, { sizeHalfPt: 28, color: '000000', bold: true, align: 'center' }, s));
    }
    parts.push(textBox(nextId(), scale(0, s), scale(topMargin, s), scale(canvasW, s), scale(ROW_HEIGHT, s), '(no tasks)', { sizeHalfPt: 18, color: '808080' }, s));
    return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), chart.title ?? 'Gantt chart', options);
  }

  const dateMin = chart.tasks.reduce((min, t) => (t.start < min ? t.start : min), chart.tasks[0]!.start);
  const dateMax = chart.tasks.reduce((max, t) => (t.end > max ? t.end : max), chart.tasks[0]!.end);
  const axis = timeScale(dateMin, dateMax);
  const chartWidth = axis.width;

  const rows = buildRows(chart.tasks);
  const verts = chart.tasks.filter((t) => hasTag(t.tags, 'vert'));
  const longestLabel = rows.reduce((max, r) => Math.max(max, r.kind === 'task' ? estimateTextWidth(r.task.text, 12) : 0), 0);
  const gutterWidth = Math.min(MAX_GUTTER, Math.max(MIN_GUTTER, longestLabel + 16));

  const rowsHeight = rows.reduce((sum, r) => sum + (r.kind === 'section' ? SECTION_ROW_HEIGHT : ROW_HEIGHT), 0);
  const vertLabelsHeight = verts.length > 0 ? VERT_LABEL_HEIGHT : 0;

  const chartX0 = gutterWidth;
  const xAt = (date: Date | number): number => chartX0 + xOf(axis, date);
  const ticks = buildTicks(axis, { tickInterval: chart.tickInterval, weekday: chart.weekday, axisFormat: chart.axisFormat });

  // Wide enough for the chart, and for the labels that start or centre near its right edge (the last
  // tick's, a `vert` line's), which Word would otherwise wrap against the canvas border.
  const lastTick = ticks[ticks.length - 1];
  const canvasW = Math.max(
    gutterWidth + chartWidth + RIGHT_MARGIN,
    lastTick ? xAt(lastTick.date) + estimateTextWidth(lastTick.label, TICK_FONT_PX) + LABEL_SLACK : 0,
    ...verts.map((v) => xAt(v.start) + VERT_LABEL_WIDTH / 2),
  );
  const canvasH = topMargin + rowsHeight + vertLabelsHeight;
  const { scale: s } = scaledExtent(canvasW, canvasH, options);

  const gridTop = topMargin;
  const gridBottom = topMargin + rowsHeight;

  const parts: string[] = [];

  if (chart.title) {
    parts.push(
      textBox(nextId(), scale(0, s), scale(0, s), scale(canvasW, s), scale(TITLE_HEIGHT, s), chart.title, { sizeHalfPt: 28, color: '000000', bold: true, align: 'center' }, s),
    );
  }

  // Shaded days, drawn first so every later shape sits on top of them.
  const dayWidth = MS_PER_DAY * axis.pxPerMs;
  if (axis.t1 - axis.t0 >= 2 * MS_PER_DAY && dayWidth >= MIN_SHADED_DAY_WIDTH) {
    for (const day of chart.shadedDays ?? defaultShadedDays(axis)) {
      const from = Math.max(day.getTime(), axis.t0);
      const to = Math.min(day.getTime() + MS_PER_DAY, axis.t1);
      if (to <= from) continue;
      parts.push(rect(nextId(), scale(xAt(from), s), scale(gridTop, s), scale(xOf(axis, to) - xOf(axis, from), s), scale(rowsHeight, s), WEEKEND_FILL));
    }
  }

  // Date-axis ticks: vertical gridline through the whole chart body + a label in the header strip.
  for (const tick of ticks) {
    const x = xAt(tick.date);
    parts.push(rect(nextId(), scale(x, s), scale(gridTop, s), scale(1, s), scale(rowsHeight, s), GRID_BORDER));
    parts.push(textBox(nextId(), scale(x, s), scale(topMargin - HEADER_HEIGHT + 4, s), scale(TICK_LABEL_WIDTH, s), scale(HEADER_HEIGHT - 4, s), tick.label, { sizeHalfPt: 14, color: '595959' }, s));
  }

  // Frame around the calendar body.
  parts.push(rect(nextId(), scale(chartX0, s), scale(gridTop, s), scale(chartWidth, s), scale(rowsHeight, s), undefined, GRID_BORDER));

  let rowY = gridTop;
  for (const row of rows) {
    if (row.kind === 'section') {
      parts.push(rect(nextId(), scale(0, s), scale(rowY, s), scale(canvasW, s), scale(SECTION_ROW_HEIGHT, s), SECTION_FILL));
      parts.push(
        textBox(nextId(), scale(6, s), scale(rowY + 2, s), scale(gutterWidth - 12, s), scale(SECTION_ROW_HEIGHT - 4, s), row.label, { sizeHalfPt: 16, color: '000000', bold: true }, s),
      );
      rowY += SECTION_ROW_HEIGHT;
      continue;
    }

    const task = row.task;
    parts.push(
      textBox(nextId(), scale(6, s), scale(rowY + 2, s), scale(gutterWidth - 10, s), scale(ROW_HEIGHT - 4, s), task.text, { sizeHalfPt: 15, color: '000000' }, s),
    );

    const barY = rowY + BAR_VPAD;
    const barH = ROW_HEIGHT - 2 * BAR_VPAD;

    if (hasTag(task.tags, 'milestone')) {
      const cx = xAt((task.start.getTime() + task.end.getTime()) / 2);
      const cy = rowY + ROW_HEIGHT / 2;
      parts.push(milestoneDiamond(nextId(), scale(cx, s), scale(cy, s), scale(barH, s), BAR_COLORS.milestone));
    } else {
      const barX = xAt(task.start);
      const barW = Math.max(MIN_BAR_WIDTH, xAt(task.end) - barX);
      parts.push(bar(nextId(), scale(barX, s), scale(barY, s), scale(barW, s), scale(barH, s), barColor(task.tags)));
    }

    rowY += ROW_HEIGHT;
  }

  // Vertical markers, over the bars, labelled under the chart.
  for (const vert of verts) {
    const x = xAt(vert.start);
    parts.push(rect(nextId(), scale(x - 1, s), scale(gridTop, s), scale(2, s), scale(rowsHeight, s), VERT_COLOR));
    parts.push(
      textBox(nextId(), scale(x - VERT_LABEL_WIDTH / 2, s), scale(gridBottom + 2, s), scale(VERT_LABEL_WIDTH, s), scale(VERT_LABEL_HEIGHT - 4, s), vert.text, { sizeHalfPt: 14, color: VERT_COLOR, align: 'center' }, s),
    );
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, chart.title ?? 'Gantt chart', options);
}
