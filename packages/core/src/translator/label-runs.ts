/**
 * A label's rich text (`types.ts`'s `LabelToken[]`) as WordprocessingML runs, shared by the shape
 * translators that draw Markdown labels (flowchart nodes and edge labels, mindmap nodes).
 */

import type { LabelToken } from '../types.js';
import { escapeXml } from './xml-escape.js';

/**
 * Render a label's rich-text body (bold/italic runs and `<br/>` line breaks)
 * as the `w:r`/`w:br` children of one `w:p`. A break token is its own run
 * holding a bare `w:br` — WordprocessingML requires the break element inside a
 * run, but that run carries no `w:rPr`/`w:t` of its own — so a `<br/>` moves to
 * a new line within this same paragraph instead of starting a new
 * (differently-spaced) paragraph. Every text run is XML-escaped here.
 */
export function renderLabelRuns(tokens: LabelToken[], color: string, sizeHalfPt: number): string {
  return tokens
    .map((token) => {
      if ('break' in token) {
        return ['          <w:r>', '            <w:br/>', '          </w:r>'].join('\n');
      }
      // CT_RPr is an ordered sequence (ECMA-376 §17.3.2.28): b, i, color, sz.
      const rPr: string[] = [];
      if (token.bold) rPr.push('<w:b/>');
      if (token.italic) rPr.push('<w:i/>');
      rPr.push(`<w:color w:val="${color}"/>`, `<w:sz w:val="${sizeHalfPt}"/>`);
      return [
        '          <w:r>',
        `            <w:rPr>${rPr.join('')}</w:rPr>`,
        `            <w:t xml:space="preserve">${escapeXml(token.text)}</w:t>`,
        '          </w:r>',
      ].join('\n');
    })
    .join('\n');
}
