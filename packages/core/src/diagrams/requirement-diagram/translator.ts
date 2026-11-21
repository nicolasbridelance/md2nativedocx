/**
 * OOXML translator for a Mermaid `requirementDiagram` (Family B — reuses
 * Dagre for layout and `../../translator/graph-shapes.ts`'s primitives,
 * same rationale as `../class-diagram/translator.ts`'s module doc comment).
 *
 * Each requirement and element is a box drawn as Mermaid's `requirementBox`
 * draws it: a header with the stereotype (`«Functional Requirement»`,
 * `«Element»`) above the name in bold, a divider, then the fields as Mermaid
 * labels them (`ID:`, `Text:`, `Risk:`, `Verification:`; `Type:`,
 * `Doc Ref:`), centred. Mermaid reads every line of the box as Markdown when
 * it draws it, so this translator does too (`parseLabel`); the AST keeps the
 * text as written.
 *
 * Relationships as Mermaid draws them (`requirementDb.ts` `getData`):
 * `contains` is a solid line with a circled cross at the containing end;
 * the 6 others a dashed line with an open arrowhead at the destination.
 * Every line carries its `«type»` label.
 *
 * Colours from `style` / `classDef`, validated before they reach the XML
 * (AGENTS.md rule 2): as in the class diagram, a styled fill covers the
 * whole box, title included; unstyled, the header keeps its own tint.
 */

