# Handover — 2026-10-05 (all 29 diagram types shipped; pptx hardened; user manual written)

One entry point for picking this project back up. Check `git log`/`TODO.md` for anything newer
than this date. Previous handover (2026-09-06, Word add-in scaffold) is folded into "Still open".

## State of the project

- **Coverage:** 29/29 Mermaid types render as native, editable Word shapes (`packages/core`), plus
  `.pptx` decks (`packages/pptx`: `md2nativedocx deck.md -o deck.pptx [--show-source]`).
- **Green locally:** typecheck, lint, 642 core tests, 25 pptx tests, 117 cli tests, `test:visual`
  68/68. `test:oxml-validate`: 0 schema errors in anything this project emits (the ~470 errors in a
  whole manual are Pandoc's own list/table/math quirks, present in a bare `pandoc` output too).
- **CI is red on one job only: `npm audit`** (19 vulns, 16 high, dev tooling only — `braces` via the
  typescript-eslint chain in `packages/word-addin`, `mocha` via `@vscode/test-cli`). No
  `package.json` changed; these are new advisories. It needs a maintainer decision (major bumps vs
  documented exceptions, AGENTS.md rule 6). Everything else passes on Linux/macOS/Windows.

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

## Still open — roadmap

*Needs the maintainer (real Word/PowerPoint/Windows):*
1. Open `docs/manual/manuel-utilisateur.docx` in Word: cover, dirty TOC field, equation matrix
   (Pandoc `m:mcPr` order is the first suspect if Word complains).
2. Import `all-types-deck.pptx` into Google Slides; check straight links (connectors) vs polylines
   (free shapes, no magnetic attachment).
3. Re-verify the Windows no-admin Pandoc incident on the real machine (0.5.1–0.5.3 fixes were only
   reproduced on Linux); `docs/missing_pandoc_bugfix.md` is the maintainer's untracked handoff note —
   commit or delete it.
4. **Word add-in (Phase 4):** `packages/word-addin/` is scaffolded, its 5 buttons are stubs, blocked
   on 3 spikes needing a real Word desktop (`TODO.md` "Comment lancer les spikes";
   `docs/adr/0008-…`). Build order after the spikes: Coller en MD → Copier en MD (needs a new
   OOXML→Markdown converter) → Couper → Enregistrer/Charger `.md`.

*Decisions only the maintainer takes:*
5. `npm audit` (above). 6. SmartArt "pixel perfect" is **not concluded** (off by default;
   ADR 0006 still awaits a final real-Word confirmation). 7. **Native `c:chart` + embedded
   workbook** for pie/xychart/radar (editable data in Word) — logged in `TODO.md` Phase 6/7 with a
   stepwise plan (pie without workbook → add workbook → real-Word check → xychart/radar), needs an
   ADR for the rule-7 exception (SmartArt already set the precedent). 8. CLA/DCO before the first
   external PR; GitHub repo settings (branch protection, private Codespaces ports).

*Doable without the maintainer:*
9. Vendor `@md2nativedocx/pptx` into the VS Code extension (`bundle-cli.mjs`; `.pptx` isn't exposed
   there yet) and add the pptx tests to the Windows/macOS CI jobs (a `ci.yml` change — needs human
   review). 10. `.qmd` (Quarto) support and a right-click "Export to Word" on the editor tab.
11. Put the manual generator into `scripts/`. 12. Panel l10n (the config panel and Phase 8 settings
   are French-only). 13. Known visual gaps: sequence block frame doesn't widen for a self-message;
   two unattached connectors on the bipartite stress graph; SmartArt cycle renders empty in Word.

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
