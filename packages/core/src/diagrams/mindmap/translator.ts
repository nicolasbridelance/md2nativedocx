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
import { estimateTextWidth } from '../../layout/layout.js';
import { escapeXml } from '../../translator/xml-escape.js';
import {
  EMU_PER_PX,
  createIdAllocator,
  scaledExtent,
  scaledFontSizeHalfPt,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
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
 * A non-rectangular preset (hexagon, ellipse, the seal/cloud shapes) has
 * meaningfully less usable interior width than its bounding box at the same
 * text width estimate — its slanted/curved edges cut into the space text
 * actually has to sit in, so a box sized like a plain rect's still clips
 * text inside it. Found by real-render audit (2026-09-04): `roundRect`/
 * `rect` labels rendered in full while `hexagon`/`circle`/`bang` labels on
 * the same diagram were visibly cut short even after the font-size-scaling
 * fix above. Extra width factor per shape, tuned against that same render.
 */
const WIDTH_PADDING_BY_SHAPE: Readonly<Record<MindmapShape, number>> = {
  default: 1,
  square: 1,
  rounded: 1,
  circle: 1.45,
  bang: 1.9,
  cloud: 1.5,
  hexagon: 1.35,
};

function boxSizeFor(label: string, depth: number, shape: MindmapShape): { width: number; height: number } {
  const fontPx = depth === 0 ? 16 : depth === 1 ? 13 : 11;
  // +36, not +24: found still-too-tight for a plain rect/roundRect box on a
  // real render (e.g. "Research", "Launch" both lost their last letter) even
  // after the per-shape factor above — a flat estimation-safety margin, not
  // shape-specific.
  const padded = estimateTextWidth(label, fontPx) * WIDTH_PADDING_BY_SHAPE[shape] + 36;
  const width = Math.max(60, padded);
  const height = depth === 0 ? 48 : 32;
  return { width, height };
}

/** Assign every node a position (polar from the root), a size, and a branch
 * color, via one pre-order walk keyed by node identity (safe within a single
 * `translateMindmapToOoxml` call — the AST is not shared/mutated). */
function layoutTree(root: MindmapNode): Map<MindmapNode, NodeLayout> {
  const layout = new Map<MindmapNode, NodeLayout>();
  const rootSize = boxSizeFor(root.label, 0, root.shape);
  layout.set(root, { x: 0, y: 0, depth: 0, width: rootSize.width, height: rootSize.height, color: ROOT_COLOR });

  function place(node: MindmapNode, depth: number, startAngle: number, endAngle: number, color: string): void {
    const weights = node.children.map(subtreeWeight);
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    let angle = startAngle;
    node.children.forEach((child, i) => {
      const span = ((endAngle - startAngle) * (weights[i] ?? 1)) / totalWeight;
      const childAngle = angle + span / 2;
      const radius = depth * RING_GAP;
      const size = boxSizeFor(child.label, depth, child.shape);
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
    '      <w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="ctr"/></w:pPr>',
    '        <w:r>',
    `          <w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="${sizeHalfPt}"/></w:rPr>`,
    `          <w:t xml:space="preserve">${escapeXml(label)}</w:t>`,
    '        </w:r>',
    '      </w:p>',
    '    </w:txbxContent>',
    '  </wps:txbx>',
    '  <wps:bodyPr lIns="45720" tIns="22860" rIns="45720" bIns="22860" anchor="ctr" wrap="none"/>',
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
export function translateMindmapToOoxml(chart: MindmapChart): string {
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
  const { scale: s } = scaledExtent(canvasW, canvasH);

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
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, chart.root.label || 'Mindmap');
}
