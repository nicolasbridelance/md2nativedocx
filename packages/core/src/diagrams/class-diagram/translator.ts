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
import { validateHexColor } from '../../translator/xml-escape.js';
import { textColorFor } from '../../translator/text-color.js';
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
/** Height of the white background under a relationship label (8 pt text), as in the requirement diagram. */
const LABEL_BG_H = 14;

const TITLE_H = 32;
/** Where a cardinality sits: this far along the line from its end (past a marker), and this far to one side. */
const CARDINALITY_ALONG = 22;
const CARDINALITY_ASIDE = 12;
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
/** Note: Mermaid's default note colours (pale yellow, olive border), folded corner, left-aligned lines. */
const NOTE_FILL = 'FFF5AD';
const NOTE_LINE = 'AAAA33';
const NOTE_FONT_PX = 11;
const NOTE_LINE_H = 18;
const NOTE_PAD = 10;
/** Diameter of a lollipop's circle, and the gap between it and its name. */
const LOLLIPOP_D = 14;
const LOLLIPOP_LABEL_GAP = 6;

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
  // Drawn apart (a circle at the interface's end, see `lollipopShapes`); never through this table.
  lollipop: { dash: 'solid', marker: 'none', size: 'sm' },
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

  // Colours from `style` / `classDef`, validated before they reach the XML (AGENTS.md rule 2). A styled fill
  // covers the whole box, title included, as in Mermaid; unstyled, the title band keeps its own tint. Text
  // is the `color:` given, else black or white to suit what it sits on.
  const styledFill = box.fill === undefined ? undefined : validateHexColor(box.fill, 'FFFFFF');
  const bodyFill = styledFill ?? 'FFFFFF';
  const titleFill = styledFill ?? TITLE_FILL;
  const line = validateHexColor(box.stroke, LINE_COLOR);
  const textOn = (fill: string): string => validateHexColor(box.textColor, textColorFor(fill));

  parts.push(rect(nextId(), bx, by, w, totalH, bodyFill, line, box.label));
  parts.push(rect(nextId(), bx, by, w, titleH, titleFill, undefined, `${box.label} title`));

  let dividerY = by + titleH;
  if (attrH > 0) {
    parts.push(rect(nextId(), bx, dividerY - Math.round(borderW / 2), w, borderW, line, undefined, 'Divider'));
    dividerY += attrH;
  }
  if (methodH > 0) {
    parts.push(rect(nextId(), bx, dividerY - Math.round(borderW / 2), w, borderW, line, undefined, 'Divider'));
  }

  const annotation = annotationLine(box);
  if (annotation === undefined) {
    parts.push(textBoxLines(nextId(), bx, by, w, titleH, [box.label], scaledFontSizeHalfPt(TITLE_SIZE_HALFPT, s), { bold: true, align: 'ctr', color: textOn(titleFill) }));
  } else {
    // `«interface»` in the member size, then the name in bold, in the same title compartment.
    const annotationH = scalePt(ANNOTATION_H + 4, s);
    parts.push(textBoxLines(nextId(), bx, by + scalePt(2, s), w, annotationH, [annotation], scaledFontSizeHalfPt(MEMBER_SIZE_HALFPT, s), { align: 'ctr', color: textOn(titleFill) }));
    parts.push(
      textBoxLines(nextId(), bx, by + scalePt(ANNOTATION_H, s), w, titleH - scalePt(ANNOTATION_H, s), [box.label], scaledFontSizeHalfPt(TITLE_SIZE_HALFPT, s), { bold: true, align: 'ctr', color: textOn(titleFill) }),
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
        { color: textOn(bodyFill) },
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
        { color: textOn(bodyFill) },
      ),
    );
  }
  return parts;
}

/** The Dagre key of a provided interface: apart from classes, namespaces and notes. */
function interfaceKey(id: string): string {
  return `itf:${id}`;
}

/** The Dagre key of a note: apart from classes and namespaces. */
function noteKey(index: number): string {
  return `note:${index}`;
}

/** A note's box: its longest line, its line count, padding, and the folded corner's room. */
function noteSize(text: string): { width: number; height: number } {
  const lines = text.split('\n');
  const widest = Math.max(...lines.map((line) => estimateTextWidth(line, NOTE_FONT_PX)));
  return { width: Math.max(60, widest + 2 * NOTE_PAD + 12), height: lines.length * NOTE_LINE_H + 2 * NOTE_PAD };
}

