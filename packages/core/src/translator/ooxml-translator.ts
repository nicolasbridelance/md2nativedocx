/**
 * OOXML/DrawingML translator: AST + layout coordinates -> a self-contained
 * WordprocessingML paragraph containing a `wpg:wgp` (grouped drawing) XML
 * string.
 *
 * This is the heart of the project (spec §5.3). It is a pure function from
 * (Flowchart, Layout) to a single XML string that can be injected verbatim into
 * a Pandoc `RawBlock('openxml', ...)` (ADR 0002). "Pure" is load-bearing: the
 * same inputs must always produce byte-identical output, so all shape ids are
 * allocated by a per-call counter (a module-level counter would leak state
 * across calls and break the golden tests' determinism).
 *
 * The emitted fragment is a complete `w:p` paragraph wrapping the drawing in
 * the schema-required hierarchy `w:p -> w:r -> w:drawing -> wp:inline ->
 * a:graphic -> a:graphicData -> wpc:wpc -> wpg:wgp`. A bare `wpg:wgp` cannot be
 * a direct child of `w:body`; emitting the full paragraph is what makes the
 * `.docx` open cleanly in Word (spec §5.3 "Encapsulation en `<wpg:wgp>` ...
 * inséré dans `<w:drawing><wp:inline>...`").
 *
 * The element structure follows the official Microsoft schemas
 * (ECMA-376 + MS-OE376, as published in the Open XML SDK) and was diffed
 * against a real Word-authored document (`tools/word-reference/`):
 *   - `wpg:wgp` / `wpg:grpSp` require `wpg:cNvPr` (with `id` + `name`),
 *     `wpg:cNvGrpSpPr`, `wpg:grpSpPr`, then a choice of `wps:wsp` / `wpg:grpSp`.
 *   - `wps:wsp` requires `wps:cNvPr`, then either `wps:cNvSpPr` (shape) or
 *     `wps:cNvCnPr` (connector), then `wps:spPr`, optional `wps:style`,
 *     optional `wps:txbx`, and `wps:bodyPr`.
 *   - `wp:inline` requires `wp:extent` and `wp:docPr` before `a:graphic`.
 *   - Every `id` in a drawing (`wp:docPr`, `wpg:cNvPr`, `wps:cNvPr`) must be
 *     distinct, or Word reports the file as corrupt and offers to repair it.
 *
 * Security invariants (AGENTS.md):
 * - Every user-controlled string is XML-escaped (rule #2) via {@link escapeXml}.
 * - Colors reaching an XML attribute are validated as 6-digit hex
 *   ({@link hexColor}), not merely escaped: `a:srgbClr/@val` is attacker-
 *   reachable through `classDef` and through the public `TranslateOptions`.
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

/**
 * Usable page area in EMU for Pandoc's default reference document (US Letter,
 * 1 inch margins => 6.5in x 9in). A drawing larger than this is scaled down
 * uniformly rather than being clipped by Word: `wp:extent` and the group's
 * `a:ext` shrink while `a:chOff`/`a:chExt` stay in native coordinates, so Word
 * applies the homothety to every child shape for us.
 */
const MAX_DRAWING_CX = 5943600;
const MAX_DRAWING_CY = 8229600;

/** Map a node shape to its DrawingML preset geometry (spec §6.1). */
const PRST_BY_SHAPE: Readonly<Record<NodeShape, string>> = {
  rect: 'rect',
  roundRect: 'roundRect',
  stadium: 'roundRect', // stadium approximated by roundRect with max adj
  diamond: 'diamond',
  cylinder: 'can', // cylinder approximated by `can`
  ellipse: 'ellipse',
};

/**
 * Map an edge type to its connector line style (spec §6.2): arrow head, dash
 * pattern and stroke width. `line` (`---`) is the only type with no arrow head.
 */
const LINE_STYLE_BY_EDGE: Readonly<
  Record<string, { dash: string; width: number; tailEnd: boolean }>
