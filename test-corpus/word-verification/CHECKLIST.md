# Word verification checklist — MVP closure (spec §9)

Purpose: this is the one piece of MVP-acceptance evidence that cannot be produced from Linux/CI —
it requires opening these files in **real Microsoft Word** (any recent desktop version) on Windows
or macOS. Everything else (crossing-detector report, golden/unit/fuzz/visual-diff tests) is already
automated — see `docs/mvp-acceptance-report.md`.

5 files, ~3 minutes each. For each one, open it in Word and check:

## 1. `minimal.docx` — baseline sanity
- [ ] Each shape is individually clickable/selectable (not one merged picture).
- [ ] Click a shape, drag it — the connected arrow follows and stays attached.
- [ ] No text overflow outside any shape.

## 2. `medium-realistic.docx` — colors, gate diamonds, a loop (Retry → Check)
- [ ] Same 3 checks as above.
- [ ] Fill colors (blue/yellow/green) render correctly.
- [ ] The loop-back arrow (Retry → Check) is legible, not overlapping other shapes' text.

## 3. `nested-3-levels.docx` — **known LibreOffice defect probe**
- [ ] Diagram renders at all (not a blank/missing area). This specific diagram silently failed to
      render in LibreOffice headless before a fix (TODO.md, "Défaut de rendu LibreOffice
      caractérisé et corrigé") — the fix was verified in LibreOffice only. **This is the check that
      confirms or refutes whether the same defect exists in real Word.**
- [ ] Same 3 baseline checks as #1.

## 4. `order-flow.docx` — **known LibreOffice defect probe #2** + skip-level edge
- [ ] Same "renders at all" check as #3 (this fixture also triggered the tall/narrow LibreOffice
      blank-render defect by accident).
- [ ] The `D → J` edge (skips over C/E/F/G/H/I) does not visually cross through the `Preparer
      colis`/`Expedier` shapes it routes around.
- [ ] Same 3 baseline checks as #1.

## 5. `crossing-stress-bipartite.docx` — the one documented exception
- [ ] This is a deliberately adversarial near-complete bipartite graph (4 A-nodes × 4 B-nodes,
      12 edges) — `docs/mvp-acceptance-report.md` documents 12 geometric edge/edge crossings here,
      the only fixture out of 24 that fails the 0-crossing check. Confirm it's visually messy but
      still *usable* (shapes selectable, no silent render failure) — this is expected to look
      busy, that's not a bug, just note whether it's "busy but readable" or "actually broken".

## Recording the result

Once done, either:
- tell Claude the outcome in the conversation (pass/fail per item, any screenshot worth keeping), or
- fill in the "Real-Word verification" section of `docs/mvp-acceptance-report.md` yourself and
  check off the corresponding TODO.md box.

Word version and OS used: _______________
Date: _______________
