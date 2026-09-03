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
 * (`FUTURE_mmd2smartart_SPEC.md` §2, confirmed by testing `pandoc.mediabag`).
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
