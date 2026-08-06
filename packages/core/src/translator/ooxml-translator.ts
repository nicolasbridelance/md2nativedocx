/**
 * OOXML/DrawingML translator: AST + layout coordinates -> a self-contained
 * `wpg:wgp` (grouped drawing) XML string.
 *
 * This is the heart of the project (spec §5.3). It is a pure function from
 * (Flowchart, Layout) to a single XML string that can be injected verbatim into
 * a Pandoc `RawBlock('openxml', ...)` (ADR 0002).
 *
 * Security invariants (AGENTS.md):
 * - Every user-controlled string is XML-escaped (rule #2) via {@link escapeXml}.
 * - No external OOXML relationship is ever emitted (rule #3): the output is
 *   fully self-contained, with all namespaces declared inline.
 */

import type { Flowchart, Layout, LayoutResult, NodeShape, Subgraph } from '../types.js';
import { escapeXml } from './xml-escape.js';

/** Pixels -> EMU (English Metric Units). Word uses 914400 EMU per inch; at 96
 * DPI that is 9525 EMU per pixel. */
const EMU_PER_PX = 9525;

/** Default shape fill/line colors (spec §6.1). */
const DEFAULT_FILL = 'D9E2F3';
const DEFAULT_LINE = '2F5496';

/** Map a node shape to its DrawingML preset geometry (spec §6.1). */
const PRST_BY_SHAPE: Readonly<Record<NodeShape, string>> = {
  rect: 'rect',
  roundRect: 'roundRect',
  stadium: 'roundRect', // stadium approximated by roundRect with max adj
  diamond: 'diamond',
  cylinder: 'can', // cylinder approximated by `can`
  ellipse: 'ellipse',
};

/** Map an edge type to its line style (spec §6.2). */
const LINE_STYLE_BY_EDGE: Readonly<Record<string, { dash?: string; width: number }>> = {
  arrow: { width: 12700 },
  line: { width: 12700 },
  dotted: { width: 12700, dash: 'sysDot' },
  thick: { width: 25400 },
};

export interface TranslateOptions {
  /** Fill color (hex, no `#`) for node shapes. */
  fill?: string;
  /** Line color (hex, no `#`) for node shapes and edges. */
  line?: string;
}

/**
 * Translate a flowchart + its layout into a self-contained `wpg:wgp` XML string.
 *
 * @param flowchart - The parsed flowchart AST.
 * @param layout - Layout result (node + subgraph coordinates) from `layout/layout.ts`.
 * @param options - Optional color overrides.
 * @returns A single XML string, ready to inject into a Pandoc `RawBlock('openxml', ...)`.
 */
export function translateToOoxml(
  flowchart: Flowchart,
  layout: LayoutResult,
  options: TranslateOptions = {},
): string {
  const fill = options.fill ?? DEFAULT_FILL;
  const line = options.line ?? DEFAULT_LINE;

  const parts: string[] = [];
  parts.push(openGroup(flowchart, layout));

  // Render subgraphs as nested wpg:wgp groups (spec §6.1), then nodes and edges.
  const renderedSubgraphs = new Set<string>();
  for (const sg of flowchart.subgraphs) {
    parts.push(renderSubgraph(sg, flowchart, layout, fill, line, renderedSubgraphs));
  }

  for (const node of flowchart.nodes) {
    const box = layout.nodes[node.id];
    if (!box) continue;
    // Per-node fill from classDef takes priority over the global default.
    const nodeFill = node.fill ?? fill;
    parts.push(renderNode(node.id, node.label, node.shape, box, nodeFill, line));
  }

  for (const edge of flowchart.edges) {
    const from = layout.nodes[edge.from];
    const to = layout.nodes[edge.to];
    if (!from || !to) continue;
    parts.push(renderEdge(edge.from, edge.to, edge.type, from, to, line));
  }

  parts.push('</wpg:wgp>');
  return parts.join('\n');
}

