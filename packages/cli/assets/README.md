# `reference.docx`

Passed to Pandoc via `--reference-doc` so generated documents use Word's current default look
(Aptos font scheme, the modern "Office" colour scheme, accent1 `#4472C4`, flat non-bold heading
hierarchy, 11 pt body text with 1.08 line spacing and 8 pt after) instead of Pandoc's own bundled
default, which is the 2007-2010 Office look (Calibri/Cambria, bold coloured headings).

**Written by this project, from scratch (2026-10-08).** Every part comes from
`packages/cli/reference-docx-src/` and is assembled by:

```bash
node scripts/build-reference-docx.mjs
```

Edit a part there, rebuild, and commit both. The build is reproducible (fixed timestamps).

Why: the previous file was derived from Pandoc's default `reference.docx`, which Pandoc distributes
under GPL-2+ only (its templates are dual GPL-2+/BSD-3, its other data files are not), while this
project is CC0. The maintainer chose to rebuild it (ADR 0013, `docs/adr/0013-odf-output-phase-0.md`).
The new parts keep the same visual values: a LibreOffice render of a document using every Pandoc
style (title block, abstract, headings, lists, footnote, code, table with caption, definition list,
diagram) is pixel-identical to the previous one. They contain no sample text and no relationship to
anything outside the package (the old file carried an unused `http://example.com` link from
Pandoc's sample document).

What the rest of the code relies on (`src/referenceDocBuilder.mjs`, tested in
`test/reference-doc-builder.test.mjs`):

- `word/theme/theme1.xml`: `<a:majorFont><a:latin typeface="…" />`, the same for `minorFont`, and
  `<a:accent1><a:srgbClr val="RRGGBB"/></a:accent1>`;
- `word/styles.xml`: `w:docDefaults` with `w:sz`/`w:szCs` and a `w:pPrDefault`; accent colours as
  `w:themeColor="accent1"` with a literal `w:val` fallback (LibreOffice does not resolve theme
  colours); a `Table` style with a `firstRow` conditional `w:tcPr`;
- `word/document.xml`: an empty `<w:sectPr />`, which `patchSectPr` fills.

Styles Pandoc adds at conversion time (syntax highlighting `SourceCode`, `*Tok`) are not in this
file: Pandoc writes them itself.

**To verify in a real Word** (no Word in this environment; checked with LibreOffice and the Open XML
validator): heading styling and whether Word's current built-in template still matches.
