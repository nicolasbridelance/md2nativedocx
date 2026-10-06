/**
 * Box text shared by every SmartArt generator: a node's structured label ({@link LabelToken}s, the same
 * runs the shape translators use) written as one paragraph with real bold/italic runs and `<a:br/>` line
 * breaks — what Word itself stores for a line typed with Shift+Enter in the Text Pane. Used both for the
 * data model (`dgm:t`, what Word edits) and the cached drawing (`dsp:txBody`, what is shown before Word
 * recomputes), so the two always agree.
 */

import type { FlowNode, LabelToken } from '../types.js';
import { escapeXml } from '../translator/xml-escape.js';

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

/** `<a:r>`/`<a:br>` children of one `<a:p>` for `text`; `rPrAttrs` are extra `a:rPr` attributes (size…). */
export function paragraphRunsXml(text: LabelToken[], rPrAttrs = ''): string {
  return text
    .map((token) => {
      if ('break' in token) return `<a:br><a:rPr lang="fr-FR"${rPrAttrs}/></a:br>`;
      if (token.text === '') return '';
      const style = `${token.bold ? ' b="1"' : ''}${token.italic ? ' i="1"' : ''}`;
      return `<a:r><a:rPr lang="fr-FR"${rPrAttrs}${style}/><a:t>${escapeXml(token.text)}</a:t></a:r>`;
    })
    .join('');
}

/** The `<dgm:t>` text body of a content point. */
export function pointTextXml(text: LabelToken[]): string {
  return `<dgm:t><a:bodyPr/><a:lstStyle/><a:p>${paragraphRunsXml(text)}</a:p></dgm:t>`;
}
