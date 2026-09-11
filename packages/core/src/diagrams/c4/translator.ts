/**
 * OOXML translator for a Mermaid C4 diagram (Family B — reuses Dagre for
 * layout and `../../translator/graph-shapes.ts`'s primitives, same
 * rationale as `../requirement-diagram/translator.ts`'s module doc
 * comment, which this module's 2-compartment box/relationship-label code
 * mirrors closely).
 *
 * Every element category (Person/System/Container/Component/Node) renders
 * as the same 2-compartment box shape — a bold centered name, then a
 * `[Category, Qualifier: technology]`-style stereotype line plus an
 * optional description line — differing only by fill color per category.
 * Two deliberate v1 simplifications, both surfaced in the stereotype text
 * rather than a distinct shape:
 * - **External elements aren't drawn differently** (no dashed border, no
 *   gray recolor) — `C4Element.external` only changes the stereotype text
 *   (e.g. `[System, External]`). Real C4 tooling (and Mermaid's own
 *   renderer) typically grays out external elements; reproducing that
 *   would mean threading a second border/fill style through `rect()`
 *   (`../../translator/graph-shapes.ts`) for a purely cosmetic distinction
 *   this project's other 2-compartment-box modules don't need either.
 * - **`Db`/`Queue` variants don't get a cylinder/queue shape** — same
 *   "text conveys the semantics, box geometry stays uniform" choice
 *   `requirementDiagram`'s translator already makes for its own stereotype
 *   line, rather than inventing shape-per-field handling this diagram
 *   family has never needed before.
 *
 * **Boundary/Deployment_Node nesting is not rendered as nesting** — see
 * `parser.ts`'s doc comment; every element lays out as an ordinary sibling
 * box in one flat Dagre graph regardless of its `parent`.
 *
 * Relationship lines are straight (box-border to box-border via
 * `edgePoint()`), not Dagre-routed multi-point polylines — the same v1
 * simplification every other Family B translator already makes (see
 * `../class-diagram/translator.ts`'s doc comment). Confirmed via a real
 * render of `test-corpus/visual/fixtures/c4.mmd` (the C4-PlantUML/Mermaid
 * docs' own banking-system example): a relationship that skips a rank
 * (`Rel(customer, spa, ...)`, where `Rel(web_app, spa, "Delivers")`
 * separately forces `spa` a rank below `web_app`) draws straight through
 * `web_app`'s box rather than routing around it, same as a flowchart
 * skip-rank edge would without `ooxml-translator.ts`'s dedicated routing —
 * which this simpler family of translators doesn't have. Not fixed here,
 * consistent with the rest of the family.
 */

import dagre from 'dagre';
import type { C4Category, C4Diagram, C4Element, C4Relationship } from './types.js';
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
const CATEGORY_FILL: Readonly<Record<C4Category, string>> = {
  person: 'FFE699',
  system: 'D9E2F3',
  container: 'C6E0B4',
  component: 'F8CBAD',
  node: 'E2E2E2',
};

const TITLE_FONT_PX = 13;
const BODY_FONT_PX = 10;
const TITLE_SIZE_HALFPT = 22;
const BODY_SIZE_HALFPT = 18;
const LABEL_SIZE_HALFPT = 16;
const TITLE_H = 32;
const ROW_H = 22;
const COMPARTMENT_PAD_Y = 6;
const PAD_X = 10;
const DIAGRAM_TITLE_H = 34;
const DIAGRAM_TITLE_SIZE_HALFPT = 28;

interface BoxSize {
  width: number;
  height: number;
  titleH: number;
  bodyH: number;
}

const CATEGORY_LABEL: Readonly<Record<C4Category, string>> = {
  person: 'Person',
  system: 'System',
  container: 'Container',
  component: 'Component',
  node: 'Node',
};

function stereotypeLine(el: C4Element): string {
  const qualifiers: string[] = [];
  if (el.external) qualifiers.push('External');
  if (el.variant === 'db') qualifiers.push('Database');
  if (el.variant === 'queue') qualifiers.push('Queue');
  const head = qualifiers.length > 0 ? `${CATEGORY_LABEL[el.category]}, ${qualifiers.join(', ')}` : CATEGORY_LABEL[el.category];
  return el.techn ? `[${head}: ${el.techn}]` : `[${head}]`;
}

function bodyLinesFor(el: C4Element): string[] {
  const lines = [stereotypeLine(el)];
  if (el.description) lines.push(el.description);
  return lines;
}

function sizeForElement(el: C4Element, bodyLines: string[]): BoxSize {
  let width = estimateTextWidth(el.label, TITLE_FONT_PX) + PAD_X * 2 + 16;
  for (const line of bodyLines) {
    width = Math.max(width, estimateTextWidth(line, BODY_FONT_PX) + PAD_X * 2);
  }
  width = Math.max(110, width);
  const bodyH = bodyLines.length * ROW_H + COMPARTMENT_PAD_Y;
  return { width, height: TITLE_H + bodyH, titleH: TITLE_H, bodyH };
}

