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

## `emoji-review.docx` — extensive emoji-presentation review (not pass/fail, exploratory)

31 emoji/symbols in a table, deliberately including pairs of the *same* character with and without
an explicit U+FE0F selector (rows 10/11 = ⚠️/⚠, 12/13 = ⚙️/⚙, 30/31 = ©️/©) to isolate exactly what
the fix normalizes, plus 2 keycap sequences (1️⃣/#️⃣, rows 24/25) that are a known, already-documented
gap (`postprocess.mjs`'s own doc comment) — expected to stay unforced/whatever Word's default does
with them, not a new bug if they look different from the rest. For each row, just note color vs.
monochrome vs. missing/tofu. No checklist to fill in — freeform feedback is enough.

## Round 4 — 2026-10-05: native Word charts (ADR 0011, `MD2NATIVEDOCX_NATIVE_CHARTS=1`, opt-in)

Three files, same Markdown (`native-chart-pie.md`, three `pie` diagrams). Open them in this order — the
schema validator reports 0 errors in the chart parts, but only a real Word can confirm the rest.

### `native-chart-pie-no-workbook.docx` (palier 1: cached values, no embedded workbook)
- [ ] Opens without a repair prompt; three pie **charts** are displayed.
- [ ] Clicking one selects a *chart* (Chart Design / Format tabs appear), not a group of shapes.
- [ ] Colours/title/legend/data labels can be changed from Chart Design. (Edit Data is expected to be
      unavailable here — that is what the next file adds.)

### `native-chart-pie.docx` (palier 2: embedded workbook)
- [ ] Opens without a repair prompt.
- [ ] Chart Design → **Edit Data** opens Excel on a two-column sheet (Category, Value); changing a value
      and closing updates the pie.
- [ ] Chart 3 (special characters `& < " «»`, accents) shows its title and labels intact, in Word *and*
      in the sheet.
- [ ] No "linked file not available" / "this workbook is corrupt" message at any point.

### `native-chart-pie-shapes.docx` (reference: the default, shape-built pie)
- [ ] Unchanged look (for comparing the two approaches).

## Round 5 — 2026-10-05: native xychart and radar (ADR 0011 palier 3)

`native-chart-xychart-radar.docx` (Markdown: `native-chart-xychart-radar.md`). Round 4 (pie) was confirmed
in real Word the same day; this adds the other two chart types. Schema validator: 0 errors in the chart
parts and in the five workbooks.

- [x] Opens without a repair prompt; 5 **charts** + 1 shape-built diagram (section 4, on purpose).
- [x] §1 bars + line on one chart, Y axis from 4 to 12, category labels jan…juin; legend reads
      "Series 1 / Series 2" (Mermaid names none).
- [x] §2 two named bar series (Prévu / Réalisé), axis titles "Sprint" and "Points".
- [x] §3 horizontal bars: **Alpha at the top**, value axis at the **bottom**, 0 to 50.
- [x] §4 is the shape-built fallback (horizontal chart + line series cannot be a Word chart); the export
      printed a warning about it.
- [x] §5 numeric x axis shows labels 0, 2, 4 … 10 (evenly spaced categories).
- [x] §6 radar: two translucent polygons (Alice, Bob), six axes, rings every 20.
- [x] Edit Data on §1 and §6 opens Excel with the matching columns; editing a value updates the chart.

**Result (maintainer, real Word, 2026-10-06): works perfectly in Word, Edit Data included.** `xychart` and `radar`
native charts are validated; the VS Code extension now turns all three chart types on by default.

## Round 6 — 2026-10-05: SmartArt `cycle` restructured (the "blank shapes" bug)

`smartart-v3.docx` — four SmartArt diagrams (chain, tree, two cycles), exported with
`MD2NATIVEDOCX_ENABLE_SMARTART=1`. Hypothesis behind the fix: `cycle.ts`'s `layoutDef` had a `composite`
wrapper with no size constraints for its child, so real Word sized it to zero (LibreOffice computes a size
anyway, hence the earlier "works in LibreOffice"). `cycle` now has the same two-level shape as `chain`,
which Word already renders. Schema validator: 0 errors in `word/diagrams/*`.

- [ ] Opens without a repair prompt.
- [ ] §1 chain and §2 tree look as in the previous round (regression check).
- [ ] §3 cycle (A, B, C): **three shapes are drawn** (before: empty frame), clockwise from the top.
- [ ] §4 cycle (Planifier, Faire, Vérifier, Agir): four shapes clockwise from the top, the first one in
      light orange.
- [ ] Click a shape and edit its text: the diagram re-lays out without disappearing.

## Round 7 — 2026-10-05: SmartArt pre-rendered drawing (`dsp:drawing`) — "pixel perfect"

`smartart-v4-drawing.docx` — same four diagrams as Round 6, exported with
`MD2NATIVEDOCX_ENABLE_SMARTART=1 MD2NATIVEDOCX_SMARTART_DRAWING=1`. Each diagram now carries the fifth part a
real Word always writes (`word/diagrams/drawingN.xml`): Word and LibreOffice show it as the cached
rendering, so both display the same shapes; they only re-run the layout when the diagram is edited. Schema
validator: 0 errors in `word/diagrams/*`. In LibreOffice the chain is no longer stretched tall: neat boxes
with arrows, tree and cycles as designed, dark text on the light-orange node.

- [ ] Opens without a repair prompt (compare with `smartart-v3.docx` from Round 6).
- [ ] §1 chain: four boxes in a row with light arrows between them (no tall stretched boxes).
- [ ] §2 tree: "Projet" across the top, three boxes below.
- [ ] §3 cycle: **A at the top, then B bottom-right, C bottom-left** (clockwise) — shapes visible.
- [ ] §4 cycle: Planifier (light orange, **dark** text), Faire, Vérifier, Agir clockwise from the top.
- [ ] Click a shape and edit its text: Word re-lays the diagram out. Note whether it **keeps looking like
      this** (our drawing matches Word's own layout) or jumps to a different arrangement, and whether
      anything disappears.

## Round 8 — 2026-10-05: SmartArt look profiles (`MD2NATIVEDOCX_SMARTART_STYLE`)

Round 7 confirmed the SmartArt open with no warning and are visible. The look was plain (one accent, flat),
so there are now three profiles; all stay **real SmartArt** (restylable from the SmartArt Design tab):
`simple` (the old look), `colorful` (a different theme accent per shape, like Word's "Colorful – Accent
Colors") and `intense` (colorful + the theme's gradient fill, drop shadow, heavier white outline).
Same four diagrams as before. Schema validator: 0 errors in `word/diagrams/*` for every profile.

- `smartart-v5-colorful.docx` (colorful + cached drawing)
- `smartart-v5-intense.docx` (intense + cached drawing)
- `smartart-v5-intense-no-drawing.docx` (intense, **no** cached drawing: shows what Word itself computes
  from our definitions)

- [ ] All three open with no repair prompt.
- [ ] colorful: each shape has its own accent colour (orange, grey, gold, blue, …); white text; the light-orange
      override on "Planifier" is kept with dark text.
- [ ] intense: gradient fill, soft shadow, white outline — the "wow" look; compare with how Word's own
      "Intense Effect" quick style looks on the same diagram (Design tab → SmartArt Styles).
- [ ] intense-no-drawing: does Word's own rendering match the cached one (gradient + shadow present)? If it
      is flat, Word is ignoring our `styleDef` references — tell me, it changes the approach.
- [ ] In the Design tab, **Change Colors** and **SmartArt Styles** still work on these diagrams.
- [ ] Which profile do you want as the default?

## Round 9 — 2026-10-05: SmartArt cycle transition arrows

A cycle without arrows between its shapes looked unfinished. `cycle` now carries one transition per node (the
last closes the loop), exactly like `chain`'s `conn` connectors: new points in the data model, a `sibTrans`
layout node, and arrows in the cached drawing that follow the circle clockwise. The boxes also shrink for larger
cycles so they never touch the arrows. Schema validator: 0 errors in `word/diagrams/*`.

`smartart-v6-cycles-colorful.docx` and `smartart-v6-cycles-intense.docx` (3, 4 and 6 steps, cached drawing on).

- [ ] Both open with no repair prompt (this changes the data model, so it is the thing to watch).
- [ ] Arrows are visible between every pair of shapes, **including the one from the last back to the first**,
      pointing clockwise.
- [ ] Click a shape and edit its text, or add a shape from the text pane: does Word re-lay the cycle out with
      arrows, and does it keep the loop closed?
- [ ] If Word draws **no** arrows after an edit (or drops the last one), note which — it tells me whether the
      layout needs `cnt` or `dir` parameters on the connector.

## Round 10 — 2026-10-05: cycle arrows, second attempt (v7)

Round 9 (v6): Word showed only some arrows (2 of 3, only the vertical ones of 6, 3 squashed of 4). Diagnosis:
Word **recomputes a cycle's layout from our `layoutDef`** — it does not show the cached drawing — and the
`layoutDef` sized every box at 30% of the frame width, so boxes overlapped and left no room for the diagonal
arrows. Fix: one sizing rule (`cycleBoxWidth(n)`) now written into the `layoutDef` **per node count** and used
by the cached drawing, a taller frame for cycles (4.6 in), and a guaranteed gap of at least 0.7 box widths
between neighbours for the arrow.

- `smartart-v7-cycles-colorful.docx` (with cached drawing) and `smartart-v7-cycles-colorful-no-drawing.docx`.
- [ ] Both open with no repair prompt.
- [ ] 3-step cycle: **3 arrows**. 4-step: **4 arrows**, not squashed. 6-step: **6 arrows**, all pointing clockwise.
- [ ] Do the two files look **identical** in Word? If yes, Word ignores our cached drawing for these diagrams and
      only the `layoutDef` matters (that settles the "pixel perfect" question: the lever is the layoutDef).
      If they differ, note how.
- [ ] If arrows are still missing or squashed: note which, and whether the boxes are where you expect.

## Round 11 — 2026-10-05: the closing arrow of a cycle (v8)

Round 10 (v7), maintainer: the two files (with / without cached drawing) are functional and **identical** in
Word, with every arrow present **except** the one from the last element back to the first, on every cycle.
Cause: the transition `forEach` of the layout carries a schema attribute `hideLastTrans`, true by default, which
hides the arrow after the last node — right for a process, wrong for a loop. Found by reading how a real
Word-authored cycle (`handmade_samples/cycle-simple.docx`, structure only) writes it: `hideLastTrans="0"`.
`cycle` now sets it; `chain` keeps the default.

`smartart-v8-cycles-colorful.docx` and `smartart-v8-cycles-intense.docx` (3, 4 and 6 steps).

- [x] Both open with no repair prompt.
- [x] 3-step cycle: **3 arrows including the last-to-first**; 4-step: **4**; 6-step: **6**, all clockwise.
- [x] Edit a text or add a step in Word: the loop stays closed.

**Result (maintainer, real Word, 2026-10-05): all confirmed. Cycles are validated.** Decision: keep the rounded
rectangles for cycle nodes (Word's own cycle uses discs; not adopted).

## Round 12 — 2026-10-05: connector lines in trees (v9)

Until now a tree showed the root box and the child boxes with **no line between them**. Word writes each
parent-to-child line as a `conn` layout node on the child's `parTrans` point, an elbow ("bend") from the
parent's facing side to the child's; the cached drawing carries it as a free-form path. Structure read from
`handmade_samples/labeled-hierarchy-basique.docx` (structure only, nothing copied). The `conn` end points follow
the direction: `TD` bottom-centre to top-centre, `LR` right to left, `BT` top to bottom, `RL` left to right.

`smartart-v9-trees-colorful.docx` and `smartart-v9-trees-intense.docx` (with cached drawing),
`smartart-v9-trees-colorful-no-drawing.docx` (layout definition only). Five trees: `TD` with 3 and 4 children,
`LR`, `BT`, `RL`.

- [x] All three open with no repair prompt.
- [x] Each child is joined to its root by an elbow line, in all five trees (root above, left, below, right).
- [x] Do the "with drawing" and "no drawing" files look the same? (For cycles they did; if the lines are missing
      only in `no-drawing`, the `layoutDef` connector is the thing to fix.)
- [x] Edit a text or add a child in Word: the lines follow and stay attached.
- Verified here: Open XML validator, 0 errors under `/word/diagrams`; LibreOffice shows the lines from the cached
  drawing (it ignores `conn` when it computes the layout itself, so `no-drawing` has no lines there — expected).

**Result (maintainer, real Word, 2026-10-05): all confirmed on the v9 files. Tree connectors are validated.**

## Round 13 — 2026-10-05: four new look profiles (v10)

SmartArt looks are now a table of profiles (`STYLE_PROFILES`, `styles.ts`) shared by chain, cycle and tree: a palette
(one accent, or a different accent per shape) times the theme line / fill / effect style a Word quick style would
reference. Existing `simple`, `colorful`, `intense` are unchanged; four new ones fill the grid:

| Profile | Palette | Fill | Effect |
|---|---|---|---|
| `subtle` | one accent | flat, white outline | none |
| `moderate` | one accent | soft gradient (theme fill 2) | light shadow |
| `intense-accent` | one accent | gradient (theme fill 3) | drop shadow |
| `colorful-moderate` | accent per shape | soft gradient | light shadow |

`smartart-v10-subtle.docx`, `-moderate.docx`, `-intense-accent.docx`, `-colorful-moderate.docx`; each holds a chain,
a 4-step cycle and a 3-child tree, with cached drawing.

- [x] All four open with no repair prompt.
- [x] The look matches the table (flat vs soft gradient vs strong gradient; shadow light vs strong; one colour vs several).
- [x] In Word's SmartArt Design tab, the diagram's own quick style / colours show as ours and can be changed to
      another one without breaking the diagram.
- [x] Open the file, then restyle in Word to "Intense Effect": it should look like `intense-accent` (same indexes).
- Not covered: Word's 3-D quick styles (Polished, Inset, Cartoon, scenes). They need `scene3d`/`sp3d` in the style
  definition and have no sample here to read; to be decided with a real Word-authored reference.

**Result (maintainer, real Word, 2026-10-05): all confirmed on the v10 files. The four new profiles are validated.**

## Round 14 — 2026-10-06: trees deeper than two levels (v11)

Until now any tree with grandchildren fell back to native shapes. `tree-deep.ts` now writes a recursive layout
(`hierRoot` / `hierChild`, the algorithms Word's own hierarchies use): each subtree takes the room of its leaves,
the parent is centred over its children, and every level has its elbow connectors. Top-down (`TD`) only, up to 5
levels and 8 leaves; other directions still fall back to native shapes. Nested-level structure read from
`handmade_samples/labeled-hierarchy-basique.docx` (structure only, nothing copied).

`smartart-v11-deep-trees-colorful.docx`, `-intense.docx` (cached drawing) and `-colorful-no-drawing.docx` (layout
definition only). Five SmartArt trees (3 levels uneven, 4 levels, edge labels + one forced colour, 5 levels, 8
leaves) and a sixth `LR` tree that must stay native shapes.

- [x] All three open with no repair prompt.
- [ ] Each diagram shows boxes at every level with a line from each parent to each child, parents centred over
      their children, nothing overlapping.
- [ ] Do "with drawing" and "no drawing" look alike? (`no-drawing` is Word laying the diagram out from our
      `layoutDef` alone: this is the real test of the `hierRoot`/`hierChild` recursion.)
- [x] Edit a text, add a child to a leaf, add a grandchild in Word: lines follow, nothing breaks.
- [ ] Section 6 (`LR`) is ordinary native shapes, not SmartArt.
- Verified here: Open XML validator, 0 errors under `/word/diagrams`; LibreOffice renders the cached drawing.
- Known: with 8 leaves the boxes are ~0.5 in wide and long words (e.g. "Organisation") wrap mid-word at 10 pt.

**Result (maintainer, real Word, 2026-10-06): all three files open fine. Growing a tree in Word up to depth 10
and 23 leaves works with no problem**, so the `hierRoot`/`hierChild` recursion holds well beyond the generator's
caps (5 levels, 8 leaves), which are a legibility choice for the export, not a Word limit. Not yet answered:
"with drawing" vs "no drawing" side by side, and section 6 staying native shapes.

## Round 15 — 2026-10-06: multi-level trees in all four directions, caps lifted (v12)

After Round 14 (Word handled depth 10 and 23 leaves): depth cap raised to 10, the leaf cap removed, the cached
drawing's font floor lowered to 8 pt. `LR`/`BT`/`RL` multi-level trees now use the same recursive layout with
only the direction parameters changed: `hierRoot` `hierAlign` (`lCtrCh` / `bCtrCh` / `rCtrCh`), `hierChild`
`linDir` + `chAlign` (`fromT`+`l` / `fromL`+`b` / `fromT`+`r`), connector end points. These parameter values come
from the ECMA-376 enumerations, not from a Word sample: **the `no-drawing` file is the real test here.**

`smartart-v12-deep-trees-directions-colorful.docx`, `-intense.docx` (cached drawing), `-colorful-no-drawing.docx`.
Same 4-level tree in `LR`, `BT`, `RL`, `TD` (reference), then a 16-leaf tree and an 8-level tree.

- [x] All three open with no repair prompt.
- [x] `no-drawing`: are `LR`, `BT`, `RL` laid out by Word in the right direction (root left / bottom / right),
      children aligned, lines attached? If one comes out top-down or jumbled, that direction's parameters are
      wrong — a hand-made Word "Horizontal Hierarchy" sample would then settle it.
- [x] Add a child in Word to the `LR` tree: it grows to the right, not downwards.
- [x] Section 5 (16 leaves): readable in Word? (In the cached drawing the boxes are ~7 mm wide and words break.)
- Verified here: Open XML validator, 0 errors under `/word/diagrams`; LibreOffice renders the cached drawing in
  all four directions with no overlap.
- Known: past ~12 leaves the cached drawing is too narrow to read in portrait. A fix would be to stack a parent's
  leaf children in a column under it (org-chart style, `hierChild` secondary direction) — not done.

**Result (maintainer, real Word, 2026-10-06): works perfectly in all four directions, `no-drawing` included — the
ECMA direction parameters are what Word expects. The 16-leaf tree is "vaguely readable".** Multi-level trees are
validated; wide trees are the open point (leaf columns, see above).

## Round 16 — 2026-10-06: compact (org-chart) layout for wide top-down trees (v13)

The 16-leaf tree of v12 was "vaguely readable". The maintainer's sample
(`handmade_samples/smartart-v12-deep-trees-directions-colorful-no-drawing-organigramme.docx`: our own v12 file
switched to Word's Organization Chart) shows the rule Word applies by default: a box whose children are all
leaves (`axis="des" func="maxDepth" op="lte" val="1"`) aligns top-left (`hierRoot` `hierAlign="tL"` +
`alignOff`), stacks its children in a column (`hierChild` `linDir="fromT"` `chAlign="l"`), and each line enters the
child's left side (`endPts="midL"`). New layout `tree-deep1-compact` carries exactly these three `dgm:choose`
blocks; the data model is unchanged. Difference from Word: Word starts the line from a hidden shape near the
parent's left edge; here it starts at the parent's bottom centre and the column is indented 0.6 box widths.
Used only top-down, and only when the ordinary layout's boxes would be narrower than 0.9 in.

`smartart-v13-wide-trees-compact-colorful.docx`, `-intense.docx`, `-colorful-no-drawing.docx`: the 16-leaf tree,
an irregular org chart (columns of 1-5 leaves, one branch one level deeper, a lone leaf), and a small tree that
must keep the row layout.

- [x] All three open with no repair prompt.
- [x] `no-drawing`: Word lays out the columns itself — leaves under their parent, indented, lines entering
      from the left; the deeper branch (Technique) keeps a row of two columns.
- [x] Add a leaf to a column in Word: it joins the column. Add a child to a leaf in a column: that branch
      switches back to a row (Word's own rule).
- [x] Section 3 looks exactly like v11/v12.
- Verified here: Open XML validator, 0 errors under `/word/diagrams`; LibreOffice renders the cached drawing.
- Known: in the irregular example, boxes are ~1.5 cm and long words ("Comptabilité", "Partenariats") still
  break at 8 pt; the font is shared by every box, sized for the longest label.

**Result (maintainer, real Word, 2026-10-06): v13 validated, everything works.** The compact org-chart layout
is confirmed, `no-drawing` included.

## Round 17 — 2026-10-06: mindmap and treeView as SmartArt (v14)

`mindmap` and `treeView-beta` are already trees, so with SmartArt on they now go through the validated tree
generators (`smartart/from-tree.ts`): mindmap left to right, file tree top-down (the compact layout stacks each
folder's files in a column). Not through the flowchart classifier, so a straight-line mindmap stays a hierarchy,
never a chain with arrows. Lost compared with the shape-built rendering: the mindmap's radial layout and node
shapes, the file tree's bold folders and italic descriptions (folded into the text as `name — description`). A
file tree with several top-level entries is not one tree and keeps the shape-built rendering.

`smartart-v14-mindmap-treeview-colorful.docx`, `-intense.docx`, `-colorful-no-drawing.docx`: a 3-level mindmap, a
2-level mindmap, a one-root file tree (with a highlighted file), and a two-root file tree (must stay shapes).

- [x] All three open with no repair prompt.
- [x] Sections 1-3 are SmartArt (click: SmartArt Design tab appears); section 4 is plain shapes.
- [x] `no-drawing`: Word lays the mindmap out left to right and the file tree with its columns.
- [x] Is a SmartArt hierarchy an acceptable stand-in for a mindmap, compared with the radial shapes you get
      with SmartArt off? (Product call: it could also stay shapes and only `treeView` switch.)
- Verified here: Open XML validator, 0 errors under `/word/diagrams`; LibreOffice renders the cached drawing.
- Known: the 2-level mindmap goes through the original 2-level generator, whose root takes a full-height 35%
  strip — correct but oversized next to the children. The file tree's font is small (17 boxes, compact layout).

**Result (maintainer, real Word, 2026-10-06): "v14 fonctionne parfaitement".** mindmap and treeView as SmartArt
are validated, and the SmartArt hierarchy is accepted as the mindmap's rendering when SmartArt is on.

## Round 18 — 2026-10-06: timeline as a SmartArt time line, line breaks and bold/italic in boxes (v16)

Two changes. (1) Every SmartArt box now keeps its label's structure: `<br/>` is a real line break (`<a:br/>`, what
Shift+Enter makes in the Text Pane) and Markdown-string bold/italic are real bold/italic runs; a chain whose boxes
hold three lines or more gets taller boxes (layout `chain1-h90` etc.). (2) A section-less `timeline` becomes a
SmartArt **time line** (`smartart/timeline.ts`, self-authored layout `timeline1-n<periods>`): an arrow axis across,
a dot per period, the period (bold) and its events in a box alternately above and below the axis. Its title is a
bold paragraph above the diagram. A timeline with sections, or too crowded for whole words at 10 pt, stays shapes.

`smartart-v16-timeline-richtext-colorful.docx`, `-intense.docx`, `-colorful-no-drawing.docx`.

- [x] All three open with no repair prompt.
- [x] Sections 1-5 are SmartArt (click: SmartArt Design tab appears); sections 6 and 7 are plain shapes.
- [x] **`no-drawing` is the real test of the new layout**: does Word itself draw the axis, the dots, and the boxes
      alternating above/below (1st above, 2nd below…)? If every box lands on the same side, Word ignored the
      `posOdd` switch — say so, the fix is small.
- [x] Still `no-drawing`: in section 2, do the boxes overhang their slot (wider than the gap between two dots)
      without being shrunk or cut off?
- [x] In the Text Pane of section 1, add a period (Enter after "2006 / Twitter"): a new dot and box appear on the
      axis. (The diagram's layout id is per period count; Word keeps using the same definition, which is fine.)
- [x] Line breaks: sections 3 and 5 show two/three lines per box; section 4 shows "produit" in italic and
      "technique" in bold.
- Verified here: Open XML validator, 0 errors under `/word/diagrams` and in `document.xml`; LibreOffice renders the
  cached drawing (sections 1-5 as SmartArt, 6-7 as shapes).
- Known: section 5 (cycle) boxes are small for three lines; the text slightly overflows in the cached drawing (Word
  shrinks it when it recomputes).

**Result (maintainer, real Word, 2026-10-06): "ça marche très bien".** The timeline as a SmartArt time line
(alternating boxes via `posOdd`, `no-drawing` included) and line breaks/bold/italic in SmartArt boxes are validated.

## Round 19 — 2026-10-06: journey, timeline sections, kanban, gitGraph, state machine, class inheritance (v17)

New SmartArt mappings, all with SmartArt on:
- `journey` and `timeline` **with sections** → grouped time line (`smartart/timeline-grouped.ts`, layout
  `timeline1-grouped-<steps per section>`): one arrow-ended bar per section with its name, the steps as neutral
  grey cards alternately above and below (journey card: task in bold, score as stars, actors). Two levels in the
  Text Pane (sections, then steps). Each section is as wide as its steps (one `forEach` per section + a catch-all
  for sections added in Word).
- `kanban` → grouped list (`smartart/kanban.ts`, layout `kanban1-<cards>x<lines>`): coloured column headers, cards
  stacked under them (title in bold, then ticket · assignee · priority). Two levels in the Text Pane.
- `gitGraph` with only the main branch → process; `stateDiagram` forming a chain or a loop (start/end markers set
  aside) → process or cycle; `classDiagram` with only inheritance forming a tree → hierarchy with the members in
  each box. These reuse the generators already validated in Word.

`smartart-v17-more-types-colorful.docx`, `-intense.docx`, `-colorful-no-drawing.docx`.

- [x] All three open with no repair prompt.
- [x] Sections 1-6 are SmartArt (click: SmartArt Design tab appears); sections 7 and 8 are plain shapes.
- [x] **`no-drawing`, sections 1-2 (new grouped layout)**: does Word draw one bar per section, and the cards
      alternating above/below inside each section? Is the "Réalisation" bar wider than "Conception" (3 periods
      vs 2)?
- [x] **`no-drawing`, section 3 (new kanban layout)**: are the cards stacked from the **top** of each column
      under its header (not centred vertically, not stretched to fill the column)?
- [x] Text Pane, section 1: add a task under "Go home" (Enter, then Tab to indent it): a new card appears in
      that section. Add a new section (a non-indented line): a new bar appears at the end.
- [x] Text Pane, section 3: move a card to another column by indenting it under that column's title.
- [x] Stars (★★★☆☆) display correctly in the journey cards.
- Verified here: Open XML validator, 0 errors under `/word/diagrams` and in `document.xml`; LibreOffice renders the
  cached drawing (6 SmartArt, sections 7-8 as shapes).
- Known: in the grouped time line, step positions restart at each section, so two neighbouring cards across a
  section boundary can land on the same side (they touch, never overlap). A timeline whose events make cards of
  4+ lines (Mermaid's "Industrial Revolution" example) stays shapes.

**Result (maintainer, real Word, 2026-10-06): "très bien tout ça, ça marche".** Grouped time line (journey, timeline
sections), kanban grouped list, and the gitGraph/state/class mappings are validated, `no-drawing` included.

## Round 20 — 2026-10-06: each node keeps its Mermaid shape in SmartArt (v18)

A flowchart node drawn as a diamond `{}`, circle `(())`, cylinder `[()]`, hexagon `{{}}`, parallelogram `[//]`,
subroutine `[[]]` or flag `>]` now keeps that shape in its SmartArt box, in all four generators. Written exactly as
Word writes right-click > Change Shape (an `a:prstGeom` on the box's presentation point, read from
`handmade_samples/processus_shape.docx`). Plain boxes `[]`, `()`, `([])` keep the layout's shape.

`smartart-v18-node-shapes-colorful.docx`, `-intense.docx`, `-colorful-no-drawing.docx`.

- [ ] All three open with no repair prompt.
- [ ] Chain: diamond "Valide ?", cylinder "Base", circle "Fin"; tree: hexagon root, parallelogram, subroutine, flag;
      cycle: circle, diamond, cylinder, plain box.
- [ ] **`no-drawing`**: Word itself draws the same shapes (the override survives Word's own layout).
- [ ] Click a shaped box > SmartArt Format > Change Shape shows its shape; Reset Shape brings back the default box.
- [ ] Add a step in the Text Pane: the new box gets the default shape, the others keep theirs.
- Verified here: Open XML validator, 0 errors under `/word/diagrams` and in `document.xml`; LibreOffice renders the
  cached drawing with the shapes.
- Known: the font is shared by every box of a diagram, sized for the smaller text area of a diamond or circle, so a
  chain with a diamond has slightly smaller text overall. Mirrored variants (`[\Text\]`) keep the unmirrored shape.

## Recording the result

Once done, either:
- tell Claude the outcome in the conversation (pass/fail per item, any screenshot worth keeping), or
- fill in the "Real-Word verification" section of `docs/mvp-acceptance-report.md` yourself and
  check off the corresponding TODO.md box.

Word version and OS used: _______________
Date: _______________
