/**
 * OOXML translator for a Mermaid `venn-beta` diagram
 * (`docs/smartart-full-catalog-cross-mermaid.md` archetype #11, "Venn").
 *
 * Same "bypass the SmartArt engine, draw plain OOXML shapes" strategy as
 * `../quadrant/translator.ts`: the cross-Mermaid catalog's own verdict is
 * that Word's `dgm:` diagram engine has no simple built-in mechanism for a
 * true overlapping-circle boolean region, so this renders semi-transparent
 * `wps:wsp` ellipses (`prstGeom="ellipse"`) instead — overlap color comes
 * for free as the natural alpha-blend of the circles stacked on top of each
 * other, no lens-shaped boolean geometry computed by hand.
 *
 * Only 1-3 sets get true overlapping-circle geometry (the classic symmetric
 * Venn layouts). Real, proportional N-way Venn geometry for N>3 is a hard,
 * open problem even for dedicated tools — not attempted here (matches this
 * project's existing judgment call on Sankey/Wardley in the cross-Mermaid
 * catalog: "no native chart type either, real geometry work"). 4+ sets
 * degrade to a non-overlapping row, each still labeled, with a visible note
 * explaining the degradation — never a silent loss of content.
 */

import type { VennChart, VennSet, VennUnion } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { escapeXml, validateHexColor } from '../../translator/xml-escape.js';
import {
  EMU_PER_PX,
  createIdAllocator,
  scaledExtent,
  scaledFontSizeHalfPt,
  wrapDrawingCanvas,
} from '../../translator/canvas.js';

const CIRCLE_R = 130;
const SEPARATION_2 = 140;
const CENTROID_DIST_3 = 100;
const ROW_GAP = 30;
const PAD = 50;
const TITLE_HEIGHT = 44;
const CIRCLE_ALPHA = 60000; // 60%, see module doc comment

const SET_DEFAULT_COLORS = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '7030A0', 'C00000'];

interface Point {
  x: number;
  y: number;
}

/** Circle centers relative to a (0,0) centroid. `overlapping` is false once
 * geometry falls back to a non-overlapping row (4+ sets). */
function computeCenters(n: number): { centers: Point[]; overlapping: boolean } {
  if (n <= 1) return { centers: [{ x: 0, y: 0 }], overlapping: true };
  if (n === 2) {
    return { centers: [{ x: -SEPARATION_2 / 2, y: 0 }, { x: SEPARATION_2 / 2, y: 0 }], overlapping: true };
  }
  if (n === 3) {
    const d = CENTROID_DIST_3;
    return {
      centers: [
        { x: 0, y: -d },
        { x: -d * 0.866, y: d * 0.5 },
        { x: d * 0.866, y: d * 0.5 },
      ],
      overlapping: true,
    };
  }
  const centers: Point[] = [];
  const step = 2 * CIRCLE_R + ROW_GAP;
  const startX = -((n - 1) * step) / 2;
  for (let i = 0; i < n; i++) centers.push({ x: startX + i * step, y: 0 });
  return { centers, overlapping: false };
}

function normalize(p: Point): Point {
  const len = Math.hypot(p.x, p.y);
  return len < 1e-6 ? { x: 0, y: -1 } : { x: p.x / len, y: p.y / len };
}

function scalePt(px: number, factor: number): number {
  return Math.round(px * EMU_PER_PX * factor);
}

function ellipse(id: number, x: number, y: number, d: number, fillHex: string, alpha: number): string {
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Set ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, d)}" cy="${Math.max(1, d)}"/></a:xfrm>`,
    '    <a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>',
    `    <a:solidFill><a:srgbClr val="${fillHex}"><a:alpha val="${alpha}"/></a:srgbClr></a:solidFill>`,
    `    <a:ln w="19050"><a:solidFill><a:srgbClr val="${fillHex}"/></a:solidFill></a:ln>`,
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

interface TextOptions {
  sizeHalfPt: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
}

/** `opts.sizeHalfPt` is the *base* (unscaled) size — see the matching doc
 * comment on `../quadrant/translator.ts`'s `textBox` for why `scaleFactor`
 * is a required, separate parameter rather than folded into `opts`. */
