/**
 * OOXML translator for a Mermaid `timeline`. Family D strategy (calculated
 * shapes on a `wpc:wpc` canvas): one column per period, left to right in
 * declaration order. From top: optional section bands spanning their periods'
 * columns, the period boxes, a thin axis bar, then each period's events as
 * lighter boxes stacked downward. Every section (or, with no sections, every
 * period) gets its own palette color, as Mermaid does. Text wraps by word to
 * the column width; `<br>` (already `\n` in the AST) forces a break.
 */

import type { TimelineChart } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { escapeXml } from '../../translator/xml-escape.js';
import {
  EMU_PER_PX,
  createIdAllocator,
  scaledExtent,
  scaledFontSizeHalfPt,
  wrapDrawingCanvas,
} from '../../translator/canvas.js';

const COL_W = 160;
const COL_GAP = 12;
const PAD = 30;
const TITLE_HEIGHT = 44;
const SECTION_H = 34;
const AXIS_H = 6;
const FONT_PX = 13;
const LINE_H = 17;
const BOX_PAD_Y = 10;
const BOX_GAP = 8;
const WRAP_W = COL_W - 16;
const PALETTE = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '7030A0', '5B9BD5', 'C00000', '2E8B8B'];

function scalePt(px: number, factor: number): number {
  return Math.round(px * EMU_PER_PX * factor);
}

/** Blend a hex color toward white (`amount` 0..1 = share of white). */
function tint(hex: string, amount: number): string {
  const channel = (i: number): string => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0');
  };
  return (channel(0) + channel(2) + channel(4)).toUpperCase();
}

/** Greedy word wrap honoring forced `\n` breaks. */
function wrapLines(text: string): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter((w) => w.length > 0)) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && estimateTextWidth(candidate, FONT_PX) > WRAP_W) {
        out.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    out.push(current);
  }
  return out;
}

function boxHeight(lines: string[]): number {
  return lines.length * LINE_H + BOX_PAD_Y * 2;
}

interface BoxStyle {
  fill: string;
  color: string;
  bold: boolean;
}

function box(id: number, x: number, y: number, w: number, h: number, lines: string[], style: BoxStyle, scale: number): string {
  const size = scaledFontSizeHalfPt(FONT_PX * 2 - 4, scale);
  const paragraphs = lines
    .map(
      (line) =>
        '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>' +
        `<w:r><w:rPr>${style.bold ? '<w:b/>' : ''}<w:color w:val="${style.color}"/><w:sz w:val="${size}"/></w:rPr>` +
        `<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`,
    )
    .join('');
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Box ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    '    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
    `    <a:solidFill><a:srgbClr val="${style.fill}"/></a:solidFill>`,
    '    <a:ln><a:noFill/></a:ln>',
    '  </wps:spPr>',
    '  <wps:txbx>',
    `    <w:txbxContent>${paragraphs}</w:txbxContent>`,
    '  </wps:txbx>',
    '  <wps:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/>',
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

/** Translate a parsed timeline into a self-contained WordprocessingML paragraph. */
export function translateTimelineToOoxml(chart: TimelineChart): string {
  if (chart.periods.length === 0) return note('This timeline has no periods to render.');

  const nextId = createIdAllocator();
  const n = chart.periods.length;
  const hasSections = chart.periods.some((p) => p.sectionIndex >= 0);
  const colorOf = (periodIndex: number): string => {
    const period = chart.periods[periodIndex];
    const key = hasSections ? Math.max(0, period?.sectionIndex ?? 0) : periodIndex;
    return PALETTE[key % PALETTE.length] ?? '4472C4';
  };

  const periodLines = chart.periods.map((p) => wrapLines(p.label));
  const periodH = Math.max(...periodLines.map(boxHeight));
  const eventLines = chart.periods.map((p) => p.events.map(wrapLines));
  const eventsH = Math.max(
    0,
    ...eventLines.map((col) => col.reduce((sum, lines) => sum + boxHeight(lines) + BOX_GAP, 0)),
  );

  const topMargin = chart.title ? TITLE_HEIGHT : 0;
  const sectionRow = hasSections ? SECTION_H + BOX_GAP : 0;
  const canvasW = PAD * 2 + n * COL_W + (n - 1) * COL_GAP;
  const canvasH = PAD * 2 + topMargin + sectionRow + periodH + AXIS_H + BOX_GAP + eventsH;
  const { scale: s } = scaledExtent(canvasW, canvasH);
  const colX = (i: number): number => PAD + i * (COL_W + COL_GAP);

  const parts: string[] = [];
  if (chart.title) {
    parts.push(
      box(nextId(), 0, scalePt(PAD / 2, s), scalePt(canvasW, s), scalePt(TITLE_HEIGHT, s), [chart.title], { fill: 'FFFFFF', color: '000000', bold: true }, s)
        .replace(/<a:solidFill><a:srgbClr val="FFFFFF"\/><\/a:solidFill>/, '<a:noFill/>'),
    );
  }

  let y = PAD + topMargin;
  if (hasSections) {
    let i = 0;
    while (i < n) {
      const sectionIndex = chart.periods[i]?.sectionIndex ?? -1;
      let j = i;
      while (j + 1 < n && (chart.periods[j + 1]?.sectionIndex ?? -1) === sectionIndex) j++;
      const label = sectionIndex >= 0 ? (chart.sections[sectionIndex] ?? '') : '';
      const w = colX(j) + COL_W - colX(i);
      parts.push(
        box(nextId(), scalePt(colX(i), s), scalePt(y, s), scalePt(w, s), scalePt(SECTION_H, s), label ? label.split('\n') : [''], { fill: colorOf(i), color: 'FFFFFF', bold: true }, s),
      );
      i = j + 1;
    }
    y += sectionRow;
  }

  chart.periods.forEach((_, i) => {
    const fill = colorOf(i);
    parts.push(
      box(nextId(), scalePt(colX(i), s), scalePt(y, s), scalePt(COL_W, s), scalePt(periodH, s), periodLines[i] ?? [''], { fill: tint(fill, 0.15), color: '000000', bold: true }, s),
    );
  });
  y += periodH;

  parts.push(box(nextId(), scalePt(PAD, s), scalePt(y, s), scalePt(canvasW - PAD * 2, s), scalePt(AXIS_H, s), [], { fill: '7F7F7F', color: '000000', bold: false }, s));
  y += AXIS_H + BOX_GAP;

  eventLines.forEach((col, i) => {
    let ey = y;
    const fill = tint(colorOf(i), 0.75);
    col.forEach((lines) => {
      const h = boxHeight(lines);
      parts.push(box(nextId(), scalePt(colX(i), s), scalePt(ey, s), scalePt(COL_W, s), scalePt(h, s), lines, { fill, color: '000000', bold: false }, s));
      ey += h + BOX_GAP;
    });
  });

  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, nextId(), chart.title ?? 'Timeline');
}
