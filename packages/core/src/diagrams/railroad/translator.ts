/**
 * OOXML translator for railroad diagrams (all four dialects). Family D strategy (calculated shapes on a
 * `wpc:wpc` canvas): {@link layoutRailroad} places everything, this module only writes it out. Per rule: the
 * rule name, one freeform shape holding every track line of the rule (straight segments, and quarter turns
 * as cubic Béziers), a pill per terminal, a box per rule reference, a dashed box per special, repeat bounds,
 * and the start/end dots. All text goes through `boxShape`, which XML-escapes it.
 */

import type { RailroadDiagram } from './types.js';
import { layoutRailroad, RAILROAD_FONT_PT, type RailBox, type RailPathOp } from './layout.js';
import { boxShape, noteParagraph, scalePt, type BoxStyle } from '../../translator/boxes.js';
import { createIdAllocator, scaledExtent, scaledLineWidthEmu, wrapDrawingCanvas, type CanvasOptions } from '../../translator/canvas.js';

const TRACK = '404040';
const HEADING = '1F3864';
/**
 * Filled boxes keep `wrap="square"`: real Word shrinks a filled `wrap="none"` text box to its text, which
 * detaches the box from its track (seen in a Word render, 2026-11-20). Terminals are pills (`adj` 50000).
 */
const STYLES: Record<RailBox['kind'], BoxStyle> = {
  terminal: { fill: 'DEEBF7', line: '2F5597', color: '000000', prst: 'roundRect', cornerAdj: 50000 },
  nonterminal: { fill: 'FFFFFF', line: '404040', color: '000000' },
  special: { fill: 'F2F2F2', line: '7F7F7F', color: '404040', italic: true, dashed: true },
};
/** Track stroke: 1.25pt. */
const TRACK_EMU = 15875;
/** Cubic Bézier handle length for a quarter circle, as a share of the radius. */
const KAPPA = 0.5522847498;

/** `boxShape` takes a px size and writes `fontPx * 2 - 4` half-points: the px value giving `pt` points. */
const fontArg = (pt: number): number => pt + 2;

interface P {
  x: number;
  y: number;
}

/** Control points of a quarter turn from `a` to `b`, leaving `a` horizontally (`h`) or vertically (`v`). */
function turnControls(a: P, b: P, from: 'h' | 'v'): [P, P] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return from === 'h'
    ? [{ x: a.x + KAPPA * dx, y: a.y }, { x: b.x, y: b.y - KAPPA * dy }]
    : [{ x: a.x, y: a.y + KAPPA * dy }, { x: b.x - KAPPA * dx, y: b.y }];
}

/** One `wps:wsp` with a stroked, unfilled `a:custGeom` made of the track ops (px, converted by `emu`). */
function trackShape(id: number, ops: RailPathOp[], emu: (v: number) => number, lineEmu: number): string {
  const cmds: Array<{ tag: 'moveTo' | 'lnTo' | 'cubicBezTo'; pts: P[] }> = [];
  let cur: P = { x: 0, y: 0 };
  for (const op of ops) {
    const p = { x: emu(op.x), y: emu(op.y) };
    if (op.op === 'T') {
      const [c1, c2] = turnControls(cur, p, op.from);
      cmds.push({ tag: 'cubicBezTo', pts: [c1, c2, p].map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) })) });
    } else {
      cmds.push({ tag: op.op === 'M' ? 'moveTo' : 'lnTo', pts: [p] });
    }
    cur = p;
  }
  const all = cmds.flatMap((c) => c.pts);
  const minX = Math.min(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const w = Math.max(1, Math.max(...all.map((p) => p.x)) - minX);
  const h = Math.max(1, Math.max(...all.map((p) => p.y)) - minY);
  const body = cmds.map((c) => `<a:${c.tag}>${c.pts.map((p) => `<a:pt x="${p.x - minX}" y="${p.y - minY}"/>`).join('')}</a:${c.tag}>`).join('');
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Track ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${minX}" y="${minY}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`,
    '    <a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="0" b="0"/>',
    `      <a:pathLst><a:path w="${w}" h="${h}" fill="none">${body}</a:path></a:pathLst>`,
    '    </a:custGeom>',
    '    <a:noFill/>',
    `    <a:ln w="${lineEmu}"><a:solidFill><a:srgbClr val="${TRACK}"/></a:solidFill><a:round/></a:ln>`,
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

/** Translate a parsed railroad diagram into a self-contained WordprocessingML paragraph. */
export function translateRailroadToOoxml(diagram: RailroadDiagram, options: CanvasOptions = {}): string {
  if (diagram.rules.length === 0) return noteParagraph('A railroad diagram needs at least one rule (name = ... ;).');

  const layout = layoutRailroad(diagram);
  const nextId = createIdAllocator();
  const { scale: s } = scaledExtent(layout.width, layout.height, options);
  const emu = (v: number): number => scalePt(v, s);
  const parts: string[] = [];
  const text = (t: { x: number; y: number; w: number; h: number; text: string }, style: BoxStyle, pt: number): string =>
    boxShape(nextId(), emu(t.x), emu(t.y), emu(t.w), emu(t.h), [t.text], style, fontArg(pt), s);

  // Unfilled text keeps `noWrap`: Word's shrink-to-text is invisible without a fill or outline.
  if (layout.title) parts.push(text(layout.title, { color: '000000', bold: true, align: 'left', noWrap: true }, RAILROAD_FONT_PT.title));
  for (const rule of layout.rules) {
    parts.push(text(rule.heading, { color: HEADING, bold: true, align: 'left', noWrap: true }, RAILROAD_FONT_PT.heading));
    if (rule.path.length > 0) parts.push(trackShape(nextId(), rule.path, emu, scaledLineWidthEmu(TRACK_EMU, s)));
    for (const b of rule.boxes) parts.push(text(b, STYLES[b.kind], RAILROAD_FONT_PT.box));
    for (const n of rule.notes) parts.push(text(n, { color: '595959', italic: true, noWrap: true }, RAILROAD_FONT_PT.note));
    for (const d of rule.dots) {
      parts.push(boxShape(nextId(), emu(d.cx - d.r), emu(d.cy - d.r), emu(d.r * 2), emu(d.r * 2), [''], { fill: TRACK, color: TRACK, prst: 'ellipse' }, fontArg(RAILROAD_FONT_PT.note), s));
    }
  }

  const name = diagram.title ?? diagram.accTitle ?? 'Railroad diagram';
  return wrapDrawingCanvas(parts.join('\n'), layout.width, layout.height, nextId(), name, options);
}
