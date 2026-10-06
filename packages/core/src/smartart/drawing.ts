/**
 * Pre-rendered SmartArt drawing (`dsp:drawing`, the fifth diagram part a real Word always writes).
 *
 * Word and LibreOffice both show this part as the diagram's **cached rendering** and only re-run the layout
 * algorithm when the diagram is edited, so emitting it makes the two applications display exactly the same
 * shapes — the "pixel perfect" lever (ADR 0006: LibreOffice displays a present `dsp:drawing` as an
 * authoritative cache instead of running its own layout, which for `chain` stretched the boxes tall).
 *
 * Each `dsp:sp/@modelId` references the diagram's **presentation** point for that shape (never a content
 * point) — rule confirmed on a real Word-authored sample, see ADR 0006 "Résultat 1".
 *
 * Geometry here approximates what the self-authored `layoutDef`s ask Word to compute (same constraints:
 * `chain.ts`, `tree.ts`, `cycle.ts`); after an edit Word recomputes and may differ slightly. All text is
 * XML-escaped (AGENTS.md rule #2).
 */

import { escapeXml, validateHexColor } from '../translator/xml-escape.js';
import type { Flowchart, LabelToken } from '../types.js';
import { paragraphRunsXml, textLines } from './text.js';
import { accentOf, profileOf, type SmartArtStyle } from './styles.js';

/** Frame size (EMU) the diagram is embedded in — keep in sync with `embed.ts`'s defaults. */
export const DRAWING_FRAME = { cx: 5486400, cy: 3200400 };

/**
 * Taller frame for a cycle (6 in x 4.6 in): the ring needs vertical room for its boxes **and** the arrows
 * between them. Word recomputes a cycle's layout from the `layoutDef` rather than showing this file's cached
 * shapes, so the sizes below are also written into the `layoutDef` (`cycle.ts`) — one source of truth.
 */
export const CYCLE_FRAME = { cx: 5486400, cy: 4206240 };

/**
 * Box width (EMU) for a cycle of `n` nodes: up to 30% of the frame, shrunk until neighbouring boxes leave a gap
 * of at least 0.7 box widths for the arrow between them. The ring radius is taken conservatively from the box
 * *width* on both axes, so the guarantee holds whichever dimension Word's cycle algorithm uses.
 */
export function cycleBoxWidth(n: number, frame: { cx: number; cy: number } = CYCLE_FRAME): number {
  let w = 0.3 * frame.cx;
  const radius = (width: number) => (frame.cy - width) / 2;
  while (w > 0.08 * frame.cx && 1.7 * w > 2 * radius(w) * Math.sin(Math.PI / Math.max(3, n))) w *= 0.97;
  return w;
}

/** Placeholder written into `dgm:dataModelExt/@relId`; the bridge swaps it for `SMARTART_PLACEHOLDER:<id>:dr`. */
export const DRAWING_REL_TOKEN = 'SMARTART_DRAWING_REL';

/** `dgm:extLst` that points the data model at its drawing part (appended after `dgm:whole`). */
export const DRAWING_EXT_LST_XML =
  '<dgm:extLst><a:ext uri="http://schemas.microsoft.com/office/drawing/2008/diagram">' +
  `<dsp:dataModelExt xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" relId="${DRAWING_REL_TOKEN}" ` +
  'minVer="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:ext></dgm:extLst>';

/** One shape of the cached drawing. Coordinates are EMU inside the frame. */
export interface DrawingShape {
  /** Presentation point id this shape renders (`dsp:sp/@modelId`). */
  modelId: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  /** Preset geometry: `roundRect` for nodes (`ellipse` for timeline dots), an arrow for chain transitions. */
  prst: 'roundRect' | 'ellipse' | 'homePlate' | 'rightArrow' | 'leftArrow' | 'downArrow' | 'upArrow' | 'connector';
  /** `connector` only: the elbow line's corner points, in EMU relative to the shape's own top-left. */
  path?: Array<[number, number]>;
  /** Node text (absent for arrows). */
  text?: LabelToken[];
  /** Font size in hundredths of a point. */
  fontSize?: number;
  /** `RRGGBB` override from `classDef`/`style`; otherwise the theme's accent colour. */
  fill?: string;
  /** Clockwise rotation in degrees (cycle arrows follow the circle). */
  rotation?: number;
  /** Theme accent (`accent1`…`accent6`) the shape is painted with; default `accent1`. */
  accent?: string;
  /** Tint of that accent for transitions (60 = lighter), in percent. */
  tintPercent?: number;
  /** `RRGGBB` outline (a neutral card); otherwise the profile's white outline. */
  line?: string;
  /** A node box drawn with another preset (`diamond`…, the Mermaid node's shape) — styled as a node all the same. */
  geom?: string;
}

