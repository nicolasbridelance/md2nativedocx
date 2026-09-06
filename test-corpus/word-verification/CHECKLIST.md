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

---

## Round 2 — 2026-09-06: Phase 8 settings + SmartArt fixes re-check

New fixtures added this round (previous 9 above are historical — some of their items have since
been confirmed in later sessions; check `TODO.md`/`HANDOVER.md` for the current status of each
before assuming an unchecked box above is still actually open). These 3 cover ground the fixtures
above never touched: export-customization settings (Phase 8, `export_customization_SPEC.md`) and
the two most recent SmartArt real-Word findings (`modelId` corruption fix, `axis="self"` bullet-
list fix).

### `combined-settings-demo.docx` — Phase 8 settings combined into one file
- [x] **TOC — resolved, not a bug.** The file was in Protected View (downloaded from the internet);
      clicking "Enable Editing" surfaces the fields-update dialog, accepting it correctly populates
      all 7 sections. The initial "empty" observation was Protected View, not a broken auto-refresh.
- [x] **Emoji — root-caused and fixed same day.** Confirmed: ✅/❌ stayed monochrome, ⚠️/🚀 rendered
      in color, all 4 confirmed tagged "Segoe UI Emoji" directly in Word. Matches each character's
      Unicode makeup exactly: ⚠️ already carries an explicit VARIATION SELECTOR-16, 🚀 has no
      monochrome glyph variant to fall back to, while ✅/❌ are Dingbats-heritage characters with
      *both* a monochrome and color glyph in Segoe UI Emoji — Unicode's own
      `Default_Emoji_Presentation=Yes` says they should default to color, but this Word/Segoe
      combination doesn't honor that reliably without the selector spelled out explicitly. Fixed:
      `postprocess.mjs` now appends U+FE0F to any bare single-code-point pictograph lacking one.
      **Needs re-verification**: regenerate and confirm ✅/❌ now render in color too.
- [x] **Landscape table**: the 8-column table sits on its own landscape page; the section right
      after it is back in portrait. Confirmed correct.
- [x] **Footer**: not explicitly called out as broken — assumed fine (see general page-number
      confirmation elsewhere in this round).
- [x] **Typography**: headings in Georgia, body in Calibri 11pt — confirmed correct.
- [x] **Accent color**: headings green (`#2E7D32`) — confirmed correct.
- [x] **Margins "moderate"**: Word's Page Setup showed "Personnalisées" (Custom), not "Modérées" —
      **disconfirmed the assumption**. Root-caused and fixed same day: `MARGIN_PRESETS_TWIPS` used a
      2.5cm-locale approximation (1417/1077 twips) instead of Word's real built-in inch-based values
      (1440/1080 twips) — twips are locale-independent, so this is the same fix regardless of UI
      language. **Needs re-verification**: regenerate `combined-settings-demo.docx` with the fixed
      values and confirm Word now shows "Modérées" by name.

### `smartart-tree-recheck.docx` — re-confirm the `axis="self"` fix
- [x] **Confirmed fixed.** Root box shows only "A", B/C/D each in their own box below.

### `smartart-cycle-recheck.docx` — sanity check after the `modelId` fix
- [x] Opens without error (`modelId` fix holds). **New, separate bug found**: the shapes render
      blank/empty (SmartArt container box visible, its side data-entry pane correctly shows A/B/C,
      but no actual shapes drawn) — logged in `TODO.md` as a new, lower-priority item (`cycle.ts`
      is off by default). Not yet investigated.

### Drag-and-drop connector test — reuse `medium-realistic.docx` above
- [x] Confirmed working — arrow follows a dragged shape and stays attached.

### Bonus finding not on the original list — `crossing-stress-bipartite.docx` (item 5, Round 1)
- [x] Two specific diagonal connectors (A1→B3, A3→B2) don't stay attached when their shapes are
      moved, unlike every other connector in the same file. Logged in `TODO.md`, lower priority
      (deliberately adversarial fixture, not representative of typical usage).

## Round 3 — needed once the fixes above are re-generated

Regenerate `combined-settings-demo.docx`, `quadrant.docx`, `venn.docx`, `mindmap.docx` with the
current code (margin preset fix + the `w:jc` schema fix that made these 3 crash Word outright) and
re-open in real Word:
- [ ] `quadrant.docx`/`venn.docx`/`mindmap.docx` open without error (the actual corruption fix).
- [ ] `combined-settings-demo.docx`'s margins now show as "Modérées" (named preset), not
      "Personnalisées".
- [ ] `combined-settings-demo.docx`'s ✅/❌ now render in color too (the emoji fix — regenerated
      the same day, includes the explicit U+FE0F variation-selector fix).

## Recording the result

Once done, either:
- tell Claude the outcome in the conversation (pass/fail per item, any screenshot worth keeping), or
- fill in the "Real-Word verification" section of `docs/mvp-acceptance-report.md` yourself and
  check off the corresponding TODO.md box.

Word version and OS used: _______________
Date: _______________
