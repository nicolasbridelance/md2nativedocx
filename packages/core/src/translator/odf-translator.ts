/**
 * Flowchart + layout -> ODF drawing (`draw:` shapes) for a `.odt` (ADR 0013, spec 05).
 *
 * The ODF counterpart of `ooxml-translator.ts`, written separately rather than as a format switch
 * inside it (ADR 0013 decision 1; ADR 0012 rule 2: what both translators share is extracted once the
 * two exist). It starts from the same `layout()` output.
 *
 * What phase 0 established, and this translator relies on:
 *
 * - The whole diagram is one `draw:g` anchored as a character (`as-char`) inside a `text:p`. Shapes
 *   anchored one by one make LibreOffice draw their connectors detached on open (spike S2).
 * - Connectors reference their shapes by `draw:id`/`xml:id` and a glue point, and carry their end
 *   points and an `svg:viewBox` (required by the schema; LibreOffice tolerates it missing, the
 *   validator does not, spike S5).
 * - Colours, strokes and text formatting live in automatic styles, not on the shapes. A raw block
 *   cannot declare them, so they are returned apart ({@link OdfDrawing.automaticStyles}) and reach
 *   `office:automatic-styles` through the derived Pandoc template. Arrow heads and the dash pattern
 *   are `office:styles` definitions ({@link ODF_GRAPHIC_DEFINITIONS}) that the `reference.odt`
 *   carries.
 *
 * Security (AGENTS.md rules 2 and 3): every label, title and name is escaped with `escapeXml`;
 * colours pass `validateHexColor`; `idPrefix` is checked against a strict pattern before it enters an
 * id or a style name. Nothing here emits a link, an image, an object, a script or an event listener.
 */

import type { EdgeType, FlowEdge, Flowchart, LabelToken, LayoutPoint, LayoutResult, NodeShape } from '../types.js';
import { escapeXml, validateHexColor } from './xml-escape.js';
import { SUBGRAPH_TITLE_HEIGHT } from '../layout/layout.js';
import { EMU_PER_PX, type CanvasOptions } from './canvas.js';

/**
 * Names of the `office:styles` definitions the diagram styles refer to. The `reference.odt` handed to
 * Pandoc must define each of them ({@link ODF_GRAPHIC_DEFINITIONS}); a document without them still
 * opens, with plain line ends and solid lines.
 */
export const ODF_STYLE_NAMES = {
  arrowMarker: 'md2nArrow',
  circleMarker: 'md2nCircle',
  crossMarker: 'md2nCross',
  dash: 'md2nDash',
} as const;

/**
 * The `draw:marker` and `draw:stroke-dash` elements behind {@link ODF_STYLE_NAMES}, for the
 * `office:styles` of the `reference.odt` (they cannot be automatic styles). One source for the names
 * and their shapes: the reference document is built from this string.
 */
export const ODF_GRAPHIC_DEFINITIONS = [
  `<draw:marker draw:name="${ODF_STYLE_NAMES.arrowMarker}" svg:viewBox="0 0 20 30" svg:d="M10 0l-10 30h20z"/>`,
  `<draw:marker draw:name="${ODF_STYLE_NAMES.circleMarker}" svg:viewBox="0 0 1131 1131" svg:d="M462 1118l-102-29-102-51-93-72-72-93-51-102-29-102-13-105 13-102 29-106 51-102 72-89 93-72 102-50 102-34 106-9 101 9 106 34 98 50 93 72 72 89 51 102 29 106 13 102-13 105-29 102-51 102-72 93-93 72-98 51-106 29-101 13z"/>`,
  `<draw:marker draw:name="${ODF_STYLE_NAMES.crossMarker}" svg:viewBox="0 0 30 30" svg:d="M4 0l11 11 11-11 4 4-11 11 11 11-4 4-11-11-11 11-4-4 11-11-11-11z"/>`,
  `<draw:stroke-dash draw:name="${ODF_STYLE_NAMES.dash}" draw:style="rect" draw:dots1="1" draw:dots1-length="0.2cm" draw:distance="0.12cm"/>`,
].join('');

/** Options of {@link translateToOdf}. */
export interface OdfTranslateOptions extends CanvasOptions {
  /** Prefix of every id and style name of this drawing; must already match {@link ODF_ID_PREFIX}. */
  idPrefix: string;
}

