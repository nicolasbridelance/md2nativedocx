/**
 * OOXML translator for a Mermaid `architecture-beta` diagram (Family B —
 * reuses Dagre for layout and `../../translator/graph-shapes.ts`'s
 * connector primitives, same rationale as `../class-diagram/translator.ts`'s
 * module doc comment).
 *
 * Two deliberate v1 simplifications, both documented rather than silently
 * approximated:
 * - **Group containment is not rendered as nesting.** A `service ... in
 *   group1` relationship is parsed (`ArchitectureNode.parent`) but every
 *   node — service, group, or junction — lays out as an ordinary sibling
 *   box in one flat Dagre graph; `parser.ts` emits a one-time warning
 *   rather than silently dropping the containment. Real nested-container
 *   layout (a group's box sized to enclose its children, the way
 *   `ooxml-translator.ts` already does for flowchart `subgraph`) is a
 *   real, separate design effort — same category of gap as classDiagram's
 *   `namespace` handling.
 * - **Edge ports (`L`/`R`/`T`/`B`) are parsed but not used for exact-side
 *   docking.** Mermaid's own renderer routes a `db:R -- L:server` edge to
 *   leave `db` from its right edge and enter `server` at its left edge
 *   specifically; this translator instead uses the same generic
 *   center-to-center-trimmed-to-border approach (`edgePoint()`) every other
 *   Family B module uses, which usually lands close to the intended side
 *   for a simple layout but doesn't guarantee it. `ArchitectureEdge.fromSide`/
 *   `toSide` are kept in the AST for a future exact-docking implementation.
 *
 * Icons have no OOXML equivalent at all (Mermaid's architecture-beta icon
 * set is its own bundled SVG library), so recognized icon names map onto
 * the closest existing preset shape this project already uses elsewhere
 * (`cloud` from `../mindmap/translator.ts`, `can` — a cylinder — from
 * `../../translator/ooxml-translator.ts`'s flowchart shape table) purely as
 * a visual hint; an unrecognized or absent icon falls back to a plain
 * rounded rectangle.
 */

import dagre from 'dagre';
import type { ArchitectureDiagram, ArchitectureNode } from './types.js';
import { escapeXml } from '../../translator/xml-escape.js';
import { estimateTextWidth } from '../../layout/layout.js';
import {
  createIdAllocator,
  scaledExtent,
  scaledFontSizeHalfPt,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
} from '../../translator/canvas.js';
import { connector, edgePoint, scalePt } from '../../translator/graph-shapes.js';

const LINE_COLOR = '2F5496';
const SERVICE_FILL = 'D9E2F3';
const GROUP_FILL = 'FCE4D6';
const LABEL_FONT_PX = 11;
const LABEL_SIZE_HALFPT = 18;
const NODE_H = 44;
const JUNCTION_SIZE = 14;
const PAD_X = 14;

const ICON_PRESET: Readonly<Record<string, string>> = {
  cloud: 'cloud',
  database: 'can',
  disk: 'can',
};

interface NodeSize {
  width: number;
  height: number;
}

function sizeForNode(node: ArchitectureNode): NodeSize {
  if (node.kind === 'junction') return { width: JUNCTION_SIZE, height: JUNCTION_SIZE };
  const label = node.title ?? node.id;
  const width = Math.max(70, estimateTextWidth(label, LABEL_FONT_PX) + PAD_X * 2);
  return { width, height: NODE_H };
}

