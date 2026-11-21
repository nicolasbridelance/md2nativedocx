/**
 * OOXML translator for a Mermaid `mindmap`
 * (`docs/smartart-full-catalog-cross-mermaid.md` archetype #5, "Radial").
 *
 * Same "plain OOXML shapes, not SmartArt `dgm:`" strategy as
 * `../quadrant/translator.ts`/`../venn/translator.ts`, for the same reason:
 * this project's existing SmartArt generators (`chain.ts`/`tree.ts`/
 * `cycle.ts`) can't draw a connector line between shapes at all (a real,
 * documented limitation of their self-authored `dgm:layoutDef`s), while a
 * mindmap's branch lines are exactly the point — plain `wps:cxnSp` straight
 * connectors, the same primitive the flowchart translator already relies on,
 * draw them directly with no such gap.
 *
 * Layout is a classic radial/balloon tree, not a Dagre ranking: every node's
 * angle is its assigned angular sector's midpoint (siblings split their
 * parent's sector proportional to subtree size), and its radius is a fixed
 * step per depth — so every node at the same depth sits on the same ring,
 * regardless of Dagre or any other graph-layout engine. No depth cap (unlike
 * `tree.ts`'s SmartArt generator, which is capped at 2 by a fixed-height
 * `layoutDef` split): a computed angular sector has no such ceiling. Dense
 * mindmaps (many siblings at one level) are not collision-checked against
 * each other in v1 — acceptable given this replaces a previously silent
 * mis-parse (`docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §1), not a
 * previously-correct rendering.
 */

import type { MindmapChart, MindmapNode, MindmapShape } from './types.js';
import type { LabelToken } from '../../types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { escapeXml } from '../../translator/xml-escape.js';
import { renderLabelRuns } from '../../translator/label-runs.js';
import { wrapText } from '../../translator/boxes.js';
import {
  createIdAllocator,
  EMU_PER_PX,
  scaledExtent,
  scaledFontSizeHalfPt,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';

const RING_GAP = 170;
const ROOT_COLOR = '404040';
const BRANCH_COLORS = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '7030A0', 'C00000', '2E75B6', '548235'];

const PRST_BY_SHAPE: Readonly<Record<MindmapShape, string>> = {
  default: 'roundRect',
  square: 'rect',
  rounded: 'roundRect',
  circle: 'ellipse',
  bang: 'irregularSeal2',
  cloud: 'cloud',
  hexagon: 'hexagon',
};

interface Point {
  x: number;
  y: number;
}

interface NodeLayout extends Point {
  depth: number;
  width: number;
  height: number;
  color: string;
}

function subtreeWeight(node: MindmapNode): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((sum, child) => sum + subtreeWeight(child), 0);
}

function fontSizeForDepth(depth: number): number {
  if (depth === 0) return 28; // root, half-pt
  if (depth === 1) return 22;
  return 18;
}

/**
 * Share of a preset's box that Word lays text out in, per axis: the preset's text rectangle
 * (`a:rect` in ECMA-376 Part 1, `presetShapeDefinitions.xml`). A curved or spiked preset keeps its
 * text well inside its outline: `ellipse` in the inscribed square (cos 45° of each axis), `cloud` in
 * 2977..17087 x 3262..17337 of a 21600 grid, `irregularSeal2` (the bang) in 5333..16733 x 7267..14783.
 * Sizing such a shape like a rectangle cut its text (seen in Word, 2026-11-21: the root ellipse showed
 * "mindma", a bang lost its third line). `hexagon` is computed apart ({@link shapeBox}): its text width
 * depends on its height. `roundRect` insets its text by a few px only, absorbed by the padding.
 */
const TEXT_AREA_SHARE: Readonly<Record<Exclude<MindmapShape, 'hexagon'>, { x: number; y: number }>> = {
  default: { x: 1, y: 1 },
  square: { x: 1, y: 1 },
  rounded: { x: 1, y: 1 },
  circle: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  cloud: { x: (17087 - 2977) / 21600, y: (17337 - 3262) / 21600 },
  bang: { x: (16733 - 5333) / 21600, y: (14783 - 7267) / 21600 },
};

/** Mermaid's `mindmap.maxNodeWidth`: a label wider than this wraps onto several lines. */
const MAX_TEXT_WIDTH_PX = 200;
/** Bold glyphs are wider than the regular ones `estimateTextWidth` is calibrated on. */
const BOLD_WIDTH_FACTOR = 1.1;
/**
 * `estimateTextWidth` is an average per character class; Word's real glyphs run wider on some words
 * (a label one letter short of fitting wraps, then overflows its box). Same role as the +36 px margin the
 * rectangles had before 2026-11-21, made proportional so a long line gets more room than a short one.
 */
const TEXT_WIDTH_SAFETY = 1.15;
/** The node's text insets (`bodyPr` `lIns`/`rIns` 45720 EMU, `tIns`/`bIns` 22860 EMU), in px. */
const INSET_X_PX = 4.8;
const INSET_Y_PX = 2.4;
/** Room between the text area and a rectangle's border, each side, in px. */
const PAD_X_PX = 10;
const PAD_Y_PX = 6;
/** Word's single line spacing, as a multiple of the font size. */
const LINE_SPACING = 1.2;

