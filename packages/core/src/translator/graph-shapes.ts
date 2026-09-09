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
  const flip = (x2 - x1) * (y2 - y1) < 0;
  const flipAttr = flip ? ' flipV="1"' : '';
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