/** A translated drawing: the paragraph to place in the body, and the styles it uses. */
export interface OdfDrawing {
  /** One `<text:p>` holding one `draw:g` anchored as a character. */
  fragment: string;
  /** `<style:style>` elements for `office:automatic-styles`. */
  automaticStyles: string[];
}

/** What an `idPrefix` must look like: it becomes part of `xml:id`s and style names (NCNames). */
export const ODF_ID_PREFIX = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

const DEFAULT_FILL = 'D9E2F3';
const DEFAULT_LINE = '2F5496';
const SUBGRAPH_FILL = 'E8E8E8';
const SUBGRAPH_LINE = '999999';

/** Default usable area, same as the `.docx` output (Letter portrait, 1in margins), in EMU. */
const MAX_DRAWING_CX = 5943600;
const MAX_DRAWING_CY = 8229600;

/** Base text sizes in points, as in the `.docx` output (12pt nodes and titles, 8pt edge labels). */
const NODE_FONT_PT = 12;
const EDGE_LABEL_FONT_PT = 8;
const MIN_FONT_PT = 2;
/** Base stroke widths in points (1pt, 2pt for `==>`), floor 0.25pt, as in the `.docx` output. */
const LINE_PT = 1;
const THICK_LINE_PT = 2;
const MIN_LINE_PT = 0.25;
/** Text insets in px (0.1in / 0.05in, Word's own defaults, also used by the `.docx` output). */
const TEXT_INSET_X_PX = 9.6;
const TEXT_INSET_Y_PX = 4.8;

/**
 * LibreOffice's preset geometry for each node shape (`draw:enhanced-geometry/@draw:type`). With no
 * `draw:enhanced-path`, LibreOffice draws the preset of that name, as editable as one picked from its
 * own shape gallery. Mirrored variants reuse a preset with `draw:mirror-*`.
 */
const ODF_TYPE_BY_SHAPE: Readonly<Record<NodeShape, string>> = {
  rect: 'rectangle',
  roundRect: 'round-rectangle',
  stadium: 'flowchart-terminator',
  diamond: 'diamond',
  cylinder: 'can',
  ellipse: 'ellipse',
  hexagon: 'hexagon',
  parallelogram: 'parallelogram',
  parallelogramAlt: 'parallelogram',
  trapezoid: 'trapezoid', // drawn by NARROW_TOP_TRAPEZOID, see there
  trapezoidAlt: 'trapezoid',
  subroutine: 'flowchart-predefined-process',
  doubleCircle: 'ellipse',
  document: 'flowchart-document',
  card: 'flowchart-card',
  delay: 'flowchart-delay',
  triangle: 'flowchart-extract',
  triangleInverted: 'flowchart-merge',
  windowPane: 'flowchart-internal-storage',
  hourglass: 'flowchart-collate',
  curvedTrapezoid: 'flowchart-display',
  bolt: 'lightning',
  braceLeft: 'left-brace',
  braceRight: 'right-brace',
  bracePair: 'brace-pair',
  crossedCircle: 'flowchart-or',
  filledCircle: 'flowchart-summing-junction',
  paperTape: 'flowchart-punched-tape',
  horizontalCylinder: 'flowchart-direct-access-storage',
  linedCylinder: 'flowchart-magnetic-disk',
  manualInput: 'flowchart-manual-input',
  asymmetric: 'pentagon-right',
};

/** Mirrored horizontally (`draw:mirror-horizontal`, which leaves the text readable). */
const MIRRORED_SHAPES: ReadonlySet<NodeShape> = new Set(['parallelogramAlt']);

/**
 * Mermaid's `[/Text\]` trapezoid is narrow at the top. LibreOffice's `trapezoid` preset is wide at
 * the top (it fits `[\Text/]` as is), and `draw:mirror-vertical` would turn the text upside down
 * (seen in a render, 2026-10-08), so this one shape is drawn by an explicit path, still editable.
 */
const NARROW_TOP_TRAPEZOID =
  '<draw:enhanced-geometry svg:viewBox="0 0 21600 21600" draw:type="non-primitive" ' +
  'draw:enhanced-path="M 5400 0 L 16200 0 21600 21600 0 21600 Z N" draw:text-areas="2700 0 18900 21600"/>';

type Marker = keyof typeof MARKER_NAMES | 'none';
const MARKER_NAMES = {
  arrow: ODF_STYLE_NAMES.arrowMarker,
  circle: ODF_STYLE_NAMES.circleMarker,
  cross: ODF_STYLE_NAMES.crossMarker,
} as const;

