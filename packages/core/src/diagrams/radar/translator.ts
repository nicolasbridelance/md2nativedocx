/**
 * OOXML translator for a Mermaid `radar-beta`. Family D strategy (calculated
 * shapes on a `wpc:wpc` canvas): graticule rings (circles or polygons, as
 * `graticule` asks), one spoke per axis with its label just outside the rim,
 * one translucent closed freeform polygon per curve, and a legend on the
 * right. Curves are straight-edged polygons (Mermaid's `curveTension`
 * smoothing is not reproduced). Needs at least 3 axes, otherwise a note.
 */

import type { RadarChart } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { boxShape, noteParagraph, scalePt } from '../../translator/boxes.js';
import { createIdAllocator, scaledExtent, scaledLineWidthEmu, wrapDrawingCanvas } from '../../translator/canvas.js';

const R = 190;
const LABEL_ROOM = 110;
const TOP = 28;
const TITLE_H = 40;
const FONT_PX = 13;
const LEGEND_W = 150;
const PALETTE = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '7030A0', '5B9BD5', 'C00000', '2E8B8B'];
const GRID = 'BFBFBF';
const AXIS = '7F7F7F';

interface Pt {
  x: number;
  y: number;
}

/** A freeform path shape from absolute EMU points; closed + filled, or an open polyline. */
function pathShape(id: number, points: Pt[], closed: boolean, fill: string | undefined, alphaPct: number, line: string, lineEmu: number): string {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - minX);
  const h = Math.max(1, Math.max(...ys) - minY);
  const [first, ...rest] = points;
  const fillXml = fill
    ? `<a:solidFill><a:srgbClr val="${fill}"><a:alpha val="${alphaPct * 1000}"/></a:srgbClr></a:solidFill>`
    : '<a:noFill/>';
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Shape ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${minX}" y="${minY}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`,
    '    <a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="0" b="0"/>',
    `      <a:pathLst><a:path w="${w}" h="${h}"${closed ? '' : ' fill="none"'}>`,
    `        <a:moveTo><a:pt x="${(first?.x ?? 0) - minX}" y="${(first?.y ?? 0) - minY}"/></a:moveTo>`,
    ...rest.map((p) => `        <a:lnTo><a:pt x="${p.x - minX}" y="${p.y - minY}"/></a:lnTo>`),
    closed ? '        <a:close/>' : '',
    '      </a:path></a:pathLst>',
    '    </a:custGeom>',
    `    ${fillXml}`,
    `    <a:ln w="${lineEmu}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>`,
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

function circleShape(id: number, cx: number, cy: number, r: number, line: string, lineEmu: number): string {
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Ring ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${cx - r}" y="${cy - r}"/><a:ext cx="${Math.max(1, r * 2)}" cy="${Math.max(1, r * 2)}"/></a:xfrm>`,
    '    <a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>',
    '    <a:noFill/>',
    `    <a:ln w="${lineEmu}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>`,
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

/** Translate a parsed radar chart into a self-contained WordprocessingML paragraph. */
export function translateRadarToOoxml(chart: RadarChart): string {
  const n = chart.axes.length;
  if (n < 3) return noteParagraph('A radar chart needs at least 3 axes to render.');

  const nextId = createIdAllocator();
  const showLegend = chart.showLegend && chart.curves.length > 0;
  const legendW = showLegend ? LEGEND_W + 20 : 0;
  const topMargin = TOP + (chart.title ? TITLE_H : 0);
  const canvasW = (R + LABEL_ROOM) * 2 + legendW;
  const canvasH = topMargin + (R + 40) * 2;
  const { scale: s } = scaledExtent(canvasW, canvasH);
  const cx = R + LABEL_ROOM;
  const cy = topMargin + R + 40;
  const emu = (v: number): number => scalePt(v, s);
  const pt = (x: number, y: number): Pt => ({ x: emu(x), y: emu(y) });
  const angle = (i: number): number => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const at = (i: number, radius: number): Pt => pt(cx + Math.cos(angle(i)) * radius, cy + Math.sin(angle(i)) * radius);

  const thin = scaledLineWidthEmu(9525, s);
  const mid = scaledLineWidthEmu(28575, s);
  const parts: string[] = [];
  const text = (x: number, y: number, w: number, h: number, str: string, opts: { bold?: boolean; align?: 'left' | 'center' }): string =>
    boxShape(nextId(), emu(x), emu(y), emu(w), emu(h), [str], { color: '000000', bold: opts.bold ?? false, align: opts.align ?? 'center', noWrap: true }, FONT_PX, s);

  if (chart.title) parts.push(text(0, TOP / 2, (R + LABEL_ROOM) * 2, TITLE_H, chart.title, { bold: true }));

  for (let t = 1; t <= chart.ticks; t++) {
    const radius = (R * t) / chart.ticks;
    if (chart.graticule === 'circle') {
      parts.push(circleShape(nextId(), emu(cx), emu(cy), emu(radius), GRID, thin));
    } else {
      const ring = Array.from({ length: n }, (_, i) => at(i, radius));
      parts.push(pathShape(nextId(), ring, true, undefined, 0, GRID, thin));
    }
  }

  chart.axes.forEach((axis, i) => {
    parts.push(pathShape(nextId(), [pt(cx, cy), at(i, R)], false, undefined, 0, AXIS, thin));
    const w = Math.ceil(estimateTextWidth(axis.label, FONT_PX)) + 12;
    const ux = Math.cos(angle(i));
    const uy = Math.sin(angle(i));
    const lx = cx + ux * (R + 10 + w / 2) - w / 2;
    const ly = cy + uy * (R + 12) - 10 + uy * 6;
    parts.push(text(lx, ly, w, 20, axis.label, {}));
  });

  chart.curves.forEach((curve, ci) => {
    const color = PALETTE[ci % PALETTE.length] ?? '4472C4';
    const ring = curve.values.map((v, i) => {
      const frac = Math.min(1, Math.max(0, (v - chart.min) / (chart.max - chart.min)));
      return at(i, R * frac);
    });
    parts.push(pathShape(nextId(), ring, true, color, 30, color, mid));
  });

  if (showLegend) {
    const lx = cx + R + LABEL_ROOM + 10;
    chart.curves.forEach((curve, ci) => {
      const color = PALETTE[ci % PALETTE.length] ?? '4472C4';
      const y = cy - R + ci * 26;
      parts.push(
        boxShape(nextId(), emu(lx), emu(y + 4), emu(14), emu(14), [], { fill: color, color: '000000' }, FONT_PX, s),
        text(lx + 20, y, LEGEND_W - 20, 22, curve.label, { align: 'left' }),
      );
    });
  }

  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), chart.title ?? 'Radar chart');
}
