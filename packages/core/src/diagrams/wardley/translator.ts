/**
 * OOXML translator for a Mermaid `wardley-beta`. Family D strategy (calculated
 * shapes on a `wpc:wpc` canvas), modeled on Mermaid's own renderer: evolution
 * stages along the x axis (equal widths unless every stage has a boundary),
 * visibility up the y axis, components as circles (or a triangle / diamond /
 * square for build / buy / outsource), anchors as filled dots, pipelines as
 * outlined boxes, straight dependency links (dashed, with flow arrowheads),
 * red dashed evolve arrows, notes, numbered annotations and accelerators.
 * Differences from Mermaid: link labels are not rotated along their line,
 * anchors use a distinct filled dot, `config` / theme styling is ignored.
 */

import type { WardleyMap, WardleyNode, WardleyStage } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { boxShape, noteParagraph, scalePt } from '../../translator/boxes.js';
import { createIdAllocator, scaledExtent, scaledLineWidthEmu, wrapDrawingCanvas } from '../../translator/canvas.js';
import { connector, diamond, ellipse, rect } from '../../translator/graph-shapes.js';
import { pathShape } from '../../translator/path-shape.js';

const DEFAULT_W = 900;
const DEFAULT_H = 600;
const PAD = 48;
const TOP = 60;
const R = 6;
const LABEL_PX = 11;
const AXIS_PX = 12;
const DEFAULT_STAGES = ['Genesis', 'Custom Built', 'Product', 'Commodity'];
const EVOLVE_COLOR = 'DC3545';
const INK = '000000';

