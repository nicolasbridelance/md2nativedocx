/**
 * Railroad diagram layout, this project's own design (CC0). Pure geometry in px, no OOXML: a translator
 * writes it out.
 *
 * Every node is a block crossed by one horizontal track: it is entered on the left and left on the right at
 * the same height, and reaches `up` px above the track and `down` px below it. Blocks combine as:
 *
 * - **sequence**: blocks side by side on the track, joined by short segments;
 * - **choice**: the first alternative stays on the track (the main path reads straight), the others are
 *   stacked below it; each lower branch leaves and rejoins the track through quarter turns;
 * - **optional**: the element on the track and a bypass passing over it;
 * - **repeat**: the element on the track and a return loop under it. Bounds other than "one or more" are
 *   written under the loop (`3×`, `2–5×`, `≥2×`); "zero or more" is an optional wrapped around "one or more".
 *
 * A rule is its name above a track that starts and ends on a small dot. Rules are stacked top to bottom,
 * under the diagram title when there is one.
 */

import { estimateTextWidth } from '../../layout/layout.js';
import type { RailroadDiagram, RailroadNode, RailroadRule } from './types.js';

/** Label size in points; the translator writes text at these sizes. */
export const RAILROAD_FONT_PT = { box: 10, heading: 10, title: 12, note: 8 } as const;
const PX_PER_PT = 4 / 3;
const BOX_FONT_PX = RAILROAD_FONT_PT.box * PX_PER_PT;
const NOTE_FONT_PX = RAILROAD_FONT_PT.note * PX_PER_PT;

/** Turn radius of the track. */
const R = 7;
/** Height of a box. */
const BOX_H = 26;
/** Text inset on each side of a box. */
const PAD_X = 9;
/** Horizontal gap between blocks of a sequence. */
const GAP_X = 14;
/** Vertical gap between stacked branches, and between an element and its bypass or loop. */
const GAP_Y = 10;
/** Height of a rule's name line, and the space under it. */
const HEAD_H = 18;
const HEAD_GAP = 6;
/** Track run between a rule's dots and its definition. */
const LEAD = 14;
/** Radius of a rule's start and end dots. */
const DOT_R = 3.5;
/** Height of a repeat-bounds note. */
const NOTE_H = 14;
/** Vertical space between rules; margin around the drawing; title band height. */
const RULE_GAP = 20;
const MARGIN = 12;
const TITLE_H = 28;

/**
 * One step of a track path, in px. `T` is a quarter turn of radius {@link R} to (x, y), leaving the current
 * point horizontally (`from: 'h'`) or vertically (`from: 'v'`).
 */
export type RailPathOp =
  | { op: 'M'; x: number; y: number }
  | { op: 'L'; x: number; y: number }
  | { op: 'T'; x: number; y: number; from: 'h' | 'v' };

