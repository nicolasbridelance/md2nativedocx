/**
 * OOXML translator for a Mermaid `sequenceDiagram` (Family E: lifeline layout,
 * calculated shapes on a `wpc:wpc` canvas). Participants are boxes across the
 * top and (unless destroyed) the bottom joined by dashed lifelines; items are
 * stacked top to bottom in source order: messages (solid/dashed, arrowhead /
 * cross / open, bidirectional, self-messages as a three-segment loop),
 * activation bars (nested ones offset), notes (left of / right of / over), block
 * frames (`loop`/`alt`/`opt`/`par`/`critical`/`break` with a tag, a condition
 * and dashed `else`/`and`/`option` dividers; `rect` is a tinted background),
 * `autonumber` badges and `create`/`destroy` (late box / lifeline-ending cross).
 * Differences from Mermaid: column spacing is derived from label widths with a
 * simple per-gap rule rather than Mermaid's own algorithm; arrowhead variety is
 * limited to what DrawingML line ends offer (a cross is drawn as two strokes,
 * the async open arrow as a small triangle). Participants are drawn as their
 * UML symbol (`participant-glyph.ts`): a box, a stick figure for an actor, the
 * boundary / control / entity circles, a database cylinder, a `collections`
 * stack, a `queue` lying cylinder. `box` groups are a band behind their
 * columns (tinted when coloured, else an outline) with the title on top; a
 * central connection `()` is a dot where the message meets the lifeline.
 * Half-arrows and theme styling are ignored.
 */

import type { SequenceDiagram, SequenceItem } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { boxShape, noteParagraph, scalePt, tint, wrapText } from '../../translator/boxes.js';
import {
  createIdAllocator,
  scaledExtent,
  scaledLineWidthEmu,
  wrapDrawingCanvas,
  type CanvasOptions,
} from '../../translator/canvas.js';
import { connector, ellipse, rect } from '../../translator/graph-shapes.js';
import { GLYPH_BAND, QUEUE_CAP, glyph, glyphKind, glyphShape, queueGlyph, type Glyph } from './participant-glyph.js';

const PAD = 20;
const FONT = 11;
const SMALL = 10;
const LINE_H = 15;
const NOTE_W = 130;
const BAR_W = 10;
const GAP_MIN = 140;
const MSG_MAX_W = 240;
const INK = '333333';
const PART_FILL = 'ECECFF';
const PART_LINE = '9370DB';
/** How far a `collections` box's back copy sits from its front one. */
const STACK = 6;
/** Space between a participant group's band and the heads inside it. */
const BAND_M = 12;
/** Radius of a central connection's dot. */
const DOT_R = 5;
const isHex = (v: string | undefined): v is string => v !== undefined && /^[0-9A-Fa-f]{6}$/.test(v);

interface Frame {
  kind: string;
  label: string;
  startY: number;
  lo: number;
  hi: number;
  depth: number;
  color?: string;
  dividers: Array<{ y: number; label: string }>;
  /** Rightmost x its content reaches beyond the lifelines (a self-message's text, an inner frame). */
  right: number;
}

const widest = (lines: string[], fontPx: number): number => Math.max(0, ...lines.map((l) => estimateTextWidth(l, fontPx)));