/** Line style of each edge type; `start` is at the `from` node, `end` at the `to` node. */
const LINE_BY_EDGE: Readonly<Record<EdgeType, { dash: boolean; widthPt: number; start: Marker; end: Marker; invisible?: boolean }>> = {
  arrow: { dash: false, widthPt: LINE_PT, start: 'none', end: 'arrow' },
  line: { dash: false, widthPt: LINE_PT, start: 'none', end: 'none' },
  dotted: { dash: true, widthPt: LINE_PT, start: 'none', end: 'arrow' },
  dottedLine: { dash: true, widthPt: LINE_PT, start: 'none', end: 'none' },
  thick: { dash: false, widthPt: THICK_LINE_PT, start: 'none', end: 'arrow' },
  thickLine: { dash: false, widthPt: THICK_LINE_PT, start: 'none', end: 'none' },
  bidirectional: { dash: false, widthPt: LINE_PT, start: 'arrow', end: 'arrow' },
  circle: { dash: false, widthPt: LINE_PT, start: 'none', end: 'circle' },
  cross: { dash: false, widthPt: LINE_PT, start: 'none', end: 'cross' },
  circleBoth: { dash: false, widthPt: LINE_PT, start: 'circle', end: 'circle' },
  crossBoth: { dash: false, widthPt: LINE_PT, start: 'cross', end: 'cross' },
  invisible: { dash: false, widthPt: LINE_PT, start: 'none', end: 'none', invisible: true },
};

/** LibreOffice's four default glue points of every shape. Not the OOXML numbering. */
const GLUE = { top: 0, right: 1, bottom: 2, left: 3 } as const;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** px -> cm at 96 DPI, as an ODF length. */
function cm(px: number): string {
  return `${round3((px * 2.54) / 96)}cm`;
}

/** px -> 1/100 mm, the unit of `svg:viewBox` and `draw:points` here. */
function hmm(px: number): number {
  return Math.round((px * 2540) / 96);
}

