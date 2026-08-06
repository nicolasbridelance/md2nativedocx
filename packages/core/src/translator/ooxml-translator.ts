/**
 * OOXML/DrawingML translator: AST + layout coordinates -> a self-contained
 * WordprocessingML paragraph containing a `wpg:wgp` (grouped drawing) XML
 * string.
 *
 * This is the heart of the project (spec §5.3). It is a pure function from
 * (Flowchart, Layout) to a single XML string that can be injected verbatim into
 * a Pandoc `RawBlock('openxml', ...)` (ADR 0002).
 *
 * The emitted fragment is a complete `w:p` paragraph wrapping the drawing in
 * the schema-required hierarchy `w:p -> w:r -> w:drawing -> wp:inline ->
 * a:graphic -> a:graphicData -> wpg:wgp`. A bare `wpg:wgp` cannot be a direct
 * child of `w:body`; emitting the full paragraph is what makes the `.docx`
 * open cleanly in Word (spec §5.3 "Encapsulation en `<wpg:wgp>` ... inséré
 * dans `<w:drawing><wp:inline>...`").
 *
 * The element structure follows the official Microsoft schemas
 * (ECMA-376 + MS-OE376, as published in the Open XML SDK):
 *   - `wpg:wgp` / `wpg:grpSp` require `wpg:cNvPr` (with `id` + `name`),
 *     `wpg:cNvGrpSpPr`, `wpg:grpSpPr`, then a choice of `wps:wsp` / `wpg:grpSp`.
 *   - `wps:wsp` requires `wps:cNvPr`, then either `wps:cNvSpPr` (shape) or
 *     `wps:cNvCnPr` (connector), then `wps:spPr`, optional `wps:style`,
 *     optional `wps:txbx`, and `wps:bodyPr`.
 *   - `wp:inline` requires `wp:extent` and `wp:docPr` before `a:graphic`.
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

/** Namespaces declared inline on the root `wpg:wgp` (self-contained, rule #3). */
const NS = {
  wpg: 'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"',
  wps: 'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
  wp: 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  a: 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  pic: 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  r: 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  w: 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
};

export interface TranslateOptions {
  /** Fill color (hex, no `#`) for node shapes. */
  fill?: string;
  /** Line color (hex, no `#`) for node shapes and edges. */
  line?: string;
}

/**
 * Translate a flowchart + its layout into a self-contained WordprocessingML
 * paragraph (`w:p`) wrapping the drawing in the schema-required hierarchy.
 *
 * @param flowchart - The parsed flowchart AST.
 * @param layout - Layout result (node + subgraph coordinates) from `layout/layout.ts`.
 * @param options - Optional color overrides.
 * @returns A single XML string (a complete `w:p` paragraph), ready to inject
 *   into a Pandoc `RawBlock('openxml', ...)` (ADR 0002).
 */
export function translateToOoxml(
  flowchart: Flowchart,
  layout: LayoutResult,
  options: TranslateOptions = {},
): string {
  const fill = options.fill ?? DEFAULT_FILL;
  const line = options.line ?? DEFAULT_LINE;

  const bb = computeBoundingBox(layout.nodes);
  const group = renderGroup(flowchart, layout, fill, line);
  return wrapInParagraph(group, bb);
}

/**
 * Render the root `wpg:wgp` group (subgraphs + nodes + edges) with all
 * namespaces declared inline (self-contained).
 */
function renderGroup(
  flowchart: Flowchart,
  layout: LayoutResult,
  fill: string,
  line: string,
): string {
  const bb = computeBoundingBox(layout.nodes);
  const parts: string[] = [];
  parts.push(openGroup(bb));

  // Pre-assign a unique numeric id to every node so connectors (stCxn/endCxn)
  // can reference the shape ids (the `wps:cNvPr id` attribute). Mermaid node
  // ids are arbitrary strings; the OOXML shape id must be a unique number.
  const nodeIds = new Map<string, number>();
  for (const node of flowchart.nodes) {
    nodeIds.set(node.id, nextId());
  }

  // Render subgraphs as nested wpg:grpSp groups (spec §6.1), then nodes and edges.
  const renderedSubgraphs = new Set<string>();
  for (const sg of flowchart.subgraphs) {
    parts.push(renderSubgraph(sg, flowchart, layout, fill, line, renderedSubgraphs));
  }

  for (const node of flowchart.nodes) {
    const box = layout.nodes[node.id];
    if (!box) continue;
    // Per-node fill from classDef takes priority over the global default.
    const nodeFill = node.fill ?? fill;
    parts.push(renderNode(nodeIds.get(node.id)!, node.label, node.shape, box, nodeFill, line));
  }

  for (const edge of flowchart.edges) {
    const from = layout.nodes[edge.from];
    const to = layout.nodes[edge.to];
    if (!from || !to) continue;
    const fromId = nodeIds.get(edge.from);
    const toId = nodeIds.get(edge.to);
    if (fromId === undefined || toId === undefined) continue;
    parts.push(renderEdge(fromId, toId, edge.type, from, to, line));
  }

  parts.push('</wpg:wgp>');
  return parts.join('\n');
}