/** A labelled box. */
export interface RailBox {
  kind: 'terminal' | 'nonterminal' | 'special';
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

/** A line of text placed in a rectangle (rule names, the title, repeat bounds). */
export interface RailText {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

/** Everything drawn for one rule. */
export interface RailRuleLayout {
  name: string;
  heading: RailText;
  boxes: RailBox[];
  /** Repeat bounds written under their loop. */
  notes: RailText[];
  /** Every track line of the rule: sub-paths, each starting with `M`. */
  path: RailPathOp[];
  /** Start and end dots. */
  dots: Array<{ cx: number; cy: number; r: number }>;
}

/** The laid-out diagram, in px. */
export interface RailroadLayout {
  width: number;
  height: number;
  title?: RailText;
  rules: RailRuleLayout[];
  /** Turn radius used by every `T` op. */
  turnRadius: number;
}

interface Out {
  boxes: RailBox[];
  notes: RailText[];
  path: RailPathOp[];
}

/** A measured block: `draw` places it with its entry point at (x, y), y being the track height. */
interface Block {
  w: number;
  up: number;
  down: number;
  draw: (x: number, y: number, out: Out) => void;
}

/** Text shown on one line: control characters (a `\n` inside a string) become spaces. */
function oneLine(text: string): string {
  // eslint-disable-next-line no-control-regex -- replacing control characters is the point
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ');
}

const line = (out: Out, x1: number, y1: number, x2: number, y2: number): void => {
  if (x1 === x2 && y1 === y2) return;
  out.path.push({ op: 'M', x: x1, y: y1 }, { op: 'L', x: x2, y: y2 });
};

function box(kind: RailBox['kind'], text: string): Block {
  const w = Math.max(BOX_H, Math.ceil(estimateTextWidth(text, BOX_FONT_PX)) + PAD_X * 2);
  return {
    w,
    up: BOX_H / 2,
    down: BOX_H / 2,
    draw: (x, y, out) => out.boxes.push({ kind, x, y: y - BOX_H / 2, w, h: BOX_H, text }),
  };
}

function sequence(items: Block[]): Block {
  if (items.length === 0) {
    const w = GAP_X * 2;
    return { w, up: 0, down: 0, draw: (x, y, out) => line(out, x, y, x + w, y) };
  }
  const w = items.reduce((sum, b) => sum + b.w, 0) + GAP_X * (items.length - 1);
  return {
    w,
    up: Math.max(...items.map((b) => b.up)),
    down: Math.max(...items.map((b) => b.down)),
    draw: (x, y, out) => {
      let cx = x;
      items.forEach((b, i) => {
        b.draw(cx, y, out);
        cx += b.w;
        if (i < items.length - 1) {
          line(out, cx, y, cx + GAP_X, y);
          cx += GAP_X;
        }
      });
    },
  };
}

function choice(items: Block[]): Block {
  const inner = Math.max(...items.map((b) => b.w));
  const w = inner + 4 * R;
  // Track offset of each branch: the first on the track, the next ones below, never closer than one turn.
  const offsets: number[] = [];
  items.forEach((b, i) => {
    const prev = items[i - 1];
    offsets.push(i === 0 || !prev ? 0 : (offsets[i - 1] ?? 0) + Math.max(prev.down + GAP_Y + b.up, 2 * R));
  });
  const last = items.length - 1;
  return {
    w,
    up: items[0]?.up ?? 0,
    down: (offsets[last] ?? 0) + (items[last]?.down ?? 0),
    draw: (x, y, out) => {
      items.forEach((b, i) => {
        const by = y + (offsets[i] ?? 0);
        const bx = x + 2 * R + (inner - b.w) / 2;
        b.draw(bx, by, out);
        if (i === 0) {
          line(out, x, y, bx, y);
          line(out, bx + b.w, y, x + w, y);
          return;
        }
        out.path.push(
          { op: 'M', x, y },
          { op: 'T', x: x + R, y: y + R, from: 'h' },
          { op: 'L', x: x + R, y: by - R },
          { op: 'T', x: x + 2 * R, y: by, from: 'v' },
          { op: 'L', x: bx, y: by },
          { op: 'M', x: bx + b.w, y: by },
          { op: 'L', x: x + w - 2 * R, y: by },
          { op: 'T', x: x + w - R, y: by - R, from: 'h' },
          { op: 'L', x: x + w - R, y: y + R },
          { op: 'T', x: x + w, y, from: 'v' },
        );
      });
    },
  };
}

function optional(el: Block): Block {
  const w = el.w + 4 * R;
  const rise = Math.max(el.up + GAP_Y, 2 * R);
  return {
    w,
    up: rise,
    down: el.down,
    draw: (x, y, out) => {
      el.draw(x + 2 * R, y, out);
      line(out, x, y, x + 2 * R, y);
      line(out, x + 2 * R + el.w, y, x + w, y);
      const top = y - rise;
      out.path.push(
        { op: 'M', x, y },
        { op: 'T', x: x + R, y: y - R, from: 'h' },
        { op: 'L', x: x + R, y: top + R },
        { op: 'T', x: x + 2 * R, y: top, from: 'v' },
        { op: 'L', x: x + w - 2 * R, y: top },
        { op: 'T', x: x + w - R, y: top + R, from: 'h' },
        { op: 'L', x: x + w - R, y: y - R },
        { op: 'T', x: x + w, y, from: 'v' },
      );
    },
  };
}

/** The bounds written under a loop, or `''` for plain "one or more". */
export function repeatBounds(min: number, max: number): string {
  if (max === min) return `${min}×`;
  if (max === Infinity) return min <= 1 ? '' : `≥${min}×`;
  return `${Math.max(1, min)}–${max}×`;
}

function oneOrMore(el: Block, note: string): Block {
  const noteW = note ? Math.ceil(estimateTextWidth(note, NOTE_FONT_PX)) + 8 : 0;
  const inner = Math.max(el.w, noteW);
  const w = inner + 4 * R;
  const drop = Math.max(el.down + GAP_Y, 2 * R);
  return {
    w,
    up: el.up,
    down: drop + (note ? NOTE_H : 0),
    draw: (x, y, out) => {
      const ex = x + 2 * R + (inner - el.w) / 2;
      el.draw(ex, y, out);
      line(out, x, y, ex, y);
      line(out, ex + el.w, y, x + w, y);
      const bottom = y + drop;
      out.path.push(
        { op: 'M', x: x + w - 2 * R, y },
        { op: 'T', x: x + w - R, y: y + R, from: 'h' },
        { op: 'L', x: x + w - R, y: bottom - R },
        { op: 'T', x: x + w - 2 * R, y: bottom, from: 'v' },
        { op: 'L', x: x + 2 * R, y: bottom },
        { op: 'T', x: x + R, y: bottom - R, from: 'h' },
        { op: 'L', x: x + R, y: y + R },
        { op: 'T', x: x + 2 * R, y, from: 'v' },
      );
      if (note) out.notes.push({ x: x + 2 * R, y: bottom + 1, w: inner, h: NOTE_H - 2, text: note });
    },
  };
}

function block(node: RailroadNode): Block {
  switch (node.type) {
    case 'terminal':
      return box('terminal', oneLine(node.value));
    case 'nonterminal':
      return box('nonterminal', oneLine(node.name));
    case 'special':
      return box('special', oneLine(node.text));
    case 'sequence':
      return sequence(node.elements.map(block));
    case 'choice':
      return choice(node.alternatives.map(block));
    case 'optional':
      return optional(block(node.element));
    case 'repeat': {
      if (node.max === 0) return sequence([]);
      const loop = oneOrMore(block(node.element), repeatBounds(node.min, node.max));
      return node.min === 0 ? optional(loop) : loop;
    }
  }
}

function layRule(rule: RailroadRule, top: number): { rule: RailRuleLayout; width: number; height: number } {
  const def = block(rule.definition);
  const name = oneLine(rule.name);
  const trackY = top + HEAD_H + HEAD_GAP + def.up;
  const startX = MARGIN + DOT_R;
  const defX = startX + DOT_R + LEAD;
  const endX = defX + def.w + LEAD + DOT_R;
  const out: Out = { boxes: [], notes: [], path: [] };
  def.draw(defX, trackY, out);
  line(out, startX + DOT_R, trackY, defX, trackY);
  line(out, defX + def.w, trackY, endX - DOT_R, trackY);
  const headingW = Math.ceil(estimateTextWidth(name, RAILROAD_FONT_PT.heading * PX_PER_PT)) + 12;
  return {
    rule: {
      name: rule.name,
      heading: { x: MARGIN, y: top, w: headingW, h: HEAD_H, text: name },
      boxes: out.boxes,
      notes: out.notes,
      path: out.path,
      dots: [
        { cx: startX, cy: trackY, r: DOT_R },
        { cx: endX, cy: trackY, r: DOT_R },
      ],
    },
    width: Math.max(endX + DOT_R, MARGIN + headingW),
    height: HEAD_H + HEAD_GAP + def.up + def.down,
  };
}

/** Lay out every rule of `diagram`, top to bottom, under its title. */
export function layoutRailroad(diagram: RailroadDiagram): RailroadLayout {
  const titleText = diagram.title ? oneLine(diagram.title) : '';
  let y = MARGIN + (titleText ? TITLE_H : 0);
  let width = titleText ? MARGIN + Math.ceil(estimateTextWidth(titleText, RAILROAD_FONT_PT.title * PX_PER_PT)) + 12 : 0;
  const rules: RailRuleLayout[] = [];
  diagram.rules.forEach((rule, i) => {
    if (i > 0) y += RULE_GAP;
    const laid = layRule(rule, y);
    rules.push(laid.rule);
    y += laid.height;
    width = Math.max(width, laid.width);
  });
  return {
    width: width + MARGIN,
    height: y + MARGIN,
    ...(titleText ? { title: { x: MARGIN, y: MARGIN, w: width - MARGIN, h: TITLE_H - 6, text: titleText } } : {}),
    rules,
    turnRadius: R,
  };
}