/**
 * Render a subgraph as a nested `wpg:wgp` group with its title in a `wps:txbx`
 * (spec §6.1). Nested subgraphs are rendered recursively.
 */
function renderSubgraph(
  sg: Subgraph,
  flowchart: Flowchart,
  layout: LayoutResult,
  fill: string,
  line: string,
  rendered: Set<string>,
): string {
  if (rendered.has(sg.id)) return '';
  rendered.add(sg.id);

  const box = layout.subgraphs[sg.id];
  if (!box) return '';
  const x = Math.round(box.x * EMU_PER_PX);
  const y = Math.round(box.y * EMU_PER_PX);
  const w = Math.max(1, Math.round(box.width * EMU_PER_PX));
  const h = Math.max(1, Math.round(box.height * EMU_PER_PX));
  const safeTitle = escapeXml(sg.title);

  const parts: string[] = [];
  parts.push('  <wpg:wgp>');
  parts.push('    <wpg:cNvGrpSpPr/>');
  parts.push('    <wpg:grpSpPr>');
  parts.push('      <a:xfrm>');
  parts.push(`        <a:off x="${x}" y="${y}"/>`);
  parts.push(`        <a:ext cx="${w}" cy="${h}"/>`);
  parts.push('        <a:chOff x="0" y="0"/>');
  parts.push(`        <a:chExt cx="${w}" cy="${h}"/>`);
  parts.push('      </a:xfrm>');
  parts.push('    </wpg:grpSpPr>');

  // Subgraph title as a text box (wps:txbx) at the top of the group.
  parts.push('    <wpg:wsp>');
  parts.push('      <wps:cNvSpPr/>');
  parts.push('      <wps:spPr>');
  parts.push('        <a:xfrm>');
  parts.push('          <a:off x="0" y="0"/>');
  parts.push(`          <a:ext cx="${w}" cy="228600"/>`);
  parts.push('        </a:xfrm>');
  parts.push('        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>');
  parts.push('        <a:noFill/>');
  parts.push('        <a:ln w="0"><a:noFill/></a:ln>');
  parts.push('      </wps:spPr>');
  parts.push('      <wps:txbx>');
  parts.push('        <w:txbxContent>');
  parts.push('          <w:p>');
  parts.push('            <w:pPr><w:jc w:val="center"/></w:pPr>');
  parts.push(`            <w:r><w:t>${safeTitle}</w:t></w:r>`);
  parts.push('          </w:p>');
  parts.push('        </w:txbxContent>');
  parts.push('      </wps:txbx>');
  parts.push('      <wps:bodyPr/>');
  parts.push('    </wpg:wsp>');

  // Nested subgraphs.
  for (const childId of sg.subgraphIds) {
    const child = flowchart.subgraphs.find((s) => s.id === childId);
    if (child) parts.push(renderSubgraph(child, flowchart, layout, fill, line, rendered));
  }

  parts.push('  </wpg:wgp>');
  return parts.join('\n');
}

/** Open the `wpg:wgp` group with all namespaces declared inline (self-contained). */
function openGroup(flowchart: Flowchart, layout: LayoutResult): string {
  const bb = computeBoundingBox(layout.nodes);
  const cx = Math.max(1, Math.round(bb.width * EMU_PER_PX));
  const cy = Math.max(1, Math.round(bb.height * EMU_PER_PX));
  return [
    '<wpg:wgp',
    '  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"',
    '  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
    '  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
    '  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
    '  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
    '  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    '  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '  <wpg:cNvGrpSpPr/>',
    '  <wpg:grpSpPr>',
    '    <a:xfrm>',
    '      <a:off x="0" y="0"/>',
    `      <a:ext cx="${cx}" cy="${cy}"/>`,
    '      <a:chOff x="0" y="0"/>',
    `      <a:chExt cx="${cx}" cy="${cy}"/>`,
    '    </a:xfrm>',
    '  </wpg:grpSpPr>',
  ].join('\n');
}

