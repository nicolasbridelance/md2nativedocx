/**
 * OOXML translator for a Mermaid `quadrantChart`
 * (`docs/smartart-full-catalog-cross-mermaid.md` archetype #9, "Matrice").
 *
 * Deliberately plain `wps:wsp` shapes on a `wpc:wpc` canvas — the same
 * primitive `../../translator/ooxml-translator.ts` uses for flowchart nodes
 * — rather than a self-authored `dgm:layoutDef` SmartArt diagram. The
 * cross-Mermaid catalog's own verdict for this archetype: a 2x2 grid of
 * independent quadrants has no node/edge `dgm:dataModel` to speak of, so the
 * SmartArt engine buys nothing here that four positioned rectangles don't
 * already give more directly and more robustly.
 *
 * A quadrant chart has no Dagre layout step: point positions come straight
 * from each point's own `[x, y]` in Mermaid's 0-1 coordinate space, so this
 * module goes straight from AST to XML, no separate `layout.ts`.
 */

import type { QuadrantChart, QuadrantPoint } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { escapeXml, validateHexColor } from '../../translator/xml-escape.js';
import { EMU_PER_PX, createIdAllocator, scaledExtent, wrapDrawingCanvas } from '../../translator/canvas.js';

const GRID_SIZE = 480;
// Wide enough for a two-word y-axis label ("High Engagement") at 8pt to fit
// on one line — found too narrow at 90px in a real LibreOffice render (the
// label wrapped to 2 lines: still legible, but avoidable).
const MARGIN_LEFT = 130;
const MARGIN_RIGHT = 20;
const MARGIN_BOTTOM = 50;
const TITLE_HEIGHT = 44;
const NO_TITLE_TOP_MARGIN = 16;

const GRID_BORDER = 'BFBFBF';
/** One pastel fill per quadrant, indexed 1-4 exactly like Mermaid's own
 * `quadrant-1`..`quadrant-4` (1 = top-right, 2 = top-left, 3 = bottom-left,
 * 4 = bottom-right). Adjacent quadrants sharing an edge each draw their own
 * {@link GRID_BORDER} stroke on it, which is what actually produces the
 * dividing cross — no separate divider line shape needed. */
const QUADRANT_FILL: Readonly<Record<1 | 2 | 3 | 4, string>> = {
  1: 'D9E2F3',
  2: 'FCE4D6',
  3: 'E2EFDA',
  4: 'FFF2CC',
};

const POINT_RADIUS_PX = 5;
const DEFAULT_POINT_COLOR = '2F5496';

function rect(
  id: number,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string | undefined,
  line: string | undefined,
): string {
  const fillXml = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>';
  const lineXml = line
    ? `<a:ln w="9525"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>`
    : '<a:ln><a:noFill/></a:ln>';
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Shape ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    '    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
    fillXml,
    lineXml,
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

function ellipse(id: number, x: number, y: number, w: number, h: number, fill: string): string {
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Point ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    '    <a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>',
    `    <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`,
    '    <a:ln w="6350"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>',
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
  align?: 'l' | 'ctr' | 'r';
}

function textBox(id: number, x: number, y: number, w: number, h: number, text: string, opts: TextOptions): string {
  const boldAttr = opts.bold ? ' <w:b/>' : '';
  const italicAttr = opts.italic ? ' <w:i/>' : '';
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
    `      <w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="${opts.align ?? 'l'}"/></w:pPr>` +
      `<w:r><w:rPr>${boldAttr}${italicAttr} <w:color w:val="${opts.color}"/>` +
      `<w:sz w:val="${opts.sizeHalfPt}"/></w:rPr>` +
      `<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`,
    '    </w:txbxContent>',
    '  </wps:txbx>',
    '  <wps:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/>',
    '</wps:wsp>',
  ].join('\n');
}

function quadrantOrigin(index: 1 | 2 | 3 | 4, gridX0: number, gridY0: number, half: number): { x: number; y: number } {
  switch (index) {
    case 1:
      return { x: gridX0 + half, y: gridY0 };
    case 2:
      return { x: gridX0, y: gridY0 };
    case 3:
      return { x: gridX0, y: gridY0 + half };
    case 4:
      return { x: gridX0 + half, y: gridY0 + half };
  }
}

function scale(px: number, factor: number): number {
  return Math.round(px * EMU_PER_PX * factor);
}

/** Translate a parsed quadrant chart into a self-contained WordprocessingML
 * paragraph, mirroring `translateToOoxml`'s signature/contract. */