/** Translate a parsed Wardley map into a self-contained WordprocessingML paragraph. */
export function translateWardleyToOoxml(map: WardleyMap): string {
  if (map.nodes.length === 0) return noteParagraph('A Wardley map needs at least one component or anchor to render.');

  const W = map.size?.width ?? DEFAULT_W;
  const H = map.size?.height ?? DEFAULT_H;
  const { scale: s } = scaledExtent(W, H);
  const emu = (v: number): number => scalePt(v, s);
  const nextId = createIdAllocator();
  const parts: string[] = [];
  const thin = scaledLineWidthEmu(9525, s);
  const chartW = W - 2 * PAD;
  const chartH = H - TOP - PAD;
  const px = (e: number): number => PAD + (e / 100) * chartW;
  const py = (v: number): number => H - PAD - (v / 100) * chartH;

  const text = (x: number, y: number, w: number, lines: string[], opts: { align?: 'left' | 'center' | 'right'; bold?: boolean; color?: string; fontPx?: number; italic?: boolean } = {}): void => {
    parts.push(
      boxShape(nextId(), emu(x), emu(y), emu(w), emu(lines.length * 15), lines, { color: opts.color ?? INK, align: opts.align ?? 'left', bold: opts.bold, italic: opts.italic, noWrap: true }, opts.fontPx ?? LABEL_PX, s),
    );
  };
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, dash: 'solid' | 'dash', head: 'none' | 'triangle' = 'none', tail: 'none' | 'triangle' = 'none'): void => {
    parts.push(connector(nextId(), emu(x1), emu(y1), emu(x2), emu(y2), color, thin, dash, head, 'sm', tail, 'sm'));
  };
  const widthOf = (t: string, px_ = LABEL_PX, bold = false): number => Math.ceil(estimateTextWidth(t, px_) * (bold ? 1.2 : 1)) + 8;

  // Title, axes, stage dividers and labels.
  if (map.title) text(0, 6, W, [map.title], { align: 'center', bold: true, fontPx: AXIS_PX + 1 });
  line(PAD, H - PAD, W - PAD, H - PAD, INK, 'solid');
  line(PAD, TOP, PAD, H - PAD, INK, 'solid');
  text(PAD, TOP - 24, 120, ['Visibility'], { bold: true, fontPx: AXIS_PX });
  text(PAD, H - PAD / 3 - 8, chartW, ['Evolution'], { align: 'center', bold: true, fontPx: AXIS_PX });
  const stages = map.stages.length > 0 ? map.stages : DEFAULT_STAGES.map((name): WardleyStage => ({ name }));
  const custom = map.stages.length > 0 && map.stages.every((st) => st.boundary !== undefined);
  let start = 0;
  stages.forEach((st, i) => {
    const end = custom ? (st.boundary ?? 100) : ((i + 1) * 100) / stages.length;
    if (i > 0) line(px(start), TOP, px(start), H - PAD, '808080', 'dash');
    const w = px(end) - px(start);
    text(px(start), H - PAD + 4, w, [st.name], { align: 'center', fontPx: AXIS_PX - 1 });
    start = end;
  });

  const byName = new Map<string, WardleyNode>(map.nodes.map((n) => [n.name, n]));
  const pos = new Map<string, { x: number; y: number; square: boolean }>();
  for (const n of map.nodes) pos.set(n.name, { x: px(n.x), y: py(n.y), square: false });

  // Pipelines: outlined box around the components; the parent sits on its top edge.
  const pipelineChildren = new Set<string>();
  for (const p of map.pipelines) {
    const kids = p.components.map((c) => pos.get(c)).filter((v): v is { x: number; y: number; square: boolean } => v !== undefined);
    const parent = pos.get(p.parent);
    if (kids.length === 0 || !parent) continue;
    p.components.forEach((c) => pipelineChildren.add(`${c}\u0000${p.parent}`));
    const xs = kids.map((k) => k.x);
    const minX = Math.min(...xs) - 15;
    const maxX = Math.max(...xs) + 15;
    const top = (kids[0] as { y: number }).y - 2 * R;
    parts.push(rect(nextId(), emu(minX), emu(top), emu(maxX - minX), emu(4 * R), undefined, INK, 'Pipeline', true));
    const sorted = [...kids].sort((a, b) => a.x - b.x);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i] as { x: number; y: number };
      const b = sorted[i + 1] as { x: number; y: number };
      line(a.x, a.y, b.x, b.y, INK, 'dash');
    }
    parent.x = (minX + maxX) / 2;
    parent.y = top - (R * 1.6) / 6;
    parent.square = true;
  }

  // Dependency links, trimmed to the node outlines.
  for (const l of map.links) {
    const a = pos.get(l.source);
    const b = pos.get(l.target);
    if (!a || !b || pipelineChildren.has(`${l.source}\u0000${l.target}`)) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 2 * R) continue;
    const ra = a.square ? R * 1.13 : R;
    const rb = b.square ? R * 1.13 : R;
    const x1 = a.x + (dx / d) * ra;
    const y1 = a.y + (dy / d) * ra;
    const x2 = b.x - (dx / d) * rb;
    const y2 = b.y - (dy / d) * rb;
    const back = l.flow === 'backward' || l.flow === 'bidirectional';
    const fwd = l.flow === 'forward' || l.flow === 'bidirectional';
    line(x1, y1, x2, y2, INK, l.dashed ? 'dash' : 'solid', back ? 'triangle' : 'none', fwd ? 'triangle' : 'none');
    if (l.label) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      text(mx - widthOf(l.label, LABEL_PX - 1) / 2 + (dy / d) * 10, my - 7 - (dx / d) * 10, widthOf(l.label, LABEL_PX - 1), [l.label], { align: 'center', fontPx: LABEL_PX - 1 });
    }
  }

  // Evolve arrows.
  for (const ev of map.evolves) {
    const n = byName.get(ev.name);
    const p = pos.get(ev.name);
    if (!n || !p) continue;
    const x2 = px(ev.target);
    if (Math.abs(x2 - p.x) < R * 2) continue;
    const dir = x2 > p.x ? 1 : -1;
    line(p.x + dir * R, p.y, x2, p.y, EVOLVE_COLOR, 'dash', 'none', 'triangle');
  }

  // Nodes and their labels.
  for (const n of map.nodes) {
    const p = pos.get(n.name) as { x: number; y: number; square: boolean };
    const id = nextId();
    if (n.kind === 'anchor') {
      parts.push(ellipse(id, emu(p.x - R), emu(p.y - R), emu(2 * R), emu(2 * R), INK, INK));
    } else if (p.square) {
      parts.push(rect(id, emu(p.x - R * 0.8), emu(p.y - R * 0.8), emu(R * 1.6), emu(R * 1.6), 'FFFFFF', INK, 'Pipeline parent'));
    } else if (n.strategy === 'buy') {
      parts.push(diamond(id, emu(p.x - R * 1.3), emu(p.y - R * 1.3), emu(R * 2.6), emu(R * 2.6), 'FFFFFF', INK));
    } else if (n.strategy === 'outsource') {
      parts.push(rect(id, emu(p.x - R), emu(p.y - R), emu(2 * R), emu(2 * R), 'FFFFFF', INK, 'Outsource'));
    } else if (n.strategy === 'build') {
      const pts = [
        { x: p.x, y: p.y - R * 1.3 },
        { x: p.x + R * 1.3, y: p.y + R },
        { x: p.x - R * 1.3, y: p.y + R },
      ].map((q) => ({ x: emu(q.x), y: emu(q.y) }));
      parts.push(pathShape(id, pts, true, 'FFFFFF', 100, INK, thin));
    } else {
      parts.push(ellipse(id, emu(p.x - R), emu(p.y - R), emu(2 * R), emu(2 * R), 'FFFFFF', INK));
    }
    if (n.inertia) line(p.x + R + 4, p.y - R, p.x + R + 4, p.y + R, INK, 'solid');
    const w = widthOf(n.name, LABEL_PX, n.kind === 'anchor');
    const dx = n.labelDx ?? 0;
    const dy = n.labelDy ?? 0;
    const lx = p.x + R + 6 + dx;
    text(lx, p.y - 8 + dy - (n.kind === 'anchor' ? 12 : 0), w, [n.name], { bold: n.kind === 'anchor' });
  }

  // Notes, accelerators, annotations.
  for (const note of map.notes) text(px(note.x), py(note.y) - 8, widthOf(note.text), [note.text], { italic: true, color: '595959' });
  for (const [list, dir] of [[map.accelerators, 1], [map.deaccelerators, -1]] as const) {
    for (const a of list) {
      const x = px(a.x);
      const y = py(a.y);
      line(x - dir * 22, y, x + dir * 22, y, EVOLVE_COLOR, 'solid', 'none', 'triangle');
      text(x - widthOf(a.text) / 2, y + 6, widthOf(a.text), [a.text], { align: 'center', fontPx: LABEL_PX - 1 });
    }
  }
  for (const a of map.annotations) {
    const x = px(a.x);
    const y = py(a.y);
    parts.push(ellipse(nextId(), emu(x - 8), emu(y - 8), emu(16), emu(16), 'FFFFFF', INK));
    text(x - 8, y - 8, 16, [String(a.number)], { align: 'center', bold: true, fontPx: LABEL_PX - 1 });
  }
  const listed = map.annotations.filter((a) => a.text);
  if (listed.length > 0) {
    const box = map.annotationsBox ?? { x: 1, y: 99 };
    const lines = listed.map((a) => `${a.number}. ${a.text}`);
    const w = Math.max(...lines.map((t) => widthOf(t))) + 8;
    const x = Math.min(px(box.x), W - PAD - w);
    const y = Math.min(py(box.y), H - PAD - lines.length * 15 - 8);
    parts.push(rect(nextId(), emu(x), emu(y), emu(w), emu(lines.length * 15 + 8), 'FFFFFF', INK, 'Annotations'));
    text(x + 4, y + 4, w - 8, lines);
  }

  return wrapDrawingCanvas(parts.join('\n'), W, H, nextId(), 'Wardley map');
}
