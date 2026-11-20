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
 * Markers: OOXML's `a:headEnd`/`a:tailEnd` are always filled with the line colour, so the hollow UML
 * markers (open triangle for inheritance/realization, open diamond for aggregation) are drawn as their own
 * white polygons over the end of the line (`hollowMarker`, `../../translator/graph-shapes.ts`), while
 * composition (filled diamond) and association/dependency (small triangle) stay line ends. A class box is
 * itself several separate shapes and its lines are not attached to it, so a detached marker loses nothing.
 *
 * Namespaces are Dagre clusters (a compound graph), drawn as dashed boxes behind their classes with the
 * look of a flowchart subgraph, the title in a band Dagre does not know about: as for a subgraph
 * (`layout.ts`'s `reserveSubgraphTitleSpace`), each box grows by {@link NAMESPACE_TITLE_H} and what it holds
 * moves down by as much.
 *
 * `edgePoint`/`connector`/`rect`/`textBoxLines` live in
 * `../../translator/graph-shapes.ts`, not here — extracted once
 * `../state-diagram/translator.ts` needed the exact same primitives (see
 * that module's own doc comment).
 */

import dagre from 'dagre';
import { layoutWithinLimits, nodeKey } from '../../layout/graph-limits.js';
import type { ClassBox, ClassDiagram, ClassMember, ClassNamespace, ClassRelationType } from './types.js';
import { boxShape } from '../../translator/boxes.js';
import { estimateTextWidth } from '../../layout/layout.js';
import {
  createIdAllocator,
  scaledExtent,
  scaledFontSizeHalfPt,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';
import { connector, edgePoint, HOLLOW_SIZE_PX, hollowMarker, rect, scalePt, textBoxLines, type ArrowMarker, type HollowMarker } from '../../translator/graph-shapes.js';

const LINE_COLOR = '2F5496';
const TITLE_FILL = 'D9E2F3';

const TITLE_FONT_PX = 13;
const MEMBER_FONT_PX = 10;
const TITLE_SIZE_HALFPT = 22;
const MEMBER_SIZE_HALFPT = 18;
const LABEL_SIZE_HALFPT = 16;

const TITLE_H = 32;
/** Extra title height for an annotation line (`«interface»`) above the name. */
const ANNOTATION_H = 16;
const ROW_H = 22;
const COMPARTMENT_PAD_Y = 6;
const PAD_X = 10;

/** Namespace box: a flowchart subgraph's look (its E8E8E8 fill at 40 % over white, grey dashed border). */
const NAMESPACE_FILL = 'F6F6F6';
const NAMESPACE_LINE = '999999';
/** Height of a namespace's title band, added above what Dagre laid out. */
const NAMESPACE_TITLE_H = 24;
const NAMESPACE_TITLE_SIZE_HALFPT = 20;

const RANKDIR: Readonly<Record<ClassDiagram['direction'], 'TB' | 'BT' | 'LR' | 'RL'>> = {
  TD: 'TB',
  BT: 'BT',
  LR: 'LR',
  RL: 'RL',
};

const STYLE_BY_TYPE: Readonly<Record<ClassRelationType, { dash: 'solid' | 'dash'; marker: ArrowMarker; size: 'sm' | 'lg'; hollow?: HollowMarker }>> = {
  // Inheritance, realization and aggregation end in a hollow marker drawn as its own shape (a line end is always filled).
  inheritance: { dash: 'solid', marker: 'none', size: 'lg', hollow: 'triangle' },
  realization: { dash: 'dash', marker: 'none', size: 'lg', hollow: 'triangle' },
  composition: { dash: 'solid', marker: 'diamond', size: 'lg' },
  aggregation: { dash: 'solid', marker: 'none', size: 'lg', hollow: 'diamond' },
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

/** The annotation line drawn above the name, `«interface»`, or `undefined`: only the first, as Mermaid does. */
function annotationLine(box: ClassBox): string | undefined {
  const first = box.annotations?.[0];
  return first === undefined ? undefined : `«${first}»`;
}

function boxSizeFor(box: ClassBox): BoxSize {
  let width = estimateTextWidth(box.label, TITLE_FONT_PX) + PAD_X * 2 + 16;
  const annotation = annotationLine(box);
  if (annotation !== undefined) width = Math.max(width, estimateTextWidth(annotation, MEMBER_FONT_PX) + PAD_X * 2);
  for (const m of [...box.attributes, ...box.methods]) {
    width = Math.max(width, estimateTextWidth(memberDisplay(m), MEMBER_FONT_PX) + PAD_X * 2);
  }
  width = Math.max(90, width);
  const attrH = box.attributes.length > 0 ? box.attributes.length * ROW_H + COMPARTMENT_PAD_Y : 0;
  const methodH = box.methods.length > 0 ? box.methods.length * ROW_H + COMPARTMENT_PAD_Y : 0;
  const titleH = TITLE_H + (annotation === undefined ? 0 : ANNOTATION_H);
  return { width, height: titleH + attrH + methodH, titleH, attrH, methodH };
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

  const annotation = annotationLine(box);
  if (annotation === undefined) {
    parts.push(textBoxLines(nextId(), bx, by, w, titleH, [box.label], scaledFontSizeHalfPt(TITLE_SIZE_HALFPT, s), { bold: true, align: 'ctr' }));
  } else {
    // `«interface»` in the member size, then the name in bold, in the same title compartment.
    const annotationH = scalePt(ANNOTATION_H + 4, s);
    parts.push(textBoxLines(nextId(), bx, by + scalePt(2, s), w, annotationH, [annotation], scaledFontSizeHalfPt(MEMBER_SIZE_HALFPT, s), { align: 'ctr' }));
    parts.push(
      textBoxLines(nextId(), bx, by + scalePt(ANNOTATION_H, s), w, titleH - scalePt(ANNOTATION_H, s), [box.label], scaledFontSizeHalfPt(TITLE_SIZE_HALFPT, s), { bold: true, align: 'ctr' }),
    );
  }

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

/** The Dagre key of a namespace cluster: apart from {@link nodeKey}'s, so a class and a namespace may share a name. */
function namespaceKey(id: string): string {
  return `ns:${id}`;
}

/** The namespaces holding at least one class, directly or in a namespace below: the boxes to draw. */
function drawnNamespaces(chart: ClassDiagram): ClassNamespace[] {
  const all = chart.namespaces ?? [];
  const holding = new Set<string>();
  for (const box of chart.classes) {
    // A class in `A.B` makes `A.B` and every ancestor hold something.
    for (let id = box.namespace; id !== undefined; id = all.find((ns) => ns.id === id)?.parent) {
      if (holding.has(id)) break;
      holding.add(id);
    }
  }
  return all.filter((ns) => holding.has(ns.id));
}

/** Translate a parsed class diagram into a self-contained WordprocessingML
 * paragraph. An empty diagram renders a visible note, matching
 * `../venn/translator.ts`'s zero-sets convention — never a silent blank
 * canvas. */
export function translateClassDiagramToOoxml(chart: ClassDiagram, options: CanvasOptions = {}): string {
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
  // Only the namespaces that hold a class, directly or below: an empty one has no box to draw.
  const namespaces = drawnNamespaces(chart);
  const g = new dagre.graphlib.Graph({ compound: namespaces.length > 0 });
  g.setGraph({ rankdir: RANKDIR[chart.direction], nodesep: 50, ranksep: 70, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const box of chart.classes) {
    const size = boxSizeFor(box);
    sizes.set(box.id, size);
    g.setNode(nodeKey(box.id), { width: size.width, height: size.height });
  }
  // Every cluster exists before any parent link (a parent is listed before its children anyway).
  for (const ns of namespaces) g.setNode(namespaceKey(ns.id), { width: 0, height: 0 });
  const drawnIds = new Set(namespaces.map((ns) => ns.id));
  for (const ns of namespaces) if (ns.parent !== undefined && drawnIds.has(ns.parent)) g.setParent(namespaceKey(ns.id), namespaceKey(ns.parent));
  for (const box of chart.classes) if (box.namespace !== undefined && drawnIds.has(box.namespace)) g.setParent(nodeKey(box.id), namespaceKey(box.namespace));
  const linked = new Set<string>();
  for (const rel of chart.relationships) {
    if (g.hasNode(nodeKey(rel.from)) && g.hasNode(nodeKey(rel.to))) {
      g.setEdge(nodeKey(rel.from), nodeKey(rel.to));
      linked.add(rel.from).add(rel.to);
    }
  }
  // Classes with no relation would all land on one rank, a single row shrunk until unreadable (a catalogue
  // of types, a PlantUML package listing). Layout-only edges stack them into columns, a grid of about
  // sqrt(n) columns; the drawing below follows `chart.relationships`, so these edges are never drawn.
  const isolated = chart.classes.map((c) => c.id).filter((id) => !linked.has(id));
  if (isolated.length > 4) {
    const columns = Math.ceil(Math.sqrt(isolated.length));
    for (let i = 0; i + columns < isolated.length; i++) g.setEdge(nodeKey(isolated[i] as string), nodeKey(isolated[i + columns] as string));
  }
  layoutWithinLimits(g, options);

  // Class centres and namespace boxes (top-left), then the title band of every namespace: it grows by
  // NAMESPACE_TITLE_H and everything inside moves down by as much, once per enclosing namespace.
  const centres = new Map<string, { x: number; y: number }>();
  for (const box of chart.classes) {
    const n = g.node(nodeKey(box.id)) as { x: number; y: number };
    centres.set(box.id, { x: n.x, y: n.y });
  }
  const nsBoxes = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const ns of namespaces) {
    const c = g.node(namespaceKey(ns.id)) as { x: number; y: number; width: number; height: number } | undefined;
    if (c && c.width > 0) nsBoxes.set(ns.id, { x: c.x - c.width / 2, y: c.y - c.height / 2, width: c.width, height: c.height });
  }
  for (const ns of namespaces) {
    const box = nsBoxes.get(ns.id);
    if (!box) continue;
    box.height += NAMESPACE_TITLE_H;
    const inside = (id: string | undefined): boolean => id !== undefined && (id === ns.id || id.startsWith(`${ns.id}.`)) && drawnIds.has(id);
    for (const cls of chart.classes) if (inside(cls.namespace)) centres.get(cls.id)!.y += NAMESPACE_TITLE_H;
    for (const other of namespaces) if (other.id !== ns.id && inside(other.id)) {
      const child = nsBoxes.get(other.id);
      if (child) child.y += NAMESPACE_TITLE_H;
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const box of chart.classes) {
    const n = centres.get(box.id)!;
    const size = sizes.get(box.id)!;
    minX = Math.min(minX, n.x - size.width / 2);
    maxX = Math.max(maxX, n.x + size.width / 2);
    minY = Math.min(minY, n.y - size.height / 2);
    maxY = Math.max(maxY, n.y + size.height / 2);
  }
  for (const box of nsBoxes.values()) {
    minX = Math.min(minX, box.x);
    maxX = Math.max(maxX, box.x + box.width);
    minY = Math.min(minY, box.y);
    maxY = Math.max(maxY, box.y + box.height);
  }
  const PAD = 24;
  const canvasW = maxX - minX + 2 * PAD;
  const canvasH = maxY - minY + 2 * PAD;
  const dx = -minX + PAD;
  const dy = -minY + PAD;
  const { scale: s } = scaledExtent(canvasW, canvasH, options);

  const nextId = createIdAllocator();
  const parts: string[] = [];

  // Namespace boxes first, outer before inner (a parent is listed first), so they stay behind; then
  // relationships (z-order = emission order), so class boxes always render on top of the lines feeding into them.
  for (const ns of namespaces) {
    const box = nsBoxes.get(ns.id);
    if (!box) continue;
    const x = scalePt(box.x + dx, s);
    const y = scalePt(box.y + dy, s);
    const w = scalePt(box.width, s);
    parts.push(boxShape(nextId(), x, y, w, scalePt(box.height, s), [''], { fill: NAMESPACE_FILL, line: NAMESPACE_LINE, color: '000000', dashed: true }, MEMBER_FONT_PX, s));
    parts.push(textBoxLines(nextId(), x, y, w, scalePt(NAMESPACE_TITLE_H, s), [ns.label], scaledFontSizeHalfPt(NAMESPACE_TITLE_SIZE_HALFPT, s), { align: 'ctr' }));
  }

  for (const rel of chart.relationships) {
    const nFrom = centres.get(rel.from);
    const nTo = centres.get(rel.to);
    if (!nFrom || !nTo) continue;
    const sizeFrom = sizes.get(rel.from)!;
    const sizeTo = sizes.get(rel.to)!;
    const p1 = edgePoint(nFrom.x, nFrom.y, sizeFrom.width / 2, sizeFrom.height / 2, nTo.x, nTo.y);
    const p2 = edgePoint(nTo.x, nTo.y, sizeTo.width / 2, sizeTo.height / 2, nFrom.x, nFrom.y);
    const style = STYLE_BY_TYPE[rel.type];
    const atFrom = rel.markerEnd === 'from' || rel.markerEnd === 'both';
    const atTo = rel.markerEnd === 'to' || rel.markerEnd === 'both';
    const headMarker = atFrom ? style.marker : 'none';
    const tailMarker = atTo ? style.marker : 'none';
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
    if (style.hollow !== undefined) {
      // A hollow marker sits at each end that carries one, pointing at the box, over the line's last stretch.
      const size = HOLLOW_SIZE_PX[style.hollow];
      for (const [tip, other] of [...(atFrom ? [[p1, p2]] : []), ...(atTo ? [[p2, p1]] : [])] as Array<[typeof p1, typeof p1]>) {
        parts.push(
          hollowMarker(
            nextId(),
            style.hollow,
            { x: scalePt(tip.x + dx, s), y: scalePt(tip.y + dy, s) },
            { x: scalePt(other.x + dx, s), y: scalePt(other.y + dy, s) },
            scalePt(size.length, s),
            scalePt(size.width, s),
            LINE_COLOR,
            scaledLineWidthEmu(9525, s),
          ),
        );
      }
    }
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
    const n = centres.get(box.id)!;
    const size = sizes.get(box.id)!;
    parts.push(...classBoxShapes(nextId, box, size, n.x - size.width / 2 + dx, n.y - size.height / 2 + dy, s));
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, 'Class diagram', options);
}
