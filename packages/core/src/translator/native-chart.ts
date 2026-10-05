/**
 * Shared building blocks of the native Word charts (ADR 0011): the `c:chartSpace` envelope, the cached
 * `strRef`/`numRef` pieces, the inline-drawing paragraph and the workbook descriptor. Per-type
 * modules (`diagrams/<type>/chart.ts`) supply only the plot area.
 *
 * Every user-controlled string goes through `escapeXml` (AGENTS.md rule #2) before it lands in XML.
 */

import { escapeXml } from './xml-escape.js';
import { NS, type CanvasOptions } from './canvas.js';

const EMU_PER_INCH = 914400;
/** Default drawing size, before any caller-supplied cap: 6 in x 3.6 in. */
const DEFAULT_CX = 6 * EMU_PER_INCH;
const DEFAULT_CY = Math.round(3.6 * EMU_PER_INCH);

/** Same palette as the shape-built charts, so switching between the two keeps the colours. */
export const SERIES_PALETTE = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '7030A0', '5B9BD5', 'C00000', '2E8B8B'];

/** Prefix of the relationship-id placeholder the post-processing step replaces (never a real `rId`). */
export const CHART_PLACEHOLDER_PREFIX = 'CHART_PLACEHOLDER:';

/** Worksheet name every chart's range formulas refer to. */
export const SHEET_NAME = 'Sheet1';

/** Data behind a chart, as the workbook the caller embeds: a header row, then one row per category. */
export interface ChartWorkbook {
  /** Worksheet name the chart's range formulas refer to. */
  sheetName: string;
  /** Header cells: the category column title, then one series name per value column. */
  header: string[];
  /** One row per category: its label, then one value per series (`undefined` = empty cell). */
  rows: Array<[string, ...Array<number | undefined>]>;
}

/** Everything produced for one native chart. */
export interface NativeChart {
  /** `w:p` paragraph holding the chart frame; its `r:id` is `CHART_PLACEHOLDER:<chartId>`. */
  paragraphXml: string;
  /** Complete `c:chartSpace` part (`word/charts/chartN.xml`). */
  chartXml: string;
  /** The data the chart displays, for building the embedded workbook. */
  workbook: ChartWorkbook;
  /** Whether the chart references an embedded workbook (`c:externalData`, relationship id `rId1`). */
  hasWorkbook: boolean;
}

/** Options shared by every `translate…ToChart`. */
export interface NativeChartOptions extends CanvasOptions {
  /** Reference an embedded workbook. When false the chart carries cached values only. */
  embedWorkbook?: boolean;
}

/** Column letters for a 0-based index: A..Z, AA..AZ, … (charts can have up to ~65 columns). */
export function columnLetters(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** `<c:ptCount/>` + `<c:pt>` entries for a cached string/number list (`undefined` values are skipped). */
export function cachedPoints(values: Array<string | undefined>): string {
  return (
    `<c:ptCount val="${values.length}"/>` +
    values
      .map((v, i) => (v === undefined ? '' : `<c:pt idx="${i}"><c:v>${escapeXml(v)}</c:v></c:pt>`))
      .join('')
  );
}

/** A cached string reference (series name, categories). */
export function strRef(formula: string, values: string[]): string {
  return `<c:strRef><c:f>${formula}</c:f><c:strCache>${cachedPoints(values)}</c:strCache></c:strRef>`;
}

/** A cached numeric reference (series values; `undefined` = empty cell). */
export function numRef(formula: string, values: Array<number | undefined>): string {
  return (
    `<c:numRef><c:f>${formula}</c:f><c:numCache><c:formatCode>General</c:formatCode>` +
    `${cachedPoints(values.map((v) => (v === undefined ? undefined : String(v))))}</c:numCache></c:numRef>`
  );
}

/** Rich-text `c:title` (chart or axis title). */
export function titleXml(text: string, sizeHundredthsPt = 1400): string {
  return (
    '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>' +
    `<a:p><a:pPr><a:defRPr sz="${sizeHundredthsPt}" b="1"/></a:pPr>` +
    `<a:r><a:rPr lang="en-US" sz="${sizeHundredthsPt}" b="1"/><a:t>${escapeXml(text)}</a:t></a:r></a:p>` +
    '</c:rich></c:tx><c:overlay val="0"/></c:title>'
  );
}

/** Solid-colour shape properties, optionally with an outline colour and a fill transparency. */
export function solidSpPr(fill: string | undefined, line?: string, alphaPercent?: number): string {
  const fillXml =
    fill === undefined
      ? '<a:noFill/>'
      : `<a:solidFill><a:srgbClr val="${fill}">${alphaPercent === undefined ? '' : `<a:alpha val="${alphaPercent * 1000}"/>`}</a:srgbClr></a:solidFill>`;
  const lineXml = line === undefined ? '' : `<a:ln w="28575"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>`;
  return `<c:spPr>${fillXml}${lineXml}</c:spPr>`;
}

/** Wrap a plot area into a complete `c:chartSpace`. */
export function chartSpace(
  plotAreaXml: string,
  opts: { title?: string; legend: boolean; embedWorkbook: boolean },
): string {
  const hasTitle = opts.title !== undefined && opts.title !== '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<c:date1904 val="0"/><c:roundedCorners val="0"/>' +
    '<c:chart>' +
    (hasTitle ? titleXml(opts.title ?? '') : '') +
    `<c:autoTitleDeleted val="${hasTitle ? 0 : 1}"/>` +
    plotAreaXml +
    (opts.legend ? '<c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend>' : '') +
    '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>' +
    '</c:chart>' +
    (opts.embedWorkbook ? '<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData>' : '') +
    '</c:chartSpace>'
  );
}

/** Drawing size in EMU, scaled down (never up) to the caller-supplied caps. */
export function chartSize(options: CanvasOptions): { cx: number; cy: number } {
  const scale = Math.min(1, (options.maxDrawingCx ?? Infinity) / DEFAULT_CX, (options.maxDrawingCy ?? Infinity) / DEFAULT_CY);
  return { cx: Math.max(1, Math.round(DEFAULT_CX * scale)), cy: Math.max(1, Math.round(DEFAULT_CY * scale)) };
}

/** The `w:p` holding the chart frame, referencing the relationship placeholder. */
export function chartParagraph(chartId: string, options: CanvasOptions, name: string): string {
  if (!/^[A-Za-z0-9-]+$/.test(chartId)) throw new RangeError('chartId must match [A-Za-z0-9-]+');
  const { cx, cy } = chartSize(options);
  return [
    `<w:p ${NS.w}>`,
    '  <w:r>',
    '    <w:drawing>',
    `      <wp:inline ${NS.wp} distT="0" distB="0" distL="0" distR="0">`,
    `        <wp:extent cx="${cx}" cy="${cy}"/>`,
    '        <wp:effectExtent l="0" t="0" r="0" b="0"/>',
    `        <wp:docPr id="1" name="${escapeXml(name)}"/>`,
    '        <wp:cNvGraphicFramePr/>',
    `        <a:graphic ${NS.a}>`,
    '          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">',
    `            <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ${NS.r} r:id="${CHART_PLACEHOLDER_PREFIX}${chartId}"/>`,
    '          </a:graphicData>',
    '        </a:graphic>',
    '      </wp:inline>',
    '    </w:drawing>',
    '  </w:r>',
    '</w:p>',
  ].join('\n');
}
