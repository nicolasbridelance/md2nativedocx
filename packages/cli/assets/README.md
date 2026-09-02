# `reference.docx`

Passed to Pandoc via `--reference-doc` so generated documents use Word's current default look
(Aptos font scheme, modern "Office" theme colors, flat non-bold heading hierarchy) instead of
Pandoc's own bundled default, which is the original 2007-2010 Office theme verbatim (Calibri
headings / Cambria body, bold colored H1-H3, accent1 `#4F81BD`) — confirmed by inspecting
Pandoc 3.1.3's `--print-default-data-file reference.docx` directly, not assumed.

No real Word install was available to generate this by hand (the usual method: open Pandoc's
default reference.docx in Word, tweak styles via the UI, save). Built instead by editing the
OOXML directly:

- `word/theme/theme1.xml`: `majorFont`/`minorFont` latin typeface set to `Aptos Display`/`Aptos`;
  color scheme swapped from the 2007 palette to the modern one (`accent1` `#4472C4`, etc.).
- `word/styles.xml`: `docDefaults` body text 12pt → 11pt, paragraph spacing single/10pt-after →
  1.08 line spacing/8pt-after (Word's actual `Normal.dotm` defaults since the 2013 theme, not
  changed by the later Aptos font rollout); `Heading1`-`Heading3` no longer bold, `Heading4`-
  `Heading5` no longer italic (the 2007 theme's bold/italic emphasis ladder isn't how the current
  built-in Word style gallery renders headings); heading/hyperlink accent colors updated to match.

**Assumptions to verify in a real Word** (no Word install in this environment — verified so far
only structurally, via `xmllint`, and visually via LibreOffice, which substitutes a fallback font
since Aptos isn't installed here either): the exact non-bold/non-italic heading styling, and
whether Word's *current* built-in template still matches this reconstruction if Microsoft has
changed it again since. Regenerate by editing `word/theme/theme1.xml` and `word/styles.xml` the
same way if it needs correcting — no other part of this file matters (do not hand-edit
`document.xml`, numbering, or anything else in the package).
