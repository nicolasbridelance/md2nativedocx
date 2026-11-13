/**
 * Rewrites the `<w:p>` drawing fragment that `@md2nativedocx/core` emits for a Mermaid diagram
 * (flat `wps:wsp` shapes at absolute EMU coordinates inside a `wpc:wpc` canvas) into `p:sp` /
 * `p:cxnSp` shapes for a slide's `p:spTree`.
 *
 * One rewrite serves every diagram type: the shape vocabulary below is all the translators emit.
 * Unknown constructs are dropped with a warning, never passed through unvalidated.
 */

import { PptxConversionError } from './errors.js';
import { convertParagraph } from './text-conversion.js';
import {
  type XNode,
  attrsOf,
  child,
  childrenNamed,
  descendants,
  kids,
  parseFragment,
  serialize,
  tagOf,
} from './xml-tree.js';

/** Shape ids in the diagram are shifted by this much so they never collide with slide-level ids. */
const DIAGRAM_ID_SHIFT = 10;

/** Result of converting one diagram fragment. */
export interface ConvertedFragment {
  /** `p:sp`/`p:cxnSp` XML, positioned relative to the diagram's own top-left corner (0, 0). */
  shapesXml: string[];
  /** Drawing extent in EMU, from `wp:extent` (0 when the fragment has no drawing). */
  extent: { cx: number; cy: number };
  /** Paragraphs found outside the drawing (e.g. fallback notes), as `a:p` XML. */
  notesXml: string[];
  /** Highest shape id used (already shifted). */
  maxId: number;
  /** Deduplicated conversion warnings. */
  warnings: string[];
}

/**
 * Convert a core-generated diagram fragment.
 *
 * @param fragmentXml - The `<w:p>` XML string produced by a core translator.
 * @param placement - `scale` uniformly resizes the drawing (coordinates, line widths, insets, fonts) and
 *   `x`/`y` (EMU) then translate it so the diagram lands where wanted on the slide.
 */
export function convertFragment(
  fragmentXml: string,
  placement: { x: number; y: number; scale?: number },
): ConvertedFragment {
  const scale = placement.scale ?? 1;
  const offset = { x: placement.x, y: placement.y };
  const roots = parseFragment(fragmentXml);
  const root = roots[0];
  if (!root) throw new PptxConversionError('empty drawing fragment');

  const warnings = new Set<string>();
  const warn = (msg: string): void => void warnings.add(msg);

  const extentNode = descendants(root, 'wp:extent')[0];
  const ext = extentNode ? attrsOf(extentNode) : {};
  const extent = { cx: toInt(ext['cx']), cy: toInt(ext['cy']) }; // unscaled, as emitted by core

  const canvas = descendants(root, 'wpc:wpc')[0];
  const shapes = canvas ? childrenNamed(canvas, 'wps:wsp') : [];
  if (canvas) {
    for (const k of kids(canvas)) {
      const tag = tagOf(k);
      if (!['wps:wsp', 'wpc:bg', 'wpc:whole', '#text'].includes(tag)) {
        warn(`canvas element <${tag}> has no pptx mapping and was dropped`);
      }
    }
  }

  let maxId = DIAGRAM_ID_SHIFT;
  const shapesXml: string[] = [];
  for (const wsp of shapes) {
    const converted = convertShape(wsp, offset, scale, warn);
    maxId = Math.max(maxId, converted.id);
    shapesXml.push(converted.xml);
  }

  // `w:p` siblings of the drawing paragraph (SmartArt/unsupported-type notes) become slide notes.
  const notesXml = kids(root)
    .filter((n) => tagOf(n) === 'w:p' && descendants(n, 'w:drawing').length === 0)
    .map((n) => convertParagraph(n, warn, 1));

  return { shapesXml, extent, notesXml, maxId, warnings: [...warnings] };
}

function toInt(value: string | undefined): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function numAttr(attrs: Record<string, string>, key: string): number {
  return Number.parseInt(attrs[`@_${key}`] ?? '0', 10) || 0;
}