/** The label as rich text: the parser's runs, or the plain label of a node built by hand. */
function runsOf(node: MindmapNode): LabelToken[] {
  return node.labelRuns ?? [{ text: node.label }];
}

/** The label's lines as Word will wrap them: one per forced break, each wrapped at `MAX_TEXT_WIDTH_PX`. */
function labelLines(runs: LabelToken[], fontPx: number): string[] {
  const forced: string[] = [''];
  for (const token of runs) {
    if ('break' in token) forced.push('');
    else forced[forced.length - 1] += token.text;
  }
  return forced.flatMap((line) => wrapText(line, fontPx, MAX_TEXT_WIDTH_PX));
}

/** The size of a node's text in px: the half-points written into its runs, at 96 px per inch. */
function fontPxForDepth(depth: number): number {
  return (fontSizeForDepth(depth) / 2) * (96 / 72);
}

/** The preset's box around a text area of `textWidth` x `textHeight` px ({@link TEXT_AREA_SHARE}). */
function shapeBox(shape: MindmapShape, textWidth: number, textHeight: number): { width: number; height: number } {
  if (shape === 'hexagon') {
    // Text rectangle of a hexagon wider than tall, default adjust: full height, each side point taking
    // (w + h) / 12 of the width. Solved for w: w = (textWidth + h / 6) * 6 / 5.
    const height = textHeight + 2 * PAD_Y_PX;
    return { width: ((textWidth + 2 * PAD_X_PX + height / 6) * 6) / 5, height };
  }
  const share = TEXT_AREA_SHARE[shape];
  // A rectangle needs some room between its text and its border; a curved preset's outline already
  // lies outside its text rectangle.
  const padX = share.x === 1 ? PAD_X_PX : 0;
  const padY = share.y === 1 ? PAD_Y_PX : 0;
  return { width: (textWidth + 2 * padX) / share.x, height: (textHeight + 2 * padY) / share.y };
}

/**
 * A node's box: its label wrapped like Mermaid's (at `MAX_TEXT_WIDTH_PX`), measured at the font size the
 * runs are written at, then the preset's box around that text.
 */
function boxSizeFor(node: MindmapNode, depth: number): { width: number; height: number } {
  const fontPx = fontPxForDepth(depth);
  const runs = runsOf(node);
  const boldFactor = runs.some((t) => !('break' in t) && t.bold) ? BOLD_WIDTH_FACTOR : 1;
  const lines = labelLines(runs, fontPx);
  const widest = Math.max(0, ...lines.map((line) => estimateTextWidth(line, fontPx)));
  const textWidth = widest * boldFactor * TEXT_WIDTH_SAFETY + 2 * INSET_X_PX;
  const textHeight = Math.max(1, lines.length) * fontPx * LINE_SPACING + 2 * INSET_Y_PX;
  const box = shapeBox(node.shape, textWidth, textHeight);
  return { width: Math.max(60, box.width), height: Math.max(depth === 0 ? 48 : 32, box.height) };
}

/** Assign every node a position (polar from the root), a size, and a branch
 * color, via one pre-order walk keyed by node identity (safe within a single
 * `translateMindmapToOoxml` call — the AST is not shared/mutated). */
function layoutTree(root: MindmapNode): Map<MindmapNode, NodeLayout> {
  const layout = new Map<MindmapNode, NodeLayout>();
  const rootSize = boxSizeFor(root, 0);
  layout.set(root, { x: 0, y: 0, depth: 0, width: rootSize.width, height: rootSize.height, color: ROOT_COLOR });

  function place(node: MindmapNode, depth: number, startAngle: number, endAngle: number, color: string): void {
    const weights = node.children.map(subtreeWeight);
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    let angle = startAngle;
    node.children.forEach((child, i) => {
      const span = ((endAngle - startAngle) * (weights[i] ?? 1)) / totalWeight;
      const childAngle = angle + span / 2;
      const radius = depth * RING_GAP;
      const size = boxSizeFor(child, depth);
      // depth === 1 here means `node` is the root itself (place() is called
      // with depth=1 for root's own children, see the initial call below) --
      // that's the one point where a fresh branch color is picked; every
      // deeper level just inherits its parent's color.
      const childColor = depth === 1 ? (BRANCH_COLORS[i % BRANCH_COLORS.length] ?? ROOT_COLOR) : color;
      layout.set(child, {
        x: radius * Math.cos(childAngle),
        y: radius * Math.sin(childAngle),
        depth,
        width: size.width,
        height: size.height,
        color: childColor,
      });
      place(child, depth + 1, angle, angle + span, childColor);
      angle += span;
    });
  }

  place(root, 1, 0, 2 * Math.PI, ROOT_COLOR);
  return layout;
}

function scalePt(px: number, factor: number): number {
  return Math.round(px * EMU_PER_PX * factor);
}

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

