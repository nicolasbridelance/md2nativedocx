/**
 * A routed edge as Word's own elbow connector (`bentConnector5`) instead of a free-form path.
 *
 * Word loads a connector whose geometry is an `a:custGeom` as a free-form shape: its `stCxn`/`endCxn`
 * attachments are dropped and the line no longer follows its nodes when they move (measured on Word
 * 16.0.20625 by the agent benchmark, `ROUTED_CONNECTOR_RESULTS.md`). A preset connector stays attached.
 * `bentConnector5` draws, in its own box, `(0,0) -> (x1,0) -> (x1,y2) -> (x3,y2) -> (x3,h) -> (w,h)` with
 * `x1 = w*adj1/100000`, `y2 = h*adj2/100000`, `x3 = w*adj3/100000` (ECMA-376 `presetShapeDefinitions.xml`):
 * an exit stub, a leg out to a lane parallel to the flow, the lane, a leg back and an entry stub. That is
 * the shape of the detour Dagre computes around an intermediate node, squared off.
 *
 * Everything here works in a local frame: origin at the source's connection site, `u` along the direction
 * the connector leaves the source, `v` across it.
 */

export interface Point {
  x: number;
  y: number;
}

/** A unit vector along one axis: the direction a connector leaves its source. */
export interface Direction {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
}

/** The six corners of a `bentConnector5` path, start to end. */
export type ElbowRoute = [Point, Point, Point, Point, Point, Point];

const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

/** The perpendicular of `d` used as the `v` axis before it is oriented towards the detour. */
const across = (d: Direction): Point => ({ x: -d.y, y: d.x });

/**
 * The elbow route from `start` to `end` through the lane Dagre's `waypoints` run along, or `undefined`
 * when no squared-off route stays clear of every obstacle (the caller then keeps Dagre's own polyline).
 *
 * The two legs stand where Dagre's detour leaves and rejoins the straight run (first and last waypoint
 * along the flow). The lane is the line across the flow where most of the detour runs; when that one
 * is blocked, each other line a waypoint sits on is tried, so the route only ever uses a corridor Dagre
 * itself reserved. `clear(a, b)` says whether segment `a`-`b` avoids every node other than the two ends.
 */
export function elbowRoute(
  start: Point,
  end: Point,
  exit: Direction,
  waypoints: Point[],
  clear: (a: Point, b: Point) => boolean,
): ElbowRoute | undefined {
  const v = across(exit);
  const length = dot(sub(end, start), exit);
  if (length <= 0 || waypoints.length === 0) return undefined;
  const local = waypoints.map((p) => ({ u: dot(sub(p, start), exit), v: dot(sub(p, start), v) }));
  const x1 = local[0]!.u;
  const x3 = local[local.length - 1]!.u;
  if (x1 <= 0 || x3 >= length || x1 > x3) return undefined;

  // Each line across the flow, weighted by how much of the detour runs along it.
  const runs = new Map<number, number>();
  local.forEach((p, i) => {
    const next = local[i + 1];
    const run = next && next.v === p.v ? Math.abs(next.u - p.u) : 0;
    runs.set(p.v, (runs.get(p.v) ?? 0) + run);
  });
  const lanes = [...runs.entries()].sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0])).map(([lane]) => lane);

  const toScreen = (u: number, w: number): Point => ({
    x: start.x + u * exit.x + w * v.x,
    y: start.y + u * exit.y + w * v.y,
  });
  const endAcross = dot(sub(end, start), v);
  for (const lane of lanes) {
    const route: ElbowRoute = [start, toScreen(x1, 0), toScreen(x1, lane), toScreen(x3, lane), toScreen(x3, endAcross), end];
    if (route.every((p, i) => i === 0 || clear(route[i - 1]!, p))) return route;
  }
  return undefined;
}

/** Largest `adj` value written: a guide formula's `val` is read as a 32-bit integer. */
const MAX_ADJ = 2 ** 31 - 1;

/**
 * The `a:xfrm` and `a:prstGeom` drawing `route` (EMU) as a `bentConnector5` that leaves its source along
 * `exit`.
 *
 * DrawingML draws a preset in its unrotated box, mirrors it (`flipH`/`flipV`), then turns it by `rot`
 * about the box's centre. The box's `x` axis must end up along `exit` and its `y` axis across it, towards
 * the end of the route: a horizontal exit needs no rotation, a vertical one a quarter turn (`rot` of 90°
 * clockwise maps the box's `x` axis to screen `y` and its `y` axis to screen `-x`); the flips then pick
 * the sense of each axis.
 *
 * When the route ends level with its start (the usual detour between two nodes on the same row), the
 * box would have no height to scale `adj2` by, and a very thin one would push `adj2` past 32 bits. The
 * height is then the smallest that keeps every `adj` a 32-bit integer; the drawn end moves across the
 * flow by that height, under 1,000 EMU (0.03 mm) for a lane anywhere on a page, and Word keeps the
 * connector attached to its node regardless.
 */
export function elbowConnectorGeometry(route: ElbowRoute, exit: Direction): string {
  const [start, legOut, laneStart, , legBack, end] = route;
  const toEnd = sub(end, start);
  const cx = dot(toEnd, exit);
  let w = across(exit);
  if (dot(toEnd, w) < 0 || (dot(toEnd, w) === 0 && dot(sub(laneStart, start), w) < 0)) w = { x: -w.x, y: -w.y };
  const laneAcross = dot(sub(laneStart, start), w);
  const minHeight = Math.ceil((Math.abs(laneAcross) * 100000) / MAX_ADJ);
  const cy = Math.max(1, dot(toEnd, w), minHeight);

  const vertical = exit.x === 0;
  // rot 0: x axis = (sx, 0), y axis = (0, sy). rot 90°: x axis = (0, sx), y axis = (-sy, 0).
  const flipH = vertical ? exit.y < 0 : exit.x < 0;
  const flipV = vertical ? w.x > 0 : w.y < 0;
  const centre = { x: start.x + (exit.x * cx + w.x * cy) / 2, y: start.y + (exit.y * cx + w.y * cy) / 2 };
  const adj = (value: number, size: number): number => Math.round((value * 100000) / size);
  const adj1 = adj(dot(sub(legOut, start), exit), cx);
  const adj2 = adj(laneAcross, cy);
  const adj3 = adj(dot(sub(legBack, start), exit), cx);

  const attrs = `${vertical ? ' rot="5400000"' : ''}${flipH ? ' flipH="1"' : ''}${flipV ? ' flipV="1"' : ''}`;
  return [
    `      <a:xfrm${attrs}>`,
    `        <a:off x="${Math.round(centre.x - cx / 2)}" y="${Math.round(centre.y - cy / 2)}"/>`,
    `        <a:ext cx="${cx}" cy="${cy}"/>`,
    '      </a:xfrm>',
    '      <a:prstGeom prst="bentConnector5">',
    '        <a:avLst>',
    `          <a:gd name="adj1" fmla="val ${adj1}"/>`,
    `          <a:gd name="adj2" fmla="val ${adj2}"/>`,
    `          <a:gd name="adj3" fmla="val ${adj3}"/>`,
    '        </a:avLst>',
    '      </a:prstGeom>',
  ].join('\n');
}