/** Scale then translate the shape's `a:xfrm`, and scale its outline widths (in place). */
function transformShape(spPr: XNode, offset: { x: number; y: number }, scale: number): void {
  const xfrm = child(spPr, 'a:xfrm');
  const off = xfrm ? child(xfrm, 'a:off') : undefined;
  const ext = xfrm ? child(xfrm, 'a:ext') : undefined;
  if (off) {
    const a = (off[':@'] ?? {}) as Record<string, string>;
    a['@_x'] = String(Math.round(numAttr(a, 'x') * scale + offset.x));
    a['@_y'] = String(Math.round(numAttr(a, 'y') * scale + offset.y));
    off[':@'] = a;
  }
  if (ext && scale !== 1) {
    const a = (ext[':@'] ?? {}) as Record<string, string>;
    a['@_cx'] = String(Math.round(numAttr(a, 'cx') * scale));
    a['@_cy'] = String(Math.round(numAttr(a, 'cy') * scale));
    ext[':@'] = a;
  }
  if (scale !== 1) {
    for (const ln of descendants(spPr, 'a:ln')) {
      const a = (ln[':@'] ?? {}) as Record<string, string>;
      if (a['@_w'] !== undefined) {
        a['@_w'] = String(Math.max(1, Math.round(numAttr(a, 'w') * scale)));
        ln[':@'] = a;
      }
    }
  }
}

/** Scale the text insets of a body-properties node (in place). */
function scaleInsets(bodyPr: XNode, scale: number): void {
  if (scale === 1) return;
  const a = (bodyPr[':@'] ?? {}) as Record<string, string>;
  for (const key of ['lIns', 'tIns', 'rIns', 'bIns']) {
    if (a[`@_${key}`] !== undefined) a[`@_${key}`] = String(Math.round(numAttr(a, key) * scale));
  }
  bodyPr[':@'] = a;
}

function convertShape(
  wsp: XNode,
  offset: { x: number; y: number },
  scale: number,
  warn: (msg: string) => void,
): { xml: string; id: number } {
  const cNvPr = child(wsp, 'wps:cNvPr');
  const props = cNvPr ? attrsOf(cNvPr) : {};
  const id = (Number.parseInt(props['id'] ?? '0', 10) || 0) + DIAGRAM_ID_SHIFT;
  const nameAttrs: Record<string, string> = { ...props, id: String(id) };
  const nvPr = serialize(cNvPr ?? { 'wps:cNvPr': [] }, { rename: 'p:cNvPr', attrs: nameAttrs });

  const spPrNode = child(wsp, 'wps:spPr');
  if (spPrNode) transformShape(spPrNode, offset, scale);
  const spPr = spPrNode ? serialize(spPrNode, { rename: 'p:spPr' }) : '<p:spPr/>';
  const styleNode = child(wsp, 'wps:style');
  const style = styleNode ? serialize(styleNode, { rename: 'p:style' }) : '';

  // A routed edge (polyline) carries a custom geometry. PowerPoint rejects `a:custGeom` on a
  // `p:cxnSp` (connectors take preset geometry only) and offers to "repair" the file, so such an
  // edge becomes a plain `p:sp`. It loses its magnetic attachment, which a polyline cannot keep anyway.
  const cnv = spPrNode && descendants(spPrNode, 'a:custGeom').length > 0 ? undefined : child(wsp, 'wps:cNvCnPr');
  if (cnv) {
    const links = kids(cnv)
      .filter((k) => ['a:stCxn', 'a:endCxn'].includes(tagOf(k)))
      .map((k) => {
        const a = attrsOf(k);
        const target = (Number.parseInt(a['id'] ?? '0', 10) || 0) + DIAGRAM_ID_SHIFT;
        return serialize(k, { attrs: { id: String(target) } });
      })
      .join('');
    const xml =
      `<p:cxnSp><p:nvCxnSpPr>${nvPr}<p:cNvCxnSpPr>${links}</p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr>` +
      `${spPr}${style}</p:cxnSp>`;
    return { xml, id };
  }

  const cNvSpPr = child(wsp, 'wps:cNvSpPr');
  const spCnv = cNvSpPr ? serialize(cNvSpPr, { rename: 'p:cNvSpPr' }) : '<p:cNvSpPr/>';

  const txbx = child(wsp, 'wps:txbx');
  const content = txbx ? child(txbx, 'w:txbxContent') : undefined;
  const paragraphs = content ? childrenNamed(content, 'w:p') : [];
  const bodyPrNode = child(wsp, 'wps:bodyPr');
  let txBody = '';
  if (paragraphs.length > 0) {
    if (bodyPrNode) scaleInsets(bodyPrNode, scale);
    const bodyPr = bodyPrNode ? serialize(bodyPrNode, { rename: 'a:bodyPr' }) : '<a:bodyPr/>';
    txBody = `<p:txBody>${bodyPr}<a:lstStyle/>${paragraphs.map((p) => convertParagraph(p, warn, scale)).join('')}</p:txBody>`;
  }

  const xml = `<p:sp><p:nvSpPr>${nvPr}${spCnv}<p:nvPr/></p:nvSpPr>${spPr}${style}${txBody}</p:sp>`;
  return { xml, id };
}
