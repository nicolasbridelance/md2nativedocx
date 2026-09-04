# Word verification checklist — MVP closure (spec §9)

Purpose: this is the one piece of MVP-acceptance evidence that cannot be produced from Linux/CI —
it requires opening these files in **real Microsoft Word** (any recent desktop version) on Windows
or macOS. Everything else (crossing-detector report, golden/unit/fuzz/visual-diff tests) is already
automated — see `docs/mvp-acceptance-report.md`.

9 files, ~3 minutes each (6 flowchart, 3 new non-flowchart types added 2026-09-04). For each one,
open it in Word and check:

## 1. `minimal.docx` — baseline sanity
- [ ] Each shape is individually clickable/selectable (not one merged picture).
- [ ] Click a shape, drag it — the connected arrow follows and stays attached.
- [ ] No text overflow outside any shape.

  **Regenerated 2026-09-04**: the previously-committed `minimal.docx` (2026-09-03) failed to open
  in Word at all ("Word a rencontré une erreur lors de l'ouverture du fichier"), reported during
  this file's first real-Word pass. Root cause: this fixture's diagram (`A-->B-->C-->A`, a 3-node
  cycle) is SmartArt-eligible, and it turns out the file was generated with SmartArt forced on
  (`MD2NATIVEDOCX_ENABLE_SMARTART=1`) rather than the CLI's actual default — dispatching it straight
  into the exact, already-documented "Incident SmartArt cycle cassé en Word réel" (`TODO.md`,
  2026-09-03: `cycle.ts`'s output is missing a `dsp:drawing` fallback part real Word requires, not
  yet fixed). All 5 fixtures here have been regenerated with the CLI's default settings (no
  SmartArt env var) so what gets tested matches what a real user's export looks like; none of the 5
  source diagrams happens to be SmartArt-eligible except this one, so `minimal.docx` is now the only
  file whose generation mode actually changed (confirmed via `unzip -l`: no more `word/diagrams/`
  parts, it uses the plain `wpc:wpc` shapes path like every other fixture here already did).
  **Re-verification of this specific file in real Word is what's pending now** — the other 4 were
  already unaffected (no SmartArt parts before or after).

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

## 6. `direction-and-asymmetric-shape.docx` — new this session (2026-09-04): `RL` direction + asymmetric shape
- [ ] The flow visibly runs **right to left** (`Debut` on the right, `Fin` on the left) — `RL` was
      unsupported before this session (parser rejected it entirely); this is the first real-Word
      signal on Dagre's `RL` rankdir specifically (`BT` also shipped this session, but is the
      vertical mirror of the already-well-tested `TD` — this file exercises `RL`/asymmetric instead,
      the two changes that touch genuinely new rendering surface: a new node preset and a Dagre
      rankdir value that was never fed to Word before).
- [ ] The `Etape asymetrique` shape (from Mermaid's `id>Text]` flag syntax, new this session) renders
      as a flag/pentagon shape (OOXML preset `homePlate` — the closest built-in match, not an exact
      shape correspondence, see `docs/markdown-mermaid-compliance-table.md` §5.2), with its 2-line
      label fully inside the shape, not overflowing.
- [ ] Same 3 baseline checks as #1 (shapes selectable, connector follows a drag, no text overflow).

## 7. `quadrant.docx` — new (2026-09-04): `quadrantChart`, first non-flowchart diagram type
- [ ] The 4 quadrant cells render with distinct fill colors and their shared borders form a clean
      dividing cross (no gap or overlap at the center).
- [ ] All 4 points (Campaign A-D) are inside their correct quadrant, with a colored dot + a fully
      legible label (Campaign C's dot should be red, from its `color:` override — the other 3 are
      the default blue).
- [ ] Axis labels (Low/High Reach, Low/High Engagement) and the title are legible, not clipped.

## 8. `venn.docx` — new (2026-09-04): `venn-beta`, 3-set overlapping-circle geometry
- [ ] 3 circles (Design/Code/Writing) render with visible color blending in every overlap region —
      2-way lenses a distinguishable blend, the center (all 3) a third, darker blend.
- [ ] All 4 labels (the 3 set names + the 3 pairwise + 1 triple overlap labels — 7 total) are inside
      their correct region and fully legible, not clipped by a circle's own edge.

## 9. `mindmap.docx` — new (2026-09-04): `mindmap`, radial layout + branch lines
- [ ] Branch lines (root → each node) are visible, correctly colored per branch, and connect the
      right pairs of shapes — this is the specific real-render bug found and fixed this session
      (a schema-valid DrawingML connector element that silently didn't render under LibreOffice;
      confirming it renders in real Word too closes the loop on that fix).
- [ ] All 6 node shapes are visually distinct: square (Wireframes), rounded (Backend), circle
      (root, "Project Plan"), starburst/bang (Marketing), cloud (Moodboard), hexagon (Engineering).
- [ ] Every label is fully legible, not clipped by its own shape — the other real bug found and
      fixed this session (font size and cloud/hexagon/bang label width weren't accounting for the
      diagram's overall scale-to-fit-page factor).

## Recording the result

Once done, either:
- tell Claude the outcome in the conversation (pass/fail per item, any screenshot worth keeping), or
- fill in the "Real-Word verification" section of `docs/mvp-acceptance-report.md` yourself and
  check off the corresponding TODO.md box.

Word version and OS used: _______________
Date: _______________
