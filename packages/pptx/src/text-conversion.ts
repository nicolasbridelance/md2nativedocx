/**
 * WordprocessingML text (`w:p`/`w:r`) -> DrawingML text (`a:p`/`a:r`).
 *
 * Only the vocabulary the core translators actually emit is mapped; anything else is dropped and
 * reported once through `warn` rather than silently guessed at.
 */

import { type XNode, attrsOf, child, childrenNamed, kids, rawText, tagOf } from './xml-tree.js';

/** DrawingML `sz` is in hundredths of a point; WordprocessingML `w:sz` in half points. */
const HALF_POINT_TO_HUNDREDTHS = 50;
const MIN_SZ = 100;
const MAX_SZ = 400000;

const ALIGN: Record<string, string> = { center: 'ctr', left: 'l', start: 'l', right: 'r', end: 'r', both: 'just' };

const HEX6 = /^[0-9A-Fa-f]{6}$/;

function isOn(node: XNode): boolean {
  const val = attrsOf(node)['w:val'];
  return val === undefined || !['0', 'false', 'off'].includes(val);
}

function escapeAttrValue(value: string): string {
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function runProperties(rPr: XNode | undefined, warn: (msg: string) => void, scale: number): string {
  if (!rPr) return '';
  const attrs: string[] = [];
  let fill = '';
  let latin = '';
  for (const prop of kids(rPr)) {
    const tag = tagOf(prop);
    const a = attrsOf(prop);
    if (tag === 'w:sz') {
      const half = Number.parseInt(a['w:val'] ?? '', 10);
      if (Number.isFinite(half)) {
        attrs.push(`sz="${Math.min(MAX_SZ, Math.max(MIN_SZ, Math.round(half * HALF_POINT_TO_HUNDREDTHS * scale)))}"`);
      }
    } else if (tag === 'w:b') {
      if (isOn(prop)) attrs.push('b="1"');
    } else if (tag === 'w:i') {
      if (isOn(prop)) attrs.push('i="1"');
    } else if (tag === 'w:u') {
      if ((a['w:val'] ?? 'single') !== 'none') attrs.push('u="sng"');
    } else if (tag === 'w:strike') {
      if (isOn(prop)) attrs.push('strike="sngStrike"');
    } else if (tag === 'w:color') {
      const val = a['w:val'] ?? '';
      if (HEX6.test(val)) fill = `<a:solidFill><a:srgbClr val="${val}"/></a:solidFill>`;
    } else if (tag === 'w:rFonts') {
      const face = a['w:ascii'] ?? a['w:hAnsi'];
      if (face) latin = `<a:latin typeface="${escapeAttrValue(face)}"/>`;
    } else if (tag !== '#text') {
      warn(`run property <${tag}> has no pptx mapping and was dropped`);
    }
  }
  const head = `<a:rPr lang="en-US"${attrs.map((x) => ` ${x}`).join('')} dirty="0"`;
  const inner = fill + latin;
  return inner === '' ? `${head}/>` : `${head}>${inner}</a:rPr>`;
}

function paragraphProperties(pPr: XNode | undefined, scale: number): string {
  if (!pPr) return '';
  const jc = child(pPr, 'w:jc');
  const algn = jc ? ALIGN[attrsOf(jc)['w:val'] ?? ''] : undefined;
  const spacing = child(pPr, 'w:spacing');
  const spacingXml = spacing ? spacingToXml(attrsOf(spacing), scale) : '';
  const attr = algn ? ` algn="${algn}"` : '';
  return spacingXml ? `<a:pPr${attr}>${spacingXml}</a:pPr>` : `<a:pPr${attr}/>`;
}

function spacingToXml(a: Record<string, string>, scale: number): string {
  const pts = (key: string): number | undefined => {
    const twips = Number.parseInt(a[key] ?? '', 10);
    // twentieths of a point -> hundredths of a point
    return Number.isFinite(twips) && twips >= 0 ? Math.round(twips * 5 * scale) : undefined;
  };
  const before = pts('w:before');
  const after = pts('w:after');
  return (
    (before !== undefined ? `<a:spcBef><a:spcPts val="${before}"/></a:spcBef>` : '') +
    (after !== undefined ? `<a:spcAft><a:spcPts val="${after}"/></a:spcAft>` : '')
  );
}

/** Convert one `w:p` into an `a:p`; `scale` multiplies font sizes and paragraph spacing. Text stays as the producer escaped it. */
export function convertParagraph(wp: XNode, warn: (msg: string) => void, scale = 1): string {
  const parts: string[] = [paragraphProperties(child(wp, 'w:pPr'), scale)];
  for (const run of childrenNamed(wp, 'w:r')) {
    const rPr = runProperties(child(run, 'w:rPr'), warn, scale);
    for (const piece of kids(run)) {
      const tag = tagOf(piece);
      if (tag === 'w:t') parts.push(`<a:r>${rPr}<a:t>${rawText(piece)}</a:t></a:r>`);
      else if (tag === 'w:br') parts.push(`<a:br>${rPr}</a:br>`);
      else if (tag !== 'w:rPr' && tag !== '#text') warn(`run content <${tag}> has no pptx mapping and was dropped`);
    }
  }
  return `<a:p>${parts.join('')}</a:p>`;
}

/** Text of a `w:p` with run formatting stripped (used for slide titles/notes length checks and tests). */
export function plainText(wp: XNode): string {
  return childrenNamed(wp, 'w:r')
    .flatMap((r) => childrenNamed(r, 'w:t'))
    .map(rawText)
    .join('');
}
