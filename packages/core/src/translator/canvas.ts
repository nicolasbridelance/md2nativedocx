/**
 * Shared drawing-canvas plumbing for every OOXML translator in this project —
 * extracted from `ooxml-translator.ts` (the flowchart translator, which keeps
 * its own private copy unchanged to avoid touching stable, heavily-tested
 * code for a pure refactor) once a second real consumer
 * (`../diagrams/quadrant/translator.ts`) needed the exact same envelope:
 * `w:p -> w:r -> w:drawing -> wp:inline -> a:graphic -> a:graphicData ->
 * wpc:wpc -> [shapes]`. Every future non-flowchart diagram family
 * (`docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §4 item 3,
 * "découplage layout/traducteur par famille") should use this rather than
 * re-deriving the envelope, including the empirically-found LibreOffice
 * narrow-tall safety margin below.
 */

import type { GraphLimits } from '../layout/graph-limits.js';
import { escapeXml } from './xml-escape.js';

/** Pixels -> EMU (English Metric Units). Word uses 914400 EMU per inch; at 96
 * DPI that is 9525 EMU per pixel. */
export const EMU_PER_PX = 9525;

/** Namespaces declared inline on the canvas (self-contained, AGENTS.md rule #3). */
export const NS = {
  wpg: 'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"',
  wps: 'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
  wp: 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  a: 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  pic: 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  r: 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  w: 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
};

/** Every shape/group id in a drawing must be distinct or Word reports the
 * file as corrupt (verified against a real Word-authored document, see
 * `ooxml-translator.ts`'s module doc comment). Per-call, not module-level, so
 * translators stay pure functions. */
export function createIdAllocator(): () => number {
  let next = 1;
  return () => next++;
}

/** Never scale a run below this — matches `ooxml-translator.ts`'s
 * `MIN_FONT_SIZE_HALFPT` (same rationale: this only prevents an invalid/zero
 * `w:sz`, a diagram scaled this far down already has other legibility
 * problems). */
const MIN_FONT_SIZE_HALFPT = 4;

/**
 * Scale a base `w:sz` (half-points) by {@link scaledExtent}'s `scale`.
 * Every text size passed to a `wps:txbx` run **must** go through this (or be
 * scaled some other way) once the canvas can exceed the page-fit size — found
 * missing from `diagrams/quadrant/translator.ts` and `diagrams/venn/translator.ts`
 * by a real-render audit of `diagrams/mindmap/translator.ts` (2026-09-04): box
 * *dimensions* shrink with `scale` (every `scalePt` call already applies it),
 * but an unscaled font size does not shrink to match, so a large diagram
 * renders its labels visibly overflowing/clipped past their own box — exactly
 * `ooxml-translator.ts`'s `scaledFontSizeHalfPt` already solves for flowchart.
 * Quadrant/venn happened to never hit `scale < 1` in testing so the bug
 * stayed latent there; fixed in all three call sites once found.
 */
export function scaledFontSizeHalfPt(baseHalfPt: number, scale: number): number {
  return Math.max(MIN_FONT_SIZE_HALFPT, Math.round(baseHalfPt * scale));
}

/** Never scale a stroke below this (EMU) — matches `ooxml-translator.ts`'s
 * `MIN_LINE_WIDTH_EMU` (0.25pt; a hairline that would otherwise round to 0
 * and disappear once `scale` is small enough). */
const MIN_LINE_WIDTH_EMU = 3175;

/** Scale a base `a:ln` stroke width (EMU) by {@link scaledExtent}'s `scale`,
 * same rationale and floor as {@link scaledFontSizeHalfPt} above. */
export function scaledLineWidthEmu(baseEmu: number, scale: number): number {
  return Math.max(MIN_LINE_WIDTH_EMU, Math.round(baseEmu * scale));
}

/** See `ooxml-translator.ts`'s `MAX_DRAWING_CX`/`MAX_DRAWING_CY` doc comment
 * — usable page area in EMU for Pandoc's default reference document. */
