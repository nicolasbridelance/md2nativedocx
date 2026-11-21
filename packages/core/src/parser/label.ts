/**
 * Mermaid label text -> plain text and rich-text runs, shared by every parser that reads Mermaid's label
 * conventions (flowchart, mindmap). Pure: untrusted text in, tokens out; escaping happens in the translators.
 */

import { decodeMermaidEntities } from './entities.js';
import type { LabelRun, LabelToken } from '../types.js';

/** How {@link parseLabel} reads a label. */
export interface ParseLabelOptions {
  /**
   * Read the label as Markdown even without backticks. A flowchart reads Markdown only inside a "`…`"
   * string; a mindmap reads every label as Markdown (Mermaid gives all its nodes `labelType: 'markdown'`).
   */
  markdown?: boolean;
}

/**
 * Parse the small set of inline-text conveniences Mermaid supports (found via
 * `docs/markdown-mermaid-compliance-table.md` §5, logged in `TODO.md`) into
 * both a flattened plain-text fallback (`text`, used for box-name attributes
 * and `layout.ts`'s width/height estimation — neither needs to know about a
 * bold/italic span) and a structured rich-text body (`runs`, `types.ts`'s
 * `LabelToken[]` — what the translator actually renders):
 *  - Mermaid's entity codes (`#quot;`, `#9829;`, `#infin;`, ...) are decoded to
 *    their character first ({@link decodeMermaidEntities}), regardless of the
 *    cases below.
 *  - `<br/>` (and `<br>`, `<br />`, case-insensitive) becomes a real line
 *    break: a `{ break: true }` token in `runs` (`text` flattens it to a
 *    single space instead — a fallback string has nowhere to put a second line).
 *  - A "Markdown string" (a label wrapped in backticks, or any label with
 *    `options.markdown`) has its delimiters stripped, a newline in it is a line
 *    break (as Mermaid draws one), and `**bold**`/`__bold__`/`*italic*`/`_italic_`
 *    spans become real `LabelRun.bold`/`.italic` tokens. Outside Markdown, a
 *    literal `**` stays literal: Mermaid's classic label syntax never
 *    interprets it.
 */
export function parseLabel(text: string, options: ParseLabelOptions = {}): { text: string; runs: LabelToken[] } {
  let decoded = decodeMermaidEntities(text);
  const isMarkdownString = decoded.length >= 2 && decoded.startsWith('`') && decoded.endsWith('`');
  if (isMarkdownString) decoded = decoded.slice(1, -1);
  const markdown = isMarkdownString || options.markdown === true;

  const segments = decoded.split(markdown ? /<br\s*\/?>|\r?\n/gi : /<br\s*\/?>/gi);
  const runs: LabelToken[] = [];
  const plainSegments: string[] = [];
  segments.forEach((segment, i) => {
    if (i > 0) runs.push({ break: true });
    const segmentRuns = markdown ? parseEmphasis(segment) : segment.length > 0 ? [{ text: segment }] : [];
    runs.push(...segmentRuns);
    plainSegments.push(segmentRuns.map((r) => r.text).join(''));
  });
  return { text: plainSegments.join(' '), runs };
}

/**
 * Split a Markdown-string segment (no line break in it — {@link parseLabel}
 * already split those out) into plain/bold/italic {@link LabelRun}s.
 * Non-nested and non-overlapping — CommonMark's full emphasis-resolution
 * algorithm is out of scope here; `**`/`__` (bold) is tried before `*`/`_`
 * (italic) at each position so a bold span is never misread as two italic
 * markers. One CommonMark rule is kept because ordinary text depends on it:
 * `_` does not open or close emphasis inside a word, so `snake_case_name`
 * stays as written (Mermaid's Markdown reader, `marked`, does the same).
 */
function parseEmphasis(text: string): LabelRun[] {
  const runs: LabelRun[] = [];
  const re = /\*\*([\s\S]+?)\*\*|(?<![\p{L}\p{N}_])__([\s\S]+?)__(?![\p{L}\p{N}_])|\*([\s\S]+?)\*|(?<![\p{L}\p{N}_])_([\s\S]+?)_(?![\p{L}\p{N}_])/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) });
    const bold = m[1] ?? m[2];
    if (bold !== undefined) runs.push({ text: bold, bold: true });
    else runs.push({ text: (m[3] ?? m[4])!, italic: true });
    last = re.lastIndex;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs;
}
