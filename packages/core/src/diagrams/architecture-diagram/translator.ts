/**
 * OOXML translator for a Mermaid `architecture-beta` diagram, drawn the way Mermaid 12.3 draws it (its
 * renderer read against the official examples; the code here is this project's own). Placement is in
 * `layout.ts`; this file draws.
 *
 * **Services** are Mermaid's icons: a blue square with a white drawing (`icons.ts`), the title centred
 * under it, both in one shape so they move together in Word. A service in quotes (`service a"API"`)
 * shows its text in a blank blue square; one with neither icon nor text, a dashed outline with rounded
 * top corners. An icon outside Mermaid's built-in set (an icon pack such as `logos:` that a web page
 * registers) is drawn as Mermaid draws it without that pack: a `?`. **Junctions** draw nothing: the
 * edges meet at their centre, as in Mermaid.
 *
 * **Groups** are dashed frames in Mermaid's group colour, their icon and title in the top-left corner,
 * nested as declared.
 *
 * **Edges** run from port to port: the middle of the named side of each icon, or of the group's frame
 * for an end marked `{group}`. Two ports on the same axis give a straight line (slanted when an `align`
 * moved one end, as in Mermaid); a turn (`R -- T`) gives a right-angled line. Arrowheads where `<` / `>`
 * say, a `-[label]-` by the middle of the line.
 *
 * Proportions are Mermaid's (icon, half an icon of frame padding, one and a half between icons), at
 * 56 px rather than 80 so that a diagram of a few columns keeps a readable size on the page.
 */

import { estimateTextWidth } from '../../layout/layout.js';
import { createIdAllocator, scaledExtent, scaledFontSizeHalfPt, scaledLineWidthEmu, wrapDrawingCanvas, type CanvasOptions } from '../../translator/canvas.js';
import { customGeometry } from '../../translator/custom-geometry.js';
import { connector, scalePt, textBoxLines, type ArrowMarker } from '../../translator/graph-shapes.js';
import { noteParagraph, wrapText } from '../../translator/boxes.js';
import { escapeXml } from '../../translator/xml-escape.js';
import { BUILT_IN_ICONS, ICON_FILL, ICON_STROKE, bareServicePath, iconPaths } from './icons.js';
import { layoutArchitecture, type ArchitectureMetrics, type Box, type PlacedNode } from './layout.js';
import type { ArchitectureDiagram, ArchitectureEdge, ArchitectureNode, ArchitectureSide } from './types.js';

const ICON = 56;
const GAP = ICON * 1.5;
const PADDING = ICON / 2;
const CLEARANCE = 48;
/** A service's title wraps at this width (Mermaid: one and a half icons, at a larger type size). */
const LABEL_W = ICON * 2;
const GROUP_ICON = PADDING * 0.75;
const CANVAS_PAD = 16;

/** Mermaid's default theme: edges `lineColor`, frames `primaryBorderColor` (hsl 240° 60% 86%), text `textColor`. */
const EDGE_COLOR = '333333';
const FRAME_COLOR = 'C7C7F1';
const TEXT_COLOR = '333333';

const LABEL_PT = 10;
const GROUP_PT = 10;
const ICON_TEXT_PT = 9;
const EDGE_PT = 9;

const pxOf = (pt: number): number => (pt * 4) / 3;
const lineH = (pt: number): number => Math.ceil(pxOf(pt) * 1.3);
const halfPt = (pt: number): number => Math.round(pt * 2);
/** Room between an icon and the first line of its title. */
const LABEL_TOP = 4;

const labelLines = (node: ArchitectureNode): string[] => (node.kind === 'service' && node.title ? wrapText(node.title, pxOf(LABEL_PT), LABEL_W) : []);

const METRICS: ArchitectureMetrics = {
  iconSize: ICON,
  gap: GAP,
  padding: PADDING,
  clearance: CLEARANCE,
  labelHeight: (node) => {
    const lines = labelLines(node);
    return lines.length > 0 ? LABEL_TOP + lines.length * lineH(LABEL_PT) : 0;
  },
  labelWidth: (node) => Math.max(0, ...labelLines(node).map((l) => estimateTextWidth(l, pxOf(LABEL_PT)))),
  headerWidth: (group) => GROUP_ICON + 12 + (group.title ? estimateTextWidth(group.title, pxOf(GROUP_PT)) : 0) + 8,
};