const EMU_PER_PT = 12700;

/** Black or white text depending on the fill's luminance (light `classDef` fills need dark text). */
function textColor(fill: string | undefined): string {
  if (!fill) return 'lt1';
  const n = Number.parseInt(fill, 16);
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luma > 160 ? 'dk1' : 'lt1';
}

/** Theme gradient fill 2 (a soft two-stop gradient, what a "moderate" quick style references) for one accent. */
function moderateGradient(accent: string): string {
  return (
    '<a:gradFill rotWithShape="1"><a:gsLst>' +
    `<a:gs pos="0"><a:schemeClr val="${accent}"><a:tint val="90000"/><a:satMod val="105000"/></a:schemeClr></a:gs>` +
    `<a:gs pos="100000"><a:schemeClr val="${accent}"><a:tint val="65000"/><a:satMod val="140000"/></a:schemeClr></a:gs>` +
    '</a:gsLst><a:lin ang="16200000" scaled="0"/></a:gradFill>'
  );
}

/** Theme gradient fill 3 (what an "intense" quick style references), written out for one accent. */
function intenseGradient(accent: string): string {
  return (
    '<a:gradFill rotWithShape="1"><a:gsLst>' +
    `<a:gs pos="0"><a:schemeClr val="${accent}"><a:tint val="100000"/><a:shade val="100000"/><a:satMod val="130000"/></a:schemeClr></a:gs>` +
    `<a:gs pos="100000"><a:schemeClr val="${accent}"><a:tint val="50000"/><a:shade val="100000"/><a:satMod val="350000"/></a:schemeClr></a:gs>` +
    '</a:gsLst><a:lin ang="16200000" scaled="0"/></a:gradFill>'
  );
}

const LIGHT_SHADOW =
  '<a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst>';

const SHADOW =
  '<a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst>';

function fillXml(shape: DrawingShape, style: SmartArtStyle): string {
  const fill = validateHexColor(shape.fill, '');
  if (fill) return `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`;
  const accent = shape.accent ?? 'accent1';
  if (shape.tintPercent === undefined && shape.line === undefined && (shape.prst === 'roundRect' || shape.prst === 'ellipse' || shape.prst === 'homePlate')) {
    const { fillIdx } = profileOf(style);
    if (fillIdx === 3) return intenseGradient(accent);
    if (fillIdx === 2) return moderateGradient(accent);
  }
  const tint = shape.tintPercent === undefined ? '' : `<a:tint val="${shape.tintPercent * 1000}"/>`;
  return `<a:solidFill><a:schemeClr val="${accent}">${tint}</a:schemeClr></a:solidFill>`;
}

