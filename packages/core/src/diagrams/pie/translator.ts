/**
 * OOXML translator for a Mermaid `pie` chart. Family D strategy (calculated
 * shapes on a `wpc:wpc` canvas, no `c:chart`): each slice is a `wps:wsp` with
 * `prstGeom="pie"` whose `adj1`/`adj2` are the start/end angles (60000ths of
 * a degree, clockwise from 3 o'clock — Mermaid starts at 12 o'clock, so every
 * angle is offset by -90°). A single 100% slice is an `ellipse` instead
 * (`pie` with equal angles draws nothing). Slice percentage labels sit at
 * Mermaid's default `textPosition` of 0.75 of the radius and are omitted for
 * slices under 1%, as Mermaid does; a legend on the right (Mermaid's default
 * `legendPosition`) names every slice, with its raw value when `showData`.
 */

import type { PieChart } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { escapeXml } from '../../translator/xml-escape.js';
import {
  EMU_PER_PX,
  createIdAllocator,
  scaledExtent,
  scaledFontSizeHalfPt,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
} from '../../translator/canvas.js';

const RADIUS = 150;
const PAD = 30;
const TITLE_HEIGHT = 44;
const LEGEND_GAP = 40;
const LEGEND_ROW = 26;
const SWATCH = 16;
const TEXT_POSITION = 0.75;
const MIN_LABELLED_FRACTION = 0.01;
const SLICE_COLORS = [
  '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47',
  '264478', '9E480E', '636363', '997300', '255E91', '43682B',
];

function scalePt(px: number, factor: number): number {
  return Math.round(px * EMU_PER_PX * factor);
}

function formatValue(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function sliceShape(id: number, x: number, y: number, d: number, fill: string, startDeg: number, endDeg: number, full: boolean, lineEmu: number): string {
  const geom = full
    ? '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>'
    : '<a:prstGeom prst="pie"><a:avLst>' +
      `<a:gd name="adj1" fmla="val ${Math.round(startDeg * 60000)}"/>` +
      `<a:gd name="adj2" fmla="val ${Math.round(endDeg * 60000)}"/>` +
      '</a:avLst></a:prstGeom>';
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Slice ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, d)}" cy="${Math.max(1, d)}"/></a:xfrm>`,
    `    ${geom}`,
    `    <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`,
    `    <a:ln w="${lineEmu}"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>`,
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

function textBox(id: number, x: number, y: number, w: number, h: number, text: string, sizeHalfPt: number, color: string, jc: 'left' | 'center', bold: boolean, scale: number): string {
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
    `      <w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="${jc}"/></w:pPr>` +
      `<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:color w:val="${color}"/>` +
      `<w:sz w:val="${scaledFontSizeHalfPt(sizeHalfPt, scale)}"/></w:rPr>` +
      `<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`,
    '    </w:txbxContent>',
    '  </wps:txbx>',
    '  <wps:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/>',
    '</wps:wsp>',
  ].join('\n');
}

function swatch(id: number, x: number, y: number, size: number, fill: string): string {
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Legend ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${size}" cy="${size}"/></a:xfrm>`,
    '    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
    `    <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`,
    '    <a:ln><a:noFill/></a:ln>',
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

function note(text: string): string {
  return [
    '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '  <w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>',
    '  <w:r>',
    '    <w:rPr><w:i/><w:color w:val="808080"/><w:sz w:val="18"/></w:rPr>',
    `    <w:t xml:space="preserve">${escapeXml(text)}</w:t>`,
    '  </w:r>',
    '</w:p>',
  ].join('\n');
}

/** Translate a parsed pie chart into a self-contained WordprocessingML paragraph. */
export function translatePieToOoxml(chart: PieChart): string {
  if (chart.slices.length === 0) return note('This pie chart has no data to render.');

  const nextId = createIdAllocator();
  const total = chart.slices.reduce((sum, s) => sum + s.value, 0);
  const legendLabels = chart.slices.map((s) => (chart.showData ? `${s.label} [${formatValue(s.value)}]` : s.label));
  const legendTextW = Math.max(...legendLabels.map((l) => estimateTextWidth(l, 14))) + 8;

  const topMargin = chart.title ? TITLE_HEIGHT : 0;
  const legendH = chart.slices.length * LEGEND_ROW;
  const chartH = Math.max(RADIUS * 2, legendH);
  const legendX = PAD + RADIUS * 2 + LEGEND_GAP;
  const canvasW = legendX + SWATCH + 8 + legendTextW + PAD;
  const canvasH = PAD * 2 + topMargin + chartH;
  const { scale: s } = scaledExtent(canvasW, canvasH);

  const cx = PAD + RADIUS;
  const cy = PAD + topMargin + chartH / 2;
  const parts: string[] = [];

  if (chart.title) {
    parts.push(textBox(nextId(), 0, 0, scalePt(canvasW, s), scalePt(topMargin + PAD / 2, s), chart.title, 28, '000000', 'center', true, s));
  }

  const lineEmu = scaledLineWidthEmu(19050, s);
  const labels: string[] = [];
  let startFrac = 0;
  chart.slices.forEach((slice, i) => {
    const frac = slice.value / total;
    const fill = SLICE_COLORS[i % SLICE_COLORS.length] ?? '4472C4';
    const startDeg = (((startFrac * 360 - 90) % 360) + 360) % 360;
    const endDeg = ((((startFrac + frac) * 360 - 90) % 360) + 360) % 360;
    parts.push(
      sliceShape(nextId(), scalePt(cx - RADIUS, s), scalePt(cy - RADIUS, s), scalePt(RADIUS * 2, s), fill, startDeg, endDeg, chart.slices.length === 1, lineEmu),
    );
    if (frac >= MIN_LABELLED_FRACTION) {
      const mid = (startFrac + frac / 2) * 2 * Math.PI - Math.PI / 2;
      const lx = cx + Math.cos(mid) * RADIUS * TEXT_POSITION;
      const ly = cy + Math.sin(mid) * RADIUS * TEXT_POSITION;
      labels.push(textBox(nextId(), scalePt(lx - 25, s), scalePt(ly - 9, s), scalePt(50, s), scalePt(18, s), `${Math.round(frac * 100)}%`, 17, '000000', 'center', false, s));
    }
    startFrac += frac;
  });
  parts.push(...labels); // labels last so no later slice paints over them

  const legendTop = cy - legendH / 2;
  chart.slices.forEach((_, i) => {
    const rowY = legendTop + i * LEGEND_ROW;
    parts.push(swatch(nextId(), scalePt(legendX, s), scalePt(rowY + (LEGEND_ROW - SWATCH) / 2, s), scalePt(SWATCH, s), SLICE_COLORS[i % SLICE_COLORS.length] ?? '4472C4'));
    parts.push(textBox(nextId(), scalePt(legendX + SWATCH + 8, s), scalePt(rowY, s), scalePt(legendTextW, s), scalePt(LEGEND_ROW, s), legendLabels[i] ?? '', 20, '000000', 'left', false, s));
  });

  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), chart.title ?? 'Pie chart');
}