function pt(value: number): string {
  return `${round3(value)}pt`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Black or white text, whichever reads on `fillHex` (same rule as the `.docx` output). */
function textColorFor(fillHex: string): string {
  const r = parseInt(fillHex.slice(0, 2), 16);
  const g = parseInt(fillHex.slice(2, 4), 16);
  const b = parseInt(fillHex.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? '000000' : 'FFFFFF';
}

/**
 * Automatic styles of one drawing, deduplicated by content: two nodes with the same colours share a
 * style. Names are `<prefix>-g<n>` (graphic) and `<prefix>-t<n>` (text spans).
 */
class StyleSheet {
  private readonly byKey = new Map<string, string>();
  readonly styles: string[] = [];

  constructor(private readonly prefix: string) {}

  /** A graphic style; `body` is its property elements, built only from validated values. */
  graphic(body: string): string {
    return this.add('g', 'graphic', body);
  }

  /** A paragraph style. */
  paragraph(body: string): string {
    return this.add('p', 'paragraph', body);
  }

  /** A text style for a bold and/or italic span. */
  span(bold: boolean, italic: boolean): string {
    const props = [bold ? ' fo:font-weight="bold"' : '', italic ? ' fo:font-style="italic"' : ''].join('');
    return this.add('t', 'text', `<style:text-properties${props}/>`);
  }

  private add(kind: string, family: string, body: string): string {
    const key = `${family}|${body}`;
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const name = `${this.prefix}-${kind}${this.styles.length + 1}`;
    this.byKey.set(key, name);
    this.styles.push(`<style:style style:name="${name}" style:family="${family}">${body}</style:style>`);
    return name;
  }
}

/**
 * The paragraph style of a shape's text: centred, with its colour and size. Both go here and not on the
 * graphic style: LibreOffice ignores paragraph properties set there, and the paragraph style's own
 * inherited size (the document default, 12pt in the bundled reference.odt) wins over a size set there
 * (seen in renders, 2026-10-08: a scaled-down diagram kept 12pt text).
 */
function shapeText(sheet: StyleSheet, color: string, fontPt: number, background?: string): string {
  const highlight = background ? ` fo:background-color="#${background}"` : '';
  return sheet.paragraph(
    '<style:paragraph-properties fo:text-align="center"/>' +
      `<style:text-properties fo:color="#${color}" fo:font-size="${pt(fontPt)}"${highlight}/>`,
  );
}

/**
 * Translate a flowchart and its layout into one ODF drawing.
 *
 * Coordinates are scaled down uniformly (never up) so the drawing fits `maxDrawingCx` x
 * `maxDrawingCy`, like the `.docx` output; text and strokes scale with it.
 */
export function translateToOdf(flowchart: Flowchart, layout: LayoutResult, options: OdfTranslateOptions): OdfDrawing {
  const prefix = options.idPrefix;
  const sheet = new StyleSheet(prefix);
  const origin = boundsOf(layout);
  const widthEmu = Math.max(1, (origin.maxX - origin.minX) * EMU_PER_PX);
  const heightEmu = Math.max(1, (origin.maxY - origin.minY) * EMU_PER_PX);
  const scale = Math.min(1, (options.maxDrawingCx ?? MAX_DRAWING_CX) / widthEmu, (options.maxDrawingCy ?? MAX_DRAWING_CY) / heightEmu);
  const place = (box: Box): Box => ({
    x: (box.x - origin.minX) * scale,
    y: (box.y - origin.minY) * scale,
    width: Math.max(1, box.width * scale),
    height: Math.max(1, box.height * scale),
  });
  const placePoint = (p: LayoutPoint): LayoutPoint => ({ x: (p.x - origin.minX) * scale, y: (p.y - origin.minY) * scale });
  const fontPt = (base: number): number => Math.max(MIN_FONT_PT, base * scale);
  const linePt = (base: number): number => Math.max(MIN_LINE_PT, base * scale);

  const parts: string[] = [];

  // Subgraph containers first, outer before inner: document order is z-order, so they stay behind.
  for (const sg of subgraphsOuterFirst(flowchart)) {
    const raw = layout.subgraphs[sg.id];
    if (!raw) continue;
    const box = place(raw);
    const style = sheet.graphic(
      `<style:graphic-properties draw:fill="solid" draw:fill-color="#${SUBGRAPH_FILL}" draw:opacity="40%" ` +
        `draw:stroke="dash" draw:stroke-dash="${ODF_STYLE_NAMES.dash}" svg:stroke-color="#${SUBGRAPH_LINE}" svg:stroke-width="${pt(linePt(0.75))}" ` +
        `draw:auto-grow-height="false" draw:auto-grow-width="false" draw:textarea-vertical-align="top" ` +
        `fo:min-height="${cm(SUBGRAPH_TITLE_HEIGHT * scale)}" ${padding(scale)}/>`,
    );
    const title = escapeXml(sg.title);
    parts.push(
      `<draw:custom-shape draw:style-name="${style}" draw:name="${title}" ${frame(box)}>` +
        `<text:p text:style-name="${shapeText(sheet, '000000', fontPt(NODE_FONT_PT))}">${title}</text:p><draw:enhanced-geometry draw:type="rectangle"/></draw:custom-shape>`,
    );
  }

  // Nodes, each with an id its connectors refer to.
  const shapeIds = new Map<string, string>();
  flowchart.nodes.forEach((node, i) => {
    const raw = layout.nodes[node.id];
    if (!raw) return;
    const id = `${prefix}-n${i + 1}`;
    shapeIds.set(node.id, id);
    const nodeFill = validateHexColor(node.fill, DEFAULT_FILL);
    const nodeLine = validateHexColor(node.stroke, DEFAULT_LINE);
    const style = sheet.graphic(
      `<style:graphic-properties draw:fill="solid" draw:fill-color="#${nodeFill}" draw:stroke="solid" ` +
        `svg:stroke-color="#${nodeLine}" svg:stroke-width="${pt(linePt(LINE_PT))}" ` +
        `draw:auto-grow-height="false" draw:auto-grow-width="false" draw:textarea-vertical-align="middle" ${padding(scale)}/>`,
    );
    const textStyle = shapeText(sheet, textColorFor(nodeFill), fontPt(NODE_FONT_PT));
    const mirrorAttr = MIRRORED_SHAPES.has(node.shape) ? ' draw:mirror-horizontal="true"' : '';
    const geometry =
      node.shape === 'trapezoid'
        ? NARROW_TOP_TRAPEZOID
        : `<draw:enhanced-geometry draw:type="${ODF_TYPE_BY_SHAPE[node.shape] ?? 'rectangle'}"${mirrorAttr}/>`;
    parts.push(
      `<draw:custom-shape draw:style-name="${style}" draw:name="${escapeXml(node.label)}" xml:id="${id}" draw:id="${id}" ${frame(place(raw))}>` +
        `<text:p text:style-name="${textStyle}">${labelSpans(node.labelRuns, sheet)}</text:p>${geometry}</draw:custom-shape>`,
    );
  });

  // Edges, each a connector attached to its two shapes; its label is the connector's own text, drawn
  // horizontally at the middle of the line (centred text area, see edgeGraphicProperties) and moving
  // with it.
  flowchart.edges.forEach((edge, i) => {
    const from = layout.nodes[edge.from];
    const to = layout.nodes[edge.to];
    const fromId = shapeIds.get(edge.from);
    const toId = shapeIds.get(edge.to);
    if (!from || !to || fromId === undefined || toId === undefined) return;
    const style = sheet.graphic(edgeGraphicProperties(edge, linePt, scale));
    const name = escapeXml(`${edge.from}--${edge.to}`);
    const labelStyle = (): string => shapeText(sheet, '000000', fontPt(EDGE_LABEL_FONT_PT), 'FFFFFF');
    const text = edge.labelRuns ? `<text:p text:style-name="${labelStyle()}">${labelSpans(edge.labelRuns, sheet)}</text:p>` : '';
    if (edge.from === edge.to) {
      parts.push(selfLoop(style, name, (layout.edges[i] ?? []).map(placePoint), text));
      return;
    }
    const a = place(from);
    const b = place(to);
    const obstacles = Object.entries(layout.nodes)
      .filter(([id]) => id !== edge.from && id !== edge.to)
      .map(([, box]) => place(box));
    const { start, end } = chooseGluePoints(a, b, obstacles);
    const p1 = gluePoint(a, start);
    const p2 = gluePoint(b, end);
    parts.push(
      `<draw:connector draw:style-name="${style}" draw:name="${name}" draw:type="standard" ` +
        `svg:x1="${cm(p1.x)}" svg:y1="${cm(p1.y)}" svg:x2="${cm(p2.x)}" svg:y2="${cm(p2.y)}" ` +
        `svg:viewBox="0 0 ${Math.max(1, hmm(Math.abs(p2.x - p1.x)))} ${Math.max(1, hmm(Math.abs(p2.y - p1.y)))}" ` +
        `draw:start-shape="${fromId}" draw:start-glue-point="${start}" draw:end-shape="${toId}" draw:end-glue-point="${end}">` +
        `${text}</draw:connector>`,
    );
  });

  const fragment =
    `<text:p><draw:g draw:name="${escapeXml(`Mermaid flowchart ${prefix}`)}" text:anchor-type="as-char" svg:y="0cm">` +
    parts.join('') +
    '</draw:g></text:p>';
  return { fragment, automaticStyles: sheet.styles };
}

/** `svg:x`/`svg:y`/`svg:width`/`svg:height` of a placed box. */
function frame(box: Box): string {
  return `svg:x="${cm(box.x)}" svg:y="${cm(box.y)}" svg:width="${cm(box.width)}" svg:height="${cm(box.height)}"`;
}

function padding(scale: number): string {
  const x = cm(TEXT_INSET_X_PX * scale);
  const y = cm(TEXT_INSET_Y_PX * scale);
  return `fo:padding-left="${x}" fo:padding-right="${x}" fo:padding-top="${y}" fo:padding-bottom="${y}"`;
}

/** Graphic style of one edge: line, dash and markers. */
function edgeGraphicProperties(edge: FlowEdge, linePt: (base: number) => number, scale: number): string {
  const kind = LINE_BY_EDGE[edge.type] ?? LINE_BY_EDGE.arrow;
  const color = validateHexColor(edge.stroke, DEFAULT_LINE);
  const customPx = validStrokeWidthPx(edge.strokeWidth);
  const widthPt = linePt(customPx !== undefined ? customPx * 0.75 : kind.widthPt);
  const markerWidth = cm(Math.max(4, (widthPt <= LINE_PT ? 10 : 14) * Math.max(scale, 0.4)));
  const stroke = kind.invisible ? 'draw:stroke="none"' : kind.dash ? `draw:stroke="dash" draw:stroke-dash="${ODF_STYLE_NAMES.dash}"` : 'draw:stroke="solid"';
  const markers =
    kind.invisible
      ? ''
      : (kind.start !== 'none' ? ` draw:marker-start="${MARKER_NAMES[kind.start]}" draw:marker-start-width="${markerWidth}"` : '') +
        (kind.end !== 'none' ? ` draw:marker-end="${MARKER_NAMES[kind.end]}" draw:marker-end-width="${markerWidth}"` : '');
  // Centred text area: without it LibreOffice draws a connector's label at the top left of its bounding
  // box, i.e. against the start shape, whatever the connector type (seen in renders, 2026-10-08).
  return (
    `<style:graphic-properties ${stroke} svg:stroke-color="#${color}" svg:stroke-width="${pt(widthPt)}"${markers} ` +
    'draw:textarea-horizontal-align="center" draw:textarea-vertical-align="middle"/>'
  );
}

/** A `linkStyle` stroke width in px, or `undefined` when absent or not a sane positive number. */
function validStrokeWidthPx(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 && value <= 100 ? value : undefined;
}

/**
 * A self-loop (`A --> A`) as a polyline through Dagre's loop route. A connector whose two ends are the
 * same shape gets re-routed by LibreOffice into something else; the `.docx` output makes the same
 * choice (a plain shape, not a connector) for the same reason.
 */
function selfLoop(style: string, name: string, points: LayoutPoint[], text: string): string {
  if (points.length < 2) return '';
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - minX);
  const h = Math.max(1, Math.max(...ys) - minY);
  const coords = points.map((p) => `${hmm(p.x - minX)},${hmm(p.y - minY)}`).join(' ');
  return (
    `<draw:polyline draw:style-name="${style}" draw:name="${name}" ${frame({ x: minX, y: minY, width: w, height: h })} ` +
    `svg:viewBox="0 0 ${Math.max(1, hmm(w))} ${Math.max(1, hmm(h))}" draw:points="${coords}">${text}</draw:polyline>`
  );
}

/** Label runs as text and spans: bold/italic spans get a text style, `<br/>` a `text:line-break`. */
function labelSpans(tokens: LabelToken[], sheet: StyleSheet): string {
  return tokens
    .map((token) => {
      if ('break' in token) return '<text:line-break/>';
      const text = escapeXml(token.text);
      if (!token.bold && !token.italic) return text;
      return `<text:span text:style-name="${sheet.span(Boolean(token.bold), Boolean(token.italic))}">${text}</text:span>`;
    })
    .join('');
}

/** Which side each end of a connector attaches to, from the relative position of the two boxes. */
function defaultGluePoints(from: Box, to: Box): { start: number; end: number } {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy > 0 ? { start: GLUE.bottom, end: GLUE.top } : { start: GLUE.top, end: GLUE.bottom };
  }
  return dx > 0 ? { start: GLUE.right, end: GLUE.left } : { start: GLUE.left, end: GLUE.right };
}