/**
 * Wrap a `wpg:wgp` group in the schema-required paragraph hierarchy so Word
 * accepts the fragment as a block-level drawing:
 * `w:p -> w:r -> w:drawing -> wp:inline -> a:graphic -> a:graphicData -> wpg:wgp`.
 *
 * `wp:inline` requires `wp:extent` and `wp:docPr` (in that order) before
 * `a:graphic` (ECMA-376 §17.3.1.1). The `wpg:wgp` group is self-contained
 * (all namespaces declared inline), so the wrapper only needs the `w`
 * namespace for `w:p`/`w:r`/`w:drawing`.
 */
function wrapInParagraph(
  group: string,
  bb: { width: number; height: number },
): string {
  const cx = Math.max(1, Math.round(bb.width * EMU_PER_PX));
  const cy = Math.max(1, Math.round(bb.height * EMU_PER_PX));
  return [
    `<w:p ${NS.w}>`,
    '  <w:r>',
    '    <w:drawing>',
    `      <wp:inline ${NS.wp}>`,
    `        <wp:extent cx="${cx}" cy="${cy}"/>`,
    '        <wp:docPr id="1" name="Diagram"/>',
    `        <a:graphic ${NS.a}>`,
    '          <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">',
    group,
    '          </a:graphicData>',
    '        </a:graphic>',
    '      </wp:inline>',
    '    </w:drawing>',
    '  </w:r>',
    '</w:p>',
  ].join('\n');
}

/**
 * Render a subgraph as a nested `wpg:grpSp` group with its title in a
 * `wps:wsp` text box (spec §6.1). Nested subgraphs are rendered recursively.
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
  parts.push('  <wpg:grpSp>');
  parts.push(`    <wpg:cNvPr id="${nextId()}" name="${safeTitle}"/>`);
  parts.push('    <wpg:cNvGrpSpPr/>');
  parts.push('    <wpg:grpSpPr>');
  parts.push('      <a:xfrm>');
  parts.push(`        <a:off x="${x}" y="${y}"/>`);
  parts.push(`        <a:ext cx="${w}" cy="${h}"/>`);
  parts.push('        <a:chOff x="0" y="0"/>');
  parts.push(`        <a:chExt cx="${w}" cy="${h}"/>`);
  parts.push('      </a:xfrm>');
  parts.push('    </wpg:grpSpPr>');

  // Subgraph title as a text box (wps:wsp with wps:txbx) at the top.
  parts.push('    <wps:wsp>');
  parts.push(`      <wps:cNvPr id="${nextId()}" name="SubgraphTitle"/>`);
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
  parts.push('    </wps:wsp>');

  // Nested subgraphs.
  for (const childId of sg.subgraphIds) {
    const child = flowchart.subgraphs.find((s) => s.id === childId);
    if (child) parts.push(renderSubgraph(child, flowchart, layout, fill, line, rendered));
  }

  parts.push('  </wpg:grpSp>');
  return parts.join('\n');
}

/** Open the root `wpg:wgp` group with all namespaces declared inline. */
function openGroup(bb: { width: number; height: number }): string {
  const cx = Math.max(1, Math.round(bb.width * EMU_PER_PX));
  const cy = Math.max(1, Math.round(bb.height * EMU_PER_PX));
  return [
    '<wpg:wgp',
    `  ${NS.wpg}`,
    `  ${NS.wps}`,
    `  ${NS.wp}`,
    `  ${NS.a}`,
    `  ${NS.pic}`,
    `  ${NS.r}`,
    `  ${NS.w}>`,
    '  <wpg:cNvPr id="1" name="Diagram"/>',
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

/** Render a single node as a `wps:wsp` (wordprocessing shape). */
function renderNode(
  id: number,
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
    '  <wps:wsp>',
    `    <wps:cNvPr id="${id}" name="${safeLabel}"/>`,
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
    '  </wps:wsp>',
  ].join('\n');
}

/** Render an edge as a `wps:wsp` connector (with `wps:cNvCnPr`). */
function renderEdge(
  fromId: number,
  toId: number,
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
    '  <wps:wsp>',
    `    <wps:cNvPr id="${nextId()}" name="Connector"/>`,
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
    '  </wps:wsp>',
  ].join('\n');
}

/** Monotonic counter for unique shape ids (required by `wps:cNvPr`/`wpg:cNvPr`). */
let idCounter = 2;

/** Return the next unique shape id. */
function nextId(): number {
  return idCounter++;
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