const MAX_DRAWING_CX = 5943600;
const MAX_DRAWING_CY = 8229600;

/**
 * Optional override of the usable area (EMU) a drawing is scaled down to fit.
 * Same meaning as `TranslateOptions.maxDrawingCx`/`maxDrawingCy` for flowcharts;
 * absent fields fall back to the Pandoc-default-page constants above.
 */
export interface CanvasOptions extends GraphLimits {
  /** Maximum drawing width in EMU. */
  maxDrawingCx?: number;
  /** Maximum drawing height in EMU. */
  maxDrawingCy?: number;
}

/** See `ooxml-translator.ts`'s `TALL_RATIO_RISK_HEIGHT`/`MIN_SAFE_ASPECT_RATIO`
 * doc comment — the empirically-found LibreOffice headless-render cliff for a
 * tall, narrow `wpc:wpc`. */
const TALL_RATIO_RISK_HEIGHT = 6858000; // 7.5in
const MIN_SAFE_ASPECT_RATIO = 1.0;

function nativeExtent(widthPx: number, heightPx: number): { cx: number; cy: number } {
  const nativeCx = Math.max(1, Math.round(widthPx * EMU_PER_PX));
  const nativeCy = Math.max(1, Math.round(heightPx * EMU_PER_PX));
  if (nativeCy > TALL_RATIO_RISK_HEIGHT && nativeCx / nativeCy < MIN_SAFE_ASPECT_RATIO) {
    return { cx: Math.round(nativeCy * MIN_SAFE_ASPECT_RATIO), cy: nativeCy };
  }
  return { cx: nativeCx, cy: nativeCy };
}

/**
 * Pixel canvas size -> the EMU extent of the drawing frame, scaled down
 * uniformly (never up) if it would not fit the usable page area. `scale`
 * must be applied to every child shape's own coordinates by the caller —
 * there is no enclosing group transform here (see `ooxml-translator.ts`'s
 * `renderContent` doc comment for why this project stopped relying on one).
 */
export function scaledExtent(
  widthPx: number,
  heightPx: number,
  options: CanvasOptions = {},
): { cx: number; cy: number; scale: number } {
  const { cx: nativeCx, cy: nativeCy } = nativeExtent(widthPx, heightPx);
  const scale = Math.min(
    1,
    (options.maxDrawingCx ?? MAX_DRAWING_CX) / nativeCx,
    (options.maxDrawingCy ?? MAX_DRAWING_CY) / nativeCy,
  );
  return {
    cx: Math.max(1, Math.round(nativeCx * scale)),
    cy: Math.max(1, Math.round(nativeCy * scale)),
    scale,
  };
}

/**
 * Wrap shape XML (already scaled by the caller per {@link scaledExtent}'s
 * `scale`) in the schema-required paragraph/drawing/canvas envelope.
 *
 * @param content - Shapes (`wps:wsp` etc.), already-scaled coordinates.
 * @param widthPx - Unscaled canvas width in logical pixels.
 * @param heightPx - Unscaled canvas height in logical pixels.
 * @param docPrId - Unique drawing id (must not collide with any shape id).
 * @param name - Human-readable name for `wp:docPr` (Word's Selection Pane).
 */