/** Room a relation's label and cardinalities need along the line (`undefined`: no text). */
function relationTextRoom(rel: ClassDiagram['relationships'][number]): { width: number; height: number } | undefined {
  const cards = [rel.fromCardinality, rel.toCardinality].filter((c): c is string => c !== undefined);
  if (!rel.label && cards.length === 0) return undefined;
  const labelWidth = rel.label ? estimateTextWidth(rel.label, 8) + 12 : 0;
  const cardWidth = cards.reduce((sum, c) => sum + estimateTextWidth(c, 8) + 8, 0);
  return {
    width: Math.max(labelWidth, cardWidth),
    height: (rel.label ? 20 : 0) + (cards.length > 0 ? 2 * CARDINALITY_ASIDE + 18 : 0),
  };
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
  // Notes are nodes too; one for a class is pulled next to it by a layout edge, drawn as a dotted line.
  const notes = chart.notes ?? [];
  const noteSizes = notes.map((note) => noteSize(note.text));
  notes.forEach((note, i) => {
    g.setNode(noteKey(i), noteSizes[i]!);
    if (note.for !== undefined && g.hasNode(nodeKey(note.for))) g.setEdge(noteKey(i), nodeKey(note.for));
  });
  // A provided interface is a small node of its own, pulled next to its class by the relation's edge.
  const interfaces = chart.interfaces ?? [];
  for (const itf of interfaces) {
    if (!g.hasNode(nodeKey(itf.classId))) continue;
    g.setNode(interfaceKey(itf.id), { width: LOLLIPOP_D, height: LOLLIPOP_D });
    g.setEdge(nodeKey(itf.classId), interfaceKey(itf.id));
  }
  const linked = new Set<string>();
  for (const itf of interfaces) linked.add(itf.classId);
  for (const rel of chart.relationships) {
    if (rel.type === 'lollipop') continue;
    if (g.hasNode(nodeKey(rel.from)) && g.hasNode(nodeKey(rel.to))) {
      // A relation with a label or cardinalities tells Dagre the room its texts take (Dagre gives it an
      // intermediate rank), so they do not pile up on a short line: the flowchart does the same for its
      // edge labels. Without text, the line keeps Dagre's shortest gap.
      const room = relationTextRoom(rel);
      g.setEdge(nodeKey(rel.from), nodeKey(rel.to), room ? { ...room, labelpos: 'c' } : {});
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
  const interfaceCentres = new Map<string, { x: number; y: number }>();
  for (const itf of interfaces) {
    const n = g.node(interfaceKey(itf.id)) as { x: number; y: number } | undefined;
    if (n) interfaceCentres.set(itf.id, { x: n.x, y: n.y });
  }
  const noteCentres = notes.map((_, i) => {
    const n = g.node(noteKey(i)) as { x: number; y: number };
    return { x: n.x, y: n.y };
  });
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
  for (const c of interfaceCentres.values()) {
    // The name may sit on any side of the circle: leave room for it all round.
    const room = LOLLIPOP_D / 2 + LOLLIPOP_LABEL_GAP + 60;
    minX = Math.min(minX, c.x - room);
    maxX = Math.max(maxX, c.x + room);
    minY = Math.min(minY, c.y - room);
    maxY = Math.max(maxY, c.y + room);
  }
  for (const box of chart.classes) {
    const n = centres.get(box.id)!;
    const size = sizes.get(box.id)!;
    minX = Math.min(minX, n.x - size.width / 2);
    maxX = Math.max(maxX, n.x + size.width / 2);
    minY = Math.min(minY, n.y - size.height / 2);
    maxY = Math.max(maxY, n.y + size.height / 2);
  }
  noteCentres.forEach((c, i) => {
    const size = noteSizes[i]!;
    minX = Math.min(minX, c.x - size.width / 2);
    maxX = Math.max(maxX, c.x + size.width / 2);
    minY = Math.min(minY, c.y - size.height / 2);
    maxY = Math.max(maxY, c.y + size.height / 2);
  });
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

  // Notes: the dotted line to their class first, then the note itself.
  notes.forEach((note, i) => {
    const c = noteCentres[i]!;
    const size = noteSizes[i]!;
    const target = note.for === undefined ? undefined : centres.get(note.for);
    if (target) {
      const targetSize = sizes.get(note.for!)!;
      const a = edgePoint(c.x, c.y, size.width / 2, size.height / 2, target.x, target.y);
      const b = edgePoint(target.x, target.y, targetSize.width / 2, targetSize.height / 2, c.x, c.y);
      parts.push(
        connector(nextId(), scalePt(a.x + dx, s), scalePt(a.y + dy, s), scalePt(b.x + dx, s), scalePt(b.y + dy, s), NOTE_LINE, scaledLineWidthEmu(9525, s), 'dash', 'none', 'sm', 'none', 'sm'),
      );
    }
    parts.push(
      boxShape(
        nextId(),
        scalePt(c.x - size.width / 2 + dx, s),
        scalePt(c.y - size.height / 2 + dy, s),
        scalePt(size.width, s),
        scalePt(size.height, s),
        note.text.split('\n'),
        { fill: NOTE_FILL, line: NOTE_LINE, color: '000000', align: 'left', prst: 'foldedCorner' },
        NOTE_FONT_PX,
        s,
      ),
    );
  });

  // Lollipops: a line from the class to a hollow circle, the interface's name just beyond it.
  for (const itf of interfaces) {
    const c = interfaceCentres.get(itf.id);
    const owner = centres.get(itf.classId);
    if (!c || !owner) continue;
    const ownerSize = sizes.get(itf.classId)!;
    const length = Math.hypot(c.x - owner.x, c.y - owner.y) || 1;
    const ux = (c.x - owner.x) / length;
    const uy = (c.y - owner.y) / length;
    const start = edgePoint(owner.x, owner.y, ownerSize.width / 2, ownerSize.height / 2, c.x, c.y);
    const end = { x: c.x - (ux * LOLLIPOP_D) / 2, y: c.y - (uy * LOLLIPOP_D) / 2 };
    parts.push(
      connector(nextId(), scalePt(start.x + dx, s), scalePt(start.y + dy, s), scalePt(end.x + dx, s), scalePt(end.y + dy, s), LINE_COLOR, scaledLineWidthEmu(9525, s), 'solid', 'none', 'sm', 'none', 'sm'),
    );
    const d = scalePt(LOLLIPOP_D, s);
    parts.push(boxShape(nextId(), scalePt(c.x - LOLLIPOP_D / 2 + dx, s), scalePt(c.y - LOLLIPOP_D / 2 + dy, s), d, d, [''], { fill: 'FFFFFF', line: LINE_COLOR, color: '000000', prst: 'ellipse' }, MEMBER_FONT_PX, s));
    const width = estimateTextWidth(itf.label, MEMBER_FONT_PX) + 8;
    const beyond = LOLLIPOP_D / 2 + LOLLIPOP_LABEL_GAP;
    const lx = c.x + ux * (beyond + width / 2);
    const ly = c.y + uy * (beyond + 10);
    parts.push(
      textBoxLines(nextId(), scalePt(lx - width / 2 + dx, s), scalePt(ly - 10 + dy, s), scalePt(width, s), scalePt(20, s), [itf.label], scaledFontSizeHalfPt(MEMBER_SIZE_HALFPT, s), { align: 'ctr' }),
    );
  }

  for (const rel of chart.relationships) {
    if (rel.type === 'lollipop') continue;
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
    // Cardinalities just off each end, on one side of the line, clear of the end's marker.
    for (const [text, at, other] of [
      [rel.fromCardinality, p1, p2],
      [rel.toCardinality, p2, p1],
    ] as const) {
      if (text === undefined) continue;
      const length = Math.hypot(other.x - at.x, other.y - at.y) || 1;
      const ux = (other.x - at.x) / length;
      const uy = (other.y - at.y) / length;
      const cx = at.x + ux * CARDINALITY_ALONG - uy * CARDINALITY_ASIDE;
      const cy = at.y + uy * CARDINALITY_ALONG + ux * CARDINALITY_ASIDE;
      const width = estimateTextWidth(text, 8) + 8;
      parts.push(
        textBoxLines(
          nextId(),
          scalePt(cx + dx - width / 2, s),
          scalePt(cy + dy - 9, s),
          scalePt(width, s),
          scalePt(18, s),
          [text],
          scaledFontSizeHalfPt(LABEL_SIZE_HALFPT, s),
          { align: 'ctr' },
        ),
      );
    }
    if (rel.label) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const labelWidth = estimateTextWidth(rel.label, 8) + 12;
      // A white background under the label, as Mermaid gives its relationship labels (`labelBkg`): without
      // it the line runs through the text, which then reads as struck through.
      parts.push(
        rect(nextId(), scalePt(midX + dx - labelWidth / 2, s), scalePt(midY + dy - LABEL_BG_H / 2, s), scalePt(labelWidth, s), scalePt(LABEL_BG_H, s), 'FFFFFF', undefined, `${rel.label} background`),
      );
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
