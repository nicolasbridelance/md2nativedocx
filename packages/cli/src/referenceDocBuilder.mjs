/**
 * Build a `reference.docx` patched for the page/typography settings a user
 * picked (`docs/specs/export_customization_SPEC.md` §1.1-1.8/1.14, §2.1 —
 * "Lot 1"), starting from the bundled static template
 * (`packages/cli/assets/reference.docx`) or a custom one the caller already
 * resolved.
 *
 * Same `unzip`/`zip` shell-out pattern `postprocess.mjs` already uses for
 * the final `.docx` (rule `AGENTS.md` "nouvelle dépendance → escalade" —
 * this needs none): extract only the entries a given option set actually
 * touches, patch them with scoped string/regex edits (not a full XML
 * parser — same rationale as `postprocess.mjs`: the input is a known,
 * machine-authored template, not arbitrary XML), rezip in place.
 *
 * Confirmed empirically (not assumed) that this is worth doing at all:
 * Pandoc's `--reference-doc` carries the reference document's own
 * `<w:sectPr>` (page size/margins) into the generated `.docx` verbatim —
 * tested with a distinctive custom `w:pgSz`/`w:pgMar` round-tripped through
 * a real `pandoc` invocation. `styles.xml`'s `w:docDefaults` is likewise
 * confirmed to reach ordinary body paragraphs: Pandoc emits `BodyText`/
 * `FirstParagraph` for regular paragraphs, and neither style (nor `Normal`
 * itself, its ultimate base) overrides `w:line`/`w:jc`, so both cascade
 * down from `w:docDefaults` unless a run/paragraph in the Markdown source
 * overrides them explicitly.
 *
 * Two of the 10 Lot 1 catalog entries are *not* a simple patch here and are
 * deliberately out of scope for this module (tracked separately in
 * TODO.md): 1.10 (TOC — a Pandoc flag + `settings.xml` patch) and 1.11
 * (table style presets — underspecified in the spec, no concrete preset
 * names to switch between yet). 1.9 (dedicated landscape section for
 * tables, "Lot 5") is mostly a new Lua filter concern (spec §2.3,
 * `md2nativedocx.lua`) but this module still has one narrow stake in it:
 * {@link buildReferenceDoc}'s `landscapeTables` option forces an explicit
 * `sectPr` even with no other page option set, so the Lua filter's "return
 * to portrait" paragraphs have a concrete page size/margins to agree with
 * (see its own doc comment for why). 1.13 (footer page numbers) needed a
 * brand-new `word/footer*.xml` part + relationship + content-type override,
 * closer in shape to `postprocess.mjs`'s `injectSmartArtParts` — implemented
 * here anyway (`patchRelsForFooter`/`patchContentTypesForFooter` below)
 * since {@link buildReferenceDoc} was already the right place to assemble it.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Page dimensions in twips (1/20 pt), portrait orientation (w < h). Standard
 * OOXML values used verbatim by Word/LibreOffice — not an assumption, unlike
 * the margin presets below. */
export const PAGE_SIZES_TWIPS = {
  A4: { w: 11906, h: 16838 },
  Letter: { w: 12240, h: 15840 },
  Legal: { w: 12240, h: 20160 },
};

/**
 * Word margin presets in twips. "Normal" here is the 2.5cm the spec's own
 * catalog (§1.3) states for a metric locale, not the 1in/1440-twip value an
 * English-locale Word writes for its own "Normal" preset — **unverified
 * against a real Word**, same category of assumption
 * `packages/cli/assets/README.md` already documents for the Aptos font
 * reconstruction (no Word install available to confirm). Flagged in
 * TODO.md alongside that one, to verify together.
 */
export const MARGIN_PRESETS_TWIPS = {
  normal: { top: 1417, right: 1417, bottom: 1417, left: 1417 },
  narrow: { top: 720, right: 720, bottom: 720, left: 720 },
  moderate: { top: 1417, right: 1077, bottom: 1417, left: 1077 },
  wide: { top: 1417, right: 2880, bottom: 1417, left: 2880 },
};

/** `w:spacing/@w:line` (in 240ths of a line) for each named preset. `'default'`
 * (or an absent/unrecognized token) means "leave the template's own 1.08 —
 * Word's actual current default, not one of these four presets — alone",
 * handled by {@link resolveLineSpacing} returning `null` rather than an
 * entry here. */
