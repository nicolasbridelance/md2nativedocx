/**
 * OOXML translator for a Mermaid C4 diagram, drawn the way Mermaid 12.3 draws it (its C4 renderer, read
 * against the official examples; the code here is this project's own).
 *
 * **Layout.** Mermaid does not run a graph layout for C4: it places things in declaration order on a
 * grid. Inside the diagram and inside each frame, the elements come first, `shapesPerRow` to a row
 * (default 4), then the nested frames below them, `boundariesPerRow` to a row (default 2); a frame is as
 * large as what it holds. `UpdateLayoutConfig` changes both numbers. The spacing is tighter than Mermaid's
 * (50 px margins on every side of a shape) so a diagram keeps a readable size once scaled to a page.
 *
 * **Shapes and colours.** One shape per element, its text inside it (so it moves with the shape in Word):
 * a person is a rounded body under a round head, a `Db` a cylinder, a `Queue` a cylinder lying on its
 * side, anything else a rounded rectangle. Fill and outline per category and external flag are Mermaid's
 * (`person_bg_color`...), white text, bold name, then `[Software System]`/`[Container: techn]` and the
 * description in smaller type. A boundary is a dashed frame, a deployment node a solid one, label bold and
 * centred at the top with its `[type]` under it. `UpdateElementStyle` replaces fill, outline and text
 * colour, on an element or a frame.
 *
 * **Relationships** are straight lines between the two shapes' borders, `444444` unless `UpdateRelStyle`
 * says otherwise, arrow at the target (both ends for `BiRel`), label at the middle of the line shifted by
 * `$offsetX`/`$offsetY`, technology in italics under it, numbered `1:`, `2:`... in a `C4Dynamic`. Mermaid
 * curves every line after the first one; here they all stay straight, and two relationships between the
 * same pair are drawn side by side rather than on top of each other. A line can cross a shape it passes:
 * Mermaid's grid does not route around shapes either.
 */

import { estimateTextWidth } from '../../layout/layout.js';
import { createIdAllocator, scaledExtent, scaledFontSizeHalfPt, scaledLineWidthEmu, wrapDrawingCanvas, type CanvasOptions } from '../../translator/canvas.js';
import { customGeometry, circlePath, horizontalCylinderGeometry, roundedRectPath } from '../../translator/custom-geometry.js';
import { connector, edgePoint, parallelEdgeOffset, perpendicularUnit, scalePt, shiftPoint, textBoxLines } from '../../translator/graph-shapes.js';
import { noteParagraph, wrapText } from '../../translator/boxes.js';
import { escapeXml } from '../../translator/xml-escape.js';
import type { C4Boundary, C4Category, C4Diagram, C4Element, C4Relationship } from './types.js';

/** Mermaid's `<category>_bg_color` / `_border_color` defaults, internal then external. */
const PALETTE: Readonly<Record<C4Category, { internal: [string, string]; external: [string, string] }>> = {
  person: { internal: ['08427B', '073B6F'], external: ['686868', '8A8A8A'] },
  system: { internal: ['1168BD', '3C7FC0'], external: ['999999', '8A8A8A'] },
  container: { internal: ['438DD5', '3C7FC0'], external: ['B3B3B3', 'A6A6A6'] },
  component: { internal: ['85BBF0', '78A8D8'], external: ['CCCCCC', 'BFBFBF'] },
};

/** Mermaid's stereotype names (`[Software System]`, not `[System]`). */
const STEREOTYPE: Readonly<Record<C4Category, string>> = {
  person: 'Person',
  system: 'Software System',
  container: 'Container',
  component: 'Component',
};

const ELEMENT_TEXT = 'FFFFFF';
const FRAME_COLOR = '444444';
const REL_COLOR = '444444';

/** Type sizes in pt: Mermaid's 14 px name, its stereotype at 0.75 em and description at 0.82 em. */
const NAME_PT = 10.5;
const STEREO_PT = 8;
const DESCR_PT = 8.5;
const FRAME_LABEL_PT = 12;
const FRAME_TYPE_PT = 10.5;
const FRAME_DESCR_PT = 9;
const REL_PT = 9;
const TITLE_PT = 14;

