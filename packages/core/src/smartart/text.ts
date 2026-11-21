/**
 * Box text shared by every SmartArt generator: a node's structured label ({@link LabelToken}s, the same
 * runs the shape translators use) written as one paragraph with real bold/italic runs and `<a:br/>` line
 * breaks — what Word itself stores for a line typed with Shift+Enter in the Text Pane. Used both for the
 * data model (`dgm:t`, what Word edits) and the cached drawing (`dsp:txBody`, what is shown before Word
 * recomputes), so the two always agree.
 */

import type { FlowNode, LabelToken } from '../types.js';
import { escapeXml, validateHexColor } from '../translator/xml-escape.js';

/** A node's box text: its label runs, prefixed with `edgeLabel : ` when its incoming edge has a label. */
export function boxText(node: FlowNode, edgeLabel?: string | null): LabelToken[] {
  const runs: LabelToken[] = node.labelRuns.length > 0 ? node.labelRuns : [{ text: node.label }];
  if (!edgeLabel) return runs;
  // Merged into a plain first run, so `label : node` stays one run as before.
  const [first, ...rest] = runs;
  if (first && !('break' in first) && !first.bold && !first.italic) return [{ text: `${edgeLabel} : ${first.text}` }, ...rest];
  return [{ text: `${edgeLabel} : ` }, ...runs];
}

/** Plain lines of `text`, one per line break (for font fitting). */
export function textLines(text: LabelToken[]): string[] {
  const lines = [''];
  for (const token of text) {
    if ('break' in token) lines.push('');
    else lines[lines.length - 1] += token.text;
  }
  return lines;
}

/**
 * The theme text colour readable on `fill` (hex, no `#`): dark text (`dk1`) on a light fill, light text
 * (`lt1`) on a dark one or when there is no fill of its own (the quick style's accent fills are dark).
 */
export function textColorOnFill(fill: string | undefined): 'dk1' | 'lt1' {
  const valid = validateHexColor(fill, '');
  if (!valid) return 'lt1';
  const n = Number.parseInt(valid, 16);
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luma > 160 ? 'dk1' : 'lt1';
}

/**
 * `<a:r>`/`<a:br>` children of one `<a:p>` for `text`; `rPrAttrs` are extra `a:rPr` attributes (size…),
 * `color` a theme colour every run is written in (none: the style's own).
 */
export function paragraphRunsXml(text: LabelToken[], rPrAttrs = '', color?: 'dk1' | 'lt1'): string {
  const fill = color ? `<a:solidFill><a:schemeClr val="${color}"/></a:solidFill>` : '';
  const rPr = (style: string): string => (fill ? `<a:rPr lang="fr-FR"${rPrAttrs}${style}>${fill}</a:rPr>` : `<a:rPr lang="fr-FR"${rPrAttrs}${style}/>`);
  return text
    .map((token) => {
      if ('break' in token) return `<a:br>${rPr('')}</a:br>`;
      if (token.text === '') return '';
      const style = `${token.bold ? ' b="1"' : ''}${token.italic ? ' i="1"' : ''}`;
      return `<a:r>${rPr(style)}<a:t>${escapeXml(token.text)}</a:t></a:r>`;
    })
    .join('');
}

/**
 * The `<dgm:t>` text body of a content point. With the point's own `fill` (a `classDef`, `style` or
 * `highlight` colour), the text is written in the colour readable on it: Word lays a SmartArt out again
 * from this model and would otherwise apply the quick style's white text, unreadable on a light fill (seen
 * in Word on a highlighted tree view row, 2026-11-21; LibreOffice shows the cached drawing, where
 * {@link textColorOnFill} already applied).
 */
export function pointTextXml(text: LabelToken[], fill?: string): string {
  const color = validateHexColor(fill, '') ? textColorOnFill(fill) : undefined;
  return `<dgm:t><a:bodyPr/><a:lstStyle/><a:p>${paragraphRunsXml(text, '', color)}</a:p></dgm:t>`;
}