function shapeXml(shape: DrawingShape, style: SmartArtStyle): string {
  const isConn = shape.prst === 'connector';
  const isArrow = shape.prst !== 'roundRect' && shape.prst !== 'ellipse' && shape.prst !== 'homePlate';
  const fill = validateHexColor(shape.fill, '');
  const profile = profileOf(style);
  const lineWidth = profile.lineW;
  const line = isConn
    ? `<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="${shape.accent ?? 'accent1'}"><a:shade val="60000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/></a:ln>`
    : isArrow
    ? '<a:ln><a:noFill/></a:ln>'
    : validateHexColor(shape.line, '')
    ? `<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="${validateHexColor(shape.line, '')}"/></a:solidFill><a:prstDash val="solid"/></a:ln>`
    : `<a:ln w="${lineWidth}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="lt1"/></a:solidFill><a:prstDash val="solid"/></a:ln>`;
  const effects = isArrow || shape.line !== undefined ? '<a:effectLst/>' : profile.effectIdx === 2 ? SHADOW : profile.effectIdx === 1 ? LIGHT_SHADOW : '<a:effectLst/>';
  const colour = textColor(fill || undefined);
  const lnIdx = isConn ? 2 : isArrow ? 0 : profile.lnIdx;
  const fillIdx = isConn ? 0 : isArrow ? 1 : profile.fillIdx;
  const effectIdx = isArrow ? 0 : profile.effectIdx;
  const styleXml =
    `<dsp:style><a:lnRef idx="${lnIdx}"><a:scrgbClr r="0" g="0" b="0"/></a:lnRef><a:fillRef idx="${fillIdx}"><a:scrgbClr r="0" g="0" b="0"/></a:fillRef>` +
    `<a:effectRef idx="${effectIdx}"><a:scrgbClr r="0" g="0" b="0"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="${colour}"/></a:fontRef></dsp:style>`;
  const sz = shape.fontSize ?? 1800;
  const inset = Math.max(0, Math.round((sz / 100) * EMU_PER_PT * 0.15));
  const textBody = isArrow
    ? '<dsp:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></dsp:txBody>'
    : `<dsp:txBody><a:bodyPr spcFirstLastPara="0" vert="horz" wrap="square" lIns="${inset}" tIns="${inset}" rIns="${inset}" bIns="${inset}" ` +
      'numCol="1" spcCol="1270" anchor="ctr" anchorCtr="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>' +
      '<a:p><a:pPr marL="0" lvl="0" indent="0" algn="ctr"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPct val="0"/></a:spcBef>' +
      '<a:spcAft><a:spcPct val="35000"/></a:spcAft><a:buNone/></a:pPr>' +
      `${paragraphRunsXml(shape.text ?? [], ` sz="${sz}" kern="1200"`)}</a:p></dsp:txBody>`;
  const rect = `<a:off x="${shape.x}" y="${shape.y}"/><a:ext cx="${shape.cx}" cy="${shape.cy}"/>`;
  const geometry = isConn
    ? `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="0" b="0"/><a:pathLst><a:path>${(shape.path ?? [])
        .map(([px, py], i) => `<a:${i === 0 ? 'moveTo' : 'lnTo'}><a:pt x="${Math.round(px)}" y="${Math.round(py)}"/></a:${i === 0 ? 'moveTo' : 'lnTo'}>`)
        .join('')}</a:path></a:pathLst></a:custGeom>`
    : `<a:prstGeom prst="${shape.geom ?? shape.prst}"><a:avLst/></a:prstGeom>`;
  const rot = shape.rotation ? ` rot="${Math.round(shape.rotation * 60000)}"` : '';
  return (
    `<dsp:sp modelId="${escapeXml(shape.modelId)}"><dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>` +
    `<dsp:spPr><a:xfrm${rot}>${rect}</a:xfrm>${geometry}${isConn ? '<a:noFill/>' : fillXml(shape, style)}${line}${effects}</dsp:spPr>` +
    `${styleXml}${textBody}<dsp:txXfrm>${rect}</dsp:txXfrm></dsp:sp>`
  );
}

/** The complete `word/diagrams/drawingN.xml` part for `shapes`. */
export function buildDiagramDrawingXml(shapes: DrawingShape[], style: SmartArtStyle = 'simple'): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<dsp:drawing xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" ' +
    'xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/>' +
    shapes.map((shape) => shapeXml(shape, style)).join('') +
    '</dsp:spTree></dsp:drawing>'
  );
}

/**
 * Whether `labels` fit a `cx` x `cy` box at `size` pt without breaking a word: at most three wrapped lines, or one
 * per explicit line break when a label has more.
 */
export function textFits(labels: LabelToken[][], cx: number, cy: number, size: number): boolean {
  const widthPt = cx / EMU_PER_PT;
  const heightPt = cy / EMU_PER_PT;
  const lineSets = labels.map(textLines);
  const words = lineSets.flatMap((lines) => lines.flatMap((l) => l.split(/\s+/)));
  const longestWord = Math.max(1, ...words.map((w) => w.length));
  const maxLines = Math.max(3, ...lineSets.map((lines) => lines.length));
  const usable = widthPt - 2 * size * 0.3;
  const perLine = Math.max(1, Math.floor(usable / (size * 0.55)));
  const lines = Math.max(1, ...lineSets.map((ls) => ls.reduce((sum, l) => sum + Math.max(1, Math.ceil(l.length / perLine)), 0)));
  return longestWord <= perLine && lines <= maxLines && lines * size * 1.1 <= heightPt;
}

/** Largest font (1/100 pt, `minPt`-24 pt, default floor 10 pt) at which `labels` fit a `cx` x `cy` box ({@link textFits}). */
export function fitFontSize(labels: LabelToken[][], cx: number, cy: number, minPt = 10): number {
  for (let size = 24; size > minPt; size -= 1) {
    if (textFits(labels, cx, cy, size)) return size * 100;
  }
  return minPt * 100;
}

interface Labelled {
  /** Presentation point id of the node's shape. */
  id: string;
  text: LabelToken[];
  fill?: string;
  /** Preset of the Mermaid node's shape, when it is not a plain box (see `node-shape.ts`). */
  geom?: string;
  /** Presentation point id of the connector line leading into this node (tree children only). */
  connId?: string;
}