import dagre from 'dagre';
import { layoutWithinLimits, nodeKey } from '../../layout/graph-limits.js';
import { REQUIREMENT_TYPES } from './types.js';
import type { Requirement, RequirementBoxStyle, RequirementDiagram, RequirementElement } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { parseLabel } from '../../parser/label.js';
import type { LabelToken } from '../../types.js';
import {
  createIdAllocator,
  scaledExtent,
  scaledFontSizeHalfPt,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';
import { connector, edgePoint, ellipse, parallelEdgeOffset, perpendicularUnit, rect, scalePt, shiftPoint, textBoxLines } from '../../translator/graph-shapes.js';
import { textColorFor } from '../../translator/text-color.js';
import { validateHexColor } from '../../translator/xml-escape.js';

const LINE_COLOR = '2F5496';
const TITLE_FILL = 'D9E2F3';
const TITLE_FONT_PX = 13;
const BODY_FONT_PX = 10;
const TITLE_SIZE_HALFPT = 22;
const BODY_SIZE_HALFPT = 18;
const LABEL_SIZE_HALFPT = 16;
const LABEL_FONT_PX = 11;
/** Height of the white background under a relationship label. */
const LABEL_BG_H = 14;
/** How far apart two labels on the same pair of boxes are staggered along their lines. */
const LABEL_ALONG_STEP_PX = 16;

/** Width of a relationship's `«type»` label and its background, measured in the label's own size (8 pt,
 * about 11 px) so the background covers the text. */
function relationshipLabelWidth(type: string): number {
  return estimateTextWidth(`«${type}»`, LABEL_FONT_PX) + 8;
}
/** Height of one line of the name, and of one line of the stereotype or a field. */
const NAME_ROW_H = 22;
const ROW_H = 20;
const COMPARTMENT_PAD_Y = 6;
const PAD_X = 10;
/** Diameter of `contains`'s circled cross (Mermaid's marker: a circle of radius 9 with a cross in it). */
const CONTAINS_MARKER_PX = 18;

const RANKDIR: Readonly<Record<NonNullable<RequirementDiagram['direction']>, 'TB' | 'BT' | 'LR' | 'RL'>> = {
  TD: 'TB',
  BT: 'BT',
  LR: 'LR',
  RL: 'RL',
};

/** Each type keyword as Mermaid displays it in the stereotype (`requirementDb.ts`). */
const TYPE_DISPLAY: Readonly<Record<(typeof REQUIREMENT_TYPES)[number], string>> = {
  requirement: 'Requirement',
  functionalRequirement: 'Functional Requirement',
  interfaceRequirement: 'Interface Requirement',
  performanceRequirement: 'Performance Requirement',
  physicalRequirement: 'Physical Requirement',
  designConstraint: 'Design Constraint',
};

interface BoxContent {
  stereotype: string;
  name: LabelToken[];
  /** One entry per field line, its `Label: ` prefix included. */
  bodyLines: LabelToken[][];
  style: RequirementBoxStyle;
}

interface BoxSize {
  width: number;
  height: number;
  titleH: number;
  bodyH: number;
}

/** A field line as Mermaid composes it (`Text: <value>`), the value read as Markdown. */
function fieldLine(label: string, value: string | undefined): LabelToken[] | null {
  if (value === undefined || value.length === 0) return null;
  const [first, ...rest] = parseLabel(value, { markdown: true }).runs;
  // A plain first run joins the prefix: one run `ID: 1` rather than two.
  if (first !== undefined && !('break' in first) && !first.bold && !first.italic) return [{ text: `${label}: ${first.text}` }, ...rest];
  return [{ text: `${label}: ` }, ...(first === undefined ? [] : [first]), ...rest];
}

function requirementContent(req: Requirement): BoxContent {
  const display = (TYPE_DISPLAY as Record<string, string | undefined>)[req.type] ?? req.type;
  const fields = [fieldLine('ID', req.id), fieldLine('Text', req.text), fieldLine('Risk', req.risk), fieldLine('Verification', req.verifyMethod)];
  return { stereotype: `«${display}»`, name: parseLabel(req.name, { markdown: true }).runs, bodyLines: fields.filter((f) => f !== null), style: req };
}

function elementContent(el: RequirementElement): BoxContent {
  const fields = [fieldLine('Type', el.type), fieldLine('Doc Ref', el.docRef)];
  return { stereotype: '«Element»', name: parseLabel(el.name, { markdown: true }).runs, bodyLines: fields.filter((f) => f !== null), style: el };
}

/** A label's visual lines (split at its line breaks), as plain text for width estimation. */
function visualLines(tokens: LabelToken[]): string[] {
  const lines = [''];
  for (const t of tokens) {
    if ('break' in t) lines.push('');
    else lines[lines.length - 1] += t.text;
  }
  return lines;
}

function sizeForBox(content: BoxContent): BoxSize {
  const nameLines = visualLines(content.name);
  let width = estimateTextWidth(content.stereotype, BODY_FONT_PX) + PAD_X * 2;
  for (const line of nameLines) width = Math.max(width, estimateTextWidth(line, TITLE_FONT_PX) + PAD_X * 2 + 16);
  let bodyRows = 0;
  for (const field of content.bodyLines) {
    for (const line of visualLines(field)) {
      width = Math.max(width, estimateTextWidth(line, BODY_FONT_PX) + PAD_X * 2);
      bodyRows++;
    }
  }
  width = Math.max(100, width);
  const titleH = ROW_H + nameLines.length * NAME_ROW_H + COMPARTMENT_PAD_Y;
  const bodyH = bodyRows === 0 ? 0 : bodyRows * ROW_H + COMPARTMENT_PAD_Y;
  return { width, height: titleH + bodyH, titleH, bodyH };
}

function boxShapes(nextId: () => number, content: BoxContent, size: BoxSize, x: number, y: number, s: number): string[] {
  const parts: string[] = [];
  const bx = scalePt(x, s);
  const by = scalePt(y, s);
  const w = scalePt(size.width, s);
  const titleH = scalePt(size.titleH, s);
  const bodyH = scalePt(size.bodyH, s);
  const totalH = titleH + bodyH;
  const borderW = scaledLineWidthEmu(9525, s);
  const plainName = visualLines(content.name).join(' ');

  const { style } = content;
  const styledFill = style.fill === undefined ? undefined : validateHexColor(style.fill, 'FFFFFF');
  const bodyFill = styledFill ?? 'FFFFFF';
  const titleFill = styledFill ?? TITLE_FILL;
  const line = validateHexColor(style.stroke, LINE_COLOR);
  const textOn = (fill: string): string => validateHexColor(style.textColor, textColorFor(fill));
  const emphasis = { ...(style.bold ? { bold: true } : {}), ...(style.italic ? { italic: true } : {}) };

  parts.push(rect(nextId(), bx, by, w, totalH, bodyFill, line, plainName));
  parts.push(rect(nextId(), bx, by, w, titleH, titleFill, undefined, `${plainName} title`));
  if (bodyH > 0) parts.push(rect(nextId(), bx, by + titleH - Math.round(borderW / 2), w, borderW, line, undefined, 'Divider'));

  const rowH = scalePt(ROW_H, s);
  const headerTop = by + scalePt(COMPARTMENT_PAD_Y / 2, s);
  parts.push(
    textBoxLines(nextId(), bx, headerTop, w, rowH, [content.stereotype], scaledFontSizeHalfPt(BODY_SIZE_HALFPT, s), {
      ...emphasis,
      align: 'ctr',
      color: textOn(titleFill),
    }),
  );
  parts.push(
    textBoxLines(nextId(), bx, headerTop + rowH, w, titleH - rowH - scalePt(COMPARTMENT_PAD_Y, s), [content.name], scaledFontSizeHalfPt(TITLE_SIZE_HALFPT, s), {
      ...emphasis,
      bold: true,
      align: 'ctr',
      color: textOn(titleFill),
    }),
  );

  if (bodyH > 0) {
    const padX = scalePt(PAD_X, s);
    parts.push(
      textBoxLines(nextId(), bx + padX, by + titleH, w - 2 * padX, bodyH, content.bodyLines, scaledFontSizeHalfPt(BODY_SIZE_HALFPT, s), {
        ...emphasis,
        align: 'ctr',
        color: textOn(bodyFill),
      }),
    );
  }
  return parts;
}

/**
 * `contains`'s circled cross, touching the containing box at `tip` and centred on the line towards `toward`
 * (px, canvas coordinates before the offset): a white circle hiding the line under it, then the cross, one
 * stroke along the line and one across it, as Mermaid's `requirement_contains` marker.
 */
function containsMarker(
  nextId: () => number,
  tip: { x: number; y: number },
  toward: { x: number; y: number },
  dx: number,
  dy: number,
  s: number,
): string[] {
  const len = Math.hypot(toward.x - tip.x, toward.y - tip.y) || 1;
  const ux = (toward.x - tip.x) / len;
  const uy = (toward.y - tip.y) / len;
  const r = CONTAINS_MARKER_PX / 2;
  const cx = tip.x + ux * r;
  const cy = tip.y + uy * r;
  const lineW = scaledLineWidthEmu(9525, s);
  const segment = (x1: number, y1: number, x2: number, y2: number): string =>
    connector(nextId(), scalePt(x1 + dx, s), scalePt(y1 + dy, s), scalePt(x2 + dx, s), scalePt(y2 + dy, s), LINE_COLOR, lineW, 'solid', 'none', 'sm', 'none', 'sm');
  return [
    ellipse(nextId(), scalePt(cx - r + dx, s), scalePt(cy - r + dy, s), scalePt(CONTAINS_MARKER_PX, s), scalePt(CONTAINS_MARKER_PX, s), 'FFFFFF', LINE_COLOR),
    segment(tip.x, tip.y, tip.x + ux * CONTAINS_MARKER_PX, tip.y + uy * CONTAINS_MARKER_PX),
    segment(cx - uy * r, cy + ux * r, cx + uy * r, cy - ux * r),
  ];
}

/** Translate a parsed requirement diagram into a self-contained
 * WordprocessingML paragraph. An empty diagram renders a visible note,
 * matching the other Family B translators' zero-content convention —
 * never a silent blank canvas. */
export function translateRequirementDiagramToOoxml(chart: RequirementDiagram, options: CanvasOptions = {}): string {
  const boxContents = new Map<string, BoxContent>();
  for (const req of chart.requirements) boxContents.set(req.name, requirementContent(req));
  for (const el of chart.elements) boxContents.set(el.name, elementContent(el));

  if (boxContents.size === 0) {
    return [
      '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '  <w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>',
      '  <w:r>',
      '    <w:rPr><w:i/><w:color w:val="808080"/><w:sz w:val="18"/></w:rPr>',
      '    <w:t xml:space="preserve">This requirement diagram has no content to render.</w:t>',
      '  </w:r>',
      '</w:p>',
    ].join('\n');
  }

  const sizes = new Map<string, BoxSize>();
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: RANKDIR[chart.direction ?? 'TD'], nodesep: 50, ranksep: 70, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const [name, content] of boxContents) {
    const size = sizeForBox(content);
    sizes.set(name, size);
    g.setNode(nodeKey(name), { width: size.width, height: size.height });
  }
  // Each relationship tells Dagre the room its `«type»` label takes (Dagre gives the label an intermediate
  // rank), as Mermaid's layout does, so the line between two boxes is long enough to show both the label and
  // the arrowhead. Two relationships between the same boxes share one Dagre edge: their labels are staggered
  // along the line (below), so the room is the widest label plus that stagger.
  const roomByEdge = new Map<string, { from: string; to: string; width: number; count: number }>();
  for (const rel of chart.relationships) {
    if (!g.hasNode(nodeKey(rel.from)) || !g.hasNode(nodeKey(rel.to))) continue;
    const key = JSON.stringify([rel.from, rel.to]);
    const room = roomByEdge.get(key) ?? { from: rel.from, to: rel.to, width: 0, count: 0 };
    room.width = Math.max(room.width, relationshipLabelWidth(rel.type));
    room.count++;
    roomByEdge.set(key, room);
  }
  for (const room of roomByEdge.values()) {
    g.setEdge(nodeKey(room.from), nodeKey(room.to), { width: room.width + (room.count - 1) * LABEL_ALONG_STEP_PX, height: LABEL_BG_H, labelpos: 'c' });
  }
  layoutWithinLimits(g, options);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const name of boxContents.keys()) {
    const n = g.node(nodeKey(name)) as { x: number; y: number };
    const size = sizes.get(name)!;
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
  const { scale: s } = scaledExtent(canvasW, canvasH, options);

  const nextId = createIdAllocator();
  const parts: string[] = [];

  // Group relationships by their unordered node pair (`A - x -> B` and
  // `B <- y - A` sit on the same line regardless of direction) so 2+
  // relationships between the same two boxes can be pushed apart instead of
  // drawing exactly on top of each other — see parallelEdgeOffset()'s doc
  // comment for the real-render bug this fixes.
  const pairGroups = new Map<string, number[]>();
  chart.relationships.forEach((rel, i) => {
    const key = [rel.from, rel.to].sort().join('|');
    const group = pairGroups.get(key) ?? [];
    group.push(i);
    pairGroups.set(key, group);
  });
  const offsetIndexByRel = new Map<number, { index: number; count: number }>();
  for (const group of pairGroups.values()) {
    group.forEach((relIndex, i) => offsetIndexByRel.set(relIndex, { index: i, count: group.length }));
  }

  chart.relationships.forEach((rel, relIndex) => {
    const nFrom = g.node(nodeKey(rel.from)) as { x: number; y: number } | undefined;
    const nTo = g.node(nodeKey(rel.to)) as { x: number; y: number } | undefined;
    if (!nFrom || !nTo) return;
    const sizeFrom = sizes.get(rel.from)!;
    const sizeTo = sizes.get(rel.to)!;
    const rawP1 = edgePoint(nFrom.x, nFrom.y, sizeFrom.width / 2, sizeFrom.height / 2, nTo.x, nTo.y);
    const rawP2 = edgePoint(nTo.x, nTo.y, sizeTo.width / 2, sizeTo.height / 2, nFrom.x, nFrom.y);
    const { index, count } = offsetIndexByRel.get(relIndex)!;
    // Perpendicular direction from a canonical (direction-independent) node
    // ordering — see perpendicularUnit()'s doc comment for why deriving it
    // from this relationship's own from/to would cancel out for a reversed
    // duplicate.
    const sortedPair = [rel.from, rel.to].sort();
    const posA = g.node(nodeKey(sortedPair[0]!)) as { x: number; y: number };
    const posB = g.node(nodeKey(sortedPair[1]!)) as { x: number; y: number };
    const { ux, uy } = perpendicularUnit(posA, posB);
    const amount = parallelEdgeOffset(index, count);
    const p1 = shiftPoint(rawP1, ux, uy, amount);
    const p2 = shiftPoint(rawP2, ux, uy, amount);
    const contains = rel.type === 'contains';
    parts.push(
      connector(
        nextId(),
        scalePt(p1.x + dx, s),
        scalePt(p1.y + dy, s),
        scalePt(p2.x + dx, s),
        scalePt(p2.y + dy, s),
        LINE_COLOR,
        scaledLineWidthEmu(9525, s),
        contains ? 'solid' : 'dash',
        'none',
        'sm',
        contains ? 'none' : 'arrow',
        'lg',
      ),
    );
    if (contains) parts.push(...containsMarker(nextId, p1, p2, dx, dy, s));
    const label = `«${rel.type}»`;
    // Perpendicular separation between lines alone isn't reliably wide
    // enough to keep 2+ relationships' `«type»` labels from overlapping
    // each other (found via a real render, test-corpus/visual/fixtures/
    // requirement-diagram.mmd — a 14px line gap left two ~9-character
    // labels garbled together; a fixed larger gap still barely touched).
    // Staggering each label's position *along* the line too (not just
    // perpendicular to it) guarantees real separation regardless of exact
    // text width — but as a *fraction* of the line's own length, this had
    // no visible effect when 2 boxes sit close together (a short line, most
    // of which is already spent on the arrowhead/loose ends): the fixed
    // pixel step below instead guarantees a minimum absolute separation
    // however short the line is.
    //
    // Just like perpendicularUnit()'s own pitfall: this "along" direction
    // MUST also come from the canonical pair (posA -> posB), not from this
    // relationship's own p1/p2 — deriving it from p1/p2 flips sign for a
    // reversed-direction duplicate (`{from:B,to:A}` vs `{from:A,to:B}`),
    // which exactly cancels parallelEdgeOffset's own index-based sign flip
    // and collapses both labels onto the same point again. Caught by
    // instrumenting actual coordinates on the real fixture, not by eye —
    // the first attempt at this fix *looked* like it should have worked
    // and didn't.
    const alongStepPx = LABEL_ALONG_STEP_PX;
    const canonicalDx = posB.x - posA.x;
    const canonicalDy = posB.y - posA.y;
    const canonicalLen = Math.hypot(canonicalDx, canonicalDy) || 1;
    const alongShift = count > 1 ? (index - (count - 1) / 2) * alongStepPx : 0;
    const midX = (p1.x + p2.x) / 2 + (canonicalDx / canonicalLen) * alongShift;
    const midY = (p1.y + p2.y) / 2 + (canonicalDy / canonicalLen) * alongShift;
    const labelWidth = relationshipLabelWidth(rel.type);
    // A white background under the label, as Mermaid gives its relationship labels (`labelBkg`): the label
    // stays readable over its line and the arrowhead next to it.
    parts.push(
      rect(nextId(), scalePt(midX + dx - labelWidth / 2, s), scalePt(midY + dy - LABEL_BG_H / 2, s), scalePt(labelWidth, s), scalePt(LABEL_BG_H, s), 'FFFFFF', undefined, `${label} background`),
    );
    parts.push(
      textBoxLines(
        nextId(),
        scalePt(midX + dx - labelWidth / 2, s),
        scalePt(midY + dy - 10, s),
        scalePt(labelWidth, s),
        scalePt(20, s),
        [label],
        scaledFontSizeHalfPt(LABEL_SIZE_HALFPT, s),
        { align: 'ctr' },
      ),
    );
  });

  for (const [name, content] of boxContents) {
    const n = g.node(nodeKey(name)) as { x: number; y: number };
    const size = sizes.get(name)!;
    parts.push(...boxShapes(nextId, content, size, n.x - size.width / 2 + dx, n.y - size.height / 2 + dy, s));
  }

  const contentXml = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(contentXml, canvasW, canvasH, docPrId, 'Requirement diagram', options);
}