function nodeShape(
  id: number,
  x: number,
  y: number,
  w: number,
  h: number,
  prst: string,
  colorHex: string,
  label: string,
  runs: LabelToken[],
  sizeHalfPt: number,
  borderWidthEmu: number,
): string {
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="${escapeXml(label)}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    `    <a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>`,
    `    <a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill>`,
    `    <a:ln w="${borderWidthEmu}"><a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill></a:ln>`,
    '  </wps:spPr>',
    style(),
    '  <wps:txbx>',
    '    <w:txbxContent>',
    '      <w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>',
    renderLabelRuns(runs, 'FFFFFF', sizeHalfPt),
    '      </w:p>',
    '    </w:txbxContent>',
    '  </wps:txbx>',
    // `wrap="square"`, never `"none"`: real Word shrinks a `wrap="none"` box to its text (see
    // `unwrappedTextFrame` in `canvas.ts`); `boxSizeFor` sizes the box to the lines Word will wrap the text to.
    '  <wps:bodyPr lIns="45720" tIns="22860" rIns="45720" bIns="22860" anchor="ctr" wrap="square"/>',
    '</wps:wsp>',
  ].join('\n');
}

/**
 * A straight parent-child branch line. Uses `wps:wsp` + `wps:cNvCnPr` (a
 * plain shape declared as a connector), matching `ooxml-translator.ts`'s
 * `renderEdge` — **not** `wps:cxnSp`, a schema-valid DrawingML element that
 * turned out not to render at all inside this project's `wpc:wpc` canvas
 * under LibreOffice (found by real-render audit: every branch line was
 * silently missing). `wps:wsp` is this project's one confirmed-working
 * connector wrapper; no other element has been verified here.
 */
function connector(
  id: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colorHex: string,
  widthEmu: number,
): string {
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const w = Math.max(1, Math.abs(x2 - x1));
  const h = Math.max(1, Math.abs(y2 - y1));
  const flip = (x2 - x1) * (y2 - y1) < 0;
  const flipAttr = flip ? ' flipV="1"' : '';
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Connector ${id}"/>`,
    '  <wps:cNvCnPr/>',
    '  <wps:spPr>',
    `    <a:xfrm${flipAttr}><a:off x="${minX}" y="${minY}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`,
    '    <a:prstGeom prst="line"><a:avLst/></a:prstGeom>',
    `    <a:ln w="${widthEmu}"><a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill></a:ln>`,
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

/** Translate a parsed mindmap into a self-contained WordprocessingML
 * paragraph. `null`-root charts render a visible note (never a silent blank
 * canvas), matching `../venn/translator.ts`'s zero-sets convention. */
export function translateMindmapToOoxml(chart: MindmapChart, options: CanvasOptions = {}): string {
  if (!chart.root) {
    return [
      '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '  <w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>',
      '  <w:r>',
      '    <w:rPr><w:i/><w:color w:val="808080"/><w:sz w:val="18"/></w:rPr>',
      '    <w:t xml:space="preserve">This mindmap has no content to render.</w:t>',
      '  </w:r>',
      '</w:p>',
    ].join('\n');
  }

  const nextId = createIdAllocator();
  const positions = layoutTree(chart.root);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x - p.width / 2);
    maxX = Math.max(maxX, p.x + p.width / 2);
    minY = Math.min(minY, p.y - p.height / 2);
    maxY = Math.max(maxY, p.y + p.height / 2);
  }
  const PAD = 30;
  const canvasW = maxX - minX + 2 * PAD;
  const canvasH = maxY - minY + 2 * PAD;
  const dx = -minX + PAD;
  const dy = -minY + PAD;
  const { scale: s } = scaledExtent(canvasW, canvasH, options);

  const parts: string[] = [];

  // Connectors first (z-order = emission order), parent -> child, so nodes
  // always render on top of the lines feeding into them.
  function emitConnectors(node: MindmapNode): void {
    const p = positions.get(node);
    if (!p) return;
    for (const child of node.children) {
      const c = positions.get(child);
      if (!c) continue;
      parts.push(
        connector(
          nextId(),
          scalePt(p.x + dx, s),
          scalePt(p.y + dy, s),
          scalePt(c.x + dx, s),
          scalePt(c.y + dy, s),
          c.color,
          scaledLineWidthEmu(19050, s),
        ),
      );
      emitConnectors(child);
    }
  }
  emitConnectors(chart.root);

  function emitNodes(node: MindmapNode): void {
    const p = positions.get(node);
    if (p) {
      parts.push(
        nodeShape(
          nextId(),
          scalePt(p.x - p.width / 2 + dx, s),
          scalePt(p.y - p.height / 2 + dy, s),
          scalePt(p.width, s),
          scalePt(p.height, s),
          PRST_BY_SHAPE[node.shape],
          p.color,
          node.label,
          runsOf(node),
          scaledFontSizeHalfPt(fontSizeForDepth(p.depth), s),
          scaledLineWidthEmu(9525, s),
        ),
      );
    }
    for (const child of node.children) emitNodes(child);
  }
  emitNodes(chart.root);

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, chart.root.label || 'Mindmap', options);
}
