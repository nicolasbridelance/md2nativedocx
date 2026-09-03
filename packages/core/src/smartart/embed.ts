/**
 * Build the `<w:p>` fragment that embeds a SmartArt diagram inline in
 * `document.xml` — the SmartArt equivalent of `ooxml-translator.ts`'s
 * `wrapInParagraph` for the `wpg:wgp` path, same overall shape (`w:p` >
 * `w:r` > `w:drawing` > `wp:inline` > `a:graphic`), swapping the
 * `wpc:wpc` canvas content for a `dgm:relIds` reference (spec §3).
 *
 * **Placeholder relationship ids, not real ones.** A SmartArt diagram's 4
 * parts (`data`/`layout`/`colors`/`quickStyle`) don't exist as package
 * relationships yet at the point this module runs — Pandoc's Lua filter API
 * has no mechanism to add new `.docx` package parts or relationships
 * (`docs/specs/FUTURE_mmd2smartart_SPEC.md` §2, confirmed by testing `pandoc.mediabag`).
 * The `relIds` passed in here are therefore opaque caller-chosen strings
 * (`packages/pandoc-filter/bin/md2nativedocx-core.mjs` uses
 * `SMARTART_PLACEHOLDER:<uuid>:dm` etc.) that a later, package-aware step
 * (`packages/cli/src/postprocess.mjs`, run after Pandoc has produced the
 * `.docx`) finds, replaces with real `rId`s, and backs with real parts +
 * relationships + `[Content_Types].xml` overrides. This module knows
 * nothing about that protocol — it just needs *some* 4 strings to put in
 * `r:dm`/`r:lo`/`r:qs`/`r:cs`, real or not.
 *
 * `wp:docPr/@id` is left as `"1"` deliberately, not computed here: the
 * existing document-wide renumbering pass (`postprocess.mjs`'s
 * `renumberDrawingIds`) already treats every `<w:drawing>` block's
 * `wp:docPr`/`cNvPr` ids as one shared id space and renumbers them without
 * caring which translator produced the block — the same mechanism that
 * already resolves collisions between multiple `wpg:wgp` diagrams handles a
 * SmartArt diagram for free.
 */

import { escapeXml } from '../translator/xml-escape.js';
import type { SmartArtIneligible } from './classify.js';

const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';
const DIAGRAM_GRAPHIC_URI = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';

/** The 4 relationship ids (real or placeholder) a SmartArt `dgm:relIds` needs. */
export interface SmartArtRelIds {
  /** `r:dm` — `diagramData`. */
  dm: string;
  /** `r:lo` — `diagramLayout`. */
  lo: string;
  /** `r:qs` — `diagramQuickStyle`. */
  qs: string;
  /** `r:cs` — `diagramColors`. */
  cs: string;
}

export interface SmartArtEmbedOptions {
  /** `wp:extent/@cx` in EMU. Default ~6 in — matches the spike's own frame size. */
  widthEmu?: number;
  /** `wp:extent/@cy` in EMU. Default ~3.33 in. */
  heightEmu?: number;
  /** `wp:docPr/@name` — cosmetic only (Word's alt-text/selection UI). */
  name?: string;
}

const DEFAULT_WIDTH_EMU = 5486400;
const DEFAULT_HEIGHT_EMU = 3200400;

/**
 * Build the `<w:p>` fragment referencing `relIds`. Deliberately a **fixed**
 * frame size (not content-aware, unlike the `wpg:wgp` path's
 * `computeBoundingBox`/`scaledExtent`): Word computes the SmartArt's
 * internal shape geometry itself at open-time from `data`+`layout`, so
 * there's no equivalent bounding-box calculation to run ahead of time here.
 * A future refinement could scale `widthEmu` with node count for `chain`
 * (more items need more horizontal room) — not attempted, kept out of scope
 * for wiring the dispatch.
 */
