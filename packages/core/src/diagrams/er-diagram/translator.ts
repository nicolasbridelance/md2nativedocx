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
 *
 * Groups (`subgraph`) are laid out by the flowchart engine (`../../layout/layout.ts`), since Mermaid lays
 * out an ER diagram's groups as it does a flowchart's subgraphs: entities are nodes of their own size
 * (`LayoutOptions.nodeSizes`), groups are subgraphs, relationships are links whose label takes room. So a
 * group is laid out on its own, in its own direction, when no relationship crosses its border, and with the
 * rest of the diagram otherwise; a relationship to a group (`A ||--|| Group`) ends on its box. Groups are
 * drawn as flowchart subgraphs: a titled box, light grey, dashed. A diagram without groups keeps the single
 * Dagre graph it always had.
 */

import dagre from 'dagre';
import { layoutWithinLimits, nodeKey } from '../../layout/graph-limits.js';
import type { ErAttribute, ErCardinality, ErDiagram, ErEntity, ErGroup } from './types.js';
import type { Flowchart, Subgraph } from '../../types.js';
import { estimateTextWidth, layout, SUBGRAPH_TITLE_HEIGHT } from '../../layout/layout.js';
import {
  createIdAllocator,
  scaledExtent,
  scaledFontSizeHalfPt,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';
import { connector, edgePoint, rect, scalePt, textBoxLines, type ArrowMarker } from '../../translator/graph-shapes.js';
import { boxShape } from '../../translator/boxes.js';
import { validateHexColor } from '../../translator/xml-escape.js';
import { textColorFor } from '../../translator/text-color.js';

const LINE_COLOR = '2F5496';
const TITLE_FILL = 'D9E2F3';
const TITLE_FONT_PX = 13;
const ATTR_FONT_PX = 10;
const TITLE_SIZE_HALFPT = 22;
const ATTR_SIZE_HALFPT = 18;
const LABEL_SIZE_HALFPT = 16;
/** Height of the white background under a relationship label (8 pt text), as in the requirement diagram. */
const LABEL_BG_H = 14;
const TITLE_H = 32;
const ROW_H = 22;
const COMPARTMENT_PAD_Y = 6;
const PAD_X = 10;
/** Group box: a flowchart subgraph's look (light grey fill, grey dashed border), as the class namespaces. */
const GROUP_FILL = 'F6F6F6';
const GROUP_LINE = '999999';
const GROUP_TITLE_SIZE_HALFPT = 20;

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
  let width = estimateTextWidth(entity.label ?? entity.id, TITLE_FONT_PX) + PAD_X * 2 + 16;
  for (const a of entity.attributes) {
    width = Math.max(width, estimateTextWidth(attributeDisplay(a), ATTR_FONT_PX) + PAD_X * 2);
  }
  width = Math.max(90, width);
  const attrH = entity.attributes.length > 0 ? entity.attributes.length * ROW_H + COMPARTMENT_PAD_Y : 0;
  return { width, height: TITLE_H + attrH, titleH: TITLE_H, attrH };
}

function entityShapes(nextId: () => number, entity: ErEntity, size: EntitySize, x: number, y: number, s: number): string[] {
  // A style colours the whole box, title band included; the border and divider take its stroke.
  const fill = entity.fill === undefined ? undefined : validateHexColor(entity.fill, 'FFFFFF');
  const line = validateHexColor(entity.stroke, LINE_COLOR);
  const text = validateHexColor(entity.textColor, textColorFor(fill ?? 'FFFFFF'));
  const titleText = validateHexColor(entity.textColor, textColorFor(fill ?? TITLE_FILL));
  const parts: string[] = [];
  const bx = scalePt(x, s);
  const by = scalePt(y, s);
  const w = scalePt(size.width, s);
  const titleH = scalePt(size.titleH, s);
  const attrH = scalePt(size.attrH, s);
  const totalH = titleH + attrH;
  const borderW = scaledLineWidthEmu(9525, s);

  parts.push(rect(nextId(), bx, by, w, totalH, fill ?? 'FFFFFF', line, entity.label ?? entity.id));
  parts.push(rect(nextId(), bx, by, w, titleH, fill ?? TITLE_FILL, undefined, `${entity.label ?? entity.id} title`));
  if (attrH > 0) {
    parts.push(rect(nextId(), bx, by + titleH - Math.round(borderW / 2), w, borderW, line, undefined, 'Divider'));
  }

  parts.push(textBoxLines(nextId(), bx, by, w, titleH, [entity.label ?? entity.id], scaledFontSizeHalfPt(TITLE_SIZE_HALFPT, s), { bold: true, align: 'ctr', color: titleText }));

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
        { color: text },
      ),
    );
  }
  return parts;
}

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Frame keys: entities and groups apart, since a group and an entity may share an id in a hand-built AST. */
const entityKey = (id: string): string => `e:${id}`;
const groupKey = (id: string): string => `g:${id}`;