/** Outward direction of each glue point. */
const OUTWARD: Readonly<Record<number, LayoutPoint>> = {
  [GLUE.top]: { x: 0, y: -1 },
  [GLUE.right]: { x: 1, y: 0 },
  [GLUE.bottom]: { x: 0, y: 1 },
  [GLUE.left]: { x: -1, y: 0 },
};

/**
 * The elbow route LibreOffice's standard connector takes between two glue points, approximately: one
 * bend when one end leaves vertically and the other horizontally, two bends (through the middle) when
 * both ends share an orientation.
 */
function elbowRoute(p1: LayoutPoint, start: number, p2: LayoutPoint, end: number): LayoutPoint[] {
  const vertical = (glue: number): boolean => glue === GLUE.top || glue === GLUE.bottom;
  if (vertical(start) && !vertical(end)) return [p1, { x: p1.x, y: p2.y }, p2];
  if (!vertical(start) && vertical(end)) return [p1, { x: p2.x, y: p1.y }, p2];
  if (vertical(start)) {
    const midY = (p1.y + p2.y) / 2;
    return [p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2];
  }
  const midX = (p1.x + p2.x) / 2;
  return [p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2];
}

/** Whether an axis-aligned segment passes through the inside of a box (touching its edge does not count). */
function segmentCrossesBox(a: LayoutPoint, b: LayoutPoint, box: Box): boolean {
  const inset = 1;
  const left = box.x + inset;
  const right = box.x + box.width - inset;
  const top = box.y + inset;
  const bottom = box.y + box.height - inset;
  const [x1, x2] = a.x <= b.x ? [a.x, b.x] : [b.x, a.x];
  const [y1, y2] = a.y <= b.y ? [a.y, b.y] : [b.y, a.y];
  return x1 < right && x2 > left && y1 < bottom && y2 > top;
}

