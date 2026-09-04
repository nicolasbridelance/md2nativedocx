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

/** See `ooxml-translator.ts`'s `MAX_DRAWING_CX`/`MAX_DRAWING_CY` doc comment
 * — usable page area in EMU for Pandoc's default reference document. */
const MAX_DRAWING_CX = 5943600;
const MAX_DRAWING_CY = 8229600;

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
export function scaledExtent(widthPx: number, heightPx: number): { cx: number; cy: number; scale: number } {
  const { cx: nativeCx, cy: nativeCy } = nativeExtent(widthPx, heightPx);
  const scale = Math.min(1, MAX_DRAWING_CX / nativeCx, MAX_DRAWING_CY / nativeCy);
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
): string {
  const { cx, cy } = scaledExtent(widthPx, heightPx);
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
