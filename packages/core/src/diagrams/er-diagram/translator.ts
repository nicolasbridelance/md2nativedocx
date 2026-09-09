/**
 * OOXML translator for a Mermaid `erDiagram` (Family B — reuses Dagre for
 * layout and `../../translator/graph-shapes.ts`'s primitives, same
 * rationale as `../class-diagram/translator.ts`'s module doc comment).
 *
 * Cardinality marker fidelity is a deliberate v1 simplification, same
 * philosophy as `../class-diagram/translator.ts`'s relationship markers:
 * true crow's-foot notation (a circle for "zero", a single perpendicular
 * bar for "one", a splayed 3-line fan for "many", combined in pairs at each
 * end) has no OOXML equivalent at all — `a:headEnd`/`a:tailEnd` offers only
 * `none`/`triangle`/`oval`/`diamond`. Mapped to the closest available preset
 * that keeps all 4 cardinality states visually distinct from each other:
 * `exactly-one` -> no marker, `zero-or-one` -> `oval` (a circle is at least
 * genuinely evocative of crow's-foot's own "zero" glyph), `one-or-many` ->
 * `triangle`, `zero-or-many` -> `diamond` (the remaining bucket — not
 * evocative of anything in real crow's-foot notation, just distinct from
 * the other 3). The identifying (`--`) vs non-identifying (`..`) line style
 * has no such gap: it maps directly and faithfully to solid vs dashed.
 */

import dagre from 'dagre';
import type { ErAttribute, ErCardinality, ErDiagram, ErEntity } from './types.js';
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
const ATTR_FONT_PX = 10;
const TITLE_SIZE_HALFPT = 22;
const ATTR_SIZE_HALFPT = 18;
const LABEL_SIZE_HALFPT = 16;
const TITLE_H = 32;
const ROW_H = 22;
const COMPARTMENT_PAD_Y = 6;
const PAD_X = 10;

const MARKER_BY_CARDINALITY: Readonly<Record<ErCardinality, ArrowMarker>> = {
  'exactly-one': 'none',
  'zero-or-one': 'oval',
  'one-or-many': 'triangle',
  'zero-or-many': 'diamond',
};

interface EntitySize {
  width: number;
  height: number;
  titleH: number;
  attrH: number;
}

function attributeDisplay(a: ErAttribute): string {
  const prefix = a.keys.length > 0 ? `${a.keys.join(',')} ` : '';
  return `${prefix}${a.type} ${a.name}`;
}

function sizeForEntity(entity: ErEntity): EntitySize {
  let width = estimateTextWidth(entity.id, TITLE_FONT_PX) + PAD_X * 2 + 16;
  for (const a of entity.attributes) {
    width = Math.max(width, estimateTextWidth(attributeDisplay(a), ATTR_FONT_PX) + PAD_X * 2);
  }
  width = Math.max(90, width);
  const attrH = entity.attributes.length > 0 ? entity.attributes.length * ROW_H + COMPARTMENT_PAD_Y : 0;
  return { width, height: TITLE_H + attrH, titleH: TITLE_H, attrH };
}

function entityShapes(nextId: () => number, entity: ErEntity, size: EntitySize, x: number, y: number, s: number): string[] {
  const parts: string[] = [];
  const bx = scalePt(x, s);
  const by = scalePt(y, s);
  const w = scalePt(size.width, s);
  const titleH = scalePt(size.titleH, s);
  const attrH = scalePt(size.attrH, s);
  const totalH = titleH + attrH;
  const borderW = scaledLineWidthEmu(9525, s);

  parts.push(rect(nextId(), bx, by, w, totalH, 'FFFFFF', LINE_COLOR, entity.id));
  parts.push(rect(nextId(), bx, by, w, titleH, TITLE_FILL, undefined, `${entity.id} title`));
  if (attrH > 0) {
    parts.push(rect(nextId(), bx, by + titleH - Math.round(borderW / 2), w, borderW, LINE_COLOR, undefined, 'Divider'));
  }

  parts.push(textBoxLines(nextId(), bx, by, w, titleH, [entity.id], scaledFontSizeHalfPt(TITLE_SIZE_HALFPT, s), { bold: true, align: 'ctr' }));

  const padX = scalePt(PAD_X, s);
  if (attrH > 0) {
    parts.push(
      textBoxLines(
        nextId(),
        bx + padX,
        by + titleH,
        w - 2 * padX,
        attrH,
        entity.attributes.map(attributeDisplay),
        scaledFontSizeHalfPt(ATTR_SIZE_HALFPT, s),
      ),
    );
  }
  return parts;
}

/** Translate a parsed ER diagram into a self-contained WordprocessingML
 * paragraph. An empty diagram renders a visible note, matching the other
 * Family B translators' zero-content convention — never a silent blank
 * canvas. */
export function translateErDiagramToOoxml(chart: ErDiagram): string {
  if (chart.entities.length === 0) {
    return [
      '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '  <w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>',
      '  <w:r>',
      '    <w:rPr><w:i/><w:color w:val="808080"/><w:sz w:val="18"/></w:rPr>',
      '    <w:t xml:space="preserve">This ER diagram has no content to render.</w:t>',
      '  </w:r>',
      '</w:p>',
    ].join('\n');
  }

  const sizes = new Map<string, EntitySize>();
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const entity of chart.entities) {
    const size = sizeForEntity(entity);
    sizes.set(entity.id, size);
    g.setNode(entity.id, { width: size.width, height: size.height });
  }
  for (const rel of chart.relationships) {
    if (g.hasNode(rel.from) && g.hasNode(rel.to)) g.setEdge(rel.from, rel.to);
  }
  dagre.layout(g);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const entity of chart.entities) {
    const n = g.node(entity.id) as { x: number; y: number };
    const size = sizes.get(entity.id)!;
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

  for (const rel of chart.relationships) {
    const nFrom = g.node(rel.from) as { x: number; y: number } | undefined;
    const nTo = g.node(rel.to) as { x: number; y: number } | undefined;
    if (!nFrom || !nTo) continue;
    const sizeFrom = sizes.get(rel.from)!;
    const sizeTo = sizes.get(rel.to)!;
    const p1 = edgePoint(nFrom.x, nFrom.y, sizeFrom.width / 2, sizeFrom.height / 2, nTo.x, nTo.y);
    const p2 = edgePoint(nTo.x, nTo.y, sizeTo.width / 2, sizeTo.height / 2, nFrom.x, nFrom.y);
    parts.push(
      connector(
        nextId(),
        scalePt(p1.x + dx, s),
        scalePt(p1.y + dy, s),
        scalePt(p2.x + dx, s),
        scalePt(p2.y + dy, s),
        LINE_COLOR,
        scaledLineWidthEmu(9525, s),
        rel.identifying ? 'solid' : 'dash',
        MARKER_BY_CARDINALITY[rel.fromCardinality],
        'lg',
        MARKER_BY_CARDINALITY[rel.toCardinality],
        'lg',
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

  for (const entity of chart.entities) {
    const n = g.node(entity.id) as { x: number; y: number };
    const size = sizes.get(entity.id)!;
    parts.push(...entityShapes(nextId, entity, size, n.x - size.width / 2 + dx, n.y - size.height / 2 + dy, s));
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, 'ER diagram');
}
