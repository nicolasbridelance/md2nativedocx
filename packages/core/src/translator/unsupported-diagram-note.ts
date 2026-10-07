/**
 * Build the note `<w:p>` shown in place of a diagram whose type was
 * recognized (`../parser/diagram-type.ts`) but isn't implemented by this
 * project yet — e.g. `gitGraph`, `mindmap`, `sequenceDiagram`. Mirrors
 * `../smartart/embed.ts`'s `buildSmartArtFallbackNoteXml` (same direct-run
 * styling, same "visible note, never a silent blank canvas" rule), but for
 * the diagram-type guard-rail instead of a rejected SmartArt classification
 * (`docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §4 "Phase 0", item 1).
 *
 * Callers (`packages/pandoc-filter/bin/md2nativedocx-core.mjs`) must only
 * emit this once `detectDiagramType()` has returned a type other than
 * `'flowchart'`/`'unknown'` — never for a diagram that actually went through
 * the flowchart pipeline.
 */

import { escapeXml } from './xml-escape.js';
import type { DiagramTypeInfo } from '../parser/diagram-type.js';

export function buildUnsupportedDiagramTypeNoteXml(info: DiagramTypeInfo): string {
  const message = escapeXml(
    `${info.label} diagrams are not yet supported by md2nativedocx — this diagram was not converted.`,
  );
  return buildNoteParagraph(message);
}

/**
 * The note shown in place of a diagram that exceeded the size limits (`DiagramTooLargeError`), so the
 * document still converts and the reader sees why the diagram is missing. Escaped: the message embeds
 * only numbers and fixed words, but it is built the same way as every other note.
 */
export function buildDiagramTooLargeNoteXml(error: Pick<Error, 'message'>): string {
  const message = escapeXml(`This diagram was not converted: ${error.message}.`);
  return buildNoteParagraph(message);
}

function buildNoteParagraph(escapedMessage: string): string {
  return [
    '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '  <w:pPr>',
    '    <w:spacing w:before="0" w:after="120"/>',
    '  </w:pPr>',
    '  <w:r>',
    '    <w:rPr>',
    '      <w:i/>',
    '      <w:color w:val="808080"/>',
    '      <w:sz w:val="18"/>',
    '    </w:rPr>',
    `    <w:t xml:space="preserve">${escapedMessage}</w:t>`,
    '  </w:r>',
    '</w:p>',
  ].join('\n');
}
