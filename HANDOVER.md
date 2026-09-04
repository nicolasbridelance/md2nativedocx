# Handover — 2026-09-04

One entry point for picking this project back up. Written at the end of a session that shipped 3
new Mermaid diagram types and then did a full audit pass (tests, docs, fixtures) before pausing.
Superseded by the next handover note if/when one is written — check the git log / `TODO.md` for
anything newer than this file's date.

## What shipped this session

A strategy pivot (see `docs/smartart-full-catalog-cross-mermaid.md`) — instead of asking "does
this Mermaid type fit some SmartArt category" (the old, type-first framing), ask "for each real
SmartArt shape archetype, which Mermaid type reduces to it" (shape-first). That flip caught a real
miss in the prior analysis (quadrant/Venn had been dismissed as "no SmartArt fit" purely by
name-matching) and directly produced 3 shipped diagram types, all OOXML shapes rather than
SmartArt `dgm:layoutDef` (reasoning is per-type, see each commit / the catalog doc):

| Type | Commit | Archetype | Notes |
|---|---|---|---|
| `quadrantChart` | `55fd26d` | #9 Matrice | First non-flowchart type ever shipped. `translator/canvas.ts` extracted for reuse. |
| `venn-beta` | `03dd349` | #11 Venn | 2-3 sets, true overlap geometry; 4+ degrades with a visible note. |
| `mindmap` | `5bec150` | #5 Radial | Fixes the *exact* bug that started this whole thread (`root((mindmap))` silently mis-parsed as a fake flowchart node). Radial/balloon layout, no depth cap. |

`mindmap` surfaced 3 real bugs only a real LibreOffice render caught (not unit tests) — all fixed,
all re-verified by another real render:
1. `wps:cxnSp` connectors are schema-valid but silently invisible in this project's canvas under
   LibreOffice — switched to `wps:wsp`+`wps:cNvCnPr`, the one confirmed-working pattern.
2. Font size was never scaled by the diagram's overall page-fit `scale` factor in any of the 3 new
   translators — latent in quadrant/venn too, just never triggered (their canvases stayed small).
   Fixed in `translator/canvas.ts` (`scaledFontSizeHalfPt`/`scaledLineWidthEmu`), applied to all 3.
3. Non-rectangular presets (hexagon/circle/bang/cloud) clip text inside their bounding box more
   than a rect does — added a per-shape width-padding factor.

**Deliberately not built**: a flowchart "star" (hub-and-spoke) SmartArt topology. That shape
already renders correctly via the existing OOXML pipeline *with real connector lines* — something
`chain.ts`/`tree.ts`/`cycle.ts` explicitly cannot draw. Building SmartArt for it would have added
complexity for no real gain. See the dedicated note in the cross-Mermaid catalog.

## Audit pass (this same session, after the 3 types landed)

Closed gaps across every automated test chapter in `TESTING.md` that the 3 new types were missing:

- **Chapter 1 (unit)**: already covered when each type shipped — 289 core tests.
- **Chapter 2 (pipeline integration)**: was missing entirely. Added
  `packages/cli/test/new-diagram-types.test.mjs` — exercises all 3 types through the real CLI
  (not just `packages/core` functions in isolation), plus a warning-surfacing check and a
  regression lock on the `wps:cNvCnPr` connector fix above.
