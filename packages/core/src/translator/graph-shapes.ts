/**
 * Shared node/connector shape helpers for Family B diagram translators
 * (`docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §3 — "graphe nœuds/
 * arêtes, réutilise Dagre + traducteur étendu"). Extracted from
 * `../diagrams/class-diagram/translator.ts` once
 * `../diagrams/state-diagram/translator.ts` needed the exact same
 * primitives (straight relationship line trimmed to each box's border, with
 * an optional `a:headEnd`/`a:tailEnd` marker; a plain filled/bordered rect;
 * a multi-line text box) — the same
 * "extract once a second real consumer needs it" convention `canvas.ts`
 * itself was born from (see that module's doc comment).
 *
 * Not used by `quadrant`/`venn`/`mindmap`'s translators: those have simpler
 * needs (a single-line label, center-to-center connectors with no per-type
 * marker/dash), and already had working private copies before this module
 * existed — left alone rather than churned for a refactor they don't need.
 */

import { escapeXml } from './xml-escape.js';
import { EMU_PER_PX } from './canvas.js';

/** `a:headEnd`/`a:tailEnd` marker presets this project has confirmed render
 * correctly (see `../translator/ooxml-translator.ts`'s `ArrowMarker`). */
export type ArrowMarker = 'none' | 'triangle' | 'oval' | 'diamond';

export function scalePt(px: number, factor: number): number {
  return Math.round(px * EMU_PER_PX * factor);
}

/** Point where the ray from a box's center toward `(tx, ty)` crosses the
 * box's own axis-aligned border — used to trim a relationship line to each
 * box's edge instead of drawing it center-to-center through both boxes. */
export function edgePoint(cx: number, cy: number, halfW: number, halfH: number, tx: number, ty: number): { x: number; y: number } {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const k = Math.min(scaleX, scaleY);
  return { x: cx + dx * k, y: cy + dy * k };
}

/**
 * How far the `index`-th of `count` relationships sharing the same node
 * pair should be pushed off the direct line between them, perpendicular to
 * it — without this, two or more relationships between the same two boxes
 * (e.g. `requirementDiagram`'s `A - traces -> B` and `A <- derives - B`)
 * draw exactly on top of each other, garbling both labels into one
 * illegible overlap. Found via a real render of
 * `test-corpus/visual/fixtures/requirement-diagram.mmd` (2026-09-09) — not
 * a hypothetical: `test_req`/`test_req2` in that fixture have 2
 * relationships between them, and unit tests alone (XML-structure-only,
 * same as every past "found by real render" bug in this project) had
 * nothing to catch a purely-visual overlap. Callers group relationships by
 * an unordered pair key (`[a, b].sort().join('|')`, since `A - x -> B` and
 * `B <- x - A` sit on the same line regardless of direction) and pass this
 * relationship's position within that group.
 */
export function parallelEdgeOffset(index: number, count: number, gapPx = 14): number {
  if (count <= 1) return 0;
  return (index - (count - 1) / 2) * gapPx;
}

/**
 * Unit vector perpendicular to the line from `p1` to `p2`. Degenerates to
 * `(0,0)` for a zero-length line (nothing meaningful to be perpendicular
 * to).
 *
 * **Must be computed once from a canonical (direction-independent) pair of
 * points per node pair, not from each relationship's own `p1`/`p2`** — two
 * relationships between the same nodes but opposite documented directions
 * (`A - x -> B` and `A <- y - B`, i.e. `{from:A,to:B}` and `{from:B,to:A}`)
 * have swapped `p1`/`p2`, which flips this vector's sign; combined with
 * {@link parallelEdgeOffset} assigning them opposite-signed offsets, the
 * two sign flips cancel out and both lines end up shifted onto the *same*
 * side by the *same* amount — coincident again, not parallel. Callers
 * must derive `p1`/`p2` here from a fixed canonical ordering (e.g. the two
 * node names sorted) and apply the resulting vector via {@link shiftPoint}
 * to each relationship's own actual endpoints.
 */
export function perpendicularUnit(p1: { x: number; y: number }, p2: { x: number; y: number }): { ux: number; uy: number } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { ux: 0, uy: 0 };
  return { ux: -dy / len, uy: dx / len };
}

/** Shift a point by `amount` along the `(ux, uy)` unit vector — see
 * {@link perpendicularUnit}'s doc comment for why that vector must come
 * from a canonical pair, not from the point being shifted. */
export function shiftPoint(p: { x: number; y: number }, ux: number, uy: number, amount: number): { x: number; y: number } {
  return { x: p.x + ux * amount, y: p.y + uy * amount };
}