/** Render a single node as a `wpg:wsp` (wordprocessing shape). */
function renderNode(
  id: string,
  label: string,
  shape: NodeShape,
  box: { x: number; y: number; width: number; height: number },
  fill: string,
  line: string,
): string {
  const x = Math.round(box.x * EMU_PER_PX);
  const y = Math.round(box.y * EMU_PER_PX);
  const w = Math.max(1, Math.round(box.width * EMU_PER_PX));
  const h = Math.max(1, Math.round(box.height * EMU_PER_PX));
  const prst = PRST_BY_SHAPE[shape] ?? 'rect';
  const safeLabel = escapeXml(label);

  return [
    '  <wpg:wsp>',
    '    <wps:cNvSpPr/>',
    '    <wps:spPr>',
    '      <a:xfrm>',
    `        <a:off x="${x}" y="${y}"/>`,
    `        <a:ext cx="${w}" cy="${h}"/>`,
    '      </a:xfrm>',
    `      <a:prstGeom prst="${prst}">`,
    '        <a:avLst/>',
    '      </a:prstGeom>',
    `      <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`,
    `      <a:ln w="12700"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>`,
    '    </wps:spPr>',
    '    <wps:txbx>',
    '      <w:txbxContent>',
    '        <w:p>',
    '          <w:pPr><w:jc w:val="center"/></w:pPr>',
    `          <w:r><w:t>${safeLabel}</w:t></w:r>`,
    '        </w:p>',
    '      </w:txbxContent>',
    '    </wps:txbx>',
    '    <wps:bodyPr/>',
    '  </wpg:wsp>',
  ].join('\n');
}

/** Render an edge as a `wpg:cxnSp` (connector) between two node boxes. */
function renderEdge(
  fromId: string,
  toId: string,
  type: string,
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number },
  line: string,
): string {
  const style = LINE_STYLE_BY_EDGE[type] ?? LINE_STYLE_BY_EDGE.arrow!;
  const dash = style.dash ? `\n        <a:prstDash val="${style.dash}"/>` : '';

  // Anchor the connector to the centers of the two node boxes. Word's
  // magnetic connectors (stCxn/endCxn) will keep them attached when a box
  // moves (spec §6.2).
  const fromCx = Math.round((from.x + from.width / 2) * EMU_PER_PX);
  const fromCy = Math.round((from.y + from.height / 2) * EMU_PER_PX);
  const toCx = Math.round((to.x + to.width / 2) * EMU_PER_PX);
  const toCy = Math.round((to.y + to.height / 2) * EMU_PER_PX);

  return [
    '  <wpg:cxnSp>',
    '    <wps:cNvCnPr>',
    `      <a:stCxn id="${fromId}" idx="0"/>`,
    `      <a:endCxn id="${toId}" idx="0"/>`,
    '    </wps:cNvCnPr>',
    '    <wps:spPr>',
    '      <a:xfrm>',
    `        <a:off x="${Math.min(fromCx, toCx)}" y="${Math.min(fromCy, toCy)}"/>`,
    `        <a:ext cx="${Math.abs(toCx - fromCx)}" cy="${Math.abs(toCy - fromCy)}"/>`,
    '      </a:xfrm>',
    '      <a:prstGeom prst="line">',
    '        <a:avLst/>',
    '      </a:prstGeom>',
    `      <a:ln w="${style.width}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill>${dash}</a:ln>`,
    '    </wps:spPr>',
    '    <wps:style/>',
    '    <wps:bodyPr/>',
    '  </wpg:cxnSp>',
  ].join('\n');
}

/** Compute the total bounding box of a layout, in pixels. */
function computeBoundingBox(layout: Layout): { width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of Object.values(layout)) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  if (minX === Infinity) return { width: 0, height: 0 };
  return { width: maxX - minX, height: maxY - minY };
}