const pxOf = (pt: number): number => (pt * 4) / 3;
/** Height of one line of text at `pt`, in px (Word's single spacing is about 1.2 em; a little room on top). */
const lineH = (pt: number): number => Math.ceil(pxOf(pt) * 1.3);
const halfPt = (pt: number): number => Math.round(pt * 2);

/** Mermaid's element width; text wraps inside it, less the padding. */
const ELEMENT_W = 216;
const ELEMENT_PAD_X = 16;
const ELEMENT_PAD_Y = 10;
const ELEMENT_MIN_H = 60;
const SECTION_GAP = 3;
/** Rounded-rectangle corner radius (Mermaid's `rx: 12px`). */
const CORNER = 12;
/** Half the height of a `Db` cylinder's top ellipse, and the width of a `Queue` cylinder's end cap. */
const DB_CAP = 10;
const QUEUE_CAP = 8;

const GAP_X = 40;
const GAP_Y = 56;
const FRAME_PAD = 20;
const FRAME_HEADER_GAP = 12;
const CANVAS_PAD = 24;

const DEFAULT_SHAPES_PER_ROW = 4;
const DEFAULT_BOUNDARIES_PER_ROW = 2;

interface TextLine {
  text: string;
  pt: number;
  bold?: boolean;
  italic?: boolean;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ElementLayout extends Box {
  element: C4Element;
  lines: TextLine[];
  /** Top of the body, where the text area starts (below a person's head, a cylinder's top ellipse). */
  bodyTop: number;
  /** Room kept free under the text (a cylinder's bottom curve). */
  bodyBottom: number;
}

/** A frame (or the diagram itself, `boundary` absent): what it holds and, once placed, where. */
interface Block extends Box {
  boundary?: C4Boundary;
  header: TextLine[];
  elements: ElementLayout[];
  children: Block[];
}

function stereotype(el: C4Element): string {
  return el.techn ? `[${STEREOTYPE[el.category]}: ${el.techn}]` : `[${STEREOTYPE[el.category]}]`;
}

/**
 * The size text is measured at, for a size it is written at (both in pt, unscaled): once the drawing is
 * scaled to the page, Word gets whole half-points, so a size can come out a few percent larger than the
 * scale alone gives. Measuring at that rounded-up size keeps the text inside its shape.
 */
type Fit = (pt: number) => number;
const asWritten: Fit = (pt) => pt;

function wrapped(text: string, pt: number, widthPx: number, fit: Fit, style: Omit<TextLine, 'text' | 'pt'> = {}): TextLine[] {
  return wrapText(text, pxOf(fit(pt)), widthPx).map((line) => ({ text: line, pt, ...style }));
}

const textHeight = (lines: TextLine[], fit: Fit): number => lines.reduce((sum, l) => sum + lineH(fit(l.pt)), 0);
const textWidth = (lines: TextLine[], fit: Fit): number =>
  Math.max(0, ...lines.map((l) => estimateTextWidth(l.text, pxOf(fit(l.pt))) * (l.bold ? 1.08 : 1)));

/** Person geometry for a body `w` wide, in Mermaid's proportions: head radius about a quarter of the
 * width (16 to 56 px), sinking into the body by a quarter of that radius. */
function personHead(w: number): { r: number; overlap: number } {
  const r = Math.min(Math.max(w * 0.23, 16), 56);
  return { r, overlap: r * 0.27 };
}

function measureElement(el: C4Element, fit: Fit): ElementLayout {
  // A word longer than the wrap width widens the shape rather than being cut.
  const sections = [el.label, stereotype(el), el.description ?? ''];
  const longestWord = Math.max(
    0,
    ...sections.flatMap((s, i) => s.split(/\s+/).map((word) => estimateTextWidth(word, pxOf(fit([NAME_PT, STEREO_PT, DESCR_PT][i]!))) * (i === 0 ? 1.08 : 1))),
  );
  const w = Math.max(ELEMENT_W, Math.ceil(longestWord) + 2 * ELEMENT_PAD_X);
  const wrapW = w - 2 * ELEMENT_PAD_X;
  const lines: TextLine[] = [
    ...wrapped(el.label, NAME_PT, wrapW, fit, { bold: true }),
    ...wrapped(stereotype(el), STEREO_PT, wrapW, fit),
    ...(el.description ? wrapped(el.description, DESCR_PT, wrapW, fit) : []),
  ];
  const sectionsShown = el.description ? 3 : 2;
  const textH = textHeight(lines, fit) + (sectionsShown - 1) * SECTION_GAP;
  const bodyH = Math.max(ELEMENT_MIN_H, textH + 2 * ELEMENT_PAD_Y);
  let bodyTop = 0;
  let bodyBottom = 0;
  if (el.category === 'person') {
    const { r, overlap } = personHead(w);
    bodyTop = 2 * r - overlap;
  } else if (el.variant === 'db') {
    // The top ellipse is 2 x DB_CAP high; the bottom curve dips DB_CAP under the side lines.
    bodyTop = 2 * DB_CAP;
    bodyBottom = DB_CAP;
  }
  return { element: el, lines, bodyTop, bodyBottom, x: 0, y: 0, w, h: bodyTop + bodyH + bodyBottom };
}

/** Place `items` left to right, `perRow` to a row, from (`x0`, `y0`); returns the extent used. */
function placeRows(items: Box[], perRow: number, x0: number, y0: number): { w: number; h: number } {
  let y = y0;
  let maxW = 0;
  for (let start = 0; start < items.length; start += perRow) {
    const row = items.slice(start, start + perRow);
    let x = x0;
    let rowH = 0;
    for (const item of row) {
      item.x = x;
      item.y = y;
      x += item.w + GAP_X;
      rowH = Math.max(rowH, item.h);
    }
    maxW = Math.max(maxW, x - GAP_X - x0);
    y += rowH + GAP_Y;
  }
  return { w: maxW, h: items.length > 0 ? y - GAP_Y - y0 : 0 };
}

/** Move a block and everything it holds by (`dx`, `dy`). */
function shiftBlock(block: Block, dx: number, dy: number): void {
  block.x += dx;
  block.y += dy;
  for (const el of block.elements) {
    el.x += dx;
    el.y += dy;
  }
  for (const child of block.children) shiftBlock(child, dx, dy);
}

/**
 * Size `block` and place its content relative to its own top-left corner (children are laid out first,
 * then moved into place, so every coordinate ends up relative to this block).
 */
function layoutBlock(block: Block, shapesPerRow: number, boundariesPerRow: number, fit: Fit): void {
  for (const child of block.children) layoutBlock(child, shapesPerRow, boundariesPerRow, fit);
  const framed = block.boundary !== undefined;
  const pad = framed ? FRAME_PAD : 0;
  const headerH = framed ? textHeight(block.header, fit) + FRAME_HEADER_GAP : 0;
  const top = pad + headerH;

  const elementsExtent = placeRows(block.elements, shapesPerRow, pad, top);
  const childTop = top + elementsExtent.h + (elementsExtent.h > 0 && block.children.length > 0 ? GAP_Y : 0);
  // Children were laid out at their own origin: record it, place their boxes, then move their content.
  const origins = block.children.map((c) => ({ x: c.x, y: c.y }));
  const childExtent = placeRows(block.children, boundariesPerRow, pad, childTop);
  block.children.forEach((child, i) => {
    const target = { x: child.x, y: child.y };
    child.x = origins[i]!.x;
    child.y = origins[i]!.y;
    shiftBlock(child, target.x - child.x, target.y - child.y);
  });

  const contentW = Math.max(elementsExtent.w, childExtent.w);
  const contentBottom = childExtent.h > 0 ? childTop + childExtent.h : top + elementsExtent.h;
  block.w = Math.max(contentW, framed ? textWidth(block.header, fit) + 16 : 0, framed ? 120 : 0) + 2 * pad;
  block.h = Math.max(contentBottom + pad, framed ? top + 24 : 0);

  // Centre the content of a frame under its (wider) header, as Mermaid centres the label over it.
  const slack = block.w - 2 * pad - contentW;
  if (slack > 0 && framed) {
    for (const el of block.elements) el.x += slack / 2;
    for (const child of block.children) shiftBlock(child, slack / 2, 0);
  }
}

function frameHeader(b: C4Boundary): TextLine[] {
  const lines: TextLine[] = [];
  if (b.label) lines.push(...b.label.split('\n').map((text) => ({ text, pt: FRAME_LABEL_PT, bold: true })));
  if (b.type) lines.push(...`[${b.type}]`.split('\n').map((text) => ({ text, pt: FRAME_TYPE_PT })));
  if (b.description) lines.push(...b.description.split('\n').map((text) => ({ text, pt: FRAME_DESCR_PT })));
  return lines;
}

interface DiagramLayout {
  root: Block;
  byId: Map<string, Block>;
  elementsById: Map<string, ElementLayout>;
  canvasW: number;
  canvasH: number;
}

/** Build the block tree (the diagram, its frames by `parent`, each holding its elements) and lay it out
 * on the canvas, under the title. */
function layoutDiagram(chart: C4Diagram, fit: Fit): DiagramLayout {
  const root: Block = { header: [], elements: [], children: [], x: 0, y: 0, w: 0, h: 0 };
  const byId = new Map<string, Block>();
  for (const b of chart.boundaries ?? []) byId.set(b.id, { boundary: b, header: frameHeader(b), elements: [], children: [], x: 0, y: 0, w: 0, h: 0 });
  // A parent that names nothing known (or itself, or a cycle built by hand) falls back to the diagram.
  const parentOf = (parent: string | undefined, self?: string): Block => {
    if (parent === undefined || parent === self) return root;
    const seen = new Set<string>(self ? [self] : []);
    let cursor: string | undefined = parent;
    while (cursor !== undefined) {
      if (seen.has(cursor)) return root;
      seen.add(cursor);
      cursor = byId.get(cursor)?.boundary?.parent;
    }
    return byId.get(parent) ?? root;
  };
  for (const block of byId.values()) parentOf(block.boundary!.parent, block.boundary!.id).children.push(block);
  const elementsById = new Map<string, ElementLayout>();
  for (const el of chart.elements) {
    const layout = measureElement(el, fit);
    elementsById.set(el.id, layout);
    parentOf(el.parent).elements.push(layout);
  }
  layoutBlock(root, chart.layout?.shapesPerRow ?? DEFAULT_SHAPES_PER_ROW, chart.layout?.boundariesPerRow ?? DEFAULT_BOUNDARIES_PER_ROW, fit);
  const titleH = chart.title ? lineH(fit(TITLE_PT)) + 12 : 0;
  const canvasW = Math.max(root.w, chart.title ? estimateTextWidth(chart.title, pxOf(fit(TITLE_PT))) * 1.08 : 0) + 2 * CANVAS_PAD;
  const canvasH = root.h + 2 * CANVAS_PAD + titleH;
  shiftBlock(root, CANVAS_PAD + (canvasW - 2 * CANVAS_PAD - root.w) / 2, CANVAS_PAD + titleH);
  return { root, byId, elementsById, canvasW, canvasH };
}

interface Paragraph {
  text: string;
  sizeHalfPt: number;
  bold?: boolean;
  italic?: boolean;
  color: string;
}

/** One `wps:wsp`: a geometry, its fill and outline, and its text inside it (insets in EMU). */
function shapeWithText(
  id: number,
  name: string,
  box: { x: number; y: number; w: number; h: number },
  geometry: string,
  fill: string | undefined,
  line: { color: string; emu: number; dashed?: boolean },
  paragraphs: Paragraph[],
  inset: { t: number; b: number; lr: number },
  anchor: 't' | 'ctr',
): string {
  const fillXml = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>';
  const lnXml = `<a:ln w="${line.emu}"><a:solidFill><a:srgbClr val="${line.color}"/></a:solidFill>${line.dashed ? '<a:prstDash val="dash"/>' : ''}</a:ln>`;
  const body = paragraphs
    .map(
      (p) =>
        '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>' +
        `<w:r><w:rPr>${p.bold ? '<w:b/>' : ''}${p.italic ? '<w:i/>' : ''}<w:color w:val="${p.color}"/><w:sz w:val="${p.sizeHalfPt}"/></w:rPr>` +
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
    `  <wps:bodyPr wrap="square" lIns="${inset.lr}" tIns="${inset.t}" rIns="${inset.lr}" bIns="${inset.b}" anchor="${anchor}"/>`,
    '</wps:wsp>',
  ].join('\n');
}

const roundRectPreset = (w: number, h: number, radius: number): string =>
  `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round((Math.min(radius, Math.min(w, h) / 2) / Math.min(w, h)) * 100000)}"/></a:avLst></a:prstGeom>`;

/** The geometry of an element `w` x `h` px (path units are px, scaled by DrawingML to the shape). */
function elementGeometry(el: ElementLayout): string {
  const { w, h } = el;
  if (el.element.category === 'person') {
    const { r, overlap } = personHead(w);
    const bodyTop = 2 * r - overlap;
    const bodyH = h - bodyTop;
    const bodyR = Math.min(w * 0.177, bodyH * 0.45);
    return customGeometry(w, h, [
      ['norm', roundedRectPath(0, bodyTop, w, bodyH, bodyR)],
      ['norm', circlePath(w / 2, r, r)],
    ]);
  }
  if (el.element.variant === 'db') {
    return `<a:prstGeom prst="can"><a:avLst><a:gd name="adj" fmla="val ${Math.round(((2 * DB_CAP) / Math.min(w, h)) * 100000)}"/></a:avLst></a:prstGeom>`;
  }
  if (el.element.variant === 'queue') return horizontalCylinderGeometry(w, h, QUEUE_CAP);
  return roundRectPreset(w, h, CORNER);
}

/** Translate a parsed C4 diagram into a self-contained WordprocessingML paragraph. An empty diagram
 * renders a visible note, never a silent blank canvas. */
export function translateC4DiagramToOoxml(chart: C4Diagram, options: CanvasOptions = {}): string {
  if (chart.elements.length === 0 && (chart.boundaries ?? []).length === 0) return noteParagraph('This C4 diagram has no content to render.');

  // Lay out, find the scale the page imposes, then lay out again measuring text at the half-point sizes
  // Word will get at that scale. The scale barely moves between passes; three is more than enough.
  let laid = layoutDiagram(chart, asWritten);
  let s = scaledExtent(laid.canvasW, laid.canvasH, options).scale;
  for (let pass = 0; pass < 3 && s < 1; pass++) {
    const scale = s;
    // Only a size rounded up is measured larger; one rounded down keeps its proportional size, whose
    // slack absorbs the gap between this width estimate and Word's own line breaking.
    laid = layoutDiagram(chart, (pt) => Math.max(pt, scaledFontSizeHalfPt(halfPt(pt), scale) / 2 / scale));
    const next = scaledExtent(laid.canvasW, laid.canvasH, options).scale;
    if (next === s) break;
    s = next;
  }
  const { root, byId, elementsById, canvasW, canvasH } = laid;
  const S = (px: number): number => scalePt(px, s);
  const sz = (pt: number): number => scaledFontSizeHalfPt(halfPt(pt), s);

  const nextId = createIdAllocator();
  const parts: string[] = [];

  if (chart.title) {
    parts.push(textBoxLines(nextId(), 0, S(CANVAS_PAD / 2), S(canvasW), S(lineH(TITLE_PT)), [chart.title], sz(TITLE_PT), { bold: true, align: 'ctr' }));
  }

  // Frames, outermost first so an inner frame is drawn over its parent.
  const drawFrame = (block: Block): void => {
    const b = block.boundary!;
    const color = b.style?.text ?? FRAME_COLOR;
    parts.push(
      shapeWithText(
        nextId(),
        b.label || b.id,
        { x: S(block.x), y: S(block.y), w: S(block.w), h: S(block.h) },
        roundRectPreset(block.w, block.h, 3),
        b.style?.fill,
        { color: b.style?.line ?? FRAME_COLOR, emu: scaledLineWidthEmu(9525, s), dashed: b.kind === 'boundary' },
        block.header.map((l) => ({ text: l.text, sizeHalfPt: sz(l.pt), bold: l.bold, color })),
        { t: S(FRAME_PAD / 2), b: 0, lr: S(8) },
        't',
      ),
    );
    for (const child of block.children) drawFrame(child);
  };
  for (const child of root.children) drawFrame(child);

  for (const el of elementsById.values()) {
    const e = el.element;
    const [defFill, defLine] = PALETTE[e.category][e.external ? 'external' : 'internal'];
    const color = e.style?.text ?? ELEMENT_TEXT;
    const paragraphs: Paragraph[] = el.lines.map((l) => ({ text: l.text, sizeHalfPt: sz(l.pt), bold: l.bold, color }));
    parts.push(
      shapeWithText(
        nextId(),
        e.label.split('\n')[0] || e.id,
        { x: S(el.x), y: S(el.y), w: S(el.w), h: S(el.h) },
        elementGeometry(el),
        e.style?.fill ?? defFill,
        { color: e.style?.line ?? defLine, emu: scaledLineWidthEmu(19050, s) },
        paragraphs,
        // Word centres the text in the body: the insets keep it off a head or a cylinder's ends.
        { t: S(el.bodyTop), b: S(el.bodyBottom), lr: S(ELEMENT_PAD_X / 2) },
        'ctr',
      ),
    );
  }

  // Each relationship's endpoints: an element's box, or a frame's.
  const boxOf = (id: string): Box | undefined => elementsById.get(id) ?? byId.get(id);
  const pairGroups = new Map<string, number[]>();
  chart.relationships.forEach((rel, i) => {
    const key = [rel.from, rel.to].sort().join('|');
    pairGroups.set(key, [...(pairGroups.get(key) ?? []), i]);
  });
  const labels: string[] = [];
  chart.relationships.forEach((rel: C4Relationship, relIndex) => {
    const a = boxOf(rel.from);
    const b = boxOf(rel.to);
    if (!a || !b || a === b) return;
    const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const group = pairGroups.get([rel.from, rel.to].sort().join('|'))!;
    const [first, second] = [rel.from, rel.to].sort();
    const posA = first === rel.from ? ca : cb;
    const posB = second === rel.to ? cb : ca;
    const { ux, uy } = perpendicularUnit(posA, posB);
    const amount = parallelEdgeOffset(group.indexOf(relIndex), group.length);
    const p1 = shiftPoint(edgePoint(ca.x, ca.y, a.w / 2, a.h / 2, cb.x, cb.y), ux, uy, amount);
    const p2 = shiftPoint(edgePoint(cb.x, cb.y, b.w / 2, b.h / 2, ca.x, ca.y), ux, uy, amount);
    const lineColor = rel.style?.line ?? REL_COLOR;
    parts.push(
      connector(nextId(), S(p1.x), S(p1.y), S(p2.x), S(p2.y), lineColor, scaledLineWidthEmu(9525, s), 'solid', rel.bidirectional ? 'triangle' : 'none', 'sm', 'triangle', 'sm'),
    );

    const label = chart.level === 'dynamic' ? `${relIndex + 1}: ${rel.label}` : rel.label;
    const textColor = rel.style?.text ?? REL_COLOR;
    const midX = (p1.x + p2.x) / 2 + (rel.style?.offsetX ?? 0);
    const midY = (p1.y + p2.y) / 2 + (rel.style?.offsetY ?? 0);
    const rows: Array<{ text: string; italic: boolean }> = [
      ...(label ? label.split('\n').map((text) => ({ text, italic: false })) : []),
      ...(rel.techn ? `[${rel.techn}]`.split('\n').map((text) => ({ text, italic: true })) : []),
    ];
    if (rows.length === 0) return;
    const rowH = lineH(REL_PT);
    const top = midY - rowH / 2;
    rows.forEach((row, i) => {
      const w = estimateTextWidth(row.text, pxOf(REL_PT)) + 12;
      labels.push(
        textBoxLines(nextId(), S(midX - w / 2), S(top + i * rowH), S(w), S(rowH), [row.text], sz(REL_PT), { align: 'ctr', italic: row.italic, color: textColor }),
      );
    });
  });
  parts.push(...labels);

  const docPrId = nextId();
  return wrapDrawingCanvas(parts.join('\n'), canvasW, canvasH, docPrId, chart.title ?? 'C4 diagram', options);
}