function textBox(
  id: number,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  opts: TextOptions,
  scaleFactor: number,
): string {
  const boldAttr = opts.bold ? ' <w:b/>' : '';
  const italicAttr = opts.italic ? ' <w:i/>' : '';
  const sizeHalfPt = scaledFontSizeHalfPt(opts.sizeHalfPt, scaleFactor);
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
    `      <w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="ctr"/></w:pPr>` +
      `<w:r><w:rPr>${boldAttr}${italicAttr} <w:color w:val="${opts.color}"/>` +
      `<w:sz w:val="${sizeHalfPt}"/></w:rPr>` +
      `<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`,
    '    </w:txbxContent>',
    '  </wps:txbx>',
    '  <wps:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/>',
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

/** Translate a parsed Venn chart into a self-contained WordprocessingML
 * paragraph (+ a trailing degradation note paragraph for 4+ sets or 0 sets). */
export function translateVennToOoxml(chart: VennChart): string {
  if (chart.sets.length === 0) {
    return note('This Venn diagram has no sets to render.');
  }

  const nextId = createIdAllocator();
  const { centers, overlapping } = computeCenters(chart.sets.length);
  const centroid = { x: 0, y: 0 };

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of centers) {
    minX = Math.min(minX, c.x - CIRCLE_R);
    maxX = Math.max(maxX, c.x + CIRCLE_R);
    minY = Math.min(minY, c.y - CIRCLE_R);
    maxY = Math.max(maxY, c.y + CIRCLE_R);
  }
  const hasTitle = Boolean(chart.title);
  const topMargin = hasTitle ? TITLE_HEIGHT : 0;
  const canvasW = maxX - minX + 2 * PAD;
  const canvasH = maxY - minY + 2 * PAD + topMargin;
  const dx = -minX + PAD;
  const dy = -minY + PAD + topMargin;
  const { scale: s } = scaledExtent(canvasW, canvasH);

  const parts: string[] = [];

  if (chart.title) {
    parts.push(
      textBox(
        nextId(),
        scalePt(0, s),
        scalePt(0, s),
        scalePt(canvasW, s),
        scalePt(topMargin, s),
        chart.title,
        { sizeHalfPt: 28, color: '000000', bold: true },
        s,
      ),
    );
  }

  // Circles first (z-order = emission order), so labels always land on top.
  chart.sets.forEach((set, i) => {
    const c = centers[i] ?? { x: 0, y: 0 };
    const fill = validateHexColor(set.fill, SET_DEFAULT_COLORS[i % SET_DEFAULT_COLORS.length] ?? '4472C4');
    parts.push(
      ellipse(
        nextId(),
        scalePt(c.x - CIRCLE_R + dx, s),
        scalePt(c.y - CIRCLE_R + dy, s),
        scalePt(CIRCLE_R * 2, s),
        fill,
        CIRCLE_ALPHA,
      ),
    );
  });

  // Set labels, pushed outward from the centroid into each circle's own
  // exclusive area (see module doc comment for why this needs no boolean
  // region math: it's a fixed fraction of the radius, not a computed lens).
  chart.sets.forEach((set, i) => {
    const c = centers[i] ?? { x: 0, y: 0 };
    const dir = overlapping ? normalize({ x: c.x - centroid.x, y: c.y - centroid.y }) : { x: 0, y: -1 };
    const lx = c.x + dir.x * CIRCLE_R * 0.55;
    const ly = c.y + dir.y * CIRCLE_R * 0.55;
    const labelWidth = Math.min(CIRCLE_R * 1.6, estimateTextWidth(set.label, 13) + 8);
    parts.push(
      textBox(
        nextId(),
        scalePt(lx - labelWidth / 2 + dx, s),
        scalePt(ly - 9 + dy, s),
        scalePt(labelWidth, s),
        scalePt(18, s),
        set.label,
        { sizeHalfPt: 17, color: '000000', bold: true },
        s,
      ),
    );
  });

  // Union (overlap) labels, only meaningful with true overlapping geometry.
  if (overlapping) {
    for (const union of chart.unions) {
      const pos = unionLabelPosition(union, chart.sets, centers, centroid);
      if (!pos || !union.label) continue;
      const labelWidth = Math.min(CIRCLE_R * 1.6, estimateTextWidth(union.label, 12) + 8);
      parts.push(
        textBox(
          nextId(),
          scalePt(pos.x - labelWidth / 2 + dx, s),
          scalePt(pos.y - 8 + dy, s),
          scalePt(labelWidth, s),
          scalePt(16, s),
          union.label,
          { sizeHalfPt: 15, color: '000000', italic: true },
          s,
        ),
      );
    }
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  let output = wrapDrawingCanvas(content, canvasW, canvasH, docPrId, chart.title ?? 'Venn diagram');

  if (!overlapping) {
    output +=
      '\n' +
      note(
        'This Venn diagram has more than 3 sets: true overlapping-circle geometry is not supported past 3, so sets are shown side by side without their intersections.',
      );
  }

  return output;
}

function unionLabelPosition(
  union: VennUnion,
  sets: VennSet[],
  centers: Point[],
  centroid: Point,
): Point | undefined {
  const indices = union.setIds.map((id) => sets.findIndex((s) => s.id === id)).filter((i) => i >= 0);
  if (indices.length < 2) return undefined;
  const pts = indices.map((i) => centers[i] ?? { x: 0, y: 0 });
  const mid = {
    x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
    y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
  };
  if (indices.length >= 3) return mid; // triple+ overlap: the centroid area itself.
  // Pairwise overlap: nudge outward from the centroid so the label lands in
  // the "these two only" lens rather than dead on the triple-overlap point.
  const dir = normalize({ x: mid.x - centroid.x, y: mid.y - centroid.y });
  return { x: mid.x + dir.x * CIRCLE_R * 0.25, y: mid.y + dir.y * CIRCLE_R * 0.25 };
}