export const LINE_SPACING_TOKENS = {
  single: { line: 240, rule: 'auto' },
  '1.15': { line: 276, rule: 'auto' },
  '1.5': { line: 360, rule: 'auto' },
  double: { line: 480, rule: 'auto' },
};

const XML_ATTR_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** Escape a string for use inside an XML attribute value (rule #2,
 * AGENTS.md) — `headingFont`/`bodyFont` are free-text VS Code settings, not
 * validated against a fixed list, so they reach `a:latin/@typeface`
 * user-controlled. */
function escapeXmlAttr(value) {
  return String(value).replace(/[&<>"']/g, (ch) => XML_ATTR_ESCAPES[ch]);
}

/** Validate a color as 6 hex digits, uppercased; `null` if invalid. Mirrors
 * `ooxml-translator.ts`'s `hexColor` — same reasoning: escaping alone would
 * still let a non-hex value through into `a:srgbClr/@val`. */
function validHexColor(value) {
  return /^[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : null;
}

/** Resolve a page size + orientation into portrait/landscape twip
 * dimensions. Unrecognized `pageSize` falls back to A4 (spec §1.1 default). */
export function resolvePageSize(pageSize, orientation) {
  const base = PAGE_SIZES_TWIPS[pageSize] ?? PAGE_SIZES_TWIPS.A4;
  return orientation === 'landscape'
    ? { w: base.h, h: base.w, orientation: 'landscape' }
    : { w: base.w, h: base.h, orientation: 'portrait' };
}

const DEFAULT_PAGE_SIZE = resolvePageSize('A4', 'portrait');

/** Resolve a margin preset name, or `custom` + `customCm` ({top,right,bottom,left}
 * in centimeters). An invalid/incomplete custom value falls back to the
 * `normal` preset rather than writing a malformed or absurd page margin. */
export function resolveMargins(margins, customCm) {
  if (margins === 'custom' && customCm) {
    const toTwip = (cm) => Math.round((Number(cm) * 1440) / 2.54);
    const resolved = {
      top: toTwip(customCm.top),
      right: toTwip(customCm.right),
      bottom: toTwip(customCm.bottom),
      left: toTwip(customCm.left),
    };
    const sane = Object.values(resolved).every((v) => Number.isFinite(v) && v > 0 && v < 50000);
    if (sane) return resolved;
  }
  return MARGIN_PRESETS_TWIPS[margins] ?? MARGIN_PRESETS_TWIPS.normal;
}

/** Resolve a line-spacing token to `{line, rule}`, or `null` for `'default'`
 * (leave the template's current value untouched) or an unrecognized token. */
export function resolveLineSpacing(token) {
  if (!token || token === 'default') return null;
  return LINE_SPACING_TOKENS[token] ?? null;
}

/** Font size in points -> `w:sz`/`w:szCs` half-points, clamped to a sane
 * 6-72pt range (spec §1.6 only exposes 9-14, but this is a defensive floor/
 * ceiling, not the UI-facing limit). `undefined` for a non-finite/non-positive
 * input. */
function resolveFontSizeHalfPt(pt) {
  const n = Number(pt);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.max(Math.round(n * 2), 12), 144);
}

/**
 * Patch `word/theme/theme1.xml`: heading/body font typefaces and the accent1
 * color. Each field is independently optional — an absent one leaves that
 * part of the theme untouched.
 */
export function patchTheme(themeXml, { headingFont, bodyFont, accentColor } = {}) {
  let out = themeXml;
  if (headingFont) {
    out = out.replace(
      /(<a:majorFont><a:latin typeface=")[^"]*("\s*\/>)/,
      `$1${escapeXmlAttr(headingFont)}$2`,
    );
  }
  if (bodyFont) {
    out = out.replace(
      /(<a:minorFont><a:latin typeface=")[^"]*("\s*\/>)/,
      `$1${escapeXmlAttr(bodyFont)}$2`,
    );
  }
  if (accentColor) {
    const safe = validHexColor(accentColor);
    if (safe) {
      out = out.replace(
        /(<a:accent1><a:srgbClr val=")[0-9A-Fa-f]{6}("\s*\/><\/a:accent1>)/,
        `$1${safe}$2`,
      );
    }
  }
  return out;
}

/**
 * Patch `word/styles.xml`'s `<w:docDefaults>` block: base font size, line
 * spacing, and default justification. Scoped to that one block (extracted,
 * transformed, spliced back) so a `w:sz`/`w:spacing` elsewhere in the
 * stylesheet (e.g. a heading style's own override) is never touched.
 */
export function patchStyles(stylesXml, { fontSizeHalfPt, lineSpacing, justify } = {}) {
  const match = stylesXml.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/);
  if (!match) return stylesXml;
  let block = match[0];

  if (fontSizeHalfPt !== undefined) {
    block = block
      .replace(/<w:sz w:val="\d+"\s*\/>/, `<w:sz w:val="${fontSizeHalfPt}" />`)
      .replace(/<w:szCs w:val="\d+"\s*\/>/, `<w:szCs w:val="${fontSizeHalfPt}" />`);
  }

  if (lineSpacing) {
    block = block.replace(
      /<w:spacing w:after="(\d+)" w:line="\d+" w:lineRule="auto"\s*\/>/,
      `<w:spacing w:after="$1" w:line="${lineSpacing.line}" w:lineRule="${lineSpacing.rule}" />`,
    );
  }

  if (justify === 'both') {
    block = block.replace(/(<w:pPrDefault>\s*<w:pPr>)/, `$1<w:jc w:val="both" />`);
  }

  return stylesXml.replace(match[0], block);
}

/**
 * Patch `word/document.xml`'s final (only) `<w:sectPr />` into a full
 * section with explicit page size/orientation/margins, and optionally a
 * `<w:footerReference>` (spec §1.13, "Lot 1" fast-follow — `footerRId` is the
 * relationship id {@link patchRelsForFooter} minted for `word/footer1.xml`).
 * `pgSize`/`margins` are each `null` when not requested — falls back to A4
 * portrait / the `normal` preset respectively for whichever one the caller
 * didn't ask to change, since a `<w:sectPr>` needs both to be well-formed
 * regardless of which specific option triggered building one at all.
 * `footerReference` must be the first child when present — confirmed
 * against a real Pandoc-processed `sectPr` (`TODO.md`), not assumed.
 */
export function patchSectPr(documentXml, { pgSize, margins, footerRId } = {}) {
  if (!pgSize && !margins && !footerRId) return documentXml;
  const size = pgSize ?? DEFAULT_PAGE_SIZE;
  const mar = margins ?? MARGIN_PRESETS_TWIPS.normal;
  const orientAttr = size.orientation === 'landscape' ? ' w:orient="landscape"' : '';
  const footerRef = footerRId ? `<w:footerReference w:type="default" r:id="${footerRId}"/>` : '';
  const sectPr =
    `<w:sectPr>${footerRef}<w:pgSz w:w="${size.w}" w:h="${size.h}"${orientAttr}/>` +
    `<w:pgMar w:top="${mar.top}" w:right="${mar.right}" w:bottom="${mar.bottom}" w:left="${mar.left}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  return documentXml.replace(/<w:sectPr\s*\/>/, sectPr);
}

/**
 * Minimal footer part (spec §1.13): a single centered `PAGE` field. Written
 * as a brand-new `word/footer1.xml` package part — confirmed empirically
 * that, unlike `settings.xml` (see `patchSettings`'s doc comment), Pandoc
 * *does* carry over a reference document's footer part/relationship/
 * `footerReference` verbatim: a canary footer with a `PAGE` field, added to
 * a copy of `reference.docx` and round-tripped through a real `pandoc`
 * invocation, survived into the generated `.docx` and rendered a page
 * number when opened in LibreOffice.
 */
export const FOOTER_PAGE_NUMBER_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>' +
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
  '<w:r><w:t>1</w:t></w:r>' +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
  '</w:p></w:ftr>';

/** Smallest unused `rId` in a `.rels` file's `Id="rIdN"` attributes (`rId1`
 * if there are none) — `reference.docx`'s own relationships already go up
 * to `rId8` plus a decorative `rId30` (an external hyperlink in its
 * placeholder body content, never reaching real output), so a fixed id
 * would risk colliding. */
function nextRelationshipId(relsXml) {
  const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  const max = ids.length ? Math.max(...ids) : 0;
  return `rId${max + 1}`;
}

/** Add the footer relationship to `word/_rels/document.xml.rels`. Returns
 * `{ xml, rId }` — `rId` is what {@link patchSectPr}'s `footerRId` and
 * `patchContentTypesForFooter` need to stay consistent. */
export function patchRelsForFooter(relsXml) {
  const rId = nextRelationshipId(relsXml);
  const rel =
    '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" ' +
    `Id="${rId}" Target="footer1.xml" />`;
  return { xml: relsXml.replace('</Relationships>', `${rel}</Relationships>`), rId };
}

/** Declare `word/footer1.xml`'s content type in `[Content_Types].xml`.
 * Idempotent (checked by path, not just presence of the word "footer") in
 * case a future base template already ships a footer of its own. */
export function patchContentTypesForFooter(contentTypesXml) {
  if (contentTypesXml.includes('/word/footer1.xml')) return contentTypesXml;
  const override =
    '<Override PartName="/word/footer1.xml" ' +
    'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml" />';
  return contentTypesXml.replace('</Types>', `${override}</Types>`);
}

/**
 * Patch `word/settings.xml` to add `<w:updateFields w:val="true" />` when a
 * TOC is requested (spec §1.10/§2.2) — without it, a Pandoc-generated TOC
 * field shows stale/empty content until the user manually refreshes it
 * (F9); with it, Word itself offers to update fields on open. No-op (and
 * idempotent) when `toc` is falsy or the flag is already present.
 *
 * Applied by `postprocess.mjs` to the **final generated `.docx`**'s own
 * `settings.xml`, not to the reference doc here — confirmed empirically
 * that Pandoc synthesizes its own `word/settings.xml` from scratch and does
 * NOT carry over the reference document's (unlike `theme1.xml`/
 * `styles.xml`/`document.xml`'s `sectPr`, all confirmed carried over).
 * Exported from this module anyway since it's the same kind of pure,
 * independently-testable XML patch as the others here — just consumed by a
 * different caller.
 */
export function patchSettings(settingsXml, { toc } = {}) {
  if (!toc || /<w:updateFields\b/.test(settingsXml)) return settingsXml;
  return settingsXml.replace(/(<w:settings\b[^>]*>)/, `$1\n  <w:updateFields w:val="true" />`);
}

/**
 * Build a patched `reference.docx` from `basePath` for the given raw option
 * values (as they arrive from CLI env vars / VS Code settings — every field
 * optional, `undefined` meaning "user didn't touch this one").
 *
 * Returns `null` when every option is unset (the common case — no export
 * customization active): callers should keep using `basePath` unchanged,
 * unzip/zip is skipped entirely. Otherwise returns `{ path, dir }`: `path` is
 * the patched `.docx` (pass it to Pandoc's `--reference-doc`), `dir` is the
 * scratch directory the caller must `rmSync(dir, { recursive: true, force:
 * true })` once Pandoc has run (mirrors how `md2nativedocx.mjs` already
 * cleans up its `smartArtDir` scratch directory).
 */
export function buildReferenceDoc(basePath, rawOptions = {}) {
  const {
    pageSize, orientation, margins, marginsCustomCm,
    headingFont, bodyFont, fontSizePt, lineSpacing, justify, accentColor,
    footerPageNumber, landscapeTables,
  } = rawOptions;

  const needsFooter = footerPageNumber === true;
  // Lot 5 (spec §1.9/§2.3) also forces an explicit sectPr, even with no
  // pageSize/orientation/margins of its own: the Lua filter's "return to
  // portrait" paragraphs need a concrete, known page size/margins to write
  // — Pandoc's own unpatched default (an empty `<w:sectPr/>`, which resolves
  // to whatever Letter/A4 default the local Pandoc/LibreOffice install
  // falls back to) is not something this process can introspect, and a
  // mismatch between that and this module's own A4/normal fallback would
  // make the non-table sections of the document silently switch page size
  // the moment landscape tables are turned on (found manually testing this
  // lot end to end). So enabling landscapeTables alone pins the whole
  // document to the same A4/normal-margins default `resolvePageSize`/
  // `resolveMargins` already use elsewhere — a real, deliberate behavior
  // change flagged in TODO.md, not a silent one: a user who wants a
  // different page size must combine this toggle with the Lot 1 page size
  // setting, same as any other Lot 1 option already requires today.
  const needsSectPr =
    pageSize !== undefined || orientation !== undefined || margins !== undefined || needsFooter || landscapeTables === true;
  const needsTheme = headingFont !== undefined || bodyFont !== undefined || accentColor !== undefined;
  const resolvedLineSpacing = resolveLineSpacing(lineSpacing);
  const needsStyles = fontSizePt !== undefined || resolvedLineSpacing !== null || justify === 'both';

  if (!needsSectPr && !needsTheme && !needsStyles) return null;

  const dir = mkdtempSync(join(tmpdir(), 'md2nativedocx-refdoc-'));
  const workDocx = join(dir, 'reference.docx');

  try {
    copyFileSync(basePath, workDocx);

    const entries = [];
    if (needsTheme) entries.push('word/theme/theme1.xml');
    if (needsStyles) entries.push('word/styles.xml');
    if (needsSectPr) entries.push('word/document.xml');
    if (needsFooter) entries.push('word/_rels/document.xml.rels', '[Content_Types].xml');

    // unzip treats `[...]` in a member-name argument as a glob character
    // class (not a literal bracket), so `[Content_Types].xml` must be
    // escaped for extraction or it silently fails to match ("filename not
    // matched") — same pitfall already found and documented in
    // postprocess.mjs's injectSmartArtParts. `zip` (the write side, below)
    // does not need the same escaping.
    const unzipEntries = entries.map((e) => (e === '[Content_Types].xml' ? '\\[Content_Types\\].xml' : e));
    execFileSync('unzip', ['-o', '-q', workDocx, ...unzipEntries, '-d', dir], { stdio: 'pipe' });

    if (needsTheme) {
      const p = join(dir, 'word', 'theme', 'theme1.xml');
      writeFileSync(p, patchTheme(readFileSync(p, 'utf8'), { headingFont, bodyFont, accentColor }), 'utf8');
    }
    if (needsStyles) {
      const p = join(dir, 'word', 'styles.xml');
      const fontSizeHalfPt = fontSizePt !== undefined ? resolveFontSizeHalfPt(fontSizePt) : undefined;
      writeFileSync(
        p,
        patchStyles(readFileSync(p, 'utf8'), { fontSizeHalfPt, lineSpacing: resolvedLineSpacing, justify }),
        'utf8',
      );
    }

    let footerRId;
    if (needsFooter) {
      const relsPath = join(dir, 'word', '_rels', 'document.xml.rels');
      const patched = patchRelsForFooter(readFileSync(relsPath, 'utf8'));
      footerRId = patched.rId;
      writeFileSync(relsPath, patched.xml, 'utf8');

      const contentTypesPath = join(dir, '[Content_Types].xml');
      writeFileSync(contentTypesPath, patchContentTypesForFooter(readFileSync(contentTypesPath, 'utf8')), 'utf8');

      writeFileSync(join(dir, 'word', 'footer1.xml'), FOOTER_PAGE_NUMBER_XML, 'utf8');
      entries.push('word/footer1.xml');
    }

    if (needsSectPr) {
      const p = join(dir, 'word', 'document.xml');
      const pgSize =
        pageSize !== undefined || orientation !== undefined || landscapeTables === true
          ? resolvePageSize(pageSize, orientation)
          : null;
      const mar = margins !== undefined || landscapeTables === true ? resolveMargins(margins, marginsCustomCm) : null;
      writeFileSync(p, patchSectPr(readFileSync(p, 'utf8'), { pgSize, margins: mar, footerRId }), 'utf8');
    }

    execFileSync('zip', ['-q', '-X', workDocx, ...entries], { cwd: dir, stdio: 'pipe' });
    return { path: workDocx, dir };
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Usable page area in EMU for `TranslateOptions.maxDrawingCx`/`maxDrawingCy`
 * (`export_customization_SPEC.md` §2.4) — the same page size/orientation/
 * margins resolution as {@link buildReferenceDoc}, but expressed as the
 * drawable area a diagram must fit, in EMU (1 twip = 635 EMU) rather than as
 * XML to patch. Independent of whether a reference doc was actually built:
 * even a `md2nativedocx.referenceDocument` custom-template user still gets a
 * diagram sized for *some* explicit page area rather than silently keeping
 * the Letter-portrait default when they never touched Lot 1's settings at
 * all — so this only returns `null` (meaning "keep the translator's own
 * built-in default") when literally none of pageSize/orientation/margins
 * were set, same condition as `needsSectPr` above.
 */
export function resolveMaxDrawingExtentEmu({ pageSize, orientation, margins, marginsCustomCm } = {}) {
  if (pageSize === undefined && orientation === undefined && margins === undefined) return null;
  const size = resolvePageSize(pageSize, orientation);
  const mar = margins !== undefined ? resolveMargins(margins, marginsCustomCm) : MARGIN_PRESETS_TWIPS.normal;
  const TWIP_TO_EMU = 635;
  const cx = (size.w - mar.left - mar.right) * TWIP_TO_EMU;
  const cy = (size.h - mar.top - mar.bottom) * TWIP_TO_EMU;
  return { cx: Math.max(1, cx), cy: Math.max(1, cy) };
}