/** A diagram without groups: one Dagre graph, as ER diagrams have always been laid out. */
function layoutFlat(chart: ErDiagram, sizes: Map<string, EntitySize>, options: CanvasOptions): Map<string, Frame> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: chart.direction === undefined || chart.direction === 'TD' ? 'TB' : chart.direction, nodesep: 50, ranksep: 70, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const entity of chart.entities) {
    const size = sizes.get(entity.id)!;
    g.setNode(nodeKey(entity.id), { width: size.width, height: size.height });
  }
  for (const rel of chart.relationships) {
    if (g.hasNode(nodeKey(rel.from)) && g.hasNode(nodeKey(rel.to))) g.setEdge(nodeKey(rel.from), nodeKey(rel.to));
  }
  layoutWithinLimits(g, options);
  const frames = new Map<string, Frame>();
  for (const entity of chart.entities) {
    const n = g.node(nodeKey(entity.id)) as { x: number; y: number };
    const size = sizes.get(entity.id)!;
    frames.set(entityKey(entity.id), { x: n.x - size.width / 2, y: n.y - size.height / 2, width: size.width, height: size.height });
  }
  return frames;
}

/**
 * The groups that can be drawn, in an order where a group comes before the ones inside it: a parent that
 * names no group, the group itself or a cycle of parents (only a hand-built AST can have those) puts the
 * group at the top level.
 */
function drawableGroups(chart: ErDiagram): Map<string, string | undefined> {
  const byId = new Map<string, ErGroup>();
  for (const g of chart.groups ?? []) if (!byId.has(g.id)) byId.set(g.id, g);
  const parentOf = new Map<string, string | undefined>();
  for (const g of byId.values()) {
    let parent = g.parent !== undefined && byId.has(g.parent) && g.parent !== g.id ? g.parent : undefined;
    const seen = new Set([g.id]);
    for (let at = parent; at !== undefined; at = byId.get(at)?.parent) {
      if (seen.has(at)) {
        parent = undefined;
        break;
      }
      seen.add(at);
    }
    parentOf.set(g.id, parent);
  }
  return parentOf;
}

/** A diagram with groups, laid out by the flowchart engine (see the module doc comment). */
function layoutGrouped(chart: ErDiagram, sizes: Map<string, EntitySize>, parentOf: Map<string, string | undefined>, options: CanvasOptions): Map<string, Frame> {
  const labelOf = new Map((chart.groups ?? []).map((g) => [g.id, g.label] as const));
  const directionOf = new Map((chart.groups ?? []).map((g) => [g.id, g.direction] as const));
  const subgraphs: Subgraph[] = [...parentOf.keys()].map((id) => ({
    id,
    title: labelOf.get(id) ?? id,
    nodeIds: chart.entities.filter((e) => e.group === id && !parentOf.has(e.id)).map((e) => e.id),
    subgraphIds: [...parentOf].filter(([, parent]) => parent === id).map(([child]) => child),
    ...(directionOf.get(id) ? { direction: directionOf.get(id) } : {}),
  }));
  // An entity with a group's id is the group (the parser never keeps both); a group's id in a relationship
  // is a link to the subgraph, which the flowchart engine ends on its box.
  const entities = chart.entities.filter((e) => !parentOf.has(e.id));
  const flowchart: Flowchart = {
    direction: chart.direction ?? 'TD',
    nodes: entities.map((e) => ({ id: e.id, label: '', labelRuns: [], shape: 'rect' })),
    edges: chart.relationships.map((r) => ({
      from: r.from,
      to: r.to,
      type: 'line',
      label: r.label ?? null,
      labelRuns: r.label ? [{ text: r.label }] : null,
    })),
    subgraphs,
  };
  const nodeSizes = new Map(entities.map((e) => [e.id, sizes.get(e.id)!] as const));
  const laid = layout(flowchart, { ...options, nodeSizes });
  const frames = new Map<string, Frame>();
  for (const e of entities) {
    const box = laid.nodes[e.id];
    if (box) frames.set(entityKey(e.id), box);
  }
  for (const id of parentOf.keys()) {
    const box = laid.subgraphs[id];
    if (box) frames.set(groupKey(id), box);
  }
  return frames;
}

