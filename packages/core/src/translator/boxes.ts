/**
 * Shared text-box primitives for the Family D "grid of calculated boxes"
 * translators (`../diagrams/timeline`, `../diagrams/kanban`) — extracted when
 * the second real consumer appeared, same convention as `canvas.ts`.
 */

import { estimateTextWidth } from '../layout/layout.js';
import { escapeXml } from './xml-escape.js';
import { EMU_PER_PX, LABEL_NAME, scaledFontSizeHalfPt, scaledLineWidthEmu, unwrappedTextFrame } from './canvas.js';

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
  /**
   * One line, never wrapped. Without a fill or outline the box is widened so the text may overflow it
   * ({@link unwrappedTextFrame}); with one, the box keeps its size and the caller sizes it to the text.
   */
  noWrap?: boolean;
  /** Preset geometry (default `rect`); `roundRect` takes {@link BoxStyle.cornerAdj}. */
  prst?: 'rect' | 'roundRect' | 'ellipse';
  /** `roundRect` corner radius, as DrawingML's `adj` (100000 = half the shorter side). */
  cornerAdj?: number;
  /** Dashed outline. */
  dashed?: boolean;
  /** Outline width in EMU before scaling (default 9525, 1px). */
  lineEmu?: number;
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
    ? `<a:ln w="${scaledLineWidthEmu(style.lineEmu ?? 9525, scale)}"><a:solidFill><a:srgbClr val="${style.line}"/></a:solidFill>${style.dashed ? '<a:prstDash val="dash"/>' : ''}</a:ln>`
    : '<a:ln><a:noFill/></a:ln>';
  const prst = style.prst ?? 'rect';
  const av = prst === 'roundRect' && style.cornerAdj !== undefined ? `<a:gd name="adj" fmla="val ${Math.round(style.cornerAdj)}"/>` : '';
  // `wrap="none"` is never written: Word resizes such a box to its text (see `unwrappedTextFrame`).
  const invisible = !style.fill && !style.line;
  const frame = style.noWrap && invisible ? unwrappedTextFrame(x, w, jc) : { x, w };
  const inset = jc === 'center' ? 0 : scalePt(style.noWrap ? 2 : 8, scale);
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="${style.noWrap && invisible ? LABEL_NAME : 'Box'} ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${frame.x}" y="${y}"/><a:ext cx="${Math.max(1, frame.w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    `    <a:prstGeom prst="${prst}">${av ? `<a:avLst>${av}</a:avLst>` : '<a:avLst/>'}</a:prstGeom>`,
    `    ${fill}`,
    `    ${ln}`,
    '  </wps:spPr>',
    '  <wps:txbx>',
    `    <w:txbxContent>${paragraphs}</w:txbxContent>`,
    '  </wps:txbx>',
    `  <wps:bodyPr wrap="square" lIns="${inset}" tIns="0" rIns="${inset}" bIns="0" anchor="ctr"/>`,
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

/** Font size (px) that fits the widest of `lines` within `widthPx` on one
 * line each (never above `fontPx`, never below `minPx`), plus whether any
 * shrinking happened — callers then pair it with `noWrap` so the renderer
 * doesn't break a single long word mid-letter. */
export function fitFont(lines: string[], fontPx: number, widthPx: number, minPx: number): { fontPx: number; shrunk: boolean } {
  const widest = Math.max(1, ...lines.map((l) => estimateTextWidth(l, fontPx)));
  if (widest <= widthPx) return { fontPx, shrunk: false };
  return { fontPx: Math.max(minPx, Math.floor((fontPx * widthPx) / widest)), shrunk: true };
}