/** Share of a box's width and height a non-rectangular shape (diamond, circle…) leaves to its text. */
const SHAPED_TEXT_SHARE = 0.65;

/** {@link fitFontSize} for node boxes, the shaped ones (`geom`) having less room for their text. */
function fitNodeFont(nodes: Array<{ text: LabelToken[]; geom?: string }>, cx: number, cy: number, minPt = 10): number {
  const plain = nodes.filter((n) => !n.geom).map((n) => n.text);
  const shaped = nodes.filter((n) => n.geom).map((n) => n.text);
  return Math.min(
    plain.length > 0 ? fitFontSize(plain, cx, cy, minPt) : 2400,
    shaped.length > 0 ? fitFontSize(shaped, cx * SHAPED_TEXT_SHARE, cy * SHAPED_TEXT_SHARE, minPt) : 2400
  );
}

/** Box width/height and gap (EMU) of an `n`-box chain in the default frame, box height `aspect` of its width. */
export function chainBoxSize(direction: Flowchart['direction'], n: number, aspect = 0.6): { bw: number; bh: number; gap: number } {
  const { cx: FW, cy: FH } = DRAWING_FRAME;
  if (direction === 'LR' || direction === 'RL') {
    const bw = Math.min(FW / (n + 0.4 * (n - 1)), FH / aspect);
    return { bw, bh: aspect * bw, gap: 0.4 * bw };
  }
  const bh = Math.min(FH / (n + 0.45 * (n - 1)), aspect * FW);
  return { bw: bh / aspect, bh, gap: 0.45 * bh };
}

/**
 * Chain geometry: `n` boxes in a row (or column) with a transition arrow between consecutive ones,
 * using the `layoutDef`'s ratios — box height `aspect` (default 0.6) of its width, transition 0.4 of a box wide.
 */
export function chainShapes(
  direction: Flowchart['direction'],
  nodes: Labelled[],
  transIds: string[],
  style: SmartArtStyle = 'simple',
  aspect = 0.6,
): DrawingShape[] {
  const n = nodes.length;
  const horizontal = direction === 'LR' || direction === 'RL';
  const { cx: FW, cy: FH } = DRAWING_FRAME;
  const { bw, bh, gap } = chainBoxSize(direction, n, aspect);
  const total = n * (horizontal ? bw : bh) + (n - 1) * gap;
  const start = ((horizontal ? FW : FH) - total) / 2;
  const reverse = direction === 'RL' || direction === 'BT';
  const font = fitNodeFont(nodes, bw, bh);
  const shapes: DrawingShape[] = [];
  const along = (k: number) => start + k * ((horizontal ? bw : bh) + gap);
  const arrowPrst: DrawingShape['prst'] = { LR: 'rightArrow', RL: 'leftArrow', TD: 'downArrow', BT: 'upArrow' }[direction] as DrawingShape['prst'];
  nodes.forEach((node, i) => {
    const k = reverse ? n - 1 - i : i;
    const pos = along(k);
    shapes.push({
      modelId: node.id,
      x: Math.round(horizontal ? pos : (FW - bw) / 2),
      y: Math.round(horizontal ? (FH - bh) / 2 : pos),
      cx: Math.round(bw),
      cy: Math.round(bh),
      prst: 'roundRect',
      text: node.text,
      ...(node.geom ? { geom: node.geom } : {}),
      fontSize: font,
      accent: accentOf(style, 'node1', i),
      ...(node.fill ? { fill: node.fill } : {}),
    });
    const trans = transIds[i];
    if (trans !== undefined) {
      const kt = reverse ? n - 2 - i : i;
      const base = along(kt) + (horizontal ? bw : bh) + gap * 0.25;
      const len = gap * 0.53;
      const thick = Math.min(horizontal ? bh : bw, gap * 1.05) * 0.62;
      shapes.push({
        modelId: trans,
        x: Math.round(horizontal ? base : (FW - thick) / 2),
        y: Math.round(horizontal ? (FH - thick) / 2 : base),
        cx: Math.round(horizontal ? len : thick),
        cy: Math.round(horizontal ? thick : len),
        prst: arrowPrst,
        accent: accentOf(style, 'sibTrans', i),
        tintPercent: 60,
      });
    }
  });
  return shapes;
}

