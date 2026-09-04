# Test strategy — `md2nativedocx`

> This file exists because the test directory grew by successive additions rather than by
> design, and that ended up being confusing — see `TODO.md` (2026-08-07) for the history of
> that finding and the cleanup that followed. This document gives the missing overview: the
> project's seven test chapters, what each one guarantees, where it lives, and how to add a case.

## The seven chapters

| # | Chapter | Where | Automated | What it guarantees |
|---|---|---|---|---|
| 1 | [Unit](#1-unit) | `packages/*/test/{unit,golden,fuzz}` | yes, on every push | pure logic (parser, layout, translator), no I/O |
| 2 | [Pipeline integration](#2-pipeline-integration) | `packages/cli/test`, `packages/pandoc-filter/test` | yes, on every push | the real chain Markdown → Pandoc → Lua filter → core → `.docx` |
| 3 | [Real diagram corpus](#3-real-diagram-corpus) | `test-corpus/corpus/` | yes (regeneration + conformance) + manual Word review | real `.mmd` files from mermaid-js/mermaid go through the whole pipeline |
| 4 | [Visual regression](#4-visual-regression) | `test-corpus/visual/`, `scripts/test-visual.mjs` | yes, on demand (LibreOffice required) | the actual render doesn't regress, not just the XML |
| 5 | [Native Word comparison](#5-native-word-comparison) | `tools/word-reference/` | no, manual, Windows | OOXML structure compared against an authentic Word document |
| 6 | [Manual Word acceptance checklist](#6-manual-word-acceptance-checklist) | `test-corpus/word-verification/` | no, manual, real Word required | spec §9 release gate: known LibreOffice-only-verified defects and a crossing-heavy adversarial case, opened and eyeballed in actual Word |
| 7 | [Historical spikes](#7-historical-spikes) | `docs/adr/spikes/` | no, archive | evidence that motivated ADR 0001/0002 |

Commands: see `AGENTS.md` → "Build, test, lint" for the `npm run ...` list.

## Why this split

Each chapter answers a question none of the others can answer alone:

- Chapters 1-2 verify that the **code** does what it's supposed to — fast, deterministic, zero
  external dependency (Pandoc excepted for #2).
- Chapter 3 verifies the pipeline holds up against **real Mermaid syntax**, not just the cases
  we'd have thought to write ourselves.
- Chapter 4 exists because the first three validate the XML, not the **render** — a `.docx` can
  be a valid ZIP, well-formed XML, every id unique, and still display as an empty gray rectangle
  or not render at all in Word/LibreOffice. Several defects in this category (namespaces not
  declared on the root, invisible arrows, overlapping subgraph title, an edge crossing through a
  node, rendering completely absent past a given width/height ratio) were found ONLY by this
  chapter — see `TODO.md` for the detailed history of each.
- Chapter 5 is the only one that compares against **real Word** rather than our own understanding
  of the OOXML format — irreplaceable for diagnosing a discrepancy, but manual and Windows-only,
  so not in the CI loop.
- Chapter 6 is the spec's own release gate (§9, "manual test in real Word"), and answers a
  question chapter 5 doesn't: chapter 5 diffs *structure* against a Word-generated reference on
  Windows CI-adjacent tooling, but nothing in chapters 1-5 ever opens a file in Word and looks —
  LibreOffice (chapter 4's renderer) and real Word are different rendering engines, and at least
  one defect (`nested-3-levels.docx`'s missing subgraph container box) was confirmed identical in
  both, which chapter 4's baseline-diff mechanism could never have caught on its own since the gap
  predates the accepted baseline. See `docs/mvp-acceptance-report.md` for the results this chapter
  has produced so far.
- Chapter 7 isn't a test: it's the empirical evidence that settled two architecture decisions
  (layout engine, Pandoc integration mechanism). It's archived, not maintained.

## 1. Unit

`packages/core/test/unit/*.test.ts` (parser, layout, translator), `packages/core/test/golden/`
(expected XML fixtures, structural comparison not raw text), `packages/core/test/fuzz/`
(property-based on the untrusted-input boundary, `fast-check`).

**Adding a case**: one more `test()` in the relevant file. A bug found by a higher chapter
(4, especially) almost always comes back down here as a regression test — that's the convention
followed throughout (see the 2026-08-07 session's commits for examples).

## 2. Pipeline integration

`packages/cli/test/{cli,postprocess}.test.mjs`, `packages/pandoc-filter/test/filter.test.mjs`.
Exercises the real CLI (`execFileSync`) or the real Lua filter, not just `packages/core`'s
functions in isolation.

**Adding a case**: write a minimal `.md` in a temp directory
(`mkdtempSync(join(tmpdir(), '...'))` + `rmSync` cleanup — the pattern already in place in
`cli.test.mjs`; don't reinvent a timestamped persisted output, see the anti-pattern below).

## 3. Real diagram corpus

`test-corpus/corpus/` — details, provenance, and scope limits in its own
`test-corpus/corpus/README.md`. Regenerated by `packages/cli/test/corpus.test.mjs` (automatic
conformance assertions) and by `node scripts/generate-corpus.mjs` (standalone regeneration).
`generated/*.docx` also serves as material for the MVP acceptance criterion (spec §9: manual
tests in real Word before each release).

## 4. Visual regression

`test-corpus/visual/` — details, the LibreOffice height/ratio pitfall, and the procedure for
adding a case in its own `test-corpus/visual/README.md`. Mechanism: `scripts/test-visual.mjs` +
`scripts/lib/png.mjs` (in-house PNG decoder/diff, zero dependency).

## 5. Native Word comparison

`tools/word-reference/` — generates a real Word document (PowerShell, requires Word installed)
and compares its `wpg:wgp` structure to our output. See `tools/word-reference/README.md`. Manual,
Windows-only: use it when a real Word render diverges from what LibreOffice/our structural tests
validate, to isolate whether the discrepancy comes from us or from the rendering engine.

## 6. Manual Word acceptance checklist

`test-corpus/word-verification/` — a small hand-picked set of generated `.docx` files
(`minimal`, `medium-realistic`, `nested-3-levels`, `order-flow`, `crossing-stress-bipartite`) plus
`CHECKLIST.md`, curated from `test-corpus/visual/fixtures/` specifically to re-probe known
LibreOffice-only-verified defects and the one documented adversarial crossing case in actual
desktop Word. This is the evidence for MVP acceptance item 2 in `docs/specs/cahier_des_charges.md`
§9 ("manual test in real Word before each release") — see `docs/mvp-acceptance-report.md` for the
recorded results.

Distinct from chapter 5 (`tools/word-reference/`): chapter 5 automates a *structural* OOXML diff
against a Word-generated reference; this chapter is a human opening each file in Word and
eyeballing render fidelity per `CHECKLIST.md`'s checkboxes — the two catch different classes of
defect and neither substitutes for the other.

**Adding a case**: regenerate with `node scripts/generate-corpus.mjs` pointed at a fixture under
`test-corpus/visual/fixtures/`, copy the resulting `.docx`/`.md` into
`test-corpus/word-verification/`, and add a numbered section to `CHECKLIST.md` explaining what to
look for and why (a known defect this probes, an MVP acceptance criterion, etc. — not just "looks
right").

## 7. Historical spikes

`docs/adr/spikes/` — see its own `README.md`. Archived evidence for `docs/adr/0001-*` and
`docs/adr/0002-*`. Nothing here runs as part of the automated tests.

## Anti-pattern avoided: timestamped accumulation

`test-corpus/output/simple/` used to create a timestamped subdirectory on **every** `npm test`
run, never cleaned up — 100+ files accumulated in one session, some committed by mistake. The
intent ("stay auditable") was legitimate but misapplied: a simple test (e.g. "Markdown without
Mermaid contains no `wpg:wgp`") is an assertion on generated XML, not an artifact a human reviews
afterward — an ephemeral temp directory (`mkdtempSync`/`rmSync`, chapter 2) is enough. Reserve
**persisted** output for the cases that genuinely need it (chapter 3: a human opens the `.docx`
in Word; chapter 4: a baseline serves as a diff reference) — and in that case, overwrite it on
every run instead of timestamping it, the way `test-corpus/corpus/generated/` already does.
