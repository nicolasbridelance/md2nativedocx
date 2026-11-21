/**
 * Building blocks for DrawingML custom geometries (`a:custGeom`): paths authored in logical px, scaled to
 * the shape by DrawingML itself, so a symbol moves and resizes as one shape in Word and PowerPoint.
 * Extracted from `../diagrams/sequence/participant-glyph.ts` when the C4 translator became its second
 * consumer (person, horizontal cylinder).
 */

/** Path units per logical px: enough resolution for arcs and fractional sizes. */
const UNIT = 10;

/** Logical px -> path units. */
export const pathUnits = (v: number): number => Math.round(v * UNIT);

/** A closed circle of radius `r` centred on (`cx`, `cy`). */
export function circlePath(cx: number, cy: number, r: number): string {
  const u = pathUnits;
  return `<a:moveTo><a:pt x="${u(cx - r)}" y="${u(cy)}"/></a:moveTo><a:arcTo wR="${u(r)}" hR="${u(r)}" stAng="10800000" swAng="21600000"/><a:close/>`;
}

/** A polyline through `points`, closed when `closed`. */
export function polylinePath(points: Array<[number, number]>, closed = false): string {
  const u = pathUnits;
  return (
    points.map(([x, y], i) => `<a:${i === 0 ? 'moveTo' : 'lnTo'}><a:pt x="${u(x)}" y="${u(y)}"/></a:${i === 0 ? 'moveTo' : 'lnTo'}>`).join('') +
    (closed ? '<a:close/>' : '')
  );
}

/** A rectangle at (`x`, `y`), `w` x `h`, with corners of radius `r` (clamped to half the shorter side). */
export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const u = pathUnits;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const arc = (stAng: number): string => `<a:arcTo wR="${u(rr)}" hR="${u(rr)}" stAng="${stAng}" swAng="5400000"/>`;
  return (
    `<a:moveTo><a:pt x="${u(x + rr)}" y="${u(y)}"/></a:moveTo>` +
    `<a:lnTo><a:pt x="${u(x + w - rr)}" y="${u(y)}"/></a:lnTo>${arc(16200000)}` +
    `<a:lnTo><a:pt x="${u(x + w)}" y="${u(y + h - rr)}"/></a:lnTo>${arc(0)}` +
    `<a:lnTo><a:pt x="${u(x + rr)}" y="${u(y + h)}"/></a:lnTo>${arc(5400000)}` +
    `<a:lnTo><a:pt x="${u(x)}" y="${u(y + rr)}"/></a:lnTo>${arc(10800000)}<a:close/>`
  );
}

/**
 * A custom geometry of `w` x `h` px whose paths are given as `[fill, path ops]`: `norm` is filled and
 * outlined, `none` only outlined, `darken` filled with a darker shade of the fill.
 */
export function customGeometry(w: number, h: number, paths: Array<['norm' | 'none' | 'darken', string]>): string {
  const body = paths
    .map(([fill, ops]) => `<a:path w="${pathUnits(w)}" h="${pathUnits(h)}"${fill === 'norm' ? '' : ` fill="${fill}"`}>${ops}</a:path>`)
    .join('');
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst>${body}</a:pathLst></a:custGeom>`;
}

/**
 * A cylinder lying on its side, `w` x `h` px, its visible end on the right, end caps `cap` px wide. Drawn
 * here rather than with Word's `flowChartMagneticDrum`, whose caps take a third of the width whatever the
 * height.
 */
export function horizontalCylinderGeometry(w: number, h: number, cap: number): string {
  const u = pathUnits;
  const rx = cap;
  const ry = h / 2;
  const arc = (stAng: number, swAng: number): string => `<a:arcTo wR="${u(rx)}" hR="${u(ry)}" stAng="${stAng}" swAng="${swAng}"/>`;
  const outline =
    `<a:moveTo><a:pt x="${u(rx)}" y="0"/></a:moveTo><a:lnTo><a:pt x="${u(w - rx)}" y="0"/></a:lnTo>${arc(16200000, 10800000)}` +
    `<a:lnTo><a:pt x="${u(rx)}" y="${u(h)}"/></a:lnTo>${arc(5400000, 10800000)}<a:close/>`;
  const end = `<a:moveTo><a:pt x="${u(w - 2 * rx)}" y="${u(ry)}"/></a:moveTo>${arc(10800000, 21600000)}<a:close/>`;
  return customGeometry(w, h, [['norm', outline], ['none', end]]);
}
