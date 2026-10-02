/**
 * Shared text-box primitives for the Family D "grid of calculated boxes"
 * translators (`../diagrams/timeline`, `../diagrams/kanban`) — extracted when
 * the second real consumer appeared, same convention as `canvas.ts`.
 */

import { estimateTextWidth } from '../layout/layout.js';
import { escapeXml } from './xml-escape.js';
import { EMU_PER_PX, scaledFontSizeHalfPt, scaledLineWidthEmu } from './canvas.js';

/** Pixels -> EMU, multiplied by the canvas `scale` from `scaledExtent`. */
export function scalePt(px: number, factor: number): number {
  return Math.round(px * EMU_PER_PX * factor);
}

/** Blend a hex color toward white (`amount` 0..1 = share of white). */
export function tint(hex: string, amount: number): string {
  const channel = (i: number): string => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0');
  };
  return (channel(0) + channel(2) + channel(4)).toUpperCase();
}

/** Greedy word wrap to `widthPx` honoring forced `\n` breaks. */
export function wrapText(text: string, fontPx: number, widthPx: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter((w) => w.length > 0)) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && estimateTextWidth(candidate, fontPx) > widthPx) {
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

export interface BoxStyle {
  fill?: string;
  color: string;
  bold?: boolean;
  italic?: boolean;
  /** Outline color; no outline when omitted. */
  line?: string;
  align?: 'left' | 'center' | 'right';
  /** Disable word wrap (text may overflow the box instead of breaking mid-word). */
  noWrap?: boolean;
}

/** A filled rectangle with one centered/left paragraph per entry of `lines`
 * (all text XML-escaped). `fontPx` is the unscaled size; `scale` is applied
 * to the font here, but the caller scales `x`/`y`/`w`/`h` (via {@link scalePt}). */
export function boxShape(
  id: number,
  x: number,
  y: number,
  w: number,
  h: number,
  lines: string[],
  style: BoxStyle,
  fontPx: number,
  scale: number,
): string {
  const size = scaledFontSizeHalfPt(fontPx * 2 - 4, scale);
  const jc = style.align ?? 'center';
  const paragraphs = lines
    .map(
      (line) =>
        `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="${jc}"/></w:pPr>` +
        `<w:r><w:rPr>${style.bold ? '<w:b/>' : ''}${style.italic ? '<w:i/>' : ''}<w:color w:val="${style.color}"/><w:sz w:val="${size}"/></w:rPr>` +
        `<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`,
    )
    .join('');
  const fill = style.fill ? `<a:solidFill><a:srgbClr val="${style.fill}"/></a:solidFill>` : '<a:noFill/>';
  const ln = style.line
    ? `<a:ln w="${scaledLineWidthEmu(9525, scale)}"><a:solidFill><a:srgbClr val="${style.line}"/></a:solidFill></a:ln>`
    : '<a:ln><a:noFill/></a:ln>';
  const inset = jc === 'center' ? 0 : scalePt(style.noWrap ? 2 : 8, scale);
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Box ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    '    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
    `    ${fill}`,
    `    ${ln}`,
    '  </wps:spPr>',
    '  <wps:txbx>',
    `    <w:txbxContent>${paragraphs}</w:txbxContent>`,
    '  </wps:txbx>',
    `  <wps:bodyPr wrap="${style.noWrap ? 'none' : 'square'}" lIns="${inset}" tIns="0" rIns="${inset}" bIns="0" anchor="ctr"/>`,
    '</wps:wsp>',
  ].join('\n');
}

/** A gray italic WordprocessingML note paragraph (empty/degraded diagrams). */
export function noteParagraph(text: string): string {
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