/**
 * Glue points for a connector between `from` and `to`. LibreOffice routes a standard connector itself
 * and only steers clear of the two shapes it joins, so the sides picked from the boxes' relative
 * position alone can send it straight through a third node (seen in a render, 2026-10-08: a decision's
 * "no" branch crossing the "yes" branch's first box). Every pair of sides is scored on its estimated
 * elbow route: crossings first, then a route leaving or reaching a box from the wrong side; the
 * position-based choice wins any tie on those two (a merely shorter route that enters a box from the
 * side reads worse in a top-down flow), then length decides among the others.
 */
function chooseGluePoints(from: Box, to: Box, obstacles: Box[]): { start: number; end: number } {
  const preferred = defaultGluePoints(from, to);
  let best = preferred;
  let bestScore = Infinity;
  for (let start = 0; start < 4; start++) {
    for (let end = 0; end < 4; end++) {
      const p1 = gluePoint(from, start);
      const p2 = gluePoint(to, end);
      const route = elbowRoute(p1, start, p2, end);
      let crossings = 0;
      let length = 0;
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1]!;
        const b = route[i]!;
        length += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
        crossings += obstacles.filter((box) => segmentCrossesBox(a, b, box)).length;
      }
      const out = OUTWARD[start]!;
      const back = OUTWARD[end]!;
      const wrongSide = (p2.x - p1.x) * out.x + (p2.y - p1.y) * out.y < 0 || (p1.x - p2.x) * back.x + (p1.y - p2.y) * back.y < 0;
      const isPreferred = start === preferred.start && end === preferred.end;
      const score = crossings * 1e6 + (wrongSide ? 1e4 : 0) + (isPreferred ? 0 : 1e3) + length;
      if (score < bestScore) {
        bestScore = score;
        best = { start, end };
      }
    }
  }
  return best;
}