> = {
  arrow: { dash: 'solid', width: 12700, tailEnd: true },
  line: { dash: 'solid', width: 12700, tailEnd: false },
  dotted: { dash: 'dash', width: 12700, tailEnd: true },
  thick: { dash: 'solid', width: 25400, tailEnd: true },
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

/** A rectangle in logical pixels. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Allocates the distinct `id` values a drawing needs. Word treats
 * `wp:docPr/@id` and every `cNvPr/@id` in the same drawing as one id space and
 * flags the document as corrupt on a collision, so a single counter feeds them
 * all. It is per-call so the translator stays a pure function.
 */
function createIdAllocator(): () => number {
  let next = 1;
  return () => next++;
}

/**
 * Validate a color as 6 hexadecimal digits, falling back to `fallback` when it
 * is not. Applied to every color that reaches an `a:srgbClr/@val` attribute:
 * `classDef` fills and the public {@link TranslateOptions} are both
 * user-controlled, and escaping alone would still let a bad value through into
 * the rendered XML.
 */
function hexColor(value: string | undefined, fallback: string): string {
  return value !== undefined && /^[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : fallback;
}

/**
 * Pick a readable text color for a shape fill, so labels stay visible on both
 * light and dark fills. Word resolves shape text color from the theme
 * (`a:fontRef` -> `lt1`, i.e. white), which is invisible on the light default
 * fill; an explicit run color overrides it.
 */
function textColorFor(fillHex: string): string {
  const r = parseInt(fillHex.slice(0, 2), 16);
  const g = parseInt(fillHex.slice(2, 4), 16);
  const b = parseInt(fillHex.slice(4, 6), 16);
  // Relative luminance (sRGB coefficients, WCAG's simplified form).
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '000000' : 'FFFFFF';
}

/**
 * The full `wps:bodyPr` element Word emits for a text-bearing shape, with all
 * the attributes needed for the fill to render (a bare `<wps:bodyPr/>` makes
 * Word render the group as an empty gray rectangle).
 */
function bodyPr(): string {
  return [
    '<wps:bodyPr rot="0" spcFirstLastPara="0" vertOverflow="overflow" horzOverflow="overflow"',
    '  vert="horz" wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720"',
    '  numCol="1" spcCol="0" rtlCol="0" fromWordArt="0" anchor="ctr" anchorCtr="0"',
    '  forceAA="0" compatLnSpc="1">',
    '  <a:prstTxWarp prst="textNoShape"><a:avLst/></a:prstTxWarp>',
    '  <a:noAutofit/>',
    '</wps:bodyPr>',
  ].join('\n');
}

/**
 * The `wps:style` element Word emits for a shape, referencing the document
 * theme. Required for the shape fill/line to render (the `a:solidFill`/`a:ln`
 * in `wps:spPr` alone are not enough — Word resolves the visual style from
 * these theme references).
 */
function style(): string {
  return [
    '<wps:style>',
    '  <a:lnRef idx="2"><a:schemeClr val="accent1"><a:shade val="15000"/></a:schemeClr></a:lnRef>',
    '  <a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>',
    '  <a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef>',
    '  <a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef>',
    '</wps:style>',
  ].join('\n');
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
  const fill = hexColor(options.fill, DEFAULT_FILL);
  const line = hexColor(options.line, DEFAULT_LINE);
  const nextId = createIdAllocator();

  // `wp:docPr` shares its id space with the shapes below it, so it draws from
  // the same allocator and must be taken before the group is rendered.
  const docPrId = nextId();
  const bb = computeBoundingBox(layout);
  const group = renderGroup(flowchart, layout, fill, line, nextId);
  return wrapInParagraph(group, bb, docPrId);
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
  nextId: () => number,
): string {
  const bb = computeBoundingBox(layout);
  const parts: string[] = [];
  parts.push(openGroup(bb, nextId()));

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
    parts.push(renderSubgraph(sg, flowchart, layout, renderedSubgraphs, nextId));
  }

  for (const node of flowchart.nodes) {
    const box = layout.nodes[node.id];
    if (!box) continue;
    // Per-node fill from classDef takes priority over the global default.
    const nodeFill = hexColor(node.fill, fill);
    parts.push(renderNode(nodeIds.get(node.id)!, node.label, node.shape, box, nodeFill, line));
  }

  for (const edge of flowchart.edges) {
    const from = layout.nodes[edge.from];
    const to = layout.nodes[edge.to];
    if (!from || !to) continue;
    const fromId = nodeIds.get(edge.from);
    const toId = nodeIds.get(edge.to);
    if (fromId === undefined || toId === undefined) continue;
    parts.push(renderEdge(fromId, toId, edge.type, from, to, line, nextId));
    if (edge.label) {
      parts.push(renderEdgeLabel(edge.label, from, to, nextId()));
    }
  }

  parts.push('</wpg:wgp>');
  return parts.join('\n');
}

/**
 * Wrap a `wpg:wgp` group in the schema-required paragraph hierarchy so Word
 * accepts the fragment as a drawing:
 * `w:p -> w:r -> w:drawing -> wp:inline -> a:graphic -> a:graphicData ->
 * wpc:wpc -> wpg:wgp`.
 *
 * The drawing is **inline** (spec §5.3), so it flows with the surrounding text
 * instead of floating over it, and it sits inside a drawing canvas (`wpc:wpc`)
 * — the container Word itself uses for a group of shapes, hence the
 * `wordprocessingCanvas` `a:graphicData` URI.
 */
function wrapInParagraph(
  group: string,
  bb: { width: number; height: number },
  docPrId: number,
): string {
  const { cx, cy } = scaledExtent(bb);
  return [
    `<w:p ${NS.w}>`,
    '  <w:r>',
    '    <w:drawing>',
    `      <wp:inline ${NS.wp} distT="0" distB="0" distL="0" distR="0">`,
    `        <wp:extent cx="${cx}" cy="${cy}"/>`,
    '        <wp:effectExtent l="0" t="0" r="0" b="0"/>',
    `        <wp:docPr id="${docPrId}" name="Diagram ${docPrId}"/>`,
    '        <wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>',
    `        <a:graphic ${NS.a}>`,
    '          <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas">',
    '            <wpc:wpc xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas">',
    '              <wpc:bg><a:solidFill><a:prstClr val="white"/></a:solidFill></wpc:bg>',
    '              <wpc:whole/>',
    group,
    '            </wpc:wpc>',
    '          </a:graphicData>',
    '        </a:graphic>',
    '      </wp:inline>',
    '    </w:drawing>',
    '  </w:r>',
    '</w:p>',
  ].join('\n');
}

/**
 * Convert a pixel bounding box to the EMU extent of the drawing frame, scaled
 * down uniformly if it would not fit the usable page area. Returns the scale
 * factor so the group's `a:ext` can shrink in step with `wp:extent` while its
 * `a:chExt` stays in native coordinates.
 */
function scaledExtent(bb: { width: number; height: number }): {
  cx: number;
  cy: number;
  scale: number;
} {
  const nativeCx = Math.max(1, Math.round(bb.width * EMU_PER_PX));
  const nativeCy = Math.max(1, Math.round(bb.height * EMU_PER_PX));
  const scale = Math.min(1, MAX_DRAWING_CX / nativeCx, MAX_DRAWING_CY / nativeCy);
  return {
    cx: Math.max(1, Math.round(nativeCx * scale)),
    cy: Math.max(1, Math.round(nativeCy * scale)),
    scale,
  };
}

/**
 * Render a subgraph as a nested `wpg:grpSp` group with its title in a
 * `wps:wsp` text box (spec §6.1). Nested subgraphs are rendered recursively.
 */
function renderSubgraph(
  sg: Subgraph,
  flowchart: Flowchart,
  layout: LayoutResult,
  rendered: Set<string>,
  nextId: () => number,
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
  parts.push('            <w:r>');
  parts.push('              <w:rPr><w:color w:val="000000"/></w:rPr>');
  parts.push(`              <w:t xml:space="preserve">${safeTitle}</w:t>`);
  parts.push('            </w:r>');
  parts.push('          </w:p>');
  parts.push('        </w:txbxContent>');
  parts.push('      </wps:txbx>');
  parts.push('      <wps:bodyPr anchor="ctr" anchorCtr="0"/>');
  parts.push('    </wps:wsp>');

  // Nested subgraphs.
  for (const childId of sg.subgraphIds) {
    const child = flowchart.subgraphs.find((s) => s.id === childId);
    if (child) parts.push(renderSubgraph(child, flowchart, layout, rendered, nextId));
  }

  parts.push('  </wpg:grpSp>');
  return parts.join('\n');
}

/**
 * Open the root `wpg:wgp` group with all namespaces declared inline.
 *
 * `a:ext` carries the (possibly scaled-down) on-page size while
 * `a:chOff`/`a:chExt` stay in native pixel-derived EMU, which is what makes
 * Word scale every child shape uniformly instead of clipping them.
 */
function openGroup(bb: { width: number; height: number }, groupId: number): string {
  const { cx, cy } = scaledExtent(bb);
  const childCx = Math.max(1, Math.round(bb.width * EMU_PER_PX));
  const childCy = Math.max(1, Math.round(bb.height * EMU_PER_PX));
  return [
    '<wpg:wgp',
    `  ${NS.wpg}`,
    `  ${NS.wps}`,
    `  ${NS.wp}`,
    `  ${NS.a}`,
    `  ${NS.pic}`,
    `  ${NS.r}`,
    `  ${NS.w}>`,
    `  <wpg:cNvPr id="${groupId}" name="Diagram group ${groupId}"/>`,
    '  <wpg:cNvGrpSpPr/>',
    '  <wpg:grpSpPr>',
    '    <a:xfrm>',
    '      <a:off x="0" y="0"/>',
    `      <a:ext cx="${cx}" cy="${cy}"/>`,
    '      <a:chOff x="0" y="0"/>',
    `      <a:chExt cx="${childCx}" cy="${childCy}"/>`,
    '    </a:xfrm>',
    '  </wpg:grpSpPr>',
  ].join('\n');
}

/** Render a single node as a `wps:wsp` (wordprocessing shape). */
function renderNode(
  id: number,
  label: string,
  shape: NodeShape,
  box: Box,
  fill: string,
  line: string,
): string {
  const x = Math.round(box.x * EMU_PER_PX);
  const y = Math.round(box.y * EMU_PER_PX);
  const w = Math.max(1, Math.round(box.width * EMU_PER_PX));
  const h = Math.max(1, Math.round(box.height * EMU_PER_PX));
  const prst = PRST_BY_SHAPE[shape] ?? 'rect';
  const safeLabel = escapeXml(label);
  const textColor = textColorFor(fill);

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
    '      <a:ln w="12700" cap="flat" cmpd="sng" algn="ctr">',
    `        <a:solidFill><a:srgbClr val="${line}"/></a:solidFill>`,
    '        <a:prstDash val="solid"/>',
    '      </a:ln>',
    '    </wps:spPr>',
    style(),
    '    <wps:txbx>',
    '      <w:txbxContent>',
    '        <w:p>',
    '          <w:pPr><w:jc w:val="center"/></w:pPr>',
    '          <w:r>',
    `            <w:rPr><w:color w:val="${textColor}"/></w:rPr>`,
    `            <w:t xml:space="preserve">${safeLabel}</w:t>`,
    '          </w:r>',
    '        </w:p>',
    '      </w:txbxContent>',
    '    </wps:txbx>',
    bodyPr(),
    '  </wps:wsp>',
  ].join('\n');
}