/**
 * Tree geometry (root + one row/column of children): the `layoutDef` gives the root a 35% strip across the
 * whole frame and the children the remaining 55% area, each child `1 / (n + 0.1 (n - 1))` of it with a 10% gap.
 * `TD`: root on top; `BT`: root at the bottom; `LR`: root on the left; `RL`: root on the right.
 */
export function treeShapes(
  direction: Flowchart['direction'],
  root: Labelled,
  children: Labelled[],
  style: SmartArtStyle = 'simple',
): DrawingShape[] {
  const { cx: FW, cy: FH } = DRAWING_FRAME;
  const n = children.length;
  const horizontalFlow = direction === 'LR' || direction === 'RL';
  const along = horizontalFlow ? FH : FW; // axis the children are spread along
  const cell = along / (n + 0.1 * (n - 1));
  const gap = 0.1 * cell;
  const rootRect = horizontalFlow
    ? { x: direction === 'LR' ? 0 : 0.65 * FW, y: 0, cx: 0.35 * FW, cy: FH }
    : { x: 0, y: direction === 'TD' ? 0 : 0.65 * FH, cx: FW, cy: 0.35 * FH };
  const areaStart = horizontalFlow ? (direction === 'LR' ? 0.45 * FW : 0) : direction === 'TD' ? 0.45 * FH : 0;
  const areaSize = horizontalFlow ? 0.55 * FW : 0.55 * FH;
  const shapes: DrawingShape[] = [];
  const rootFont = fitNodeFont([root], rootRect.cx, rootRect.cy);
  shapes.push({
    modelId: root.id,
    x: Math.round(rootRect.x),
    y: Math.round(rootRect.y),
    cx: Math.round(rootRect.cx),
    cy: Math.round(rootRect.cy),
    prst: 'roundRect',
    text: root.text,
    ...(root.geom ? { geom: root.geom } : {}),
    fontSize: rootFont,
    accent: accentOf(style, 'node1', 0),
    ...(root.fill ? { fill: root.fill } : {}),
  });
  const boxW = horizontalFlow ? areaSize : cell;
  const boxH = horizontalFlow ? cell : areaSize;
  const font = fitNodeFont(children, boxW, boxH);
  children.forEach((child, i) => {
    const pos = i * (cell + gap);
    shapes.push({
      modelId: child.id,
      x: Math.round(horizontalFlow ? areaStart : pos),
      y: Math.round(horizontalFlow ? pos : areaStart),
      cx: Math.round(boxW),
      cy: Math.round(boxH),
      prst: 'roundRect',
      text: child.text,
      ...(child.geom ? { geom: child.geom } : {}),
      fontSize: font,
      accent: accentOf(style, 'node2', i),
      ...(child.fill ? { fill: child.fill } : {}),
    });
    if (child.connId !== undefined) {
      // Elbow from the middle of the root's facing side to the middle of the child's facing side, bending at
      // the midpoint of the gap between the two (the shape Word's own tree connectors have).
      const rootEdge = { TD: rootRect.y + rootRect.cy, BT: rootRect.y, LR: rootRect.x + rootRect.cx, RL: rootRect.x }[direction];
      const childEdge = { TD: areaStart, BT: areaStart + areaSize, LR: areaStart, RL: areaStart + areaSize }[direction];
      const rootMid = (horizontalFlow ? rootRect.y + rootRect.cy / 2 : rootRect.x + rootRect.cx / 2);
      const childMid = pos + cell / 2;
      const mainA = Math.min(rootEdge, childEdge); // low end of the connector along the flow axis
      const mainLen = Math.abs(childEdge - rootEdge);
      const crossA = Math.min(rootMid, childMid);
      const crossLen = Math.abs(childMid - rootMid);
      // Points relative to the box, in (flow axis, cross axis) terms, then mapped to (x, y).
      const fromRoot = rootEdge <= childEdge ? 0 : mainLen;
      const toChild = mainLen - fromRoot;
      const rc = rootMid - crossA;
      const cc = childMid - crossA;
      const mid = mainLen / 2;
      const along2xy = (m: number, c: number): [number, number] => (horizontalFlow ? [m, c] : [c, m]);
      shapes.push({
        modelId: child.connId,
        x: Math.round(horizontalFlow ? mainA : crossA),
        y: Math.round(horizontalFlow ? crossA : mainA),
        cx: Math.round(horizontalFlow ? mainLen : crossLen),
        cy: Math.round(horizontalFlow ? crossLen : mainLen),
        prst: 'connector',
        path: [along2xy(fromRoot, rc), along2xy(mid, rc), along2xy(mid, cc), along2xy(toChild, cc)],
        accent: accentOf(style, 'parChTrans1D2', 0),
      });
    }
  });
  return shapes;
}

