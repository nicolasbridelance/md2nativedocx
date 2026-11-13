/**
 * Native Word chart for a Mermaid `radar-beta` (ADR 0011, palier 3): one `c:radarChart` series per curve,
 * one category per axis, a value axis scaled to Mermaid's `min`/`max` with `ticks` rings.
 *
 * Deliberate gaps: Word's radar grid is always polygonal, so `graticule circle` is drawn as polygon;
 * fewer than three axes cannot form a radar and {@link translateRadarToChart} throws (the caller falls
 * back to the shape-built chart).
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
  type NativeChart,
  type NativeChartOptions,
} from '../../translator/native-chart.js';
import type { RadarChart } from './types.js';

/** Options of {@link translateRadarToChart}. */
export type RadarChartOptions = NativeChartOptions;

const CAT_AX = 333333;
const VAL_AX = 444444;

/**
 * Translate a parsed `radar-beta` into a native Word chart.
 *
 * @param chart - The parsed radar (at least three axes and one curve).
 * @param chartId - Opaque id in the caller's hand-off (`[A-Za-z0-9-]` only).
 * @param options - Drawing-size caps and whether to reference an embedded workbook.
 * @throws {RangeError} when there are fewer than three axes, no curve, or the id is unsafe.
 */
export function translateRadarToChart(chart: RadarChart, chartId: string, options: RadarChartOptions = {}): NativeChart {
  if (chart.axes.length < 3) throw new RangeError('a radar chart needs at least three axes');
  if (chart.curves.length === 0) throw new RangeError('a radar chart needs at least one curve');
  const embedWorkbook = options.embedWorkbook === true;
  const labels = chart.axes.map((a) => a.label);
  const last = labels.length + 1;
  const series = chart.curves
    .map((curve, i) => {
      const color = SERIES_PALETTE[i % SERIES_PALETTE.length] ?? '4472C4';
      const column = columnLetters(i + 1);
      return (
        `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>` +
        `<c:tx>${strRef(`${SHEET_NAME}!$${column}$1`, [curve.label])}</c:tx>` +
        // Mermaid fills each curve with a translucent colour and a solid outline.
        solidSpPr(color, color, 35) +
        `<c:cat>${strRef(`${SHEET_NAME}!$A$2:$A$${last}`, labels)}</c:cat>` +
        `<c:val>${numRef(`${SHEET_NAME}!$${column}$2:$${column}$${last}`, curve.values)}</c:val></c:ser>`
      );
    })
    .join('');
  const majorUnit = (chart.max - chart.min) / Math.max(1, chart.ticks);
  const plotArea =
    '<c:plotArea><c:layout/>' +
    `<c:radarChart><c:radarStyle val="filled"/><c:varyColors val="0"/>${series}<c:axId val="${CAT_AX}"/><c:axId val="${VAL_AX}"/></c:radarChart>` +
    `<c:catAx><c:axId val="${CAT_AX}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>` +
    '<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
    `<c:crossAx val="${VAL_AX}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="${VAL_AX}"/><c:scaling><c:orientation val="minMax"/><c:max val="${chart.max}"/><c:min val="${chart.min}"/></c:scaling><c:delete val="0"/>` +
    '<c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="cross"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
    `<c:crossAx val="${CAT_AX}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/><c:majorUnit val="${majorUnit}"/></c:valAx>` +
    '</c:plotArea>';
  return {
    paragraphXml: chartParagraph(chartId, options, chart.title ?? 'Radar chart'),
    chartXml: chartSpace(plotArea, {
      ...(chart.title !== undefined ? { title: chart.title } : {}),
      legend: chart.showLegend,
      embedWorkbook,
    }),
    workbook: {
      sheetName: SHEET_NAME,
      header: ['Category', ...chart.curves.map((c) => c.label)],
      rows: labels.map((label, k): [string, ...Array<number | undefined>] => [label, ...chart.curves.map((c) => c.values[k])]),
    },
    hasWorkbook: embedWorkbook,
  };
}