/**
 * The `wps:style` element Word emits for a connector, referencing the document
 * theme. Unlike a shape, a connector has no fill (`fillRef idx="0"`) and uses
 * the text-1 font (`fontRef val="tx1"`).
 */
function connectorStyle(): string {
  return [
    '<wps:style>',
    '  <a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef>',
    '  <a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef>',
    '  <a:effectRef idx="1"><a:schemeClr val="accent1"/></a:effectRef>',
    '  <a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef>',
    '</wps:style>',
  ].join('\n');
}

/**
 * Connection-site indices for the built-in preset geometries used here (rect,
 * roundRect, diamond, ellipse, can): 0=top, 1=right, 2=bottom, 3=left,
 * clockwise from the top. Verified against a real Word-authored document
 * (`tools/word-reference/`): a vertical connector between two stacked
 * rectangles used `idx="2"` (bottom) at the source and `idx="0"` (top) at the
 * target — Word's own indices are 0-based, not the 1-based "1=top..4=left"
 * an earlier version of this file assumed.
 */
const SITE = { top: 0, right: 1, bottom: 2, left: 3 } as const;

/** The point where a connector attaches to a box for a given connection site. */
function sitePoint(box: Box, side: number): { x: number; y: number } {
  switch (side) {
    case SITE.right:
      return { x: box.x + box.width, y: box.y + box.height / 2 };
    case SITE.bottom:
      return { x: box.x + box.width / 2, y: box.y + box.height };
    case SITE.left:
      return { x: box.x, y: box.y + box.height / 2 };
    case SITE.top:
    default:
      return { x: box.x + box.width / 2, y: box.y };
  }
}

