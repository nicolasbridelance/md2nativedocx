/**
 * Native Word chart for a Mermaid `xychart-beta` (ADR 0011, palier 3): `bar` series become a clustered
 * `c:barChart`, `line` series a `c:lineChart`, both on one category axis and one value axis, so a mixed
 * chart (like Mermaid's bar + line example) stays a single editable chart.
 *
 * Deliberate gaps, each degrading rather than failing silently:
 * - a numeric x-axis (`x-axis "t" 0 --> 10`) becomes evenly spaced category labels;
 * - per-point labels on a line (`[25 "late"]`) are not carried over;
 * - a horizontal chart with a `line` series cannot be a Word chart (line charts are always vertical):
 *   {@link translateXyChartToChart} throws, and the caller falls back to the shape-built chart.
 */

import {
  SERIES_PALETTE,
  SHEET_NAME,
  chartParagraph,
  chartSpace,
  columnLetters,
  numRef,
  solidSpPr,
  strRef,
  titleXml,
  type NativeChart,
  type NativeChartOptions,
} from '../../translator/native-chart.js';
import type { XyChart } from './types.js';

/** Options of {@link translateXyChartToChart}. */
export type XyChartOptions = NativeChartOptions;

const CAT_AX = 111111;
const VAL_AX = 222222;

function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Category labels: the declared ones, evenly spaced labels for a numeric range, or 1..n. */
function categoryLabels(chart: XyChart, count: number): string[] {
  const declared = chart.xAxis.categories;
  const { min, max } = chart.xAxis;
  return Array.from({ length: count }, (_, i) => {
    if (declared) return declared[i] ?? String(i + 1);
    if (min !== undefined && max !== undefined) {
      return formatNumber(count === 1 ? min : min + (i * (max - min)) / (count - 1));
    }
    return String(i + 1);
  });
}

function categoryAxis(chart: XyChart): string {
  const horizontal = chart.horizontal;
  return (
    `<c:catAx><c:axId val="${CAT_AX}"/>` +
    // Mermaid lists horizontal categories top to bottom; Word draws the first one at the bottom unless reversed.
    `<c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/>` +
    `<c:axPos val="${horizontal ? 'l' : 'b'}"/>` +
    (chart.xAxis.title ? titleXml(chart.xAxis.title, 1000) : '') +
    '<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
    `<c:crossAx val="${VAL_AX}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
  );
}

function valueAxis(chart: XyChart): string {
  const { min, max } = chart.yAxis;
  const range = min !== undefined && max !== undefined ? `<c:max val="${max}"/><c:min val="${min}"/>` : '';
  return (
    `<c:valAx><c:axId val="${VAL_AX}"/><c:scaling><c:orientation val="minMax"/>${range}</c:scaling><c:delete val="0"/>` +
    `<c:axPos val="${chart.horizontal ? 'b' : 'l'}"/><c:majorGridlines/>` +
    (chart.yAxis.title ? titleXml(chart.yAxis.title, 1000) : '') +
    '<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
    // With a reversed category axis the value axis would jump to the top; cross at the last category to keep it at the bottom.
    `<c:crossAx val="${CAT_AX}"/><c:crosses val="${chart.horizontal ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`
  );
}

/**
 * Translate a parsed `xychart-beta` into a native Word chart.
 *
 * @param chart - The parsed chart (at least one series).
 * @param chartId - Opaque id in the caller's hand-off (`[A-Za-z0-9-]` only).
 * @param options - Drawing-size caps and whether to reference an embedded workbook.
 * @throws {RangeError} when there is no series, the id is unsafe, or a horizontal chart has a line series.
 */
export function translateXyChartToChart(chart: XyChart, chartId: string, options: XyChartOptions = {}): NativeChart {
  if (chart.series.length === 0) throw new RangeError('an xychart needs at least one series');
  if (chart.horizontal && chart.series.some((s) => s.kind === 'line')) {
    throw new RangeError('a horizontal xychart with a line series cannot be a native Word chart (line charts are vertical only)');
  }
  const embedWorkbook = options.embedWorkbook === true;
  const count = Math.max(chart.xAxis.categories?.length ?? 0, ...chart.series.map((s) => s.values.length));
  const labels = categoryLabels(chart, count);
  const last = count + 1;
  const names = chart.series.map((s, i) => s.name ?? `Series ${i + 1}`);

  const seriesXml = (kind: 'bar' | 'line'): string =>
    chart.series
      .map((s, i) => {
        if (s.kind !== kind) return '';
        const color = SERIES_PALETTE[i % SERIES_PALETTE.length] ?? '4472C4';
        const column = columnLetters(i + 1);
        const common =
          `<c:idx val="${i}"/><c:order val="${i}"/><c:tx>${strRef(`${SHEET_NAME}!$${column}$1`, [names[i] ?? ''])}</c:tx>`;
        const cat = `<c:cat>${strRef(`${SHEET_NAME}!$A$2:$A$${last}`, labels)}</c:cat>`;
        const val = `<c:val>${numRef(`${SHEET_NAME}!$${column}$2:$${column}$${last}`, Array.from({ length: count }, (_, k) => s.values[k]))}</c:val>`;
        if (kind === 'bar') return `<c:ser>${common}${solidSpPr(color)}<c:invertIfNegative val="0"/>${cat}${val}</c:ser>`;
        return (
          `<c:ser>${common}<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:round/></a:ln></c:spPr>` +
          `<c:marker><c:symbol val="circle"/><c:size val="5"/>${solidSpPr(color)}</c:marker>${cat}${val}<c:smooth val="0"/></c:ser>`
        );
      })
      .join('');

  const hasBars = chart.series.some((s) => s.kind === 'bar');
  const hasLines = chart.series.some((s) => s.kind === 'line');
  const axes = `<c:axId val="${CAT_AX}"/><c:axId val="${VAL_AX}"/>`;
  const plotArea =
    '<c:plotArea><c:layout/>' +
    (hasBars
      ? `<c:barChart><c:barDir val="${chart.horizontal ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${seriesXml('bar')}<c:gapWidth val="150"/>${axes}</c:barChart>`
      : '') +
    (hasLines
      ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${seriesXml('line')}<c:marker val="1"/>${axes}</c:lineChart>`
      : '') +
    categoryAxis(chart) +
    valueAxis(chart) +
    '</c:plotArea>';

  return {
    paragraphXml: chartParagraph(chartId, options, chart.title ?? 'XY chart'),
    chartXml: chartSpace(plotArea, {
      ...(chart.title !== undefined ? { title: chart.title } : {}),
      legend: chart.series.length > 1,
      embedWorkbook,
    }),
    workbook: {
      sheetName: SHEET_NAME,
      header: ['Category', ...names],
      rows: labels.map((label, k): [string, ...Array<number | undefined>] => [label, ...chart.series.map((s) => s.values[k])]),
    },
    hasWorkbook: embedWorkbook,
  };
}