export function translateQuadrantToOoxml(chart: QuadrantChart): string {
  const nextId = createIdAllocator();
  const hasTitle = Boolean(chart.title);
  const topMargin = hasTitle ? TITLE_HEIGHT : NO_TITLE_TOP_MARGIN;
  const canvasW = MARGIN_LEFT + GRID_SIZE + MARGIN_RIGHT;
  const canvasH = topMargin + GRID_SIZE + MARGIN_BOTTOM;
  const { scale: s } = scaledExtent(canvasW, canvasH);

  const gridX0 = MARGIN_LEFT;
  const gridY0 = topMargin;
  const half = GRID_SIZE / 2;
  const parts: string[] = [];

  if (chart.title) {
    parts.push(
      textBox(nextId(), scale(0, s), scale(0, s), scale(canvasW, s), scale(topMargin, s), chart.title, {
        sizeHalfPt: 28,
        color: '000000',
        bold: true,
        align: 'ctr',
      }),
    );
  }

  // Four quadrant cells: fill + border (adjacent cells' shared borders form
  // the dividing cross, see QUADRANT_FILL's doc comment) + an inset label.
  for (const index of [1, 2, 3, 4] as const) {
    const { x, y } = quadrantOrigin(index, gridX0, gridY0, half);
    parts.push(
      rect(nextId(), scale(x, s), scale(y, s), scale(half, s), scale(half, s), QUADRANT_FILL[index], GRID_BORDER),
    );
    const label = chart.quadrants[index];
    if (label) {
      parts.push(
        textBox(nextId(), scale(x + 6, s), scale(y + 4, s), scale(half - 12, s), scale(20, s), label, {
          sizeHalfPt: 18,
          color: '595959',
          italic: true,
        }),
      );
    }
  }

  // Axis labels: bottom strip for x-axis (low-left / high-right), left
  // gutter for y-axis (low-bottom / high-top). Not rotated (v1 simplification,
  // see module doc comment) — a plain horizontal label reads fine at this
  // canvas size and avoids `a:xfrm/@rot` text-box quirks entirely.
  if (chart.xAxis) {
    parts.push(
      textBox(nextId(), scale(gridX0, s), scale(gridY0 + GRID_SIZE + 6, s), scale(half, s), scale(20, s), chart.xAxis.low, {
        sizeHalfPt: 16,
        color: '595959',
      }),
    );
    if (chart.xAxis.high) {
      parts.push(
        textBox(
          nextId(),
          scale(gridX0 + half, s),
          scale(gridY0 + GRID_SIZE + 6, s),
          scale(half, s),
          scale(20, s),
          chart.xAxis.high,
          { sizeHalfPt: 16, color: '595959', align: 'r' },
        ),
      );
    }
  }
  if (chart.yAxis) {
    parts.push(
      textBox(nextId(), scale(0, s), scale(gridY0 + GRID_SIZE - 20, s), scale(MARGIN_LEFT - 6, s), scale(20, s), chart.yAxis.low, {
        sizeHalfPt: 16,
        color: '595959',
        align: 'r',
      }),
    );
    if (chart.yAxis.high) {
      parts.push(
        textBox(nextId(), scale(0, s), scale(gridY0, s), scale(MARGIN_LEFT - 6, s), scale(20, s), chart.yAxis.high, {
          sizeHalfPt: 16,
          color: '595959',
          align: 'r',
        }),
      );
    }
  }

  // Points, drawn last (on top of quadrant fills/labels).
  for (const point of chart.points) {
    parts.push(...renderPoint(point, gridX0, gridY0, half, s, nextId));
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, chart.title ?? 'Quadrant chart');
}

function renderPoint(
  point: QuadrantPoint,
  gridX0: number,
  gridY0: number,
  half: number,
  s: number,
  nextId: () => number,
): string[] {
  const clampedX = Math.min(1, Math.max(0, point.x));
  const clampedY = Math.min(1, Math.max(0, point.y));
  const px = gridX0 + clampedX * (2 * half);
  // Grid y grows downward; Mermaid's y=0 is the bottom, y=1 the top.
  const py = gridY0 + (1 - clampedY) * (2 * half);
  const color = validateHexColor(point.color, DEFAULT_POINT_COLOR);

  const dot = ellipse(
    nextId(),
    scale(px - POINT_RADIUS_PX, s),
    scale(py - POINT_RADIUS_PX, s),
    scale(POINT_RADIUS_PX * 2, s),
    scale(POINT_RADIUS_PX * 2, s),
    color,
  );

  const labelWidthPx = Math.min(160, estimateTextWidth(point.name, 12) + 8);
  const label = textBox(
    nextId(),
    scale(px + POINT_RADIUS_PX + 3, s),
    scale(py - 9, s),
    scale(labelWidthPx, s),
    scale(18, s),
    point.name,
    { sizeHalfPt: 16, color: '000000' },
  );

  return [dot, label];
}