/** A group's dashed box and its title band, coloured by its `style` when it has one. */
function groupShapes(nextId: () => number, group: ErGroup, f: Frame, dx: number, dy: number, s: number): string[] {
  const x = scalePt(f.x + dx, s);
  const y = scalePt(f.y + dy, s);
  const w = scalePt(f.width, s);
  const fill = validateHexColor(group.fill, GROUP_FILL);
  return [
    boxShape(nextId(), x, y, w, scalePt(f.height, s), [''], { fill, line: validateHexColor(group.stroke, GROUP_LINE), color: '000000', dashed: true }, ATTR_FONT_PX, s),
    textBoxLines(nextId(), x, y, w, scalePt(SUBGRAPH_TITLE_HEIGHT, s), [group.label], scaledFontSizeHalfPt(GROUP_TITLE_SIZE_HALFPT, s), { align: 'ctr', color: textColorFor(fill) }),
  ];
}

/** Translate a parsed ER diagram into a self-contained WordprocessingML
 * paragraph. An empty diagram renders a visible note, matching the other
 * Family B translators' zero-content convention — never a silent blank
 * canvas. */
export function translateErDiagramToOoxml(chart: ErDiagram, options: CanvasOptions = {}): string {
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
  for (const entity of chart.entities) sizes.set(entity.id, sizeForEntity(entity));
  const parentOf = drawableGroups(chart);
  const frames = parentOf.size === 0 ? layoutFlat(chart, sizes, options) : layoutGrouped(chart, sizes, parentOf, options);
  /** The frame a relationship end names: a group if one has that id, else an entity. */
  const frameOf = (id: string): Frame | undefined => frames.get(parentOf.has(id) ? groupKey(id) : entityKey(id));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const f of frames.values()) {
    minX = Math.min(minX, f.x);
    maxX = Math.max(maxX, f.x + f.width);
    minY = Math.min(minY, f.y);
    maxY = Math.max(maxY, f.y + f.height);
  }
  const PAD = 24;
  const canvasW = maxX - minX + 2 * PAD;
  const canvasH = maxY - minY + 2 * PAD;
  const dx = -minX + PAD;
  const dy = -minY + PAD;
  const { scale: s } = scaledExtent(canvasW, canvasH, options);

  const nextId = createIdAllocator();
  const parts: string[] = [];

  // Group boxes first, an enclosing group before the ones inside it, so they stay behind everything.
  const depth = (id: string): number => {
    let d = 0;
    for (let at = parentOf.get(id); at !== undefined; at = parentOf.get(at)) d++;
    return d;
  };
  const byId = new Map((chart.groups ?? []).map((g) => [g.id, g] as const));
  for (const id of [...parentOf.keys()].sort((a, b) => depth(a) - depth(b))) {
    const f = frames.get(groupKey(id));
    if (f) parts.push(...groupShapes(nextId, byId.get(id)!, f, dx, dy, s));
  }

  for (const rel of chart.relationships) {
    const fFrom = frameOf(rel.from);
    const fTo = frameOf(rel.to);
    if (!fFrom || !fTo) continue;
    const nFrom = { x: fFrom.x + fFrom.width / 2, y: fFrom.y + fFrom.height / 2 };
    const nTo = { x: fTo.x + fTo.width / 2, y: fTo.y + fTo.height / 2 };
    const p1 = edgePoint(nFrom.x, nFrom.y, fFrom.width / 2, fFrom.height / 2, nTo.x, nTo.y);
    const p2 = edgePoint(nTo.x, nTo.y, fTo.width / 2, fTo.height / 2, nFrom.x, nFrom.y);
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

  for (const entity of chart.entities) {
    const f = parentOf.has(entity.id) ? undefined : frames.get(entityKey(entity.id));
    if (f) parts.push(...entityShapes(nextId, entity, sizes.get(entity.id)!, f.x + dx, f.y + dy, s));
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, 'ER diagram', options);
}