/** A node of a multi-level tree, as {@link deepTreeShapes} lays it out. */
export interface DeepTreeNode extends Labelled {
  children: DeepTreeNode[];
}

/** Gap between neighbouring subtrees, in box sizes along the sibling axis. */
const DEEP_SIBLING_GAP = 0.3;
/** Gap between levels, in box sizes along the level axis (the `layoutDef`'s `sp` constraint). */
const DEEP_LEVEL_GAP = 0.4;
/** Tallest frame (EMU) a multi-level tree may ask for (5 in). */
const DEEP_MAX_FRAME_CY = 4572000;
/** Compact (org-chart) layout: how far right of its parent's left edge a column of leaves starts, in box widths. */
export const DEEP_COLUMN_INDENT = 0.6;
/** A top-down tree whose boxes would come out narrower than this (EMU, 0.9 in) switches to the compact layout. */
const DEEP_COMPACT_BELOW = 822960;
/** Smallest font in a multi-level tree's cached drawing (wide trees get small boxes; Word can enlarge them). */
const DEEP_MIN_FONT_PT = 8;

/** Number of levels (the root counts as 1) and of leaves of a tree. */
export function deepTreeSize(root: { children: unknown[] }): { depth: number; leaves: number } {
  const walk = (n: { children: unknown[] }): { depth: number; leaves: number } => {
    if (n.children.length === 0) return { depth: 1, leaves: 1 };
    const subs = n.children.map((c) => walk(c as { children: unknown[] }));
    return { depth: 1 + Math.max(...subs.map((s) => s.depth)), leaves: subs.reduce((sum, s) => sum + s.leaves, 0) };
  };
  return walk(root);
}

/** In the compact layout, a non-root node whose children are all leaves stacks them in a column under itself. */
function isColumnParent(n: DeepTreeNode, root: DeepTreeNode): boolean {
  return n !== root && n.children.length > 0 && n.children.every((c) => c.children.length === 0);
}

/** Width of a subtree in box widths (`compact`: leaf-only families are a 1 + indent wide column). */
function deepSpan(n: DeepTreeNode, root: DeepTreeNode, compact: boolean): number {
  if (n.children.length === 0) return 1;
  if (compact && isColumnParent(n, root)) return 1 + DEEP_COLUMN_INDENT;
  return Math.max(1, n.children.reduce((s, c) => s + deepSpan(c, root, compact), 0) + DEEP_SIBLING_GAP * (n.children.length - 1));
}

/**
 * Whether a multi-level tree should use the compact (org-chart) layout: only top-down, only when the ordinary
 * layout would make boxes narrower than 0.9 in, and only if stacking leaf families actually narrows the tree.
 * This is how Word's own organisation chart keeps wide trees readable (leaves in a column under their parent).
 */
export function deepTreeIsCompact(root: DeepTreeNode, direction: Flowchart['direction']): boolean {
  if (direction !== 'TD') return false;
  const normal = deepSpan(root, root, false);
  return DRAWING_FRAME.cx / normal < DEEP_COMPACT_BELOW && deepSpan(root, root, true) < normal;
}

/**
 * Multi-level tree geometry, in the four Mermaid directions. Space is shared by the **real shape of each
 * subtree**: a leaf takes one box along the sibling axis, a parent's subtree the sum of its children's (plus
 * a gap between siblings), and the parent is centred on its first and last child — so a branch with
 * grandchildren is wide and a lone leaf next to it stays narrow. Each parent→child link is an elbow bending
 * halfway across the gap between the two levels. The frame is sized to the result.
 *
 * Computed on two abstract axes — *cross* (siblings) and *flow* (levels, root first) — then mapped to x/y:
 * `TD` flow = down, `BT` flow = up, `LR` flow = right, `RL` flow = left.
 *
 * `compact` (top-down only, see {@link deepTreeIsCompact}): a node whose children are all leaves keeps its
 * box at the left of its slot and stacks the leaves in a column below it, indented by
 * {@link DEEP_COLUMN_INDENT}; each leaf's line runs down from the parent and enters the leaf's left side.
 */