export function wrapDrawingCanvas(
  content: string,
  widthPx: number,
  heightPx: number,
  docPrId: number,
  name: string,
  options: CanvasOptions = {},
): string {
  const { cx, cy } = scaledExtent(widthPx, heightPx, options);
  content = clampLabelFrames(content, cx);
  return [
    `<w:p ${NS.w}>`,
    '  <w:r>',
    '    <w:drawing>',
    `      <wp:inline ${NS.wp} distT="0" distB="0" distL="0" distR="0">`,
    `        <wp:extent cx="${cx}" cy="${cy}"/>`,
    '        <wp:effectExtent l="0" t="0" r="0" b="0"/>',
    `        <wp:docPr id="${docPrId}" name="${escapeXml(name)}"/>`,
    '        <wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>',
    `        <a:graphic ${NS.a}>`,
    '          <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas">',
    `            <wpc:wpc xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ${NS.wpg} ${NS.wps} ${NS.pic} ${NS.r}>`,
    '              <wpc:bg><a:solidFill><a:prstClr val="white"/></a:solidFill></wpc:bg>',
    '              <wpc:whole/>',
    content,
    '            </wpc:wpc>',
    '          </a:graphicData>',
    '        </a:graphic>',
    '      </wp:inline>',
    '    </w:drawing>',
    '  </w:r>',
    '</w:p>',
  ].join('\n');
}

/**
 * The frame to give a one-line, unfilled text box so it renders where it was placed, in real Word as in
 * LibreOffice. Never use `wrap="none"` for a text box: real Word resizes such a box to the width of its
 * text, keeping its left edge (measured 2026-11-20 with Word's own PDF export, `noAutofit`, `txBox` and
 * `anchorCtr` changing nothing), so centred text drifts left, right-aligned text detaches from what it
 * labels, and a filled box shrinks or grows. Instead the box keeps `wrap="square"` and is widened on the
 * side(s) the text may run into: both sides when centred, the left when right-aligned, the right when
 * left-aligned. The box draws nothing, so the extra width is invisible and the text never wraps.
 *
 * `x` and `w` are in EMU; returns the widened frame, in EMU. The shape must be named
 * `${LABEL_NAME} <id>`: {@link wrapDrawingCanvas} then brings the frame back inside the canvas, since
 * LibreOffice moves the whole drawing when a shape reaches past the canvas edges.
 */
export function unwrappedTextFrame(x: number, w: number, align: 'left' | 'center' | 'right'): { x: number; w: number } {
  // Room for text up to about three times the box, and at least one inch, on each open side.
  const extra = Math.max(w, 914400);
  if (align === 'center') return { x: x - extra, w: w + 2 * extra };
  if (align === 'right') return { x: x - extra, w: w + extra };
  return { x, w: w + extra };
}

/** `cNvPr` name prefix of a text frame widened by {@link unwrappedTextFrame}. */
export const LABEL_NAME = 'Label';

/**
 * Bring every widened text frame (`name="Label <id>"`) back inside a canvas `canvasCx` EMU wide, keeping
 * what its alignment anchors: the centre for centred text, the right edge for right-aligned, the left edge
 * for left-aligned. The frame never ends up narrower than the box it was widened from, as long as that box
 * was inside the canvas.
 */
function clampLabelFrames(content: string, canvasCx: number): string {
  return content.replace(/<wps:wsp>(?:(?!<\/wps:wsp>)[\s\S])*?<\/wps:wsp>/g, (shape) => {
    if (!shape.includes(`name="${LABEL_NAME} `)) return shape;
    const frame = /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)"/.exec(shape);
    if (!frame) return shape;
    const x = Number(frame[1]);
    const w = Number(frame[3]);
    const jc = /<w:jc w:val="(left|center|right)"\/>/.exec(shape)?.[1] ?? 'left';
    let nx: number;
    let nw: number;
    if (jc === 'center') {
      const c = x + w / 2;
      const half = Math.min(w / 2, c, canvasCx - c);
      if (half <= 0) return shape;
      nx = Math.round(c - half);
      nw = Math.round(2 * half);
    } else if (jc === 'right') {
      nx = Math.max(0, x);
      nw = x + w - nx;
    } else {
      nx = x;
      nw = Math.min(w, canvasCx - x);
    }
    if (nw < 1 || (nx === x && nw === w)) return shape;
    return shape.replace(frame[0], `<a:off x="${nx}" y="${frame[2]}"/><a:ext cx="${nw}"`);
  });
}