export function rect(id: number, x: number, y: number, w: number, h: number, fill: string | undefined, line: string | undefined, name: string, roundRect = false): string {
  const fillXml = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>';
  const lineXml = line
    ? `<a:ln w="9525"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>`
    : '<a:ln><a:noFill/></a:ln>';
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="${escapeXml(name)}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    `    <a:prstGeom prst="${roundRect ? 'roundRect' : 'rect'}"><a:avLst/></a:prstGeom>`,
    fillXml,
    lineXml,
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

export function ellipse(id: number, x: number, y: number, w: number, h: number, fill: string, line?: string): string {
  const lineXml = line
    ? `<a:ln w="9525"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>`
    : '<a:ln><a:noFill/></a:ln>';
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Shape ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    '    <a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>',
    `    <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`,
    lineXml,
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

export function diamond(id: number, x: number, y: number, w: number, h: number, fill: string, line: string): string {
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Shape ${id}"/>`,
    '  <wps:cNvSpPr/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    '    <a:prstGeom prst="diamond"><a:avLst/></a:prstGeom>',
    `    <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`,
    `    <a:ln w="9525"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>`,
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ].join('\n');
}

const WORD_JC: Readonly<Record<'l' | 'ctr', 'left' | 'center'>> = { l: 'left', ctr: 'center' };

export function textBoxLines(
  id: number,
  x: number,
  y: number,
  w: number,
  h: number,
  lines: string[],
  sizeHalfPt: number,
  opts: { bold?: boolean; align?: 'l' | 'ctr'; color?: string } = {},
): string {
  const align = opts.align ?? 'l';
  const boldAttr = opts.bold ? '<w:b/>' : '';
  const color = opts.color ?? '000000';
  const paragraphs = lines
    .map(
      (line) =>
        `      <w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="${WORD_JC[align]}"/></w:pPr>` +
        `<w:r><w:rPr>${boldAttr}<w:color w:val="${color}"/><w:sz w:val="${sizeHalfPt}"/></w:rPr>` +
        `<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`,
    )
    .join('\n');
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Text ${id}"/>`,
    '  <wps:cNvSpPr txBox="1"/>',
    '  <wps:spPr>',
    `    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${Math.max(1, w)}" cy="${Math.max(1, h)}"/></a:xfrm>`,
    '    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
    '    <a:noFill/>',
    '    <a:ln><a:noFill/></a:ln>',
    '  </wps:spPr>',
    '  <wps:txbx>',
    '    <w:txbxContent>',
    paragraphs,
    '    </w:txbxContent>',
    '  </wps:txbx>',
    `  <wps:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${align === 'ctr' ? 'ctr' : 't'}"/>`,
    '</wps:wsp>',
  ].join('\n');
}

/**
 * A straight relationship/edge line, `wps:wsp` + `wps:cNvCnPr` (the one
 * confirmed-working connector primitive in this project's `wpc:wpc` canvas
 * under LibreOffice — see `../diagrams/mindmap/translator.ts`'s `connector()`
 * doc comment) plus `a:headEnd`/`a:tailEnd` markers, the same mechanism
 * `./ooxml-translator.ts` uses for flowchart arrowheads.
 */
export function connector(
  id: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colorHex: string,
  widthEmu: number,
  dash: 'solid' | 'dash',
  headEnd: ArrowMarker,
  headSize: 'sm' | 'lg',
  tailEnd: ArrowMarker,
  tailSize: 'sm' | 'lg',
): string {
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const w = Math.max(1, Math.abs(x2 - x1));
  const h = Math.max(1, Math.abs(y2 - y1));
  // The `line` preset's own unflipped path runs local (0,0) -> (w,h), i.e.
  // absolute (minX,minY) -> (maxX,maxY) — so `headEnd` (which decorates the
  // path start) only lands on `(x1,y1)` for free when `x1<=x2 && y1<=y2`.
  // In every other of the 4 quadrant cases, a single combined `flipV`
  // (the previous implementation: `flipV` iff `(x2-x1)*(y2-y1) < 0`) gets 2
  // of the 4 right by coincidence and silently swaps `headEnd`/`tailEnd`
  // onto the wrong endpoint in the other 2 — found via a real render
  // (`test-corpus/visual/fixtures/er-diagram.mmd`: a cardinality marker
  // landed on the wrong entity whenever `x1 > x2`, regardless of `y`).
  // Fixed by flipping each axis independently: flip horizontally whenever
  // `x1` is the larger x, flip vertically whenever `y1` is the larger y —
  // this provably keeps local (0,0)/`headEnd` pinned to `(x1,y1)` and local
  // (w,h)/`tailEnd` to `(x2,y2)` in all 4 cases (worked through by hand: the
  // displayed position of local (0,0) under {flipH,flipV} is
  // {no flip: (minX,minY), flipV only: (minX,maxY), flipH only:
  // (maxX,minY), both: (maxX,maxY)} — exactly the 4 possible `(x1,y1)`
  // corners depending on its relation to `x2`/`y2`).
  const flipH = x1 > x2;
  const flipV = y1 > y2;
  const flipAttr = `${flipH ? ' flipH="1"' : ''}${flipV ? ' flipV="1"' : ''}`;
  const headXml = headEnd !== 'none' ? `      <a:headEnd type="${headEnd}" w="${headSize}" len="${headSize}"/>` : '';
  const tailXml = tailEnd !== 'none' ? `      <a:tailEnd type="${tailEnd}" w="${tailSize}" len="${tailSize}"/>` : '';
  return [
    '<wps:wsp>',
    `  <wps:cNvPr id="${id}" name="Connector ${id}"/>`,
    '  <wps:cNvCnPr/>',
    '  <wps:spPr>',
    `    <a:xfrm${flipAttr}><a:off x="${minX}" y="${minY}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`,
    '    <a:prstGeom prst="line"><a:avLst/></a:prstGeom>',
    `    <a:ln w="${widthEmu}">`,
    `      <a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill>`,
    `      <a:prstDash val="${dash}"/>`,
    headXml,
    tailXml,
    '    </a:ln>',
    '  </wps:spPr>',
    '  <wps:bodyPr/>',
    '</wps:wsp>',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}
