/**
 * Native Word chart (`c:chart`) for a Mermaid `pie` — the opt-in alternative to the shape-built pie of
 * `translator.ts` (ADR 0011). The result is an editable chart object: colours and styles through Chart
 * Design and, once the workbook is embedded, its values through Edit Data.
 *
 * Pure function like every translator: it returns the three things the caller needs and writes nothing.
 * The caller (the Pandoc bridge + CLI post-processing, same hand-off as SmartArt) adds the chart part,
 * the workbook and the relationships to the `.docx`, then swaps {@link NativeChart.paragraphXml}'s
 * placeholder for the real relationship id.
 *
 * Every user-controlled string (title, labels) goes through `escapeXml` (AGENTS.md rule #2).
 */

import { escapeXml } from '../../translator/xml-escape.js';
import { NS, type CanvasOptions } from '../../translator/canvas.js';
import type { PieChart } from './types.js';

const EMU_PER_INCH = 914400;
/** Default drawing size, before any caller-supplied cap: 6 in x 3.6 in. */
const DEFAULT_CX = 6 * EMU_PER_INCH;
const DEFAULT_CY = Math.round(3.6 * EMU_PER_INCH);

/** Same palette as the shape-built pie, so switching between the two keeps the colours. */
const SLICE_COLORS = [
  '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47',
  '264478', '9E480E', '636363', '997300', '255E91', '43682B',
];

/** Prefix of the relationship-id placeholder the post-processing step replaces (never a real `rId`). */
export const CHART_PLACEHOLDER_PREFIX = 'CHART_PLACEHOLDER:';

const SHEET_NAME = 'Sheet1';
const SERIES_NAME = 'Value';

/** Data behind the chart, as the workbook rows the caller embeds (header row excluded). */
export interface ChartWorkbook {
  /** Worksheet name the chart's range formulas refer to. */
  sheetName: string;
  /** Header cells: category column title, then the series name. */
  header: [string, string];
  /** One row per data point: category label, value. */
  rows: Array<[string, number]>;
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

/** Options of {@link translatePieToChart}. */
export interface PieChartOptions extends CanvasOptions {
  /** Reference an embedded workbook (palier 2). When false the chart carries cached values only. */
  embedWorkbook?: boolean;
}

function cached(values: string[]): string {
  return (
    `<c:ptCount val="${values.length}"/>` +
    values.map((v, i) => `<c:pt idx="${i}"><c:v>${escapeXml(v)}</c:v></c:pt>`).join('')
  );
}

function titleXml(title: string): string {
  return (
    '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr>' +
    `<a:r><a:rPr lang="en-US" sz="1400" b="1"/><a:t>${escapeXml(title)}</a:t></a:r></a:p></c:rich></c:tx>` +
    '<c:overlay val="0"/></c:title>'
  );
}

function buildChartXml(chart: PieChart, embedWorkbook: boolean): string {
  const n = chart.slices.length;
  const first = 2;
  const last = n + 1;
  const points = chart.slices
    .map((_, i) => {
      const fill = SLICE_COLORS[i % SLICE_COLORS.length] ?? '4472C4';
      return `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></c:spPr></c:dPt>`;
    })
    .join('');
  // `showData` in Mermaid prints the raw values; the default shows each slice's share, as Mermaid does.
  const labels =
    '<c:dLbls>' +
    '<c:dLblPos val="bestFit"/>' +
    '<c:showLegendKey val="0"/>' +
    `<c:showVal val="${chart.showData ? 1 : 0}"/>` +
    '<c:showCatName val="0"/>' +
    '<c:showSerName val="0"/>' +
    '<c:showPercent val="1"/>' +
    '<c:showBubbleSize val="0"/>' +
    '<c:showLeaderLines val="1"/>' +
    '</c:dLbls>';
  const series =
    '<c:ser><c:idx val="0"/><c:order val="0"/>' +
    `<c:tx><c:strRef><c:f>${SHEET_NAME}!$B$1</c:f><c:strCache>${cached([SERIES_NAME])}</c:strCache></c:strRef></c:tx>` +
    points +
    labels +
    `<c:cat><c:strRef><c:f>${SHEET_NAME}!$A$${first}:$A$${last}</c:f><c:strCache>${cached(chart.slices.map((s) => s.label))}</c:strCache></c:strRef></c:cat>` +
    `<c:val><c:numRef><c:f>${SHEET_NAME}!$B$${first}:$B$${last}</c:f><c:numCache><c:formatCode>General</c:formatCode>${cached(chart.slices.map((s) => String(s.value)))}</c:numCache></c:numRef></c:val>` +
    '</c:ser>';
  const hasTitle = chart.title !== undefined && chart.title !== '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<c:date1904 val="0"/><c:roundedCorners val="0"/>' +
    '<c:chart>' +
    (hasTitle ? titleXml(chart.title ?? '') : '') +
    `<c:autoTitleDeleted val="${hasTitle ? 0 : 1}"/>` +
    '<c:plotArea><c:layout/>' +
    `<c:pieChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/></c:pieChart>` +
    '</c:plotArea>' +
    '<c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend>' +
    '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>' +
    '</c:chart>' +
    (embedWorkbook ? '<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData>' : '') +
    '</c:chartSpace>'
  );
}

function paragraph(chartId: string, cx: number, cy: number, name: string): string {
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

/**
 * Translate a parsed Mermaid `pie` into a native Word chart.
 *
 * @param chart - The parsed pie (at least one slice).
 * @param chartId - Opaque id of this chart in the caller's hand-off; only `[A-Za-z0-9-]` is accepted
 *   because it ends up inside an XML attribute and a directory name.
 * @param options - Drawing-size caps and whether to reference an embedded workbook.
 * @returns The paragraph (with a relationship placeholder), the chart part, and the data for the workbook.
 * @throws {RangeError} when `chartId` has unexpected characters or the pie has no slice.
 */
export function translatePieToChart(chart: PieChart, chartId: string, options: PieChartOptions = {}): NativeChart {
  if (!/^[A-Za-z0-9-]+$/.test(chartId)) throw new RangeError('chartId must match [A-Za-z0-9-]+');
  if (chart.slices.length === 0) throw new RangeError('a pie chart needs at least one slice');
  const embedWorkbook = options.embedWorkbook === true;
  const scale = Math.min(1, (options.maxDrawingCx ?? Infinity) / DEFAULT_CX, (options.maxDrawingCy ?? Infinity) / DEFAULT_CY);
  const cx = Math.max(1, Math.round(DEFAULT_CX * scale));
  const cy = Math.max(1, Math.round(DEFAULT_CY * scale));
  return {
    paragraphXml: paragraph(chartId, cx, cy, chart.title ?? 'Pie chart'),
    chartXml: buildChartXml(chart, embedWorkbook),
    workbook: {
      sheetName: SHEET_NAME,
      header: ['Category', SERIES_NAME],
      rows: chart.slices.map((s): [string, number] => [s.label, s.value]),
    },
    hasWorkbook: embedWorkbook,
  };
}