export function deepTreeShapes(
  root: DeepTreeNode,
  style: SmartArtStyle = 'simple',
  direction: Flowchart['direction'] = 'TD',
  compact = false,
): { shapes: DrawingShape[]; frame: { cx: number; cy: number } } {
  const FW = DRAWING_FRAME.cx;
  const horizontal = direction === 'LR' || direction === 'RL';
  const reversed = direction === 'BT' || direction === 'RL';
  const columns = compact && direction === 'TD';
  const isColumn = (n: DeepTreeNode): boolean => columns && isColumnParent(n, root);
  const span = (n: DeepTreeNode): number => deepSpan(n, root, columns);
  const totalSpan = span(root);
  // Rows of boxes along the flow axis: one per level, plus one per leaf in a stacked column.
  const lastRow = (n: DeepTreeNode, row: number): number =>
    isColumn(n) ? row + n.children.length : Math.max(row, ...n.children.map((c) => lastRow(c, row + 1)));
  const rows = lastRow(root, 0) + 1;
  const levels = rows + DEEP_LEVEL_GAP * (rows - 1);

  // Box size along each axis, and the frame. Vertical trees spread siblings across the page width; horizontal
  // ones spread the levels across it and the siblings down a frame of at most 5 in.
  let boxCross: number;
  let boxFlow: number;
  if (horizontal) {
    boxFlow = Math.min(FW / levels, 0.28 * FW);
    boxCross = Math.min(0.6 * boxFlow, 822960, DEEP_MAX_FRAME_CY / totalSpan);
  } else {
    boxCross = Math.min(FW / totalSpan, 0.28 * FW);
    boxFlow = Math.min(0.7 * boxCross, 822960, DEEP_MAX_FRAME_CY / levels);
  }
  const crossTotal = horizontal ? totalSpan * boxCross : FW;
  const flowTotal = boxFlow * levels;
  const frame = horizontal
    ? { cx: Math.round(flowTotal), cy: Math.round(crossTotal) }
    : { cx: FW, cy: Math.round(flowTotal) };
  const originCross = (crossTotal - totalSpan * boxCross) / 2;
  const boxW = horizontal ? boxFlow : boxCross;
  const boxH = horizontal ? boxCross : boxFlow;

  // Abstract (cross, flow) rectangle -> frame rectangle.
  const toRect = (c: number, f: number, cs: number, fs: number) => {
    const flow = reversed ? flowTotal - f - fs : f;
    return horizontal ? { x: flow, y: c, cx: fs, cy: cs } : { x: c, y: flow, cx: cs, cy: fs };
  };

  const all: DeepTreeNode[] = [];
  const collect = (n: DeepTreeNode): void => {
    all.push(n);
    n.children.forEach(collect);
  };
  collect(root);
  const font = fitNodeFont(all, boxW, boxH, DEEP_MIN_FONT_PT);

  // Pass 1: centre of every node along the cross axis, in box units from the start of the tree.
  const centreOf = new Map<DeepTreeNode, number>();
  const centre = (n: DeepTreeNode, start: number): void => {
    if (n.children.length === 0 || isColumn(n)) {
      centreOf.set(n, start + 0.5); // a column parent's box sits at the left of its slot
      return;
    }
    let childStart = start;
    for (const child of n.children) {
      centre(child, childStart);
      childStart += span(child) + DEEP_SIBLING_GAP;
    }
    centreOf.set(n, (centreOf.get(n.children[0]!)! + centreOf.get(n.children[n.children.length - 1]!)!) / 2);
  };
  centre(root, 0);

  // Pass 2: shapes in depth-first order (the order the data model numbers the boxes, for `presStyleIdx`).
  const shapes: DrawingShape[] = [];
  let nonRootCount = 0;
  const emit = (n: DeepTreeNode, level: number, parent: { midCross: number; flowEnd: number } | undefined): void => {
    const c = originCross + (centreOf.get(n)! - 0.5) * boxCross;
    const f = level * boxFlow * (1 + DEEP_LEVEL_GAP);
    const r = toRect(c, f, boxCross, boxFlow);
    shapes.push({
      modelId: n.id,
      x: Math.round(r.x),
      y: Math.round(r.y),
      cx: Math.round(r.cx),
      cy: Math.round(r.cy),
      prst: 'roundRect',
      text: n.text,
      ...(n.geom ? { geom: n.geom } : {}),
      fontSize: font,
      accent: accentOf(style, level === 0 ? 'node1' : 'node2', level === 0 ? 0 : nonRootCount++),
      ...(n.fill ? { fill: n.fill } : {}),
    });
    const midCross = c + boxCross / 2;
    if (parent && n.connId !== undefined) {
      // Elbow from the middle of the parent's far side to the middle of this box's near side.
      const gap = f - parent.flowEnd;
      const low = Math.min(parent.midCross, midCross);
      const box = toRect(low, parent.flowEnd, Math.abs(midCross - parent.midCross), gap);
      const point = (dc: number, df: number): [number, number] => {
        const flow = reversed ? gap - df : df;
        return horizontal ? [flow, dc] : [dc, flow];
      };
      shapes.push({
        modelId: n.connId,
        x: Math.round(box.x),
        y: Math.round(box.y),
        cx: Math.round(box.cx),
        cy: Math.round(box.cy),
        prst: 'connector',
        path: [
          point(parent.midCross - low, 0),
          point(parent.midCross - low, gap / 2),
          point(midCross - low, gap / 2),
          point(midCross - low, gap),
        ],
        accent: accentOf(style, 'parChTrans1D2', 0),
      });
    }
    if (isColumn(n)) {
      // Leaves stacked below, indented; each line drops from the parent's bottom centre and turns into the leaf.
      const leafCross = c + DEEP_COLUMN_INDENT * boxCross;
      n.children.forEach((leaf, k) => {
        const lf = (level + 1 + k) * boxFlow * (1 + DEEP_LEVEL_GAP);
        const lr = toRect(leafCross, lf, boxCross, boxFlow);
        shapes.push({
          modelId: leaf.id,
          x: Math.round(lr.x),
          y: Math.round(lr.y),
          cx: Math.round(lr.cx),
          cy: Math.round(lr.cy),
          prst: 'roundRect',
          text: leaf.text,
          ...(leaf.geom ? { geom: leaf.geom } : {}),
          fontSize: font,
          accent: accentOf(style, 'node2', nonRootCount++),
          ...(leaf.fill ? { fill: leaf.fill } : {}),
        });
        if (leaf.connId === undefined) return;
        const drop = lf + boxFlow / 2 - (f + boxFlow);
        const stub = leafCross - midCross;
        const box = toRect(midCross, f + boxFlow, stub, drop);
        shapes.push({
          modelId: leaf.connId,
          x: Math.round(box.x),
          y: Math.round(box.y),
          cx: Math.round(box.cx),
          cy: Math.round(box.cy),
          prst: 'connector',
          path: [
            [0, 0],
            [0, drop],
            [stub, drop],
          ],
          accent: accentOf(style, 'parChTrans1D2', 0),
        });
      });
      return;
    }
    for (const child of n.children) emit(child, level + 1, { midCross, flowEnd: f + boxFlow });
  };
  emit(root, 0, undefined);
  return { shapes, frame };
}

