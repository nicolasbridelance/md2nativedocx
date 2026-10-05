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
import type { Flowchart } from '../types.js';
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
  /** Preset geometry: `roundRect` for nodes, an arrow for chain transitions. */
  prst: 'roundRect' | 'rightArrow' | 'leftArrow' | 'downArrow' | 'upArrow' | 'connector';
  /** `connector` only: the elbow line's corner points, in EMU relative to the shape's own top-left. */
  path?: Array<[number, number]>;
  /** Node text (absent for arrows). */
  text?: string;
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
  if (shape.tintPercent === undefined && shape.prst === 'roundRect') {
    const { fillIdx } = profileOf(style);
    if (fillIdx === 3) return intenseGradient(accent);
    if (fillIdx === 2) return moderateGradient(accent);
  }
  const tint = shape.tintPercent === undefined ? '' : `<a:tint val="${shape.tintPercent * 1000}"/>`;
  return `<a:solidFill><a:schemeClr val="${accent}">${tint}</a:schemeClr></a:solidFill>`;
}

function shapeXml(shape: DrawingShape, style: SmartArtStyle): string {
  const isConn = shape.prst === 'connector';
  const isArrow = shape.prst !== 'roundRect';
  const fill = validateHexColor(shape.fill, '');
  const profile = profileOf(style);
  const lineWidth = profile.lineW;
  const line = isConn
    ? `<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="${shape.accent ?? 'accent1'}"><a:shade val="60000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/></a:ln>`
    : isArrow
    ? '<a:ln><a:noFill/></a:ln>'
    : `<a:ln w="${lineWidth}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="lt1"/></a:solidFill><a:prstDash val="solid"/></a:ln>`;
  const effects = isArrow ? '<a:effectLst/>' : profile.effectIdx === 2 ? SHADOW : profile.effectIdx === 1 ? LIGHT_SHADOW : '<a:effectLst/>';
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
      `<a:r><a:rPr lang="fr-FR" sz="${sz}" kern="1200"/><a:t>${escapeXml(shape.text ?? '')}</a:t></a:r></a:p></dsp:txBody>`;
  const rect = `<a:off x="${shape.x}" y="${shape.y}"/><a:ext cx="${shape.cx}" cy="${shape.cy}"/>`;
  const geometry = isConn
    ? `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="0" b="0"/><a:pathLst><a:path>${(shape.path ?? [])
        .map(([px, py], i) => `<a:${i === 0 ? 'moveTo' : 'lnTo'}><a:pt x="${Math.round(px)}" y="${Math.round(py)}"/></a:${i === 0 ? 'moveTo' : 'lnTo'}>`)
        .join('')}</a:path></a:pathLst></a:custGeom>`
    : `<a:prstGeom prst="${shape.prst}"><a:avLst/></a:prstGeom>`;
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

/** Largest font (1/100 pt, 10-24 pt) at which `labels` fit a `cx` x `cy` box in at most three lines. */
export function fitFontSize(labels: string[], cx: number, cy: number): number {
  const widthPt = cx / EMU_PER_PT;
  const heightPt = cy / EMU_PER_PT;
  const longestWord = Math.max(1, ...labels.flatMap((l) => l.split(/\s+/).map((w) => w.length)));
  const longest = Math.max(1, ...labels.map((l) => l.length));
  for (let size = 24; size > 10; size -= 1) {
    const usable = widthPt - 2 * size * 0.3;
    const perLine = Math.max(1, Math.floor(usable / (size * 0.55)));
    const lines = Math.ceil(longest / perLine);
    if (longestWord <= perLine && lines <= 3 && lines * size * 1.1 <= heightPt) return size * 100;
  }
  return 1000;
}

interface Labelled {
  /** Presentation point id of the node's shape. */
  id: string;
  text: string;
  fill?: string;
  /** Presentation point id of the connector line leading into this node (tree children only). */
  connId?: string;
}

/**
 * Chain geometry: `n` boxes in a row (or column) with a transition arrow between consecutive ones,
 * using the `layoutDef`'s ratios — box height 0.6 of its width, transition 0.4 of a box wide.
 */
export function chainShapes(
  direction: Flowchart['direction'],
  nodes: Labelled[],
  transIds: string[],
  style: SmartArtStyle = 'simple',
): DrawingShape[] {
  const n = nodes.length;
  const horizontal = direction === 'LR' || direction === 'RL';
  const { cx: FW, cy: FH } = DRAWING_FRAME;
  let bw: number;
  let bh: number;
  let gap: number;
  if (horizontal) {
    bw = Math.min(FW / (n + 0.4 * (n - 1)), FH / 0.6);
    bh = 0.6 * bw;
    gap = 0.4 * bw;
  } else {
    bh = Math.min(FH / (n + 0.45 * (n - 1)), 0.6 * FW);
    bw = bh / 0.6;
    gap = 0.45 * bh;
  }
  const total = n * (horizontal ? bw : bh) + (n - 1) * gap;
  const start = ((horizontal ? FW : FH) - total) / 2;
  const reverse = direction === 'RL' || direction === 'BT';
  const font = fitFontSize(nodes.map((nd) => nd.text), bw, bh);
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
  const rootFont = fitFontSize([root.text], rootRect.cx, rootRect.cy);
  shapes.push({
    modelId: root.id,
    x: Math.round(rootRect.x),
    y: Math.round(rootRect.y),
    cx: Math.round(rootRect.cx),
    cy: Math.round(rootRect.cy),
    prst: 'roundRect',
    text: root.text,
    fontSize: rootFont,
    accent: accentOf(style, 'node1', 0),
    ...(root.fill ? { fill: root.fill } : {}),
  });
  const boxW = horizontalFlow ? areaSize : cell;
  const boxH = horizontalFlow ? cell : areaSize;
  const font = fitFontSize(children.map((c) => c.text), boxW, boxH);
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
  const font = fitFontSize(nodes.map((nd) => nd.text), w, h);
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
