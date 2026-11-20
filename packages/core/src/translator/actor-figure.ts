/**
 * Geometry of the `actor` node shape (UML stick figure), shared by the OOXML and ODF translators so both
 * draw the same figure: a head, a body, arms and legs in the upper part of the node's box, and the label
 * in the part below. The figure keeps its proportions whatever the box (it is centred, sized by the box's
 * height and width, whichever is smaller), so a wide box does not stretch it.
 */

import { ACTOR_FIGURE_RATIO } from '../layout/layout.js';

/** A point, in the unit of the box it was computed for. */
export interface FigurePoint {
  x: number;
  y: number;
}

/** The figure's parts for a box of `width` x `height` (any unit; the result is in the same unit). */
export interface ActorFigure {
  /** Head circle. */
  head: { cx: number; cy: number; r: number };
  /** Open polylines: body, arms, legs. */
  strokes: FigurePoint[][];
  /** Top of the text area (the label sits between this and the bottom of the box). */
  textTop: number;
  /** The figure's own bounding box: connectors attach to its edges, not to the (wider) box of the label. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Connection sites, in the order top, left, bottom, right: the midpoints of {@link bounds}' edges. */
  sites: FigurePoint[];
}

/** A box in any unit. */
interface BoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The part of an actor's box that connectors attach to: its figure. `box` and the result share a unit. */
export function actorConnectBox(box: BoxLike): BoxLike {
  const { bounds } = actorFigure(box.width, box.height);
  return { x: box.x + bounds.x, y: box.y + bounds.y, width: bounds.width, height: bounds.height };
}

/** Compute the figure for a box. */
export function actorFigure(width: number, height: number): ActorFigure {
  const fh = height * ACTOR_FIGURE_RATIO;
  // Figure height, capped so a narrow box does not clip the arms.
  // Also kept a little short of the label area, so the legs never touch the label.
  const size = Math.min(fh * 0.84, width * 1.3);
  const cx = width / 2;
  const top = (fh - size) / 2;
  const r = size * 0.15;
  const neck = top + 2 * r;
  const hip = top + size * 0.62;
  const arms = top + size * 0.38;
  const armSpan = size * 0.3;
  const legSpan = size * 0.24;
  const bottom = top + size;
  return {
    head: { cx, cy: top + r, r },
    strokes: [
      [{ x: cx, y: neck }, { x: cx, y: hip }],
      [{ x: cx - armSpan, y: arms }, { x: cx + armSpan, y: arms }],
      [{ x: cx - legSpan, y: bottom }, { x: cx, y: hip }, { x: cx + legSpan, y: bottom }],
    ],
    textTop: fh,
    // Down to the bottom of the box, so a connector leaves below the label instead of crossing it.
    bounds: { x: cx - armSpan, y: top, width: 2 * armSpan, height: height - top },
    sites: [
      { x: cx, y: top },
      { x: cx - armSpan, y: top + (height - top) / 2 },
      { x: cx, y: height },
      { x: cx + armSpan, y: top + (height - top) / 2 },
    ],
  };
}