function elementShapes(nextId: () => number, el: C4Element, bodyLines: string[], size: BoxSize, x: number, y: number, s: number): string[] {
  const parts: string[] = [];
  const bx = scalePt(x, s);
  const by = scalePt(y, s);
  const w = scalePt(size.width, s);
  const titleH = scalePt(size.titleH, s);
  const bodyH = scalePt(size.bodyH, s);
  const totalH = titleH + bodyH;
  const borderW = scaledLineWidthEmu(9525, s);
  const fill = CATEGORY_FILL[el.category];

  parts.push(rect(nextId(), bx, by, w, totalH, 'FFFFFF', LINE_COLOR, el.label));
  parts.push(rect(nextId(), bx, by, w, titleH, fill, undefined, `${el.label} title`));
  parts.push(rect(nextId(), bx, by + titleH - Math.round(borderW / 2), w, borderW, LINE_COLOR, undefined, 'Divider'));

  parts.push(textBoxLines(nextId(), bx, by, w, titleH, [el.label], scaledFontSizeHalfPt(TITLE_SIZE_HALFPT, s), { bold: true, align: 'ctr' }));

  const padX = scalePt(PAD_X, s);
  parts.push(
    textBoxLines(nextId(), bx + padX, by + titleH, w - 2 * padX, bodyH, bodyLines, scaledFontSizeHalfPt(BODY_SIZE_HALFPT, s), { align: 'ctr' }),
  );
  return parts;
}

/** Translate a parsed C4 diagram into a self-contained WordprocessingML
 * paragraph. An empty diagram renders a visible note, matching the other
 * Family B translators' zero-content convention — never a silent blank
 * canvas. */
export function translateC4DiagramToOoxml(chart: C4Diagram): string {
  if (chart.elements.length === 0) {
    return [
      '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '  <w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>',
      '  <w:r>',
      '    <w:rPr><w:i/><w:color w:val="808080"/><w:sz w:val="18"/></w:rPr>',
      '    <w:t xml:space="preserve">This C4 diagram has no content to render.</w:t>',
      '  </w:r>',
      '</w:p>',
    ].join('\n');
  }

  const bodyLinesById = new Map<string, string[]>();
  for (const el of chart.elements) bodyLinesById.set(el.id, bodyLinesFor(el));

  const sizes = new Map<string, BoxSize>();
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const el of chart.elements) {
    const size = sizeForElement(el, bodyLinesById.get(el.id)!);
    sizes.set(el.id, size);
    g.setNode(el.id, { width: size.width, height: size.height });
  }
  for (const rel of chart.relationships) {
    if (g.hasNode(rel.from) && g.hasNode(rel.to)) g.setEdge(rel.from, rel.to);
  }
  dagre.layout(g);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const el of chart.elements) {
    const n = g.node(el.id) as { x: number; y: number };
    const size = sizes.get(el.id)!;
    minX = Math.min(minX, n.x - size.width / 2);
    maxX = Math.max(maxX, n.x + size.width / 2);
    minY = Math.min(minY, n.y - size.height / 2);
    maxY = Math.max(maxY, n.y + size.height / 2);
  }
  const PAD = 24;
  const hasTitle = Boolean(chart.title);
  const topMargin = hasTitle ? DIAGRAM_TITLE_H : 0;
  const canvasW = maxX - minX + 2 * PAD;
  const canvasH = maxY - minY + 2 * PAD + topMargin;
  const dx = -minX + PAD;
  const dy = -minY + PAD + topMargin;
  const { scale: s } = scaledExtent(canvasW, canvasH);

  const nextId = createIdAllocator();
  const parts: string[] = [];

  if (chart.title) {
    parts.push(
      textBoxLines(nextId(), 0, 0, scalePt(canvasW, s), scalePt(DIAGRAM_TITLE_H, s), [chart.title], scaledFontSizeHalfPt(DIAGRAM_TITLE_SIZE_HALFPT, s), {
        bold: true,
        align: 'ctr',
      }),
    );
  }

  // Group relationships by their unordered node pair so 2+ relationships
  // between the same two boxes push apart instead of drawing on top of each
  // other — see parallelEdgeOffset()'s doc comment for the real-render bug
  // this fixes (first found on requirementDiagram; the same geometry risk
  // applies here, e.g. a request/response pair of Rels between the same two
  // containers).
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

  chart.relationships.forEach((rel: C4Relationship, relIndex) => {
    const nFrom = g.node(rel.from) as { x: number; y: number } | undefined;
    const nTo = g.node(rel.to) as { x: number; y: number } | undefined;
    if (!nFrom || !nTo) return;
    const sizeFrom = sizes.get(rel.from)!;
    const sizeTo = sizes.get(rel.to)!;
    const rawP1 = edgePoint(nFrom.x, nFrom.y, sizeFrom.width / 2, sizeFrom.height / 2, nTo.x, nTo.y);
    const rawP2 = edgePoint(nTo.x, nTo.y, sizeTo.width / 2, sizeTo.height / 2, nFrom.x, nFrom.y);
    const { index, count } = offsetIndexByRel.get(relIndex)!;
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
        'solid',
        rel.bidirectional ? 'triangle' : 'none',
        'sm',
        'triangle',
        'sm',
      ),
    );

    const label = rel.techn ? `${rel.label} [${rel.techn}]` : rel.label;
    if (label.length === 0) return;
    // Same "along + perpendicular" double-offset as requirementDiagram's
    // translator — perpendicular separation between lines alone isn't
    // reliably wide enough to keep 2+ relationships' labels apart (found on
    // that fixture's real render; the same geometry risk applies here).
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

  for (const el of chart.elements) {
    const n = g.node(el.id) as { x: number; y: number };
    const size = sizes.get(el.id)!;
    parts.push(...elementShapes(nextId, el, bodyLinesById.get(el.id)!, size, n.x - size.width / 2 + dx, n.y - size.height / 2 + dy, s));
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, chart.title ?? 'C4 diagram');
}
