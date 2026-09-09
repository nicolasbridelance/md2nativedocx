/**
 * OOXML translator for a Mermaid `classDiagram` (Family B — reuses Dagre for
 * layout and the same `wps:wsp`-on-`wpc:wpc` shape primitives as
 * `../quadrant/translator.ts`/`../venn/translator.ts`/`../mindmap/translator.ts`,
 * with a node rendering extended to a 3-compartment box (name / attributes /
 * methods) instead of a single label, and relationship lines carrying one of
 * 4 distinct end markers instead of a single arrow style.
 *
 * Unlike `mindmap`'s radial layout, a class diagram's relationships form an
 * arbitrary graph (not a tree), so this reuses the `dagre` package directly
 * — already a dependency via `../../layout/layout.ts` (AGENTS.md rule 6: no
 * new dependency) — rather than `layout.ts`'s own `layout()`, which is typed
 * against the flowchart AST specifically and assumes fixed-size or
 * single-line-label node boxes, neither of which holds for a multi-line
 * compartment box.
 *
 * Relationship lines are straight (box-center to box-center, each end
 * trimmed to its own box border via {@link edgePoint}), not Dagre-routed
 * multi-point polylines like `ooxml-translator.ts`'s flowchart edges — a
 * deliberate v1 simplification (see `parser.ts`'s doc comment for the rest
 * of the v1 scope) that keeps this module from having to re-derive
 * flowchart's considerably more involved connector-routing/magnetic-anchor
 * machinery for a diagram family that is typically far smaller (a handful of
 * classes, not hundreds of flowchart nodes).
 *
 * Marker fidelity is also a deliberate v1 simplification: OOXML's
 * `a:headEnd`/`a:tailEnd` markers are solid-filled with no "hollow outline"
 * variant, so strict UML notation (hollow triangle for inheritance/
 * realization, hollow diamond for aggregation vs. filled for composition)
 * isn't reproducible with this project's one confirmed-working connector
 * primitive. Substituted with the closest distinguishable built-in presets —
 * `oval` standing in for aggregation's hollow diamond, and a smaller
 * `triangle` for association/dependency vs. a larger one for inheritance/
 * realization — so all 8 relationship types still render visually distinct
 * from one another, even if not pixel-identical to strict UML notation.
 *
 * `edgePoint`/`connector`/`rect`/`textBoxLines` live in
 * `../../translator/graph-shapes.ts`, not here — extracted once
 * `../state-diagram/translator.ts` needed the exact same primitives (see
 * that module's own doc comment).
 */

import dagre from 'dagre';
import type { ClassBox, ClassDiagram, ClassMember, ClassRelationType } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import {
  createIdAllocator,
  scaledExtent,
  scaledFontSizeHalfPt,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
} from '../../translator/canvas.js';
import { connector, edgePoint, rect, scalePt, textBoxLines, type ArrowMarker } from '../../translator/graph-shapes.js';

const LINE_COLOR = '2F5496';
const TITLE_FILL = 'D9E2F3';

const TITLE_FONT_PX = 13;
const MEMBER_FONT_PX = 10;
const TITLE_SIZE_HALFPT = 22;
const MEMBER_SIZE_HALFPT = 18;
const LABEL_SIZE_HALFPT = 16;

const TITLE_H = 32;
const ROW_H = 22;
const COMPARTMENT_PAD_Y = 6;
const PAD_X = 10;

const RANKDIR: Readonly<Record<ClassDiagram['direction'], 'TB' | 'BT' | 'LR' | 'RL'>> = {
  TD: 'TB',
  BT: 'BT',
  LR: 'LR',
  RL: 'RL',
};

const STYLE_BY_TYPE: Readonly<Record<ClassRelationType, { dash: 'solid' | 'dash'; marker: ArrowMarker; size: 'sm' | 'lg' }>> = {
  inheritance: { dash: 'solid', marker: 'triangle', size: 'lg' },
  realization: { dash: 'dash', marker: 'triangle', size: 'lg' },
  composition: { dash: 'solid', marker: 'diamond', size: 'lg' },
  aggregation: { dash: 'solid', marker: 'oval', size: 'lg' },
  association: { dash: 'solid', marker: 'triangle', size: 'sm' },
  dependency: { dash: 'dash', marker: 'triangle', size: 'sm' },
  link: { dash: 'solid', marker: 'none', size: 'sm' },
  dashedLink: { dash: 'dash', marker: 'none', size: 'sm' },
};

interface BoxSize {
  width: number;
  height: number;
  titleH: number;
  attrH: number;
  methodH: number;
}

function memberDisplay(m: ClassMember): string {
  return m.visibility ? `${m.visibility}${m.text}` : m.text;
}

function boxSizeFor(box: ClassBox): BoxSize {
  let width = estimateTextWidth(box.label, TITLE_FONT_PX) + PAD_X * 2 + 16;
  for (const m of [...box.attributes, ...box.methods]) {
    width = Math.max(width, estimateTextWidth(memberDisplay(m), MEMBER_FONT_PX) + PAD_X * 2);
  }
  width = Math.max(90, width);
  const attrH = box.attributes.length > 0 ? box.attributes.length * ROW_H + COMPARTMENT_PAD_Y : 0;
  const methodH = box.methods.length > 0 ? box.methods.length * ROW_H + COMPARTMENT_PAD_Y : 0;
  return { width, height: TITLE_H + attrH + methodH, titleH: TITLE_H, attrH, methodH };
}

