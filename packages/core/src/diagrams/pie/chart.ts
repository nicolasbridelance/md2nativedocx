/**
 * Native Word chart (`c:chart`) for a Mermaid `pie` — the opt-in alternative to the shape-built pie of
 * `translator.ts` (ADR 0011). The result is an editable chart object: colours and styles through Chart
 * Design and, with the embedded workbook, its values through Edit Data.
 *
 * Pure function like every translator: it returns the paragraph, the chart part and the workbook data
 * and writes nothing; the caller (Pandoc bridge + CLI post-processing, same hand-off as SmartArt) adds
 * them to the `.docx` and swaps the paragraph's relationship placeholder for the real id.
 */

import {
  CHART_PLACEHOLDER_PREFIX,
  SHEET_NAME,
  chartParagraph,
  chartSpace,
  numRef,
  strRef,
  type ChartWorkbook,
  type NativeChart,
  type NativeChartOptions,
} from '../../translator/native-chart.js';
import type { PieChart } from './types.js';

export { CHART_PLACEHOLDER_PREFIX };
export type { ChartWorkbook, NativeChart };
/** Options of {@link translatePieToChart}. */
export type PieChartOptions = NativeChartOptions;

/** Same palette as the shape-built pie, so switching between the two keeps the colours. */
const SLICE_COLORS = [
  '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47',
  '264478', '9E480E', '636363', '997300', '255E91', '43682B',
];

const SERIES_NAME = 'Value';

function plotArea(chart: PieChart): string {
  const last = chart.slices.length + 1;
  const points = chart.slices
    .map((_, i) => {
      const fill = SLICE_COLORS[i % SLICE_COLORS.length] ?? '4472C4';
      return `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></c:spPr></c:dPt>`;
    })
    .join('');
  // `showData` in Mermaid prints the raw values; the default shows each slice's share, as Mermaid does.
  const labels =
    '<c:dLbls><c:dLblPos val="bestFit"/><c:showLegendKey val="0"/>' +
    `<c:showVal val="${chart.showData ? 1 : 0}"/><c:showCatName val="0"/><c:showSerName val="0"/>` +
    '<c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>';
  const series =
    '<c:ser><c:idx val="0"/><c:order val="0"/>' +
    `<c:tx>${strRef(`${SHEET_NAME}!$B$1`, [SERIES_NAME])}</c:tx>` +
    points +
    labels +
    `<c:cat>${strRef(`${SHEET_NAME}!$A$2:$A$${last}`, chart.slices.map((s) => s.label))}</c:cat>` +
    `<c:val>${numRef(`${SHEET_NAME}!$B$2:$B$${last}`, chart.slices.map((s) => s.value))}</c:val>` +
    '</c:ser>';
  return `<c:plotArea><c:layout/><c:pieChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/></c:pieChart></c:plotArea>`;
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
  if (chart.slices.length === 0) throw new RangeError('a pie chart needs at least one slice');
  const embedWorkbook = options.embedWorkbook === true;
  return {
    paragraphXml: chartParagraph(chartId, options, chart.title ?? 'Pie chart'),
    chartXml: chartSpace(plotArea(chart), { ...(chart.title !== undefined ? { title: chart.title } : {}), legend: true, embedWorkbook }),
    workbook: {
      sheetName: SHEET_NAME,
      header: ['Category', SERIES_NAME],
      rows: chart.slices.map((s): [string, number] => [s.label, s.value]),
    },
    hasWorkbook: embedWorkbook,
  };
}