- **Chapter 4 (visual regression)**: was missing entirely. Added `quadrant.mmd`/`venn.mmd`/
  `mindmap.mmd` to `test-corpus/visual/fixtures/`, generated + **manually reviewed** (per the
  chapter's own mandatory rule) + accepted baselines. Confirmed zero regression to the 32
  pre-existing flowchart baselines (byte-identical, checked via `git status` before/after
  `--update-baseline`, which touches every fixture unconditionally).
- **Chapter 6 (manual Word acceptance)**: fixtures prepared (`quadrant`/`venn`/`mindmap`
  `.docx`/`.md`/`.log`, real CLI output, 0 warnings) and `CHECKLIST.md` entries #7-9 written, but
  **the actual check requires opening these 3 files in real Word — not done, needs a human on
  Windows/macOS with Word installed.** This is the single concrete next action if you're picking
  this up.
- **Chapter 3 (real diagram corpus)**: **deliberately not touched.** That corpus's own stated
  principle (`test-corpus/corpus/README.md`) is sources "not written by this project" — official
  Mermaid examples. I don't have a quick, verified official `quadrantChart`/`venn-beta`/`mindmap`
  source in hand that meets that bar, and didn't want to add self-authored content to a corpus
  whose whole point is being *not* self-authored. Left for whoever wants to source real examples.
- **Chapter 5 (native Word comparison)**: unchanged — manual, Windows-only, always has been.

Docs updated for accuracy while auditing (not just the new-feature mentions): `README.md` had a
stale architecture diagram/wording (`wpg:wgp`, dropped from the codebase a while ago) and said
"six testing chapters" when `TESTING.md` itself says seven — both fixed. `docs/specs/
FUTURE_full_mermaid_coverage_SPEC.md`'s "zero implementation" / "SmartArt and type-coverage are
orthogonal" framing is now stale given the above — annotated in place rather than rewritten, so
the original reasoning stays visible. `packages/vscode-extension/CHANGELOG.md` got an `Unreleased`
entry (no version bump — that's the maintainer's call, not made here).

## Current state (verified right before this note was written)

- `git status`: clean, everything committed and pushed to `origin/main` (through the audit commit
  — check `git log --oneline -5` for the actual latest hash, don't trust this file's own memory of
  it once time has passed).
- `npm run typecheck && npm run lint`: clean across every workspace.
- `npm test`: 361 tests, all workspaces (36 cli + 289 core + 11 pandoc-filter + 25 vscode-extension).
- `npm run test:visual`: 35/35 fixtures, 0.000% pixel diff on every one.
- `npm run test:fuzz`: 3/3 property tests.
- Known, pre-existing, unrelated to this session: `npm test` at the root regenerates
  `test-corpus/corpus/generated/*.docx` and leaves them git-dirty on **every** run, even with zero
  code changes (confirmed via `git stash` — same drift on a clean checkout). Discarded before
  every commit this session (`git checkout -- test-corpus/corpus/generated/`). Not investigated —
  flagging again since it'll surface again for the next person too.

## Not done / explicitly deferred (not forgotten, just not this session)

- `architecture-beta` — the other archetype-#5 (Radial) candidate alongside `mindmap`, genuinely
  new/unsupported type, not started.
- Pyramid archetype — no good Mermaid mapping found in the catalog; weak candidate, low priority.
- Labeled-Hierarchy / convergent-layout SmartArt archetypes — already explored and rejected with
  evidence in the older `docs/smartart-layout-catalog.md`, not reopened.
- The remaining ~25 Mermaid diagram types not in `docs/smartart-full-catalog-cross-mermaid.md`'s
  archetype table at all (sequenceDiagram, classDiagram, gantt, pie, ...) — see `docs/specs/
  FUTURE_full_mermaid_coverage_SPEC.md` for the broader roadmap and family taxonomy; each still
  gets a clean "not yet supported" in-document note today, never a silent misparse.
- Chapters 3 and 6 gaps noted above.

## Where to look for more

- `docs/smartart-full-catalog-cross-mermaid.md` — the archetype-first catalog driving what gets
  built next and why (which SmartArt shape maps to which Mermaid type, and the OOXML-vs-SmartArt
  implementation call for each).
- `TODO.md` Phase 5+ — the detailed, dated build log for each of the 3 shipped types (what shipped,
  what bugs were found, how they were fixed).
- `TESTING.md` — the seven test chapters, what each guarantees, how to add a case to any of them.
- `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` — the broader 28-type roadmap this session's
  work is one slice of.