/** Translate a parsed sequence diagram into a self-contained WordprocessingML paragraph. */
export function translateSequenceToOoxml(ast: SequenceDiagram, options: CanvasOptions = {}): string {
  const n = ast.participants.length;
  if (n === 0) return noteParagraph('A sequence diagram needs at least one participant to render.');

  const idx = new Map(ast.participants.map((p, i) => [p.id, i] as const));
  const at = (id: string): number => idx.get(id) ?? 0;

  // Participant heads: widths from their labels; a box holds its label, a symbol (stick figure, boundary...)
  // stands above it. Heads share the band of the tallest; each sits on the lifeline's top end.
  const bw = ast.participants.map((p) => Math.min(180, Math.max(90, widest(wrapText(p.label, FONT, 160), FONT) + 24)));
  const boxLines = ast.participants.map((p, i) => wrapText(p.label, FONT, (bw[i] as number) - 12).slice(0, 3));
  const glyphs: Array<Glyph | undefined> = ast.participants.map((p) => {
    const kind = glyphKind(p);
    return kind ? glyph(kind) : undefined;
  });
  const headH = boxLines.map((l, i) => (glyphs[i] ? GLYPH_BAND + 4 + l.length * 14 : Math.max(34, l.length * 14 + 14) + (ast.participants[i]?.kind === 'collections' ? STACK : 0)));
  const boxH = Math.max(...headH);
  /** Where in its head a creating message points: a symbol's middle, a box's middle. */
  const headAnchor = (i: number): number => {
    const g = glyphs[i];
    return g ? GLYPH_BAND - g.h / 2 : (headH[i] as number) / 2;
  };
  /** Horizontal reach of a head from its lifeline, toward a message arriving from the left (`dir` 1) or the right. */
  const headReach = (i: number, dir: number): number => {
    const g = glyphs[i];
    if (!g) return (bw[i] as number) / 2;
    return dir > 0 ? g.axis : g.w - g.axis;
  };

  const msgLines = (text: string, maxW: number): string[] => (text === '' ? [] : wrapText(text, FONT, maxW).slice(0, 5));

  // Horizontal gaps between adjacent lifelines: label widths, then message / note demands.
  const gap: number[] = [];
  for (let i = 0; i < n - 1; i++) gap.push(Math.max(GAP_MIN, (bw[i] as number) / 2 + (bw[i + 1] as number) / 2 + 20));
  let leftNeed = (bw[0] as number) / 2;
  let rightNeed = (bw[n - 1] as number) / 2;
  for (const item of ast.items) {
    if (item.type === 'message') {
      const a = at(item.from);
      const b = at(item.to);
      if (a === b) {
        const w = widest(msgLines(item.text, 160), FONT) + 60;
        if (a < n - 1) gap[a] = Math.max(gap[a] as number, w);
        else rightNeed = Math.max(rightNeed, w);
      } else {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const need = (widest(msgLines(item.text, MSG_MAX_W), FONT) + 40) / (hi - lo);
        for (let g = lo; g < hi; g++) gap[g] = Math.max(gap[g] as number, need);
      }
    } else if (item.type === 'note') {
      const i = at(item.actors[0] ?? '');
      if (item.placement === 'right') {
        if (i < n - 1) gap[i] = Math.max(gap[i] as number, NOTE_W + 30);
        else rightNeed = Math.max(rightNeed, NOTE_W + 20);
      } else if (item.placement === 'left') {
        if (i > 0) gap[i - 1] = Math.max(gap[i - 1] as number, NOTE_W + 30);
        else leftNeed = Math.max(leftNeed, NOTE_W + 20);
      } else if (i === 0) leftNeed = Math.max(leftNeed, NOTE_W / 2);
      else if (i === n - 1) rightNeed = Math.max(rightNeed, NOTE_W / 2);
    }
  }
  // Participant groups (`box`): the columns each spans, its title, and how far its band reaches past the
  // outer lifelines; a title wider than its columns widens the band evenly. Gaps then keep neighbouring
  // bands (or a band and a lone head) apart.
  const bands = (ast.boxes ?? []).flatMap((b) => {
    const cols = b.participants.map((id) => idx.get(id)).filter((i): i is number => i !== undefined);
    if (cols.length === 0) return [];
    const lo = Math.min(...cols);
    const hi = Math.max(...cols);
    let inner = (bw[lo] as number) / 2 + (bw[hi] as number) / 2 + 2 * BAND_M;
    for (let g = lo; g < hi; g++) inner += gap[g] as number;
    const title = b.label === '' ? [] : wrapText(b.label, FONT, Math.max(inner - 16, 160)).slice(0, 3);
    const extra = Math.max(0, (widest(title, FONT) + 16 - inner) / 2);
    return [{ lo, hi, title, color: isHex(b.color) ? tint(b.color, 0.55) : undefined, left: (bw[lo] as number) / 2 + BAND_M + extra, right: (bw[hi] as number) / 2 + BAND_M + extra }];
  });
  const reachRight = (i: number): number => bands.find((b) => b.hi === i)?.right ?? (bw[i] as number) / 2;
  const reachLeft = (i: number): number => bands.find((b) => b.lo === i)?.left ?? (bw[i] as number) / 2;
  for (const b of bands) {
    if (b.lo > 0) gap[b.lo - 1] = Math.max(gap[b.lo - 1] as number, reachRight(b.lo - 1) + b.left + 10);
    else leftNeed = Math.max(leftNeed, b.left);
    if (b.hi < n - 1) gap[b.hi] = Math.max(gap[b.hi] as number, b.right + reachLeft(b.hi + 1) + 10);
    else rightNeed = Math.max(rightNeed, b.right);
  }
  const bandTitleH = bands.length === 0 ? 0 : Math.max(0, ...bands.map((b) => b.title.length)) * LINE_H + 10;

  const cx: number[] = [PAD + leftNeed];
  for (let i = 1; i < n; i++) cx.push((cx[i - 1] as number) + (gap[i - 1] as number));
  const W = (cx[n - 1] as number) + rightNeed + PAD;

  // Which participants each block touches (so its frame spans only those).
  const spans = new Map<number, { lo: number; hi: number }>();
  const open: number[] = [];
  ast.items.forEach((item, k) => {
    if (item.type === 'blockStart') {
      open.push(k);
      spans.set(k, { lo: n, hi: -1 });
    } else if (item.type === 'blockEnd') {
      open.pop();
    } else if (item.type === 'message' || item.type === 'note') {
      const ids = item.type === 'message' ? [item.from, item.to] : item.actors;
      for (const s of open) {
        const sp = spans.get(s) as { lo: number; hi: number };
        for (const id of ids) {
          sp.lo = Math.min(sp.lo, at(id));
          sp.hi = Math.max(sp.hi, at(id));
        }
      }
    }
  });

  // Draw layers, assembled bottom to top once the total height is known.
  const groups: string[] = [];
  const bg: string[] = [];
  const framesXml: string[] = [];
  // Block tags and guards (`alt`, `[paid]`, an `else` divider's `[failed]`) sit above the activation bars,
  // which would otherwise hide a guard that starts on a lifeline.
  const frameText: string[] = [];
  const lifelines: string[] = [];
  const bars: string[] = [];
  const notes: string[] = [];
  const msgs: string[] = [];
  const boxes: string[] = [];

  const nextId = createIdAllocator();
  // Scale depends on the final height, which depends on this pass; the unscaled
  // draw calls are therefore deferred as closures over `emit`.
  const ops: Array<(emu: (v: number) => number, s: number, thin: number) => void> = [];
  const later = (fn: (emu: (v: number) => number, s: number, thin: number) => void): void => void ops.push(fn);

  const text = (layer: string[], x: number, y: number, w: number, lines: string[], opts: { align?: 'left' | 'center'; bold?: boolean; color?: string; fontPx?: number; italic?: boolean; lineH?: number; fill?: string; line?: string } = {}): void =>
    later((emu, s) => {
      layer.push(
        boxShape(nextId(), emu(x), emu(y), emu(w), emu(lines.length * (opts.lineH ?? LINE_H)), lines, { color: opts.color ?? INK, align: opts.align ?? 'center', bold: opts.bold, italic: opts.italic, noWrap: true, fill: opts.fill, line: opts.line }, opts.fontPx ?? FONT, s),
      );
    });
  const line = (layer: string[], x1: number, y1: number, x2: number, y2: number, o: { color?: string; dash?: 'solid' | 'dash'; head?: 'none' | 'triangle'; headSize?: 'sm' | 'lg'; tail?: 'none' | 'triangle'; tailSize?: 'sm' | 'lg' } = {}): void =>
    later((emu, _s, thin) => {
      layer.push(connector(nextId(), emu(x1), emu(y1), emu(x2), emu(y2), o.color ?? '595959', thin, o.dash ?? 'solid', o.head ?? 'none', o.headSize ?? 'sm', o.tail ?? 'none', o.tailSize ?? 'sm'));
    });
  const box = (layer: string[], x: number, y: number, w: number, h: number, fill: string | undefined, stroke: string | undefined, name: string): void =>
    later((emu) => void layer.push(rect(nextId(), emu(x), emu(y), emu(w), emu(h), fill, stroke, name)));
  const cross = (layer: string[], x: number, y: number, r: number): void => {
    line(layer, x - r, y - r, x + r, y + r, { color: INK });
    line(layer, x - r, y + r, x + r, y - r, { color: INK });
  };

  const titleH = ast.title ? 30 : 0;
  if (ast.title) text(msgs, 0, 6, W, [ast.title], { bold: true, fontPx: FONT + 3, lineH: 18 });
  const bandTop = titleH + PAD / 2;
  const topY = bandTop + bandTitleH;
  let y = topY + boxH + 24;

  const starts: Array<number[]> = ast.participants.map(() => []);
  const frames: Frame[] = [];
  const createTop = new Map<number, number>();
  const destroyAt = new Map<number, number>();
  const pendingCreate = new Set<number>();
  const pendingDestroy = new Set<number>();
  const barX = (i: number, level: number): number => (cx[i] as number) - BAR_W / 2 + level * 4;
  const closeBar = (i: number, endY: number): void => {
    const start = starts[i]?.pop();
    if (start === undefined) return;
    const level = starts[i]?.length ?? 0;
    box(bars, barX(i, level), start, BAR_W, Math.max(6, endY - start), 'F2F2F2', INK, 'Activation');
  };
  const edge = (i: number): number => ((starts[i]?.length ?? 0) > 0 ? BAR_W / 2 + ((starts[i]?.length ?? 1) - 1) * 4 : 0);

  const closeFrame = (): void => {
    const f = frames.pop() as Frame;
    const x0 = (cx[f.lo] as number) - 36 + f.depth * 6;
    const x1 = Math.max((cx[f.hi] as number) + 36 - f.depth * 6, f.right);
    const h = y - f.startY;
    const parent = frames[frames.length - 1];
    if (parent) parent.right = Math.max(parent.right, x1 + 6);
    if (f.kind === 'rect') {
      box(bg, x0, f.startY, x1 - x0, h, f.color ? tint(f.color, 0.55) : 'EFEFEF', undefined, 'Background');
      return;
    }
    box(framesXml, x0, f.startY, x1 - x0, h, undefined, '7F7F7F', `Block ${f.kind}`);
    const tagW = estimateTextWidth(f.kind, SMALL) + 16;
    text(frameText, x0, f.startY, tagW, [f.kind], { fontPx: SMALL, bold: true, fill: 'E6E6E6', line: '7F7F7F', lineH: 16 });
    if (f.label) text(frameText, x0 + tagW + 6, f.startY, x1 - x0 - tagW - 12, [`[${f.label}]`], { align: 'left', fontPx: SMALL, lineH: 16 });
    for (const d of f.dividers) {
      line(framesXml, x0, d.y, x1, d.y, { color: '7F7F7F', dash: 'dash' });
      if (d.label) text(frameText, x0 + 6, d.y + 2, x1 - x0 - 12, [`[${d.label}]`], { align: 'left', fontPx: SMALL, lineH: 14 });
    }
  };

  ast.items.forEach((item: SequenceItem, k) => {
    switch (item.type) {
      case 'create':
        pendingCreate.add(at(item.actor));
        break;
      case 'destroy':
        pendingDestroy.add(at(item.actor));
        break;
      case 'activate':
        starts[at(item.actor)]?.push(y);
        break;
      case 'deactivate':
        closeBar(at(item.actor), Math.max(y - 8, (starts[at(item.actor)]?.[(starts[at(item.actor)]?.length ?? 1) - 1] ?? 0) + 6));
        break;
      case 'note': {
        const i = at(item.actors[0] ?? '');
        const j = item.placement === 'over' && item.actors[1] !== undefined ? at(item.actors[1]) : i;
        const w = item.placement === 'over' ? Math.max(NOTE_W, Math.abs((cx[j] as number) - (cx[i] as number)) + 20) : NOTE_W;
        const x = item.placement === 'left' ? (cx[i] as number) - 10 - w : item.placement === 'right' ? (cx[i] as number) + 10 : Math.min(cx[i] as number, cx[j] as number) - (w - Math.abs((cx[j] as number) - (cx[i] as number))) / 2;
        const lines = wrapText(item.text, SMALL, w - 12).slice(0, 8);
        const h = Math.max(1, lines.length) * 12 + 10;
        box(notes, x, y, w, h, 'FFF2A8', 'BFA900', 'Note');
        text(notes, x + 6, y + 5, w - 12, lines, { align: 'left', fontPx: SMALL, lineH: 12 });
        y += h + 10;
        break;
      }
      case 'blockStart': {
        const sp = spans.get(k) as { lo: number; hi: number };
        const empty = sp.hi < 0;
        frames.push({ kind: item.kind, label: item.label, startY: y, lo: empty ? 0 : sp.lo, hi: empty ? n - 1 : sp.hi, depth: frames.length, color: item.color, dividers: [], right: -Infinity });
        y += item.kind === 'rect' ? 8 : 26;
        break;
      }
      case 'blockElse':
        frames[frames.length - 1]?.dividers.push({ y: y + 2, label: item.label });
        y += 24;
        break;
      case 'blockEnd':
        if (frames.length > 0) {
          closeFrame();
          y += 14;
        }
        break;
      case 'message': {
        const a = at(item.from);
        const b = at(item.to);
        const self = a === b;
        const dir = b >= a ? 1 : -1;
        const lines = msgLines(item.text, self ? 160 : Math.min(MSG_MAX_W, Math.max(100, Math.abs((cx[b] as number) - (cx[a] as number)) - 20)));
        const textH = lines.length * LINE_H;
        const arrowY = y + textH + 8;
        if (item.activate) starts[b]?.push(arrowY);
        const created = pendingCreate.has(b) && !self;
        if (created) {
          createTop.set(b, arrowY - headAnchor(b));
          pendingCreate.delete(b);
        }
        // A central connection's dot sits on the lifeline itself; the arrow stops at its rim.
        const dotFrom = item.central === 'from' || item.central === 'both';
        const dotTo = (item.central === 'to' || item.central === 'both') && !created;
        const xFrom = (cx[a] as number) + dir * (dotFrom ? DOT_R : edge(a));
        const xTo = created ? (cx[b] as number) - dir * headReach(b, dir) : (cx[b] as number) - dir * (dotTo ? DOT_R : edge(b));
        const dot = (x: number, at: number): void => later((emu) => void msgs.push(ellipse(nextId(), emu(x - DOT_R), emu(at - DOT_R), emu(2 * DOT_R), emu(2 * DOT_R), INK)));
        const dash = item.dashed ? 'dash' : 'solid';
        const headKind = item.head === 'arrow' || item.head === 'open' ? 'triangle' : 'none';
        const headSize = item.head === 'open' ? 'sm' : 'lg';
        if (self) {
          const x0 = (cx[a] as number) + edge(a);
          line(msgs, x0, arrowY, x0 + 30, arrowY, { dash });
          line(msgs, x0 + 30, arrowY, x0 + 30, arrowY + 20, { dash });
          line(msgs, x0 + 30, arrowY + 20, x0, arrowY + 20, { dash, tail: headKind, tailSize: headSize });
          if (item.head === 'cross') cross(msgs, x0 + 4, arrowY + 20, 4);
          if (dotFrom) dot(cx[a] as number, arrowY);
          if (dotTo) dot(cx[a] as number, arrowY + 20);
          if (lines.length > 0) {
            const textW = Math.max(...lines.map((l) => estimateTextWidth(l, FONT))) + 4;
            text(msgs, x0 + 36, y, textW, lines, { align: 'left' });
            // The enclosing frames widen to hold the text, which sits right of the loop.
            for (const f of frames) f.right = Math.max(f.right, x0 + 36 + textW + 8);
          }
        } else {
          line(msgs, xFrom, arrowY, xTo, arrowY, { dash, tail: headKind, tailSize: headSize, head: item.both ? 'triangle' : 'none', headSize });
          if (item.head === 'cross') cross(msgs, xTo - dir * 5, arrowY, 4);
          if (dotFrom) dot(cx[a] as number, arrowY);
          if (dotTo) dot(cx[b] as number, arrowY);
          if (lines.length > 0) {
            // A short arrow (e.g. to a late-created box) must not clip its label: widen the text box around the midpoint.
            const w = Math.max(Math.abs(xTo - xFrom) - 8, widest(lines, FONT) + 8);
            text(msgs, (xFrom + xTo) / 2 - w / 2, y, w, lines);
          }
        }
        if (item.number !== undefined) {
          // Clear of a central connection's dot at the sender.
          const bx = self ? xFrom + 8 : xFrom + dir * (dotFrom ? 14 : 10);
          later((emu) => void msgs.push(ellipse(nextId(), emu(bx - 7), emu(arrowY - 7), emu(14), emu(14), INK)));
          text(msgs, bx - 7, arrowY - 7, 14, [String(item.number)], { bold: true, color: 'FFFFFF', fontPx: 8, lineH: 14 });
        }
        if (item.deactivate) closeBar(a, arrowY);
        for (const who of [a, b]) {
          if (pendingDestroy.has(who)) {
            destroyAt.set(who, arrowY);
            pendingDestroy.delete(who);
            cross(msgs, cx[who] as number, arrowY, 7);
          }
        }
        y = Math.max(self ? arrowY + 20 + 14 : arrowY + 14, created ? arrowY - headAnchor(b) + (headH[b] as number) + 8 : 0);
        break;
      }
    }
  });
  while (frames.length > 0) closeFrame();

  const bottomY = y + 6;
  const bandBottom = bottomY + boxH + (bands.length > 0 ? 8 : 0);
  const H = bandBottom + PAD;

  for (const b of bands) {
    const x0 = (cx[b.lo] as number) - b.left;
    const x1 = (cx[b.hi] as number) + b.right;
    box(groups, x0, bandTop, x1 - x0, bandBottom - bandTop, b.color, b.color ? undefined : 'BFBFBF', 'Participant group');
    if (b.title.length > 0) text(groups, x0, bandTop + 5, x1 - x0, b.title);
  }

  /** Participant `i`'s head (box, stacked boxes, queue or symbol and label) from `top` down, `headH[i]` tall. */
  const head = (p: (typeof ast.participants)[number], i: number, top: number): void => {
    const w = bw[i] as number;
    const h = headH[i] as number;
    const x = (cx[i] as number) - w / 2;
    const lines = boxLines[i] as string[];
    const g = glyphs[i];
    if (g) {
      const gx = (cx[i] as number) - g.axis;
      const gy = top + GLYPH_BAND - g.h;
      later((emu, _s, thin) => void bg.push(glyphShape(nextId(), emu(gx), emu(gy), emu(g.w), emu(g.h), g, PART_FILL, PART_LINE, thin)));
      text(boxes, x, top + GLYPH_BAND + 4, w, lines, { lineH: 14 });
      return;
    }
    if (p.kind === 'collections') {
      // Two boxes, the back one up and to the right: a stack of instances.
      box(bg, x + STACK, top, w - STACK, h - STACK, PART_FILL, PART_LINE, `Participant ${p.id}`);
      box(bg, x, top + STACK, w - STACK, h - STACK, PART_FILL, PART_LINE, `Participant ${p.id}`);
      text(boxes, x, top + STACK + (h - STACK - lines.length * 14) / 2, w - STACK, lines, { lineH: 14 });
      return;
    }
    if (p.kind === 'queue') {
      // A cylinder lying on its side; the label is centred on its body, clear of the end cap.
      const drum = queueGlyph(w, h);
      later((emu, _s, thin) => void bg.push(glyphShape(nextId(), emu(x), emu(top), emu(w), emu(h), drum, PART_FILL, PART_LINE, thin)));
      text(boxes, x, top + (h - lines.length * 14) / 2, w - 2 * QUEUE_CAP, lines, { lineH: 14 });
      return;
    }
    box(bg, x, top, w, h, PART_FILL, PART_LINE, `Participant ${p.id}`);
    text(boxes, x, top + (h - lines.length * 14) / 2, w, lines, { lineH: 14 });
  };

  ast.participants.forEach((p, i) => {
    // At the top, every head ends where the lifelines start; a late-created one where its message points.
    const topBoxY = createTop.get(i) ?? topY + boxH - (headH[i] as number);
    head(p, i, topBoxY);
    const destroyed = destroyAt.get(i);
    if (destroyed === undefined) head(p, i, bottomY);
    line(lifelines, cx[i] as number, topBoxY + (headH[i] as number), cx[i] as number, destroyed ?? bottomY, { color: '999999', dash: 'dash' });
    for (const start of starts[i] ?? []) box(bars, barX(i, 0), start, BAR_W, Math.max(6, bottomY - 10 - start), 'F2F2F2', INK, 'Activation');
  });

  const { scale: s } = scaledExtent(W, H, options);
  const emu = (v: number): number => scalePt(v, s);
  const thin = scaledLineWidthEmu(9525, s);
  for (const op of ops) op(emu, s, thin);
  return wrapDrawingCanvas([...groups, ...bg, ...framesXml, ...lifelines, ...bars, ...frameText, ...notes, ...msgs, ...boxes].join('\n'), W, H, nextId(), 'Sequence diagram', options);
}