function classBoxShapes(nextId: () => number, box: ClassBox, size: BoxSize, x: number, y: number, s: number): string[] {
  const parts: string[] = [];
  const bx = scalePt(x, s);
  const by = scalePt(y, s);
  const w = scalePt(size.width, s);
  const titleH = scalePt(size.titleH, s);
  const attrH = scalePt(size.attrH, s);
  const methodH = scalePt(size.methodH, s);
  const totalH = titleH + attrH + methodH;
  const borderW = scaledLineWidthEmu(9525, s);

  parts.push(rect(nextId(), bx, by, w, totalH, 'FFFFFF', LINE_COLOR, box.label));
  parts.push(rect(nextId(), bx, by, w, titleH, TITLE_FILL, undefined, `${box.label} title`));

  let dividerY = by + titleH;
  if (attrH > 0) {
    parts.push(rect(nextId(), bx, dividerY - Math.round(borderW / 2), w, borderW, LINE_COLOR, undefined, 'Divider'));
    dividerY += attrH;
  }
  if (methodH > 0) {
    parts.push(rect(nextId(), bx, dividerY - Math.round(borderW / 2), w, borderW, LINE_COLOR, undefined, 'Divider'));
  }

  parts.push(textBoxLines(nextId(), bx, by, w, titleH, [box.label], scaledFontSizeHalfPt(TITLE_SIZE_HALFPT, s), { bold: true, align: 'ctr' }));

  const padX = scalePt(PAD_X, s);
  if (attrH > 0) {
    parts.push(
      textBoxLines(
        nextId(),
        bx + padX,
        by + titleH,
        w - 2 * padX,
        attrH,
        box.attributes.map(memberDisplay),
        scaledFontSizeHalfPt(MEMBER_SIZE_HALFPT, s),
      ),
    );
  }
  if (methodH > 0) {
    parts.push(
      textBoxLines(
        nextId(),
        bx + padX,
        by + titleH + attrH,
        w - 2 * padX,
        methodH,
        box.methods.map(memberDisplay),
        scaledFontSizeHalfPt(MEMBER_SIZE_HALFPT, s),
      ),
    );
  }
  return parts;
}

/** Translate a parsed class diagram into a self-contained WordprocessingML
 * paragraph. An empty diagram renders a visible note, matching
 * `../venn/translator.ts`'s zero-sets convention — never a silent blank
 * canvas. */
export function translateClassDiagramToOoxml(chart: ClassDiagram): string {
  if (chart.classes.length === 0) {
    return [
      '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '  <w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>',
      '  <w:r>',
      '    <w:rPr><w:i/><w:color w:val="808080"/><w:sz w:val="18"/></w:rPr>',
      '    <w:t xml:space="preserve">This class diagram has no content to render.</w:t>',
      '  </w:r>',
      '</w:p>',
    ].join('\n');
  }

  const sizes = new Map<string, BoxSize>();
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: RANKDIR[chart.direction], nodesep: 50, ranksep: 70, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const box of chart.classes) {
    const size = boxSizeFor(box);
    sizes.set(box.id, size);
    g.setNode(box.id, { width: size.width, height: size.height });
  }
  for (const rel of chart.relationships) {
    if (g.hasNode(rel.from) && g.hasNode(rel.to)) g.setEdge(rel.from, rel.to);
  }
  dagre.layout(g);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const box of chart.classes) {
    const n = g.node(box.id) as { x: number; y: number };
    const size = sizes.get(box.id)!;
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

  // Relationships first (z-order = emission order), so class boxes always
  // render on top of the lines feeding into them.
  for (const rel of chart.relationships) {
    const nFrom = g.node(rel.from) as { x: number; y: number } | undefined;
    const nTo = g.node(rel.to) as { x: number; y: number } | undefined;
    if (!nFrom || !nTo) continue;
    const sizeFrom = sizes.get(rel.from)!;
    const sizeTo = sizes.get(rel.to)!;
    const p1 = edgePoint(nFrom.x, nFrom.y, sizeFrom.width / 2, sizeFrom.height / 2, nTo.x, nTo.y);
    const p2 = edgePoint(nTo.x, nTo.y, sizeTo.width / 2, sizeTo.height / 2, nFrom.x, nFrom.y);
    const style = STYLE_BY_TYPE[rel.type];
    const headMarker = rel.markerEnd === 'from' ? style.marker : 'none';
    const tailMarker = rel.markerEnd === 'to' ? style.marker : 'none';
    parts.push(
      connector(
        nextId(),
        scalePt(p1.x + dx, s),
        scalePt(p1.y + dy, s),
        scalePt(p2.x + dx, s),
        scalePt(p2.y + dy, s),
        LINE_COLOR,
        scaledLineWidthEmu(9525, s),
        style.dash,
        headMarker,
        style.size,
        tailMarker,
        style.size,
      ),
    );
    if (rel.label) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const labelWidth = estimateTextWidth(rel.label, 8) + 12;
      parts.push(
        textBoxLines(
          nextId(),
          scalePt(midX + dx - labelWidth / 2, s),
          scalePt(midY + dy - 10, s),
          scalePt(labelWidth, s),
          scalePt(20, s),
          [rel.label],
          scaledFontSizeHalfPt(LABEL_SIZE_HALFPT, s),
          { align: 'ctr' },
        ),
      );
    }
  }

  for (const box of chart.classes) {
    const n = g.node(box.id) as { x: number; y: number };
    const size = sizes.get(box.id)!;
    parts.push(...classBoxShapes(nextId, box, size, n.x - size.width / 2 + dx, n.y - size.height / 2 + dy, s));
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, 'Class diagram');
}