export function buildSmartArtDrawingXml(relIds: SmartArtRelIds, options: SmartArtEmbedOptions = {}): string {
  const cx = options.widthEmu ?? DEFAULT_WIDTH_EMU;
  const cy = options.heightEmu ?? DEFAULT_HEIGHT_EMU;
  const name = options.name ?? 'SmartArt Diagram';

  return [
    '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '  <w:r>',
    '    <w:drawing>',
    `      <wp:inline xmlns:wp="${WP_NS}" distT="0" distB="0" distL="0" distR="0">`,
    `        <wp:extent cx="${cx}" cy="${cy}"/>`,
    '        <wp:effectExtent l="0" t="0" r="0" b="0"/>',
    `        <wp:docPr id="1" name="${name}"/>`,
    '        <wp:cNvGraphicFramePr/>',
    `        <a:graphic xmlns:a="${A_NS}">`,
    `          <a:graphicData uri="${DIAGRAM_GRAPHIC_URI}">`,
    `            <dgm:relIds xmlns:dgm="${DGM_NS}" xmlns:r="${R_NS}" ` +
      `r:dm="${relIds.dm}" r:lo="${relIds.lo}" r:qs="${relIds.qs}" r:cs="${relIds.cs}"/>`,
    '          </a:graphicData>',
    '        </a:graphic>',
    '      </wp:inline>',
    '    </w:drawing>',
    '  </w:r>',
    '</w:p>',
  ].join('\n');
}

/**
 * Build the fallback-note `<w:p>` placed directly under a diagram that was
 * attempted for SmartArt but rejected by {@link classifyTopology}
 * (`docs/specs/FUTURE_mmd2smartart_SPEC.md` §10.3 — "phrase sous le graphe" was chosen
 * over a `w:comment` because it's the only option guaranteed to survive a
 * PDF export). Callers (`packages/pandoc-filter/bin/md2nativedocx-core.mjs`)
 * must only emit this when SmartArt was actually attempted and rejected —
 * never for a diagram that succeeded as SmartArt, and never for the default
 * `wpg:wgp` pipeline when SmartArt wasn't attempted at all.
 *
 * Uses direct run formatting (italic, gray, smaller size) rather than a
 * named paragraph style, so it renders correctly regardless of which
 * `--reference-doc` produced the surrounding document — spec §10.3's "style
 * discret dédié ... ou équivalent" explicitly allows this. The text is
 * still a single, contiguous run, easy to select and delete in Word before
 * final distribution.
 */
export function buildSmartArtFallbackNoteXml(classification: SmartArtIneligible): string {
  const message = escapeXml(fallbackMessage(classification));
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
    `    <w:t xml:space="preserve">${message}</w:t>`,
    '  </w:r>',
    '</w:p>',
  ].join('\n');
}

/** Specific, actionable text per {@link SmartArtIneligibleReason} (spec
 * §10.3: never a generic "auto-generated, may contain errors" disclaimer). */
function fallbackMessage(classification: SmartArtIneligible): string {
  const { reason, at } = classification;
  switch (reason) {
    case 'merge-after-branch':
      return `Native shapes used (merge detected between ${formatAt(at)} — not supported by SmartArt export).`;
    case 'subgraph':
      return 'Native shapes used (nested subgraph detected — not supported by SmartArt export).';
    case 'self-loop':
      return `Native shapes used (self-loop detected at ${formatAt(at)} — not supported by SmartArt export).`;
    case 'disconnected':
      return 'Native shapes used (diagram has multiple disconnected parts — not supported by SmartArt export).';
    case 'tree-too-deep':
      return `Native shapes used (hierarchy under ${formatAt(at)} is deeper than SmartArt export currently supports).`;
    case 'irregular-topology':
      return 'Native shapes used (diagram shape not recognized by SmartArt export).';
  }
}

/** Quote and join node ids for a message, e.g. `"B" and "E"`. */
function formatAt(at: string[]): string {
  const quoted = at.map((id) => `"${id}"`);
  if (quoted.length === 0) return '';
  if (quoted.length === 1) return quoted[0]!;
  return `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
}
