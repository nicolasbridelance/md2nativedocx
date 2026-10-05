# Handover — 2026-10-05 (all 29 diagram types shipped; pptx hardened; user manual written)

One entry point for picking this project back up. Check `git log`/`TODO.md` for anything newer
than this date. Previous handover (2026-09-06, Word add-in scaffold) is folded into "Still open".

## State of the project

- **Coverage:** 29/29 Mermaid types render as native, editable Word shapes (`packages/core`), plus
  `.pptx` decks (`packages/pptx`: `md2nativedocx deck.md -o deck.pptx [--show-source]`).
- **Green locally:** typecheck, lint, 642 core tests, 25 pptx tests, 117 cli tests, `test:visual`
  68/68. `test:oxml-validate`: 0 schema errors in anything this project emits (the ~470 errors in a
  whole manual are Pandoc's own list/table/math quirks, present in a bare `pandoc` output too).
- **CI:** green on Linux/macOS/Windows; the `npm audit` job was red from a new advisory with no
  patched version and is now handled by a dated-exception gate (see "Still open").

## What happened this session

1. **Real-Word / real-PowerPoint verification round** (maintainer): `.docx` of sequence, zenuml,
   eventmodeling and the colour/settings mega file open fine. A real schema bug surfaced via the
   validator and was fixed: `w:b`/`w:i` must precede `w:color`/`w:sz` in label runs (`6d1f8a7`).
2. **`.pptx` hardening — first-ever real PowerPoint opens.** Two causes of the "PowerPoint found a
   problem, repair?" prompt, both invisible to the Open XML SDK validator:
   - package lacked parts PowerPoint always writes (`presProps`, `viewProps`, `tableStyles`, master
     `txStyles`, presentation→theme rel) — `161dcd1`;
   - routed (polyline) edges were `p:cxnSp` carrying `a:custGeom`; PowerPoint wants preset geometry
     on connectors, so they are now `p:sp` — `afa3943`. Found by bisecting the 62-slide deck with
     the maintainer (quarters → quarter-of-a-quarter → common feature). **Lesson:** schema-valid ≠
     PowerPoint-valid; bisect with real opens instead of guessing.
   - New opt-in `--show-source` puts each diagram's Mermaid source in a panel beside it (`25b67ed`).
3. **`packages/core` API change (maintainer-approved):** every translator now takes optional
   `CanvasOptions` (`maxDrawingCx/Cy`), exported from the barrel. Before, only flowcharts honoured
   page size/margins/landscape; the other 28 types used a hard-coded 6.5 in cap. The pandoc bridge
   passes the env-derived cap; the CLI now lets an explicit `MD2NATIVEDOCX_MAX_DRAWING_CX/CY` win.
4. **User manual** — `docs/manual/manuel-utilisateur.{md,docx}` (French, 38 pages A4): cover, TOC,
   intro, settings table, standard-Markdown checks, then one page per type (description, fiche
   table, syntax, supported, limits, source | render side by side). The TOC is a real Word field
   pre-filled with page numbers measured from a LibreOffice render and marked dirty. All text comes
   from the parser headers/warnings, not memory.
   - **The generator script is not in the repo** (it lived in a session scratchpad). Treat the `.md`
     as the source to edit by hand, or rebuild a generator (it templated the per-type table from
     `test-corpus/visual/fixtures/*.mmd` + hand-written syntax/limits, then a two-pass TOC).
5. **Verification fixtures** in `test-corpus/word-verification/`: per-type `.docx` **and** `.pptx`
   (with source panels), `all-types-mega-color.{md,docx}`, `all-types-deck.pptx`,
   `markdown-features.md`, `assets/`.
6. **Public-facing:** replaced the retired shields.io VS Marketplace badge (`26ae866`); a reply to
   mermaid-js/mermaid#8060 (native chart vs native shapes) was posted by the maintainer.

## Still open — roadmap (updated 2026-10-05, later in the day)

*Confirmed by the maintainer this session:* the manual opens fine in real Word (cover, TOC, equation
matrix); `all-types-deck.pptx` opens in PowerPoint and imports into Google Slides; the Windows
no-admin Pandoc incident is **resolved** (its field report is archived in
`docs/history/missing_pandoc_bugfix.md`).

*On hold:* Word add-in (Phase 4) — the 3 spikes need a real Word desktop; waiting on the maintainer.

*Owned by the agent (maintainer: "dans ta banette") — both now implemented, **awaiting real Word**:*
1. **Native `c:chart` + embedded workbook** (`pie`, `xychart`, `radar`; ADR 0011). `pie` is **confirmed in
   real Word** (Edit Data works). `xychart`/`radar` are schema-valid and render in LibreOffice; check them
   with `native-chart-xychart-radar.docx` (CHECKLIST Round 5). Opt-in: `MD2NATIVEDOCX_NATIVE_CHARTS=1` /
   VS Code setting `md2nativedocx.nativeCharts.enabled`. Degradations are documented in the ADR (a
   horizontal xychart with a line series stays shapes, with a warning). Remaining: decide the default.
2. **SmartArt "pixel perfect" + look** — **confirmed in real Word by the maintainer (2026-10-05): v3, v4 and all
   v5 files open with no warning, the diagrams are visible and "très joli".** What shipped:
   - `cycle` restructured to chain's two-level shape (the empty-frame cause was suspected, not proven; it now
     displays).
   - **Pre-rendered `dsp:drawing`** (`MD2NATIVEDOCX_SMARTART_DRAWING=1`, VS Code
     `smartArt.preRenderedDrawing`, default on): Word and LibreOffice show the same cached geometry.
   - **Look profiles** `simple` | `colorful` | `intense` (`MD2NATIVEDOCX_SMARTART_STYLE`, VS Code
     `smartArt.style`, default `colorful`): accents per shape, theme gradient + shadow; still real,
     restylable SmartArt. Not yet answered by the maintainer: the Word-computed look of
     `smartart-v5-intense-no-drawing.docx` (does Word honour our `styleDef` references?) and which profile
     should be the core default (core still defaults to `simple`; the VS Code extension defaults to `colorful`).