/**
 * Cycle geometry: boxes evenly spaced clockwise from the top, a transition arrow between each pair (the last
 * one closing the loop). Sizes come from {@link cycleBoxWidth}, the same rule the `layoutDef` states.
 */
export function cycleShapes(nodes: Labelled[], transIds: string[], style: SmartArtStyle = 'simple'): DrawingShape[] {
  const frame = CYCLE_FRAME;
  const n = nodes.length;
  const w = cycleBoxWidth(n, frame);
  const h = 0.6 * w;
  const radius = (frame.cy - h) / 2;
  const font = fitNodeFont(nodes, w, h);
  const point = (angle: number, r: number) => ({ x: frame.cx / 2 + r * Math.sin(angle), y: frame.cy / 2 - r * Math.cos(angle) });
  const shapes: DrawingShape[] = [];
  nodes.forEach((node, i) => {
    const centre = point((2 * Math.PI * i) / n, radius);
    shapes.push({
      modelId: node.id,
      x: Math.round(centre.x - w / 2),
      y: Math.round(centre.y - h / 2),
      cx: Math.round(w),
      cy: Math.round(h),
      prst: 'roundRect',
      text: node.text,
      ...(node.geom ? { geom: node.geom } : {}),
      fontSize: font,
      accent: accentOf(style, 'node1', i),
      ...(node.fill ? { fill: node.fill } : {}),
    });
    const trans = transIds[i];
    if (trans !== undefined) {
      const mid = (2 * Math.PI * (i + 0.5)) / n;
      const c = point(mid, radius);
      const gap = 2 * radius * Math.sin(Math.PI / n) - w;
      const len = Math.max(0.1 * w, 0.5 * gap);
      const thick = 0.8 * len;
      shapes.push({
        modelId: trans,
        x: Math.round(c.x - len / 2),
        y: Math.round(c.y - thick / 2),
        cx: Math.round(len),
        cy: Math.round(thick),
        prst: 'rightArrow',
        rotation: (mid * 180) / Math.PI,
        accent: accentOf(style, 'sibTrans', i),
        tintPercent: 60,
      });
    }
  });
  return shapes;
}