/**
 * Pick which side of each box a connector leaves/arrives from, based on the
 * relative position of the two boxes (spec §6.2 magnetic connectors).
 */
function chooseSides(from: Box, to: Box): { stSide: number; endSide: number } {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy > 0 ? { stSide: SITE.bottom, endSide: SITE.top } : { stSide: SITE.top, endSide: SITE.bottom };
  }
  return dx > 0 ? { stSide: SITE.right, endSide: SITE.left } : { stSide: SITE.left, endSide: SITE.right };
}

/** The two endpoints of a connector, in pixel space. */
interface ConnectorGeometry {
  stSide: number;
  endSide: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * Compute where a connector between two boxes actually starts and ends, i.e.
 * on the boxes' perimeter (the connection site), not their centers — the
 * `a:xfrm` off/ext must match what the connector visually is, or Word draws a
 * line straight through the shape interiors instead of stopping at their edges.
 */
function connectorGeometry(from: Box, to: Box): ConnectorGeometry {
  const { stSide, endSide } = chooseSides(from, to);
  return { stSide, endSide, start: sitePoint(from, stSide), end: sitePoint(to, endSide) };
}

/** Render an edge as a `wps:wsp` connector (with `wps:cNvCnPr`). */
function renderEdge(
  fromId: number,
  toId: number,
  type: string,
  from: Box,
  to: Box,
  line: string,
  nextId: () => number,
): string {
  const lineStyle = LINE_STYLE_BY_EDGE[type] ?? LINE_STYLE_BY_EDGE.arrow!;
  const { stSide, endSide, start, end } = connectorGeometry(from, to);

  const startX = Math.round(start.x * EMU_PER_PX);
  const startY = Math.round(start.y * EMU_PER_PX);
  const endX = Math.round(end.x * EMU_PER_PX);
  const endY = Math.round(end.y * EMU_PER_PX);

  // `a:xfrm` is a top-left box, so a connector running right-to-left or
  // bottom-to-top has to be flipped for the arrow head to land on the target.
  const flipH = endX < startX ? ' flipH="1"' : '';
  const flipV = endY < startY ? ' flipV="1"' : '';
  const tailEnd = lineStyle.tailEnd ? '        <a:tailEnd type="triangle" w="med" len="med"/>' : '';

  return [
    '  <wps:wsp>',
    `    <wps:cNvPr id="${nextId()}" name="Connector"/>`,
    '    <wps:cNvCnPr>',
    `      <a:stCxn id="${fromId}" idx="${stSide}"/>`,
    `      <a:endCxn id="${toId}" idx="${endSide}"/>`,
    '    </wps:cNvCnPr>',
    '    <wps:spPr>',
    `      <a:xfrm${flipH}${flipV}>`,
    `        <a:off x="${Math.min(startX, endX)}" y="${Math.min(startY, endY)}"/>`,
    `        <a:ext cx="${Math.abs(endX - startX)}" cy="${Math.abs(endY - startY)}"/>`,
    '      </a:xfrm>',
    '      <a:prstGeom prst="line">',
    '        <a:avLst/>',
    '      </a:prstGeom>',
    `      <a:ln w="${lineStyle.width}" cap="flat" cmpd="sng" algn="ctr">`,
    `        <a:solidFill><a:srgbClr val="${line}"/></a:solidFill>`,
    `        <a:prstDash val="${lineStyle.dash}"/>`,
    ...(tailEnd ? [tailEnd] : []),
    '      </a:ln>',
    '    </wps:spPr>',
    connectorStyle(),
    '    <wps:bodyPr/>',
    '  </wps:wsp>',
  ].join('\n');
}

/** Width/height in EMU of the transparent box holding an edge label. */
const EDGE_LABEL_CX = 685800; // 0.75in — fits a short `-->|Texte|` caption
const EDGE_LABEL_CY = 228600; // 0.25in

/**
 * Render an edge label (`-->|Texte|`) as a borderless, fill-free `wps:txbx`
 * centered on the midpoint of the connector's actual path (spec §6.2), not the
 * midpoint between the two node centers — a node sitting between the source
 * and target (a common case: a decision node's branches fan out past a third
 * node) would otherwise get the label superimposed on it. It is a sibling
 * shape rather than text on the connector itself: Word renders connector-owned
 * text along the line, which is unreadable for a diagram caption.
 */
function renderEdgeLabel(label: string, from: Box, to: Box, id: number): string {
  const { start, end } = connectorGeometry(from, to);
  const x = Math.round(((start.x + end.x) / 2) * EMU_PER_PX - EDGE_LABEL_CX / 2);
  const y = Math.round(((start.y + end.y) / 2) * EMU_PER_PX - EDGE_LABEL_CY / 2);
  const safeLabel = escapeXml(label);

  return [
    '  <wps:wsp>',
    `    <wps:cNvPr id="${id}" name="EdgeLabel"/>`,
    '    <wps:cNvSpPr txBox="1"/>',
    '    <wps:spPr>',
    '      <a:xfrm>',
    `        <a:off x="${x}" y="${y}"/>`,
    `        <a:ext cx="${EDGE_LABEL_CX}" cy="${EDGE_LABEL_CY}"/>`,
    '      </a:xfrm>',
    '      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
    '      <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>',
    '      <a:ln><a:noFill/></a:ln>',
    '    </wps:spPr>',
    '    <wps:txbx>',
    '      <w:txbxContent>',
    '        <w:p>',
    '          <w:pPr><w:jc w:val="center"/></w:pPr>',
    '          <w:r>',
    '            <w:rPr><w:color w:val="000000"/><w:sz w:val="16"/></w:rPr>',
    `            <w:t xml:space="preserve">${safeLabel}</w:t>`,
    '          </w:r>',
    '        </w:p>',
    '      </w:txbxContent>',
    '    </wps:txbx>',
    '    <wps:bodyPr rot="0" vert="horz" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0"',
    '      anchor="ctr" anchorCtr="1"><a:noAutofit/></wps:bodyPr>',
    '  </wps:wsp>',
  ].join('\n');
}

/**
 * Compute the total bounding box of a layout, in pixels.
 *
 * Subgraph containers are included: a cluster box can extend past the nodes it
 * holds, and leaving it out of the extent makes Word clip the cluster.
 */
function computeBoundingBox(layout: LayoutResult): { width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const boxes: Box[] = [
    ...Object.values(layout.nodes as Layout),
    ...Object.values(layout.subgraphs),
  ];
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  if (minX === Infinity) return { width: 0, height: 0 };
  return { width: maxX - minX, height: maxY - minY };
}
