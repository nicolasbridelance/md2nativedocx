/**
 * The UML symbols a sequence participant can be drawn as above its label: the actor's stick figure and
 * the robustness-analysis trio (boundary, control, entity), plus the database cylinder. Each is one
 * DrawingML shape with its own geometry, so it moves and scales as a whole in Word and PowerPoint. The
 * shapes follow the UML convention Mermaid also draws; the geometry is this project's own.
 */

import type { SequenceParticipant } from './types.js';

/** Height of the band every symbol sits in, above the label (logical px). */
export const GLYPH_BAND = 34;

/** Glyph-drawn participants: the symbol above the label, rather than the label inside a box. */
export type GlyphKind = 'actor' | 'boundary' | 'control' | 'entity' | 'database';

export interface Glyph {
  /** Size of the shape (logical px). */
  w: number;
  h: number;
  /** Distance from the shape's left edge to the lifeline: the symbol's axis (a boundary's circle, not its bar). */
  axis: number;
  /** Custom geometry (`a:custGeom`) of the shape, or a preset (`a:prstGeom`) name. */
  geometry: { custom: string } | { preset: string };
}

/** The glyph kind a participant is drawn with, or `undefined` for a box (plain, `collections`, `queue`). */
export function glyphKind(p: SequenceParticipant): GlyphKind | undefined {
  if (p.kind === 'collections' || p.kind === 'queue') return undefined;
  return p.kind ?? (p.actor ? 'actor' : undefined);
}

/** Path units per logical px: paths are authored in px and scaled to the shape by DrawingML itself. */
const UNIT = 10;
const u = (v: number): number => Math.round(v * UNIT);
const R = 13;

const circle = (cx: number, cy: number, r: number): string =>
  `<a:moveTo><a:pt x="${u(cx - r)}" y="${u(cy)}"/></a:moveTo><a:arcTo wR="${u(r)}" hR="${u(r)}" stAng="10800000" swAng="21600000"/><a:close/>`;
const polyline = (points: Array<[number, number]>, closed = false): string =>
  points.map(([x, y], i) => `<a:${i === 0 ? 'moveTo' : 'lnTo'}><a:pt x="${u(x)}" y="${u(y)}"/></a:${i === 0 ? 'moveTo' : 'lnTo'}>`).join('') +
  (closed ? '<a:close/>' : '');

/** A custom geometry of `w` x `h` px whose paths are given as `[fill, path ops]`. */
function custom(w: number, h: number, paths: Array<['norm' | 'none' | 'darken', string]>): { custom: string } {
  const body = paths.map(([fill, ops]) => `<a:path w="${u(w)}" h="${u(h)}"${fill === 'norm' ? '' : ` fill="${fill}"`}>${ops}</a:path>`).join('');
  return { custom: `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst>${body}</a:pathLst></a:custGeom>` };
}

/** The symbol of a glyph kind. */
export function glyph(kind: GlyphKind): Glyph {
  switch (kind) {
    case 'actor':
      return {
        w: 24,
        h: GLYPH_BAND,
        axis: 12,
        geometry: custom(24, GLYPH_BAND, [
          ['norm', circle(12, 5, 5)],
          ['none', polyline([[12, 10], [12, 22]]) + polyline([[2, 14], [22, 14]]) + polyline([[4, GLYPH_BAND], [12, 22], [20, GLYPH_BAND]])],
        ]),
      };
    case 'boundary':
      // A circle on the lifeline, joined on its left to a vertical bar.
      return {
        w: 12 + 2 * R,
        h: 2 * R,
        axis: 12 + R,
        geometry: custom(12 + 2 * R, 2 * R, [
          ['norm', circle(12 + R, R, R)],
          ['none', polyline([[0, 0], [0, 2 * R]]) + polyline([[0, R], [12, R]])],
        ]),
      };
    case 'control':
      // A circle with an arrowhead on its top, pointing left.
      return {
        w: 2 * R,
        h: 2 * R + 4,
        axis: R,
        geometry: custom(2 * R, 2 * R + 4, [
          ['norm', circle(R, R + 4, R)],
          ['darken', polyline([[R + 4, 0], [R - 5, 4], [R + 4, 8]], true)],
        ]),
      };
    case 'entity':
      // A circle resting on a horizontal line.
      return {
        w: 2 * R,
        h: 2 * R + 4,
        axis: R,
        geometry: custom(2 * R, 2 * R + 4, [
          ['norm', circle(R, R, R)],
          ['none', polyline([[0, 2 * R + 4], [2 * R, 2 * R + 4]])],
        ]),
      };
    case 'database':
      return { w: 26, h: 32, axis: 13, geometry: { preset: 'can' } };
  }
}

/** Half-width of a `queue` cylinder's end cap (logical px): narrow, so the label keeps the body. */
export const QUEUE_CAP = 6;

/**
 * A `queue` participant: a cylinder lying on its side, `w` x `h` px, its visible end on the right. Drawn
 * here rather than with Word's `flowChartMagneticDrum`, whose caps take a third of the width whatever the
 * height and run into the label.
 */
export function queueGlyph(w: number, h: number): Glyph {
  const rx = QUEUE_CAP;
  const ry = h / 2;
  const arc = (stAng: number, swAng: number): string => `<a:arcTo wR="${u(rx)}" hR="${u(ry)}" stAng="${stAng}" swAng="${swAng}"/>`;
  const outline =
    `<a:moveTo><a:pt x="${u(rx)}" y="0"/></a:moveTo><a:lnTo><a:pt x="${u(w - rx)}" y="0"/></a:lnTo>${arc(16200000, 10800000)}` +
    `<a:lnTo><a:pt x="${u(rx)}" y="${u(h)}"/></a:lnTo>${arc(5400000, 10800000)}<a:close/>`;
  const end = `<a:moveTo><a:pt x="${u(w - 2 * rx)}" y="${u(ry)}"/></a:moveTo>${arc(10800000, 21600000)}<a:close/>`;
  return { w, h, axis: w / 2, geometry: custom(w, h, [['norm', outline], ['none', end]]) };
}

/** One `wps:wsp` drawing `g` (a symbol, or a box-sized shape such as the queue cylinder) at (`x`, `y`) EMU, `w` x `h` EMU, outline `lineEmu` wide. */
export function glyphShape(id: number, x: number, y: number, w: number, h: number, g: Glyph, fill: string, line: string, lineEmu: number): string {
  const geometry = 'custom' in g.geometry ? g.geometry.custom : `<a:prstGeom prst="${g.geometry.preset}"><a:avLst/></a:prstGeom>`;
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Participant symbol ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    `    ${geometry}`,
    `    <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`,
    `    <a:ln w="${lineEmu}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>`,
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}
