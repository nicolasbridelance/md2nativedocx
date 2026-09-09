/**
 * OOXML translator for a Mermaid `requirementDiagram` (Family B — reuses
 * Dagre for layout and `../../translator/graph-shapes.ts`'s primitives,
 * same rationale as `../class-diagram/translator.ts`'s module doc comment).
 *
 * Both requirements and elements render as a 2-compartment box (name /
 * a stereotype + field list, `«requirement»`/`«element»` UML-style), and
 * every relationship renders the same way regardless of its 7 possible
 * type keywords: a dashed line with a small triangle at the destination
 * end and the type shown as a `«type»` label — SysML/UML tools draw each
 * of the 7 relationship types with its own distinct arrowhead/stereotype
 * combination, but Mermaid's own renderer does not (confirmed on
 * mermaid.js.org/syntax/requirementDiagram.html — every example renders
 * identically styled dashed arrows, differing only in their `«label»`).
 * Matching Mermaid's own fidelity level here, not inventing a distinction
 * Mermaid itself doesn't draw.
 */

import dagre from 'dagre';
import type { Requirement, RequirementDiagram, RequirementElement } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import {
  createIdAllocator,
  scaledExtent,
  scaledFontSizeHalfPt,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
} from '../../translator/canvas.js';
import { connector, edgePoint, parallelEdgeOffset, perpendicularUnit, rect, scalePt, shiftPoint, textBoxLines } from '../../translator/graph-shapes.js';

const LINE_COLOR = '2F5496';
const TITLE_FILL = 'D9E2F3';
const TITLE_FONT_PX = 13;
const BODY_FONT_PX = 10;
const TITLE_SIZE_HALFPT = 22;
const BODY_SIZE_HALFPT = 18;
const LABEL_SIZE_HALFPT = 16;
const TITLE_H = 32;
const ROW_H = 22;
const COMPARTMENT_PAD_Y = 6;
const PAD_X = 10;

interface BoxContent {
  name: string;
  bodyLines: string[];
}

interface BoxSize {
  width: number;
  height: number;
  titleH: number;
  bodyH: number;
}

function requirementBody(req: Requirement): string[] {
  const lines = [`«${req.type}»`];
  if (req.id) lines.push(`id: ${req.id}`);
  if (req.text) lines.push(`text: ${req.text}`);
  if (req.risk) lines.push(`risk: ${req.risk}`);
  if (req.verifyMethod) lines.push(`verifyMethod: ${req.verifyMethod}`);
  return lines;
}

function elementBody(el: RequirementElement): string[] {
  const lines = ['«element»'];
  if (el.type) lines.push(`type: ${el.type}`);
  if (el.docRef) lines.push(`docRef: ${el.docRef}`);
  return lines;
}

function sizeForBox(content: BoxContent): BoxSize {
  let width = estimateTextWidth(content.name, TITLE_FONT_PX) + PAD_X * 2 + 16;
  for (const line of content.bodyLines) {
    width = Math.max(width, estimateTextWidth(line, BODY_FONT_PX) + PAD_X * 2);
  }
  width = Math.max(100, width);
  const bodyH = content.bodyLines.length * ROW_H + COMPARTMENT_PAD_Y;
  return { width, height: TITLE_H + bodyH, titleH: TITLE_H, bodyH };
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

  parts.push(rect(nextId(), bx, by, w, totalH, 'FFFFFF', LINE_COLOR, content.name));
  parts.push(rect(nextId(), bx, by, w, titleH, TITLE_FILL, undefined, `${content.name} title`));
  parts.push(rect(nextId(), bx, by + titleH - Math.round(borderW / 2), w, borderW, LINE_COLOR, undefined, 'Divider'));

  parts.push(textBoxLines(nextId(), bx, by, w, titleH, [content.name], scaledFontSizeHalfPt(TITLE_SIZE_HALFPT, s), { bold: true, align: 'ctr' }));

  const padX = scalePt(PAD_X, s);
  parts.push(
    textBoxLines(nextId(), bx + padX, by + titleH, w - 2 * padX, bodyH, content.bodyLines, scaledFontSizeHalfPt(BODY_SIZE_HALFPT, s)),
  );
  return parts;
}

/** Translate a parsed requirement diagram into a self-contained
 * WordprocessingML paragraph. An empty diagram renders a visible note,
 * matching the other Family B translators' zero-content convention —
 * never a silent blank canvas. */
export function translateRequirementDiagramToOoxml(chart: RequirementDiagram): string {
  const boxContents = new Map<string, BoxContent>();
  for (const req of chart.requirements) boxContents.set(req.name, { name: req.name, bodyLines: requirementBody(req) });
  for (const el of chart.elements) boxContents.set(el.name, { name: el.name, bodyLines: elementBody(el) });

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
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const [name, content] of boxContents) {
    const size = sizeForBox(content);
    sizes.set(name, size);
    g.setNode(name, { width: size.width, height: size.height });
  }
  for (const rel of chart.relationships) {
    if (g.hasNode(rel.from) && g.hasNode(rel.to)) g.setEdge(rel.from, rel.to);
  }
  dagre.layout(g);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const name of boxContents.keys()) {
    const n = g.node(name) as { x: number; y: number };
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
  const { scale: s } = scaledExtent(canvasW, canvasH);

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
    const nFrom = g.node(rel.from) as { x: number; y: number } | undefined;
    const nTo = g.node(rel.to) as { x: number; y: number } | undefined;
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
    const posA = g.node(sortedPair[0]!) as { x: number; y: number };
    const posB = g.node(sortedPair[1]!) as { x: number; y: number };
    const { ux, uy } = perpendicularUnit(posA, posB);
    const amount = parallelEdgeOffset(index, count);
    const p1 = shiftPoint(rawP1, ux, uy, amount);
    const p2 = shiftPoint(rawP2, ux, uy, amount);
    parts.push(
      connector(
        nextId(),
        scalePt(p1.x + dx, s),
        scalePt(p1.y + dy, s),
        scalePt(p2.x + dx, s),
        scalePt(p2.y + dy, s),
        LINE_COLOR,
        scaledLineWidthEmu(9525, s),
        'dash',
        'none',
        'sm',
        'triangle',
        'sm',
      ),
    );
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
    const alongStepPx = 16;
    const canonicalDx = posB.x - posA.x;
    const canonicalDy = posB.y - posA.y;
    const canonicalLen = Math.hypot(canonicalDx, canonicalDy) || 1;
    const alongShift = count > 1 ? (index - (count - 1) / 2) * alongStepPx : 0;
    const midX = (p1.x + p2.x) / 2 + (canonicalDx / canonicalLen) * alongShift;
    const midY = (p1.y + p2.y) / 2 + (canonicalDy / canonicalLen) * alongShift;
    const labelWidth = estimateTextWidth(label, 8) + 12;
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
    const n = g.node(name) as { x: number; y: number };
    const size = sizes.get(name)!;
    parts.push(...boxShapes(nextId, content, size, n.x - size.width / 2 + dx, n.y - size.height / 2 + dy, s));
  }

  const contentXml = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(contentXml, canvasW, canvasH, docPrId, 'Requirement diagram');
}