function nodeShape(id: number, node: ArchitectureNode, x: number, y: number, w: number, h: number, s: number): string {
  if (node.kind === 'junction') {
    return [
      '<wps:wsp>',
      `  <wps:cNvPr id="${id}" name="${escapeXml(node.id)}"/>`,
      '  <wps:cNvSpPr/>',
      '  <wps:spPr>',
      `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
      '    <a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>',
      `    <a:solidFill><a:srgbClr val="${LINE_COLOR}"/></a:solidFill>`,
      '  </wps:spPr>',
      '  <wps:bodyPr/>',
      '</wps:wsp>',
    ].join('\n');
  }

  const prst = (node.icon && ICON_PRESET[node.icon]) || 'roundRect';
  const fill = node.kind === 'group' ? GROUP_FILL : SERVICE_FILL;
  const label = node.title ?? node.id;
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="${escapeXml(label)}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    `    <a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>`,
    `    <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`,
    `    <a:ln w="9525"><a:solidFill><a:srgbClr val="${LINE_COLOR}"/></a:solidFill></a:ln>`,
    '  </wps:spPr>',
    '  <wps:txbx>',
    '    <w:txbxContent>',
    '      <w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>',
    '        <w:r>',
    `          <w:rPr><w:color w:val="000000"/><w:sz w:val="${scaledFontSizeHalfPt(LABEL_SIZE_HALFPT, s)}"/></w:rPr>`,
    `          <w:t xml:space="preserve">${escapeXml(label)}</w:t>`,
    '        </w:r>',
    '      </w:p>',
    '    </w:txbxContent>',
    '  </wps:txbx>',
    '  <wps:bodyPr lIns="45720" tIns="22860" rIns="45720" bIns="22860" anchor="ctr" wrap="square"/>',
    '</wps:wsp>',
  ].join('\n');
}

/** Translate a parsed architecture diagram into a self-contained
 * WordprocessingML paragraph. An empty diagram renders a visible note,
 * matching the other Family B translators' zero-content convention —
 * never a silent blank canvas. */
export function translateArchitectureDiagramToOoxml(chart: ArchitectureDiagram): string {
  if (chart.nodes.length === 0) {
    return [
      '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '  <w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>',
      '  <w:r>',
      '    <w:rPr><w:i/><w:color w:val="808080"/><w:sz w:val="18"/></w:rPr>',
      '    <w:t xml:space="preserve">This architecture diagram has no content to render.</w:t>',
      '  </w:r>',
      '</w:p>',
    ].join('\n');
  }

  const sizes = new Map<string, NodeSize>();
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of chart.nodes) {
    const size = sizeForNode(node);
    sizes.set(node.id, size);
    g.setNode(node.id, { width: size.width, height: size.height });
  }
  for (const edge of chart.edges) {
    if (g.hasNode(edge.from) && g.hasNode(edge.to)) g.setEdge(edge.from, edge.to);
  }
  dagre.layout(g);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of chart.nodes) {
    const n = g.node(node.id) as { x: number; y: number };
    const size = sizes.get(node.id)!;
    minX = Math.min(minX, n.x - size.width / 2);
    maxX = Math.max(maxX, n.x + size.width / 2);
    minY = Math.min(minY, n.y - size.height / 2);
    maxY = Math.max(maxY, n.y + size.height / 2);
  }
  const PAD = 24;
  const canvasW = maxX - minX + 2 * PAD;
  const canvasH = maxY - minY + 2 * PAD;
  const dx = -minX + PAD;
  const dy = -minY + PAD;
  const { scale: s } = scaledExtent(canvasW, canvasH);

  const nextId = createIdAllocator();
  const parts: string[] = [];

  for (const edge of chart.edges) {
    const nFrom = g.node(edge.from) as { x: number; y: number } | undefined;
    const nTo = g.node(edge.to) as { x: number; y: number } | undefined;
    if (!nFrom || !nTo) continue;
    const sizeFrom = sizes.get(edge.from)!;
    const sizeTo = sizes.get(edge.to)!;
    const p1 = edgePoint(nFrom.x, nFrom.y, sizeFrom.width / 2, sizeFrom.height / 2, nTo.x, nTo.y);
    const p2 = edgePoint(nTo.x, nTo.y, sizeTo.width / 2, sizeTo.height / 2, nFrom.x, nFrom.y);
    parts.push(
      connector(
        nextId(),
        scalePt(p1.x + dx, s),
        scalePt(p1.y + dy, s),
        scalePt(p2.x + dx, s),
        scalePt(p2.y + dy, s),
        LINE_COLOR,
        scaledLineWidthEmu(9525, s),
        'solid',
        edge.arrowAtFrom ? 'triangle' : 'none',
        'sm',
        edge.arrowAtTo ? 'triangle' : 'none',
        'sm',
      ),
    );
  }

  for (const node of chart.nodes) {
    const n = g.node(node.id) as { x: number; y: number };
    const size = sizes.get(node.id)!;
    parts.push(
      nodeShape(
        nextId(),
        node,
        scalePt(n.x - size.width / 2 + dx, s),
        scalePt(n.y - size.height / 2 + dy, s),
        scalePt(size.width, s),
        scalePt(size.height, s),
        s,
      ),
    );
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, 'Architecture diagram');
}