3. Put the manual generator into `scripts/` (currently outside the repo); document native charts and the
   SmartArt switches in the manual.

*Done on the CI front:* `npm audit` is green again, without weakening the production gate —
`braces` (GHSA-vfj7-8cjw-p6xm) has no patched version at all, so updates can't fix it. `ci.yml` now
runs `npm audit --omit=dev --audit-level=high` (strict, 0 findings) and `scripts/audit-gate.mjs`
(whole tree; fails on any high/critical advisory without a dated, justified entry in
`audit-exceptions.json`). The single exception **expires 2026-12-31 — re-review it then**.

*Other doable work (no maintainer needed):* vendor `@md2nativedocx/pptx` into the VS Code extension and
add pptx tests to the Windows/macOS CI jobs (`ci.yml` change → human review); `.qmd` support; editor-tab
right-click "Export to Word"; l10n of the config panel; known visual gaps (sequence block frame vs
self-message, two unattached connectors on the bipartite stress graph).

*Governance, whenever the first external PR approaches:* choose DCO (`Signed-off-by` via
`git commit -s`, lightweight) vs a CLA (heavier, preserves relicensing) vs nothing — see AGENTS.md
"Licensing". Not urgent while the project is single-maintainer.

## Conventions worth remembering

- Commit each finished unit and **push** it (a stale CI badge once came from unpushed commits).
- Validate with `scripts/oxml-validator` *before* hand-diffing XML — but it is not enough for
  PowerPoint; real opens are the only proof there.
- Real renders (LibreOffice) find what unit tests can't; look at the image, don't trust the XML.
- Never ship proprietary artifacts found during research without asking (licensing caution).
- Anything touching `packages/core` public API, a dependency, `.devcontainer/`, or a security rule
  is escalated to the maintainer first (AGENTS.md).

## Where to look

`TODO.md` (full punch list; "Session 2026-10-05" block), `docs/adr/0003|0006|0008|0010`,
`docs/manual/`, `docs/specs/`, `test-corpus/word-verification/CHECKLIST.md`,
`docs/history/TODO_ARCHIVE.md`.
