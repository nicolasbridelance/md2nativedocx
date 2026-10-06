# Handover — 2026-10-06

One entry point for picking this project back up. It describes the state of the project as of this
date; `git log` has anything newer. Earlier handovers live in this file's git history.

## Where the project stands

- **The product works end to end.** Markdown with Mermaid becomes a `.docx` where every diagram is
  editable in Word, from the VS Code extension (0.7.0 on the Marketplace, tag `vscode-v0.7.0`), the
  CLI, or the Pandoc filter. The same source can also become a `.pptx` deck (`packages/pptx`), which
  opens in PowerPoint and imports into Google Slides.
- **All 29 Mermaid types are covered.** What each one becomes (SmartArt, Word chart or shapes), under
  which conditions, and what was ruled out with evidence: [`docs/coverage.md`](docs/coverage.md).
- **SmartArt and Word charts are verified in real Word** by the maintainer, round by round
  ([`test-corpus/word-verification/CHECKLIST.md`](test-corpus/word-verification/CHECKLIST.md), rounds
  4-20): processes, cycles, trees up to 10 levels in four directions, compact org charts, seven looks,
  per-node shapes, mindmap, treeView, timeline, journey, kanban, simple gitGraph/state/class diagrams;
  `pie`, `xychart` and `radar` as charts with Edit Data.
- **Same defaults everywhere.** SmartArt (with its pre-rendered drawing, `colorful` look) and Word charts
  are on in the extension, the CLI and the Pandoc filter; `MD2NATIVEDOCX_ENABLE_SMARTART=0` /
  `MD2NATIVEDOCX_NATIVE_CHARTS=0` turn them off at the CLI.
- **Versions.** Only the extension is released (0.7.0). `core`, `cli`, `pptx`, `pandoc-filter` are
  0.1.0 and not on npm yet (waiting on a token, see `TODO.md` §1).

## Health (2026-10-06)

- Tests: core 749, cli 126, vscode-extension 73, pptx 25, pandoc-filter 15, all green.
  Typecheck and lint clean.
- `test:visual` (LibreOffice render + pixel diff) green; `test:oxml-validate` reports 0 schema errors
  in anything this project emits (the remaining errors in a full document come from Pandoc's own
  `reference.docx`, identical in a bare `pandoc` export).
- CI green on Linux, macOS and Windows. `npm audit --omit=dev` is clean; the whole tree passes
  `scripts/audit-gate.mjs` with one dated exception (`braces`, no patched version, **expires
  2026-12-31**).

## What changed in the last sessions (2026-10-05 → 06)

- SmartArt campaign, every step confirmed in real Word: tree connectors, look profiles, multi-level
  trees, compact org chart, mindmap/treeView, rich text in boxes, timeline and journey time lines,
  kanban grouped list, simple gitGraph/state/class, per-node Mermaid shapes.
- Native Word charts with embedded workbook (ADR 0011) for `pie`, `xychart`, `radar`.
- Extension 0.6.0: PowerPoint export, per-diagram "what this becomes" line and hover, settings in
  sections, translated side panel, re-shot demos (`docs/specs/UX_REVIEW_2026-10.md`).
- `.pptx` hardened against real PowerPoint (two repair-prompt causes the validator could not see).
- French user manual, 38 pages (`docs/manual/`).
- Clean-up (this handover): `TODO.md` reduced to the open backlog, old content archived; new
  `docs/coverage.md`; specs given dated status banners; stale claims fixed in the READMEs, `AGENTS.md`
  and the flowchart compliance table; SmartArt showcase image regenerated (it also revealed a word
  broken inside diamond-shaped SmartArt boxes, fixed in the cached drawing).
- Lean repo before v1: the on-hold Word add-in moved to branch `word-addin-scaffold` (575 dev packages
  fewer, and the source of a critical `shell-quote` advisory that had turned CI red); spike build
  scripts and outputs, superseded verification files, duplicate images and per-type `.pptx` removed
  (restore commands in `docs/adr/spikes/README.md` and the CHECKLIST header); PNGs palette-reduced.
- Code before v1: same defaults in every entry point (SmartArt with its cached drawing, `colorful`
  look, Word charts); legacy variables `MD2NATIVEDOCX_DISABLE_SMARTART` and
  `MD2NATIVEDOCX_CHART_WORKBOOK` removed; the extension's "pre-rendered drawing" setting removed
  (`MD2NATIVEDOCX_SMARTART_DRAWING=0` stays for the no-drawing Word checks); the core barrel reduced
  from 227 to about 90 exports (per-type AST types are internal now).
- **Extension 0.7.0 published** (tag `vscode-v0.7.0`): the SmartArt additions above, the new
  Marketplace description, the drawing setting removed, a smaller `.vsix`.

## What's next

Everything open is in [`TODO.md`](TODO.md), in four sections:

1. **Maintainer:** install 0.7.0 on the corporate Windows machine and export a mixed document (the new
   defaults change existing users' output); decide on Venn as SmartArt; npm token; review a one-line
   `ci.yml` change; DCO/CLA before the first external PR. Word add-in on hold, on branch `word-addin-scaffold`.
2. **Agent, no maintainer needed:** the manual generator into `scripts/` and SmartArt/charts in the
   manual; untranslated setting descriptions; two known visual defects; the `braces` exception date.
3. **Backlog, analysed:** five SmartArt/chart tracks (Venn, small Gantt, requirement/C4 trees, treemap
   as a Word chart, SmartArt and charts in `.pptx`), each with gain, cost and a recommendation.
4. **Ideas not committed to.**

## Conventions worth remembering

- Commit each finished unit and **push** it (a stale CI badge once came from unpushed commits).
- "Word won't open the file": run `scripts/oxml-validator` before comparing XML by hand. It is not
  enough for PowerPoint, which is stricter: bisect with real opens there.
- Render with LibreOffice and look at the image; unit tests on XML miss blank or broken renders.
- A new SmartArt mapping is done only once the maintainer has opened a `smartart-vNN-*` file in real
  Word (add a CHECKLIST round). A diagram type must keep its visual identity in SmartArt, not just its
  data.
- Word-made samples (`handmade_samples/`, gitignored) are read for structure only, never committed.
- Escalate before touching `packages/core`'s public API, adding a dependency, `.devcontainer/`,
  `.vscode/`, `ci.yml` or a security rule (`AGENTS.md`).

## Where to look

| Need | File |
|---|---|
| Open work | `TODO.md` |
| What each Mermaid type becomes | `docs/coverage.md` |
| Rules, conventions, escalation | `AGENTS.md`, `TESTING.md` |
| Product intent (French) | `docs/specs/cahier_des_charges.md` |
| Decisions | `docs/adr/` (0006 SmartArt corruption, 0010 pptx, 0011 charts) |
| Real-Word verification log | `test-corpus/word-verification/CHECKLIST.md` |
| Closed work, incidents, old TODO | `docs/history/` |