interface Paragraph {
  text: string;
  sizeHalfPt: number;
  color: string;
}

/** One `wps:wsp` with a custom geometry, its fill and outline, and its text (insets in EMU). */
function shape(
  id: number,
  name: string,
  box: { x: number; y: number; w: number; h: number },
  geometry: string,
  fill: string | undefined,
  line: { color: string; emu: number; dashed?: boolean } | undefined,
  paragraphs: Paragraph[],
  text: { t: number; lr: number; anchor: 't' | 'ctr'; align: 'left' | 'center' },
): string {
  const fillXml = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>';
  const lnXml = line
    ? `<a:ln w="${line.emu}"><a:solidFill><a:srgbClr val="${line.color}"/></a:solidFill>${line.dashed ? '<a:prstDash val="dash"/>' : ''}</a:ln>`
    : '<a:ln><a:noFill/></a:ln>';
  const body = paragraphs
    .map(
      (p) =>
        `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="${text.align}"/></w:pPr>` +
        `<w:r><w:rPr><w:color w:val="${p.color}"/><w:sz w:val="${p.sizeHalfPt}"/></w:rPr>` +
        `<w:t xml:space="preserve">${escapeXml(p.text)}</w:t></w:r></w:p>`,
    )
    .join('');
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="${escapeXml(name)}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${Math.max(1, box.w)}" cy="${Math.max(1, box.h)}"/></a:xfrm>`,
    `    ${geometry}`,
    `    ${fillXml}`,
    `    ${lnXml}`,
    '  </wps:spPr>',
    ...(paragraphs.length > 0 ? ['  <wps:txbx>', `    <w:txbxContent>${body}</w:txbxContent>`, '  </wps:txbx>'] : []),
    `  <wps:bodyPr wrap="square" lIns="${text.lr}" tIns="${text.t}" rIns="${text.lr}" bIns="0" anchor="${text.anchor}"/>`,
    '</wps:wsp>',
  ].join('\n');
}

/** A right-angled edge through `points` (EMU), arrowheads at either end. */
function elbow(id: number, points: Array<{ x: number; y: number }>, color: string, widthEmu: number, head: ArrowMarker, tail: ArrowMarker): string {
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const w = Math.max(1, Math.max(...points.map((p) => p.x)) - minX);
  const h = Math.max(1, Math.max(...points.map((p) => p.y)) - minY);
  const ops = points.map((p, i) => `<a:${i === 0 ? 'moveTo' : 'lnTo'}><a:pt x="${p.x - minX}" y="${p.y - minY}"/></a:${i === 0 ? 'moveTo' : 'lnTo'}>`).join('');
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Connector ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${minX}" y="${minY}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`,
    `    <a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="0" b="0"/><a:pathLst><a:path w="${w}" h="${h}" fill="none">${ops}</a:path></a:pathLst></a:custGeom>`,
    '    <a:noFill/>',
    `    <a:ln w="${widthEmu}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
      (head !== 'none' ? `<a:headEnd type="${head}" w="lg" len="lg"/>` : '') +
      (tail !== 'none' ? `<a:tailEnd type="${tail}" w="lg" len="lg"/>` : '') +
      '</a:ln>',
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

/** The point where an edge leaves `p` by `side`: the middle of that side of the icon, or the centre of a junction. */
function port(p: PlacedNode, side: ArchitectureSide): { x: number; y: number } {
  if (p.node.kind === 'junction') return { x: p.cx, y: p.cy };
  const half = ICON / 2;
  switch (side) {
    case 'L':
      return { x: p.cx - half, y: p.cy };
    case 'R':
      return { x: p.cx + half, y: p.cy };
    case 'T':
      return { x: p.cx, y: p.cy - half };
    case 'B':
      return { x: p.cx, y: p.cy + half };
  }
}

/** The same point moved out to the edge of `frame` (an end marked `{group}`). */
function onFrame(point: { x: number; y: number }, side: ArchitectureSide, frame: Box): { x: number; y: number } {
  switch (side) {
    case 'L':
      return { x: frame.x, y: point.y };
    case 'R':
      return { x: frame.x + frame.w, y: point.y };
    case 'T':
      return { x: point.x, y: frame.y };
    case 'B':
      return { x: point.x, y: frame.y + frame.h };
  }
}

const horizontal = (side: ArchitectureSide): boolean => side === 'L' || side === 'R';

/**
 * Translate a parsed architecture diagram into a self-contained WordprocessingML paragraph. An empty
 * diagram renders a visible note, never a silent blank canvas. Placement problems (contradictory ports
 * or `align` lines, an icon Mermaid does not build in) are added to `warnings` when given.
 */
export function translateArchitectureDiagramToOoxml(chart: ArchitectureDiagram, options: CanvasOptions = {}, warnings?: string[]): string {
  if (chart.nodes.length === 0) return noteParagraph('This architecture diagram has no content to render.');

  const laid = layoutArchitecture(chart, METRICS, options);
  warnings?.push(...laid.warnings);
  const unknownIcons = [...new Set(chart.nodes.map((n) => n.icon).filter((i): i is string => i !== undefined && !BUILT_IN_ICONS.has(i)))];
  if (unknownIcons.length > 0) {
    warnings?.push(
      `Icons outside Mermaid's built-in set (they come from an icon pack a web page loads) are drawn as "?", as Mermaid draws them without that pack: ${unknownIcons.join(', ')}.`,
    );
  }

  const canvasW = laid.width + 2 * CANVAS_PAD;
  const canvasH = laid.height + 2 * CANVAS_PAD;
  const { scale: s } = scaledExtent(canvasW, canvasH, options);
  const S = (px: number): number => scalePt(px + CANVAS_PAD, s);
  const L = (px: number): number => scalePt(px, s);
  const sz = (pt: number): number => scaledFontSizeHalfPt(halfPt(pt), s);
  const nextId = createIdAllocator();
  const parts: string[] = [];
  const byId = new Map(chart.nodes.map((n) => [n.id, n]));

  // Frames, outermost first; the group's icon in the top-left corner, its title beside it.
  for (const [id, frame] of laid.frames) {
    const group = byId.get(id)!;
    const inset = GROUP_ICON + 10;
    const header: Paragraph[] = group.title ? [{ text: group.title, sizeHalfPt: sz(GROUP_PT), color: TEXT_COLOR }] : [];
    parts.push(
      shape(
        nextId(),
        group.title || group.id,
        { x: S(frame.x), y: S(frame.y), w: L(frame.w), h: L(frame.h) },
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
        undefined,
        { color: FRAME_COLOR, emu: scaledLineWidthEmu(15875, s), dashed: true },
        header,
        { t: L(4 + Math.max(0, (GROUP_ICON - lineH(GROUP_PT)) / 2)), lr: L(inset), anchor: 't', align: 'left' },
      ),
    );
    if (group.icon) {
      parts.push(
        shape(
          nextId(),
          `${group.title || group.id} icon`,
          { x: S(frame.x + 4), y: S(frame.y + 4), w: L(GROUP_ICON), h: L(GROUP_ICON) },
          customGeometry(GROUP_ICON, GROUP_ICON, iconPaths(group.icon, 0, 0, GROUP_ICON)),
          ICON_FILL,
          { color: ICON_STROKE, emu: scaledLineWidthEmu(6350, s) },
          [],
          { t: 0, lr: 0, anchor: 't', align: 'left' },
        ),
      );
    }
  }

  // Edges, under the icons so a line ends cleanly at the icon's side.
  const edgeLabels: string[] = [];
  const endPoint = (id: string, side: ArchitectureSide, toFrame: boolean | undefined): { x: number; y: number } | undefined => {
    const p = laid.nodes.get(id);
    if (!p) return undefined;
    const at = port(p, side);
    const frame = toFrame && p.node.parent !== undefined ? laid.frames.get(p.node.parent) : undefined;
    return frame ? onFrame(at, side, frame) : at;
  };
  const lineEmu = scaledLineWidthEmu(19050, s);
  chart.edges.forEach((edge: ArchitectureEdge) => {
    const a = endPoint(edge.from, edge.fromSide, edge.fromGroup);
    const b = endPoint(edge.to, edge.toSide, edge.toGroup);
    if (!a || !b || (a.x === b.x && a.y === b.y)) return;
    const head: ArrowMarker = edge.arrowAtFrom ? 'triangle' : 'none';
    const tail: ArrowMarker = edge.arrowAtTo ? 'triangle' : 'none';
    const turns = horizontal(edge.fromSide) !== horizontal(edge.toSide);
    const corner = turns ? (horizontal(edge.fromSide) ? { x: b.x, y: a.y } : { x: a.x, y: b.y }) : undefined;
    if (corner && (corner.x !== a.x || corner.y !== a.y) && (corner.x !== b.x || corner.y !== b.y)) {
      parts.push(elbow(nextId(), [a, corner, b].map((p) => ({ x: S(p.x), y: S(p.y) })), EDGE_COLOR, lineEmu, head, tail));
    } else {
      parts.push(connector(nextId(), S(a.x), S(a.y), S(b.x), S(b.y), EDGE_COLOR, lineEmu, 'solid', head, 'lg', tail, 'lg'));
    }

    if (!edge.label) return;
    const rowH = lineH(EDGE_PT);
    const textW = estimateTextWidth(edge.label, pxOf(EDGE_PT)) + 8;
    let x: number;
    let y: number;
    let align: 'l' | 'ctr';
    if (corner) {
      // Beside the corner, outside the turn.
      x = corner.x + 6;
      y = corner.y + 4;
      align = 'l';
    } else if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
      // Under the middle of a horizontal line.
      x = (a.x + b.x) / 2 - textW / 2;
      y = (a.y + b.y) / 2 + 3;
      align = 'ctr';
    } else {
      // Right of the middle of a vertical line.
      x = (a.x + b.x) / 2 + 6;
      y = (a.y + b.y) / 2 - rowH / 2;
      align = 'l';
    }
    edgeLabels.push(textBoxLines(nextId(), S(x), S(y), L(textW), L(rowH), [edge.label], sz(EDGE_PT), { align, color: TEXT_COLOR }));
  });

  // Services: icon and title in one shape, the title under the icon.
  for (const p of laid.nodes.values()) {
    const node = p.node;
    if (node.kind !== 'service') continue;
    const lines = labelLines(node);
    const w = Math.max(ICON, LABEL_W);
    const h = ICON + METRICS.labelHeight(node);
    const box = { x: S(p.cx - w / 2), y: S(p.cy - ICON / 2), w: L(w), h: L(h) };
    const iconX = (w - ICON) / 2;
    const paragraphs: Paragraph[] = lines.map((text) => ({ text, sizeHalfPt: sz(LABEL_PT), color: TEXT_COLOR }));
    const textInset = { t: L(ICON + LABEL_TOP), lr: 0, anchor: 't' as const, align: 'center' as const };
    const name = node.title || node.id;
    if (node.icon !== undefined || node.iconText !== undefined) {
      parts.push(
        shape(
          nextId(),
          name,
          box,
          customGeometry(w, h, iconPaths(node.icon ?? 'blank', iconX, 0, ICON)),
          ICON_FILL,
          { color: ICON_STROKE, emu: scaledLineWidthEmu(12700, s) },
          paragraphs,
          textInset,
        ),
      );
      if (node.iconText !== undefined) {
        const text = wrapText(node.iconText, pxOf(ICON_TEXT_PT), ICON - 6).map((t) => ({ text: t, sizeHalfPt: sz(ICON_TEXT_PT), color: ICON_STROKE }));
        parts.push(
          shape(
            nextId(),
            `${name} text`,
            { x: S(p.cx - ICON / 2), y: S(p.cy - ICON / 2), w: L(ICON), h: L(ICON) },
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
            undefined,
            undefined,
            text,
            { t: 0, lr: L(3), anchor: 'ctr', align: 'center' },
          ),
        );
      }
    } else {
      parts.push(
        shape(
          nextId(),
          name,
          box,
          customGeometry(w, h, [['none', bareServicePath(iconX, 0, ICON)]]),
          undefined,
          { color: FRAME_COLOR, emu: scaledLineWidthEmu(15875, s), dashed: true },
          paragraphs,
          textInset,
        ),
      );
    }
  }
  parts.push(...edgeLabels);

  const docPrId = nextId();
  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, docPrId, chart.title ?? 'Architecture diagram', options);
}
