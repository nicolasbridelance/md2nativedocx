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
 * **V1 simplification**: only the fixed Saturday/Sunday weekend is shaded on the
 * calendar. A custom `excludes` list (specific dates/weekday names) still correctly
 * shifts task end dates (`parser.ts`'s `stretchPastExcludes`) — it just isn't
 * re-derived here for shading, since `GanttChart` intentionally carries only already-
 * resolved dates (see `types.ts`'s doc comment), not the original `excludes` tokens.
 */

import type { GanttChart, GanttTag, GanttTask } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { escapeXml } from '../../translator/xml-escape.js';
import {
  EMU_PER_PX,
  createIdAllocator,
  scaledExtent,
  scaledFontSizeHalfPt,
  wrapDrawingCanvas,
} from '../../translator/canvas.js';
import { addDays, daysBetween, isWeekend } from './date-utils.js';

const PX_PER_DAY = 22;
const MIN_CHART_WIDTH = 220;
const MIN_GUTTER = 140;
const MAX_GUTTER = 260;
const RIGHT_MARGIN = 16;

const TITLE_HEIGHT = 32;
const HEADER_HEIGHT = 26;
const ROW_HEIGHT = 24;
const SECTION_ROW_HEIGHT = 22;
const BAR_VPAD = 4;
const MIN_BAR_WIDTH = 6;

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
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Text ${id}"/>`,
    '  <wps:cNvSpPr txBox="1"/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
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
    '  <wps:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/>',
    '</wps:wsp>',
  ].join('\n');
}

type Row = { kind: 'section'; label: string } | { kind: 'task'; task: GanttTask };

function buildRows(tasks: readonly GanttTask[]): Row[] {
  const rows: Row[] = [];
  let currentSection: string | undefined;
  let sawAnySection = false;
  for (const task of tasks) {
    if (task.section !== undefined && (task.section !== currentSection || !sawAnySection)) {
      rows.push({ kind: 'section', label: task.section });
      currentSection = task.section;
      sawAnySection = true;
    }
    rows.push({ kind: 'task', task });
  }
  return rows;
}

/** Weekly ticks for a range short enough to read at {@link PX_PER_DAY}, monthly
 * ticks (1st of each covered month) beyond that — same rationale as
 * `../quadrant/translator.ts` capping label rotation complexity: this is a v1, not an
 * attempt to reproduce Mermaid's own adaptive D3 time-axis exactly. */