function gluePoint(box: Box, glue: number): LayoutPoint {
  switch (glue) {
    case GLUE.right:
      return { x: box.x + box.width, y: box.y + box.height / 2 };
    case GLUE.bottom:
      return { x: box.x + box.width / 2, y: box.y + box.height };
    case GLUE.left:
      return { x: box.x, y: box.y + box.height / 2 };
    default:
      return { x: box.x + box.width / 2, y: box.y };
  }
}

/** Subgraphs ordered so that a parent always precedes its children. */
function subgraphsOuterFirst(flowchart: Flowchart): Flowchart['subgraphs'] {
  const byId = new Map(flowchart.subgraphs.map((sg) => [sg.id, sg]));
  const childIds = new Set(flowchart.subgraphs.flatMap((sg) => sg.subgraphIds));
  const ordered: Flowchart['subgraphs'] = [];
  const seen = new Set<string>();
  const visit = (id: string): void => {
    const sg = byId.get(id);
    if (!sg || seen.has(id)) return;
    seen.add(id);
    ordered.push(sg);
    sg.subgraphIds.forEach(visit);
  };
  flowchart.subgraphs.filter((sg) => !childIds.has(sg.id)).forEach((sg) => visit(sg.id));
  flowchart.subgraphs.forEach((sg) => visit(sg.id));
  return ordered;
}

/** Extent of everything drawn: nodes, subgraph boxes and edge routes (a self-loop bulges out). */
function boundsOf(layout: LayoutResult): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of [...Object.values(layout.nodes), ...Object.values(layout.subgraphs)]) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  for (const p of layout.edges.flat()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return minX === Infinity ? { minX: 0, minY: 0, maxX: 0, maxY: 0 } : { minX, minY, maxX, maxY };
}

/**
 * A note paragraph (a diagram not drawn, and why), with the one text style it needs. The message is
 * escaped here.
 */
export function buildOdfNote(message: string, idPrefix: string): OdfDrawing {
  const style = `${idPrefix}-note`;
  return {
    fragment: `<text:p><text:span text:style-name="${style}">${escapeXml(message)}</text:span></text:p>`,
    automaticStyles: [
      `<style:style style:name="${style}" style:family="text"><style:text-properties fo:font-style="italic" fo:color="#808080" fo:font-size="9pt"/></style:style>`,
    ],
  };
}