function buildTicks(dateMin: Date, dateMax: Date): { date: Date; label: string }[] {
  const totalDays = Math.max(1, daysBetween(dateMin, dateMax));
  const ticks: { date: Date; label: string }[] = [];
  if (totalDays <= 62) {
    for (let d = dateMin; d.getTime() <= dateMax.getTime(); d = addDays(d, 7)) {
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      ticks.push({ date: d, label: `${mm}-${dd}` });
    }
  } else {
    let cursor = new Date(Date.UTC(dateMin.getUTCFullYear(), dateMin.getUTCMonth(), 1));
    while (cursor.getTime() <= dateMax.getTime()) {
      if (cursor.getTime() >= dateMin.getTime()) {
        const yyyy = cursor.getUTCFullYear();
        const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
        ticks.push({ date: cursor, label: `${yyyy}-${mm}` });
      }
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
  }
  return ticks;
}

export function translateGanttToOoxml(chart: GanttChart): string {
  const nextId = createIdAllocator();
  const hasTitle = Boolean(chart.title);
  const topMargin = (hasTitle ? TITLE_HEIGHT : 0) + HEADER_HEIGHT;

  if (chart.tasks.length === 0) {
    const canvasW = 400;
    const canvasH = topMargin + ROW_HEIGHT;
    const { scale: s } = scaledExtent(canvasW, canvasH);
    const parts: string[] = [];
    if (chart.title) {
      parts.push(textBox(nextId(), scale(0, s), scale(0, s), scale(canvasW, s), scale(TITLE_HEIGHT, s), chart.title, { sizeHalfPt: 28, color: '000000', bold: true, align: 'center' }, s));
    }
    parts.push(textBox(nextId(), scale(0, s), scale(topMargin, s), scale(canvasW, s), scale(ROW_HEIGHT, s), '(no tasks)', { sizeHalfPt: 18, color: '808080' }, s));
    return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), chart.title ?? 'Gantt chart');
  }

  const dateMin = chart.tasks.reduce((min, t) => (t.start < min ? t.start : min), chart.tasks[0]!.start);
  const dateMaxRaw = chart.tasks.reduce((max, t) => (t.end > max ? t.end : max), chart.tasks[0]!.end);
  const dateMax = dateMaxRaw > dateMin ? dateMaxRaw : addDays(dateMin, 1);

  const totalDays = Math.max(1, daysBetween(dateMin, dateMax));
  const chartWidth = Math.max(MIN_CHART_WIDTH, totalDays * PX_PER_DAY);

  const longestLabel = chart.tasks.reduce((max, t) => Math.max(max, estimateTextWidth(t.text, 12)), 0);
  const gutterWidth = Math.min(MAX_GUTTER, Math.max(MIN_GUTTER, longestLabel + 16));

  const rows = buildRows(chart.tasks);
  const rowsHeight = rows.reduce((sum, r) => sum + (r.kind === 'section' ? SECTION_ROW_HEIGHT : ROW_HEIGHT), 0);

  const canvasW = gutterWidth + chartWidth + RIGHT_MARGIN;
  const canvasH = topMargin + rowsHeight;
  const { scale: s } = scaledExtent(canvasW, canvasH);

  const chartX0 = gutterWidth;
  const gridTop = topMargin;
  const gridBottom = topMargin + rowsHeight;

  const parts: string[] = [];

  if (chart.title) {
    parts.push(
      textBox(nextId(), scale(0, s), scale(0, s), scale(canvasW, s), scale(TITLE_HEIGHT, s), chart.title, { sizeHalfPt: 28, color: '000000', bold: true, align: 'center' }, s),
    );
  }

  // Weekend shading, drawn first so every later shape sits on top of it.
  for (let day = 0; day < totalDays; day++) {
    const date = addDays(dateMin, day);
    if (isWeekend(date)) {
      parts.push(rect(nextId(), scale(chartX0 + day * PX_PER_DAY, s), scale(gridTop, s), scale(PX_PER_DAY, s), scale(rowsHeight, s), WEEKEND_FILL));
    }
  }

  // Date-axis ticks: vertical gridline through the whole chart body + a label in the header strip.
  const ticks = buildTicks(dateMin, dateMax);
  for (const tick of ticks) {
    const x = chartX0 + daysBetween(dateMin, tick.date) * PX_PER_DAY;
    parts.push(rect(nextId(), scale(x, s), scale(gridTop, s), scale(1, s), scale(rowsHeight, s), GRID_BORDER));
    parts.push(textBox(nextId(), scale(x, s), scale(topMargin - HEADER_HEIGHT + 4, s), scale(PX_PER_DAY * 4, s), scale(HEADER_HEIGHT - 4, s), tick.label, { sizeHalfPt: 14, color: '595959' }, s));
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

    const startOffsetDays = daysBetween(dateMin, task.start);
    const barY = rowY + BAR_VPAD;
    const barH = ROW_HEIGHT - 2 * BAR_VPAD;

    if (hasTag(task.tags, 'milestone')) {
      const cx = chartX0 + startOffsetDays * PX_PER_DAY;
      const cy = rowY + ROW_HEIGHT / 2;
      parts.push(milestoneDiamond(nextId(), scale(cx, s), scale(cy, s), scale(barH, s), BAR_COLORS.milestone));
    } else {
      const durationDays = Math.max(0, daysBetween(task.start, task.end));
      const barX = chartX0 + startOffsetDays * PX_PER_DAY;
      const barW = Math.max(MIN_BAR_WIDTH, durationDays * PX_PER_DAY);
      parts.push(bar(nextId(), scale(barX, s), scale(barY, s), scale(barW, s), scale(barH, s), barColor(task.tags)));
    }

    rowY += ROW_HEIGHT;
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, Math.max(canvasH, gridBottom), docPrId, chart.title ?? 'Gantt chart');
}
