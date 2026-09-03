# Spike SmartArt — minimal `hierarchy1`-shaped diagram via hand-built OOXML parts

Spike 1 ("faisabilité brute") from `FUTURE_mmd2smartart_SPEC.md` §7. Tests whether a `.docx`
containing a hand-built 2-level SmartArt hierarchy (data + layout parts only, no colors/
quickStyle, per §3's MVP decision) is structurally acceptable OOXML, without relying on Pandoc
(which has no mechanism to add custom parts — confirmed in §2 of the spec).

This is a standalone spike, mirroring `docs/adr/spikes/spike-pandoc/`. It does its own ZIP
surgery in `build-spike.mjs`, isolated from `packages/`, per the instructions for this task
(AGENTS.md rule #7 governs the production pipeline, not this exploratory script).

## Files

- `base.md` / `base.docx` — trivial one-paragraph document, `pandoc base.md -o base.docx`.
- `diagram-data1.xml` — `dgm:dataModel`: one root node ("Root") + two children ("Child 1",
  "Child 2"), linked by `dgm:cxn type="parOf"`.
- `diagram-layout1.xml` — hand-built `dgm:layoutDef`. **Not a copy of Word's built-in
  `hierarchy1` algorithm** — see "layout1.xml provenance" below.
- `diagram-drawing1.xml` — `dsp:drawing` pre-rendered fallback part (see "The dsp:drawing
  fallback part" below for why this was added after the first render attempt came back blank).
- `build-spike.mjs` — Node/ESM script, zero new dependencies. Shells out to `unzip`/`zip` via
  `execFileSync` with argument arrays (never a shell string). Extracts `base.docx`, writes the
  three diagram parts plus `word/diagrams/_rels/data1.xml.rels`, patches `[Content_Types].xml`
  and `word/_rels/document.xml.rels`, inserts a `<w:drawing>` paragraph into `word/document.xml`
  (adding `xmlns:dgm` to the root if missing), re-zips as `spike.docx`.
- `spike.docx` — output of `node build-spike.mjs`.

## layout1.xml provenance

Searched for a verbatim/canonical copy of Word's built-in `hierarchy1` (`hierRoot1`/`hierChild1`
algorithms) via Microsoft Learn, the Open-XML-SDK GitHub repo, and general web search. Did not
find one. The one concrete, complete, primary-source worked example found was the 2007 MSDN
Magazine article "Create Custom SmartArt Graphics For Use In The 2007 Office System" (Janet
Schorr) — a full custom `dgm:layoutDef` using `composite`/`lin`/`sp`/`tx` algorithms with
`forEach`/`presOf`/`constrLst` shown as real, complete XML.

Per this task's own instruction that getting *a* valid, renderable `dgm:layoutDef` matters more
than exact algorithmic fidelity to Word's built-in one, `diagram-layout1.xml` is built from
scratch using only that documented vocabulary (`composite`, `tx`, `sp`), not the `hierChild1`/
`hierRoot1` algorithms real `hierarchy1` uses internally (whose parameter schema could not be
confirmed from a primary source in the time available). It hard-codes positions for exactly one
root and two children via `composite` constraints (fractional `l`/`t`/`w`/`h` per child, e.g.
`rootShape` at `l=0.30 t=0 w=0.40 h=0.20`) — it does not generalize to arbitrary child counts,
which is explicitly out of scope for this feasibility spike (that generalization is generator
work, §7 steps 3-4).

Connecting lines between parent and children are drawn as four plain axis-aligned rectangle
shapes at fixed composite-computed coordinates (an "elbow": one bar down from the root, one
horizontal spine, two bars down into each child) — not SmartArt's dynamic `conn` algorithm,
whose parameter schema (`begPts`/`endPts`/`connRout`) could not be confirmed from a primary
source either. This is a deliberate simplification valid only because this spike's data model is
fixed at exactly one root + two children.

**Confidence in `diagram-layout1.xml` resembling a genuine Word-emitted `layout1.xml`: low.**
It is schema-plausible (built only from documented algorithm types) but is not a transcription
of any real Word output, and per the task's own research (confirmed independently here — see
next section) real Word `layout1.xml` files for built-in layouts run several hundred lines using
algorithms (`hierChild1`/`hierRoot1`) this spike does not implement.

## The dsp:drawing fallback part (an empirical finding, not anticipated by the spec)

The first render attempt (data + layout only, no third part) produced a `.docx` that opened
cleanly in LibreOffice but showed **no visible diagram content at all** — confirmed via a UNO
script (see "Verification" below) that the diagram's graphic frame *was* created (correct name
`"SmartArt Spike Diagram"`, correct size 15240×8890 in 1/100mm matching the `wp:extent`), but its
internal rendered `Graphic` was `0×0` pixels.

Research into this (Microsoft's MS-ODRAWXML / MS-OI29500 open specs) surfaced a mechanism not
mentioned in `FUTURE_mmd2smartart_SPEC.md` §3: a diagram can carry a third, semi-optional part —
`word/diagrams/drawing1.xml` (content type `application/vnd.ms-office.drawingml.diagramDrawing
+xml`, relationship type `.../2007/relationships/diagramDrawing`), referenced not via
`dgm:relIds` but via `<dgm:extLst><a:ext uri="...diagram"><dsp:dataModelExt relId="..."/>`
**inside `data1.xml`**, with that `relId` resolved against `data1.xml`'s own part-relationships
file (`word/diagrams/_rels/data1.xml.rels` — relationship IDs are always scoped to the part that
references them, not to `document.xml.rels`). Microsoft's docs describe this part as caching
"the last successful layout" — i.e., viewers are expected to display this static, pre-computed
shape tree rather than re-running the `layoutDef` algorithm on every open.

Added `diagram-drawing1.xml` (5 shapes: root, 2 children, 2 connector bars — plus the elbow
bars, 7 total) with explicit EMU coordinates matching `diagram-layout1.xml`'s fractional
constraints against the 5486400×3200400 EMU canvas, wired it up, and re-rendered.

**Result: still blank, byte-identical PNG output to before the `dsp:drawing` part was added.**
Further isolated with a minimal single-node smoke test (one `tx`-algorithm box, explicit
`w`/`h`/`primFontSz` constraints, no connectors, no `dsp:drawing` part at all) — also rendered
0×0. This narrows the blank-render symptom to LibreOffice's handling of the live `layoutDef`
algorithm content itself (not the presence/absence of the `dsp:drawing` fallback, and not the
complexity of the 2-level layout specifically) — LibreOffice creates the diagram frame
(structurally recognizes it as a `dgm:` diagram, correct size/position) but produces empty
content for a **custom, non-built-in** algorithm, whether registered via `dsp:dataModelExt` or
not. Kept `diagram-drawing1.xml` in the final spike regardless: it is genuine, documented OOXML
structure real Word files carry, and worth having in place for the pending real-Word test.

## Verification performed

- `unzip -t spike.docx` → valid ZIP, no errors.
- Every XML part (`[Content_Types].xml`, `document.xml`, `document.xml.rels`,
  `data1.xml.rels`, `data1.xml`, `layout1.xml`, `drawing1.xml`, plus all of Pandoc's own parts)
  parsed with Python's `xml.parsers.expat`, DTD processing and external entity resolution
  explicitly disabled (`StartDoctypeDeclHandler`/`EntityDeclHandler`/`ExternalEntityRefHandler`
  all rejecting/refusing — AGENTS.md rule #5) → all well-formed. (Caught and fixed two real bugs
  this way: `--` inside XML comments in `diagram-layout1.xml` and `diagram-drawing1.xml`, illegal
  per the XML spec — not a security issue, but exactly the kind of defect this check exists to
  catch before it reaches a real Word user.)
- `mc:Ignorable` prefix-declaration check (the exact TODO.md bug class) run across every XML part
  in the built package: **no `mc:Ignorable` attribute is present anywhere** in `spike.docx` — this
  script never adds one, and Pandoc's base output doesn't emit one either — so there is nothing
  for this specific bug class to attach to here. Confirmed programmatically, not just by
  inspection.
- `grep -r "TargetMode"` across every extracted part → no matches. No external relationship
  anywhere (AGENTS.md rule #3).
- `word/document.xml`'s root `<w:document>` declares `xmlns:dgm`, alongside Pandoc's own
  `xmlns:a`/`xmlns:r`/`xmlns:wp` — `build-spike.mjs` asserts this explicitly for every prefix
  (`dgm`, `a`, `r`, `wp`) the injected `<w:drawing>` fragment uses, and refuses to write the file
  if any is missing.
- `soffice --headless --convert-to png/pdf spike.docx` → clean exit, valid single-page PDF/PNG
  produced (no crash, no error on stderr beyond the unrelated `javaldx` warning present on every
  conversion in this sandbox, including the plain base document).
- UNO inspection (`python3-uno` against a headless `soffice` listener) of the rendered document
  model: the diagram graphic frame exists, is named and sized correctly, is recognized as a
  diagram (not dropped or treated as unknown content) — **but its rendered content is a 0×0
  graphic**, confirmed byte-identical to the base document's render (no diagram content
  contributes any pixels).

## Findings

1. **Structurally, this is accepted.** ZIP valid, every part well-formed XML with XXE mitigation
   on, no external relationships, correct content-type overrides, correct internal relationship
   wiring (including the easy-to-miss part-scoped `data1.xml.rels` for the `dsp:dataModelExt`
   reference), `xmlns:dgm` properly declared where used, no `mc:Ignorable` hygiene issue (because
   nothing here uses `mc:Ignorable` at all). LibreOffice opens and converts it without complaint.
   This is a meaningfully positive signal for "won't trigger Word's blunt file-level rejection" —
   the `mc:Ignorable` bug this spike specifically checked for is the kind of defect that *does*
   trigger exactly that ("unreadable content") in real Word while LibreOffice stays silent, so
   ruling it out programmatically (not just by eyeballing) was worth doing carefully.
2. **Visually, it does not render as a tree in LibreOffice — a real negative result, not a partial
   success.** Confirmed via UNO inspection, not just eyeballing a blank PNG: the diagram frame is
   created correctly, but its computed content is 0×0. Isolated this to the hand-built
   `layoutDef` algorithm content itself: a minimal single-box variant with no children, no
   connectors, and explicit sizing constraints renders exactly as blank as the full 2-level
   version, with or without the `dsp:drawing` fallback part. This is the single biggest open
   question this spike leaves unresolved: whether the blank render is (a) a specific, fixable bug
   in this hand-approximated algorithm's semantics (most likely, given the frame itself is
   recognized correctly), or (b) evidence that LibreOffice's diagram engine only executes
   recognized built-in algorithms and does not generically interpret arbitrary custom
   `dgm:layoutDef` content at all. Distinguishing these needs either the actual LibreOffice `oox`
   diagram-import source, or a genuine Word-generated custom-layout sample to diff against —
   neither available in this sandbox.
3. **No corruption / "unreadable content" signal was reproduced** — the failure mode found here is
   "renders nothing," not "Word/LibreOffice flags the file as damaged." That is a materially
   different and less alarming failure mode than the `mc:Ignorable` bug this task was written to
   guard against, but it is not nothing either: a production `mmd2smartart` path that silently
   produces a blank diagram in some viewers would be a bad failure mode of its own, worse in one
   respect than a repair prompt because there's no user-visible signal anything went wrong.

## What still needs a human with real Word

- **Does `spike.docx` open in real Word without a repair/"unreadable content" prompt at all?**
  This is the one question this sandbox categorically cannot answer (TODO.md's `mc:Ignorable`
  incident is the standing proof that LibreOffice-clean does not imply Word-clean).
- **If it opens cleanly, does Word show the same blank diagram frame LibreOffice shows, or does
  Word's (presumably more complete) generic diagram-layout engine actually execute this hand-built
  `composite`/`tx` algorithm and render the 2-level tree?** This is the key open question the
  blank LibreOffice render could not settle either way.
- **If Word also shows it blank, does right-clicking the frame and choosing "Reset Diagram" (or
  similar) force Word to re-run the layout and populate it** — which would confirm the algorithm
  content is at least accepted and executable, just not eagerly evaluated on open.
- Whether Word requires `r:qs`/`r:cs` on `dgm:relIds` to be valid relationship references rather
  than the empty strings this spike used (per the MVP decision to omit colors/quickStyle parts
  entirely) — an empty-string reference to a nonexistent relationship is the kind of thing Word's
  stricter parser (per the `mc:Ignorable` precedent) might reject even though nothing in this
  sandbox's checks caught a problem with it.
- Whether the `dgm:extLst`/`dsp:dataModelExt` placement and `a:ext/@uri` value used here
  (`http://schemas.microsoft.com/office/drawing/2008/diagram`, chosen by convention, not
  confirmed against a real sample) are what real Word actually expects.

## v2/v3/v4 — follow-up round after the maintainer provided a real Word sample

The maintainer created a real "Hiérarchie" (+ "Hiérarchie horizontale") SmartArt pair in actual
Word and provided the `.docx`
(`SmartArt-Hierarchie+Hierarchiehorizontale.docx`, extracted into `real-word-extract/`, the
"Hiérarchie" diagram's 5 parts copied verbatim into `real-diagram1/`). This unblocked the single
biggest open question from the v1 round: whether a hand-approximated `layout1.xml` could ever be
correct. It also surfaced two mechanics not anticipated by `FUTURE_mmd2smartart_SPEC.md` §3, both
confirmed by inspecting the real parts before writing any new code:

1. `data1.xml`'s `<dsp:dataModelExt relId="rId8"/>` (inside `dgm:extLst`) resolves against
   **`word/_rels/document.xml.rels`**, not a part-scoped `word/diagrams/_rels/data1.xml.rels` —
   the real document has no such file at all. v1 had assumed (and asserted in code) the opposite,
   reasoning from generic OPC part-relationship scoping rules; this is a diagram-specific
   Microsoft convention that overrides that general rule.
2. `data1.xml` for a 6-node, 3-level real tree contains **~40 additional `type="pres"` points**
   (a resolved presentation-node tree, one family of nodes per algorithm shape) plus `parOf`
   connections between data points — far more structure than the "doc + plain nodes + parTrans/
   sibTrans" model `FUTURE_mmd2smartart_SPEC.md` §4 envisioned a generator producing.

Three follow-up builds, same zip-surgery mechanism, same verification (ZIP validity, XXE-safe
XML well-formedness, `mc:Ignorable` hygiene, no external relationships — all passed on all three,
omitted below for brevity; only the render result differs):

- **`build-spike-v2.mjs` / `spike-v2.docx`** — grafts all 5 real parts (`data1`, `layout1`,
  `colors1`, `quickStyle1`, `drawing1`) verbatim onto our own unrelated `base.docx`, applying
  correction (1) above (relId rewritten, no part-scoped rels file). **Renders as a complete,
  correctly styled 6-node/3-level tree** — confirmed visually (`spike-v2.png`): blue theme-styled
  boxes, correct parent/child connectors, matching the original real document's diagram exactly,
  now hosted inside a document that never saw real Word. **This proves the zip-surgery injection
  mechanism itself is sound** — the open question from v1 that had nothing to do with algorithm
  authenticity.
- **`build-spike-v3.mjs` / `spike-v3.docx`** — the actual §3 MVP target: only a hand-authored
  `data1.xml` (`hand-data-v3.xml`: 1 root + 3 children, different text/topology than the real
  extract, plain integer `modelId`s, **zero `pres` points**) + the real `layout1.xml` (no colors/
  quickStyle/drawing, `r:qs=""`/`r:cs=""`). **Renders as a fully blank page** — no diagram content
  at all, same failure mode as v1. Isolates that the `pres` points are load-bearing: a layout
  algorithm does not appear to resolve them on its own from the logical parent/child/transition
  structure alone, at least in LibreOffice.
- **`build-spike-v4.mjs` / `spike-v4.docx`** — isolates further: the real `data1.xml` verbatim
  (all `pres` points intact, `dgm:extLst`/`dsp:dataModelExt` stripped since no `drawing1.xml` is
  included) + the real `layout1.xml`, but `colors1.xml`/`quickStyle1.xml`/`drawing1.xml` all
  omitted (`r:qs=""`/`r:cs=""`). **Renders text only, no shapes at all** (`spike-v4.png`): each
  node's label appears at the geometrically correct hierarchical position (proving the layout
  algorithm *does* run and compute positions from data+layout alone), but no box/fill/connector
  geometry is drawn around any of them.

### What this changes about the plan

`FUTURE_mmd2smartart_SPEC.md` §3's MVP simplification ("only emit `data`+`layout`, 2 parts
instead of 4, let the diagram inherit the host theme") does not hold up as-is against these
results, at least under LibreOffice: v4 shows that dropping `colors`/`quickStyle`/`drawing` costs
more than styling — it costs the shape geometry itself. A production generator likely needs to
emit closer to what real Word emits (`colors`+`quickStyle`, or at minimum `drawing1.xml`) rather
than the lean 2-part MVP originally proposed. Separately, and more significantly for effort
estimation: a generator cannot simply emit `doc`+`plain`+`parTrans`+`sibTrans`+`cxn` nodes for an
arbitrary Mermaid tree (§4's implied data model) — it must also emit the `pres` presentation-node
mirror, which v3 shows is not auto-derived by the rendering engine from the logical structure
alone. Whether that `pres` structure follows a mechanically generalizable per-child repeating
pattern (plausible, given the real 6-node example's regularity) or is itself layout-revision-
specific and harder to generalize is **not yet answered** — the next experiment, not attempted
here for lack of remaining budget in this spike round, would be hand-authoring a `pres` tree for
a *different* child count (e.g. 1 root + 4 children, or a 4-level tree) than the real example's
2/2/1 shape, to test whether the pattern extrapolates mechanically or requires re-deriving
per-shape-count.

### Confirmed in real Word (2026-09-02, maintainer)

- **`spike-v2.docx` renders correctly in real Word** — matches the LibreOffice render. Confirms
  the zip-surgery mechanism itself works end-to-end in the actual target application, not just
  LibreOffice.
- **`spike-v4.docx` (real `data1.xml`+`layout1.xml`, `pres` points intact, no `colors`/
  `quickStyle`/`drawing`) also renders correctly in real Word** — full shapes/geometry, not the
  text-only degradation seen in LibreOffice. **This isolates the v4 LibreOffice result as a
  LibreOffice-specific import limitation, not a real OOXML/Word requirement**: Word's diagram
  engine computes full shape geometry from `data`+`layout` alone (given the `pres` node tree is
  present), exactly as `FUTURE_mmd2smartart_SPEC.md` §3's MVP decision assumed. LibreOffice's
  diagram importer apparently needs `colors`/`quickStyle`/`drawing` to render shapes at all — a
  concrete instance of the "~25 known LibreOffice SmartArt bugs" the spec's §10.4 already flagged
  as a risk, now with a specific reproduction case for `test:visual` to account for (a SmartArt
  fixture using the lean data+layout-only MVP shape may legitimately render text-only under
  LibreOffice headless while being fully correct in real Word — visual-regression baselines for
  SmartArt fixtures will need human review with this specific divergence in mind, not just the
  general "review before accepting" rule already in place).

### `spike-v3.docx` in real Word — hard failure, worse than LibreOffice's blank render

Confirmed by the maintainer: Word refuses to open `spike-v3.docx` at all — not the recoverable
"unreadable content, recover?" prompt seen for the `mc:Ignorable` bug (TODO.md) or for v1, but a
hard **"Word encountered an error opening the file"** dialog, no recovery offered. This is a more
severe failure mode than anything else found in this spike series: LibreOffice degraded to a
blank page for the same file; Word rejects it outright.

Since `spike-v3.docx` and `spike-v4.docx` share the identical surrounding package structure
(same build-script family, same `[Content_Types].xml`/`document.xml.rels`/`<w:drawing>` wrapping
logic, same authentic `layout1.xml`) and only differ in `data1.xml`'s content — real GUID-based
`data1.xml` with `pres` points (v4, opens fine) vs. hand-authored plain-id `data1.xml` with zero
`pres` points (v3, hard failure) — the most likely explanation is that Word's schema/consistency
validation for `dgm:dataModel` is considerably stricter than mere XML well-formedness (which v3
does satisfy — confirmed by this spike's own XXE-safe parse check) and considerably stricter than
LibreOffice's importer. Exactly what constraint is violated (missing `pres` nodes specifically,
plain integer `modelId`s instead of GUIDs, some other schema requirement neither hypothesis
covers) is **not disambiguated by this test alone**.

### v5 — disambiguating the modelId-format variable

Per the table above, v3→v4 changed two variables at once. `build-spike-v5.mjs` / `hand-data-v5.xml`
isolates one of them: identical to v3's hand-authored data (1 root + 3 children, zero `pres`
points, no colors/quickStyle/drawing) but with every `modelId`/`cxnId`/`srcId`/`destId`/
`parTransId`/`sibTransId` rewritten from plain strings (`"0"`, `"1"`, `"1pt"`, ...) to
GUID-shaped strings (`"{11111111-1111-1111-1111-111111111111}"`, ...), matching the format real
Word emits.

**Result: byte-for-byte identical blank render to v3 under LibreOffice** (`spike-v5.png` is
pixel-identical to `spike-v3.png`). This rules out `modelId` format as the variable that mattered
for LibreOffice's blank-render behavior — the presence/absence of `pres` points is the more
likely explanation there. `spike-v5.docx` has been handed to the maintainer for the same real-Word
test as v3, to check whether GUID-formatted ids change Word's hard-failure behavior (expected: no,
if `pres`-point absence is really the root cause of both the LibreOffice blank render and the Word
open failure).

### A countervailing data point from research, while awaiting further real-Word samples

Searched for authoritative documentation of the `forEach`/`presOf` mechanism (the layoutDef
constructs that map data points to presentation shapes) to see whether presentation-node
generation is supposed to happen live from the layout algorithm, or must be pre-resolved in
`data1.xml`. Two sources, not fully in agreement:

- Microsoft's own "Creating Custom SmartArt Layouts with Office Open XML" (archived Office 2010
  developer documentation, learn.microsoft.com/en-us/previous-versions/office/developer/
  office-2010/gg583880) states explicitly, about a `forEach` in a custom layout: *"The forEach
  statement in this example propagates subsequent points (shapes) as the user creates the
  diagram. Without this statement, only one instance of the snipped rectangle will appear in the
  diagram."* This describes `forEach` as something that **dynamically** grows shapes to match the
  live data model — which would argue `pres` points should not need to be pre-computed at all.
- Independently, the ONLYOFFICE `sdkjs` open-source implementation (a real, Word-file-compatible
  editor, not a blog post) treats the `pres` node tree architecturally as **pre-existing input**
  read from `data1.xml` (`common/Drawings/Format/Data.js`'s `Point`/`Cxn` classes model `pres`/
  `presOf`/`presParOf` as data to be parsed, and `common/SmartArts/SmartArtTree.js`'s layout
  engine traverses via `ForEach` over "already-populated" node hierarchies per a DeepWiki summary
  of that codebase) — i.e. it does not appear to synthesize the `pres` mirror itself from a bare
  logical tree.

These two sources describe the *authoring-time* behavior (Word's own UI regenerating the cache
as a human edits a diagram interactively) and a *rendering-time* implementation (an engine reading
an already-serialized file) respectively — not necessarily contradictory, but not something this
spike can reconcile without either the real forEach/presOf resolution source code or further
targeted real-Word samples. v3's/v5's hard Word failure and blank LibreOffice render are the more
concrete, directly-observed data points to weight until reconciled.

### Conclusion for this spike round

The full spectrum is now empirically mapped:

| Variant | data1.xml | colors/quickStyle/drawing | LibreOffice | Real Word |
|---|---|---|---|---|
| v1 | hand-authored, fake `layout1.xml` | no | blank | blank + mojibake, no repair prompt |
| v2 | real, verbatim (with `pres`) | yes, real | correct tree | **correct tree** |
| v3 | hand-authored, zero `pres` | no | blank | **hard open failure, no recovery** |
| v4 | real, verbatim (with `pres`) | no | text only, no shapes | **correct tree** |

Two independent variables were being tested at once when going from v4 to v3 (presence of `pres`
nodes, and `modelId` format), so this table does not yet prove which one caused the hard failure
— only that hand-authoring `data1.xml` from the minimal logical model in
`FUTURE_mmd2smartart_SPEC.md` §4 (doc/plain/parTrans/sibTrans/cxn, no `pres` mirror) produces a
file Word refuses to open, which is unambiguously worse than "renders wrong" for a shipping
product. The next disambiguating experiment (not attempted here) would be a v5: real `data1.xml`
verbatim but with `modelId`s changed to plain integers (isolating the id-format variable) versus
a v6: hand-authored data with GUID-style ids but still zero `pres` nodes (isolating the `pres`
variable) — both out of scope for this round.

## Round 3 — reverse-engineering the `pres` generation rule from 3 real samples

The maintainer provided two more real "Hiérarchie" SmartArt exports, extracted the same way as
`real-diagram1/` (`extract-deep/` = 1 root → 1 → 1 → 1, a 4-level chain with no branching;
`extract-flat/` = 1 root with 4 children, no depth beyond 2). Combined with the original 6-node
2/2/1-branching sample, this gives three independent topologies to compare `data1.xml`'s `pres`
structure across, specifically to answer the question v3/v4/v5 left open: is the `pres` mirror a
fixed, mechanically generalizable template, or something closer to a per-instance snapshot that
would need re-deriving for every tree shape?

**Result: a fully regular, depth-indexed template**, confirmed identically across all three
samples (grouping each diagram's `pres` points by their `presAssocID` + `presName`):

- The `doc` point always carries exactly 1 `pres` point: `hierChild1` (a constant top-level
  container, present in all three samples regardless of shape).
- Every **content node at depth *d*** (root = depth 1) carries exactly the same 5-point bundle,
  named purely by depth, never by identity or sibling position:
  `hierRoot{d}`, `composite{d}`, `background{d}`, `text{d}`, `hierChild{d+1}`
  (level 1's `composite`/`background`/`text` carry no numeric suffix; from level 2 on they do).
  Confirmed byte-for-byte identical across all 4 siblings in the "flat" sample (same bundle
  copy-pasted 4 times, modulo `modelId`s) and across the depth progression 1→2→3→4 in the "deep"
  chain.
- Every **edge from a depth-*d* parent to a depth-(*d*+1) child** carries exactly 1 transition
  `pres` point, named by the *depth of the edge*, not by which specific children it's between:
  `Name10` for 1→2 edges, `Name17` for 2→3, `Name23` for 3→4. Confirmed identical across all 4
  edges in the "flat" sample (same name every time, despite 4 different sibling pairs) and across
  the 3 edges in the "deep" chain (one name per depth transition, as expected).

### The hard limit this also reveals: `hierarchy1` is capped at 4 levels of depth

Grepping the real `layout1.xml` (`real-diagram1/layout1.xml`, 19 263 bytes) for every
`layoutNode name="..."` in the algorithm returns **exactly 24 names, topping out at `hierChild5`/
`hierRoot4`/`composite4`/`background4`/`text4`** — there is no `hierRoot5` or deeper. This isn't
an artifact of the specific samples tested (none reached depth 5): the algorithm itself only
defines rendering templates for 4 levels of `hierRoot`/`composite`/`background`/`text`, plus a
terminal `hierChild5` container with nothing to render inside it. **A Mermaid tree deeper than 4
levels has no valid `pres` template to map onto under `hierarchy1`**, regardless of how correctly
a generator reproduces the pattern above — this is a hard ceiling in Word's own built-in
algorithm, not a limitation of this spike or of the generation rule. Breadth (siblings per level)
has no equivalent limit found in this round: the "flat" sample's 4 siblings all reused the exact
same depth-2 template with no additional `layoutNode` definitions required.

### What this changes about the recommendation

This substantially de-risks the generator (`FUTURE_mmd2smartart_SPEC.md` §7 step 4) for the
`tree` topology: the `pres` mirror is not a per-instance snapshot requiring bespoke computation —
it's a fixed, depth-indexed lookup table (at most 4 rows, known exactly from this real sample) that
a generator can reproduce mechanically for any Mermaid tree of depth ≤ 4 and arbitrary breadth.
The classifier (§4) needs a new, previously unanticipated rule: **disqualify (fall back to
`wpg:wgp`) any tree deeper than 4 levels** for the `hierarchy1` layout path, in addition to the
existing chain/tree/cycle topology checks. Still unverified (out of scope for this spike round):
the exact `presOf`/`presParOf` wiring rule connecting each bundle to its parent's bundle (the
*shape* of the pattern is now well evidenced; the precise connection-attribute schema needed to
reproduce it byte-for-byte has not been extracted here) — that belongs to the actual generator
implementation step, not further spike work.

## Round 4 — the exact `presOf`/`presParOf` wiring algorithm

Extracted by grouping every `presOf`/`presParOf` `dgm:cxn` in `real-diagram1/data1.xml` by
`srcId`/`destId` and walking the resulting tree from its root (the `pres` point named
`hierChild1`), then confirmed identically on `real-diagram-flat/data1.xml` (1 root + 4 children,
no depth). The rule is a small, exact recursion — for a content node *N* at depth *d* (root = 1)
with children *C₁..Cₖ* (k may be 0):

```
hierRoot{d}        (presAssocID = N)
├─ composite{d}     (unsuffixed at d=1: "composite"/"background"/"text")
│  ├─ background{d}
│  └─ text{d}        ← the ONLY presOf target for N itself: presOf(N -> text{d})
└─ hierChild{d+1}   (presAssocID = N — always present, even for a leaf, just childless)
   ├─ Name{T(d)}     (presAssocID = the parTrans point of edge N->C₁; presOf(parTrans -> Name{T(d)}))
   ├─ hierRoot{d+1}  (of C₁, recurse)
   ├─ Name{T(d)}     (of edge N->C₂'s parTrans)
   ├─ hierRoot{d+1}  (of C₂, recurse)
   └─ ... one [Name, hierRoot] pair per child, in edge order (srcOrd) ...
```

Two details that only became visible from the full attribute dump (`srcId`/`destId`/`presId` on
every `dgm:cxn`, not just the type counts from Round 3):

- `presOf`'s `srcId` is **not always a content node** — for the `Name{T(d)}` pres points it's the
  edge's **`parTrans` point** (never `sibTrans`, which appears to carry no `presOf`/`presParOf` of
  its own in this layout — its role seems to be purely the `dgm:cxn`-level bookkeeping already
  described in Round 1/2, distinct from the presentation layer).
- The very first edge (`doc -> root content node`) never gets a `Name`/transition pres point —
  consistent with there being no "connecting line" for an invisible container (`hierChild1`,
  associated with `doc`) into its single top box. Every other edge (parent content node -> child
  content node) gets exactly one.

`T(d)`, the transition pres-name lookup for an edge from depth *d* to *d+1*, is a small **fixed
table taken verbatim from `layoutNode name="..."` in the real `layout1.xml`** (Round 3's 24-name
list), not something to compute: `T(1) = "Name10"`, `T(2) = "Name17"`, `T(3) = "Name23"` — and
nothing beyond, since depth 4 is `hierarchy1`'s own hard ceiling (Round 3).

This closes the question Round 3 left open ("the exact `presOf`/`presParOf` wiring rule ... has
not been extracted here"): the full `pres` mirror for an arbitrary tree of depth ≤ 4 and any
branching factor is now mechanically specifiable — a small recursive function over the Mermaid
tree, using this fixed template and the fixed depth-indexed name table, no per-shape geometry or
Word-internal algorithm knowledge required beyond what's captured here.

### Open question this raises, not a technical one: can `layout1.xml` be redistributed?

Everything above describes the *shape* of the wiring rule, which is fair to document and
reimplement (it's a structural fact about a file format, the same kind of reverse-engineering this
whole project already does for the `wpg:wgp` translator). A **separate** question is whether the
generator should embed the real `layout1.xml` (the actual ~19KB algorithm content extracted from
the maintainer's Word installation, `real-diagram1/layout1.xml`) as a static asset shipped in a
CC0 package, the way `packages/cli/assets/reference.docx` is already shipped today. That file's
content is not something this project wrote — it's Microsoft's own built-in `hierarchy1` algorithm
definition, extracted from Word's own output. Whether that specific XML is freely redistributable
inside an open-source (CC0) project, versus something a generator should instead prompt the
end user's own Word installation to supply at generation time some other way, is a licensing
question this spike explicitly does not attempt to resolve — flagged for the maintainer per
AGENTS.md's "Escalate to a human" list ("Licensing questions").

## Round 5 — full LibreOffice compatibility achieved with a 100% self-authored algorithm

Following the maintainer's explicit push to "find compatibility" rather than accept a Word-only
custom algorithm (see the strategy discussion in the conversation, not reproduced here), this round
tests whether the `presOf`/`presParOf` mirror technique reverse-engineered for Word's real
`hierarchy1` (Round 3/4) also applies to a **fully self-authored** algorithm — which would resolve
the Word/LibreOffice split without any licensing exposure at all.

Baseline confirmed first: `custom-chain1.docx` (§ above, `layout-chain1.xml` — a transcription of
Microsoft's own publicly documented "Basic Block List" tutorial example, `lin`/`composite`/`tx`/
`forEach`) **renders correctly in real Word** (screenshot confirmed by the maintainer: three
styled blue rounded rectangles) but **renders a fully blank page in LibreOffice** — the same
blank signature as every other custom-algorithm attempt so far, `forEach`-based or not.

Four incremental builds isolate exactly what LibreOffice needs, all using the *same* self-authored
`layout-chain1.xml` (unchanged) and the *same* lean logical data (doc + 3 plain nodes + `parOf`,
matching spec §4's original minimal model) as the baseline:

1. **`custom-chain1-withpres.docx`** — adds a hand-built `presOf`/`presParOf` mirror to the data,
   using `layout-chain1.xml`'s **own** layoutNode names (`root`/`composite`/`Main`) instead of
   Word's (`hierRoot`/`hierChild`/`text`) — i.e. the exact same recursive bundle technique from
   Round 4, just retargeted at an algorithm we wrote ourselves. **Result: LibreOffice now renders
   the three labels ("Etape 1/2/3") at the correct positions** — a categorical change from blank
   to partially-correct, with no change to the algorithm itself.
2. **`custom-chain1-fill.docx`** / **`custom-chain1-mainfill.docx`** — tried adding an explicit
   `<a:solidFill>` directly inside the `pres` points' own `<dgm:spPr>` (on the `composite` point,
   then on the `Main` point). **No visual effect either time** — LibreOffice does not appear to
   honor inline `spPr` overrides on `pres` points for shape geometry/fill.
3. **`custom-chain1-realstyle.docx`** — same data+algorithm, but the doc point's `prSet` now
   references `qsTypeId`/`csTypeId`, and the real `colors1.xml`/`quickStyle1.xml` (borrowed from
   `real-diagram1/`, not committed) are wired in via `r:qs`/`r:cs`. **Full correct render**: three
   filled, bordered, correctly styled rounded rectangles with white text — indistinguishable in
   quality from a built-in SmartArt.
4. **`custom-chain1-ownercolors.docx`** — same as (3), but `colors1.xml` replaced with
   `colors-chain1.xml`, a **from-scratch `dgm:colorsDef`** written from the public ECMA-376/
   Open-XML-SDK schema documentation (two `styleLbl` entries, `node0`/`node1`, plain
   `a:srgbClr` fills — no Microsoft content, no file ever extracted from a real Word document).
   `quickStyle1.xml` is still the real one at this point. **Still a full, correct render** —
   proves `colorsDef` content does not need to come from Microsoft at all.
5. **`custom-chain1-nostyle.docx`** — same as (4) but `quickStyle` relationship dropped entirely
   (`r:qs=""`, no quickStyle part at all). **Regresses to the exact text-only signature of (1)** —
   confirms `quickStyle`/`styleDef` is independently load-bearing; `colorsDef` alone is not enough.
6. **`custom-chain1-ownerstyle.docx`** — same as (4), but `quickStyle1.xml` also replaced with
   `quickstyle-chain1.xml`, a **from-scratch `dgm:styleDef`** (two `styleLbl` entries, `node0`/
   `node1`, each a plain `dgm:style` with `a:lnRef`/`a:fillRef`/`a:effectRef`/`a:fontRef` — the
   same reference-based style vocabulary `ooxml-translator.ts` already uses for `wps:style` in the
   `.docx` shape translator, not copied from any real Word diagram). **Full, correct render** —
   closes the last open question from this round: every one of the four parts needed (algorithm,
   `pres` mirror, `colorsDef`, `styleDef`) can be entirely self-authored, and the combination
   renders identically to a diagram built from Microsoft's own files.

### The full recipe, as far as this spike has verified

A 100%-licensing-clean SmartArt diagram, rendering correctly in both Word and LibreOffice, needs:

1. An original `dgm:layoutDef` (any vocabulary from the public ECMA-376/Open-XML-SDK docs —
   `composite`/`tx`/`lin`/`forEach` proven here; no Microsoft URN, no copied algorithm content).
2. A `data1.xml` carrying **both** the logical graph (doc/plain nodes, `parOf`) **and** a
   hand-generated `presOf`/`presParOf` presentation mirror keyed to that algorithm's own
   layoutNode names — the same recursive bundle technique already fully characterized in Round 4,
   just retargeted. Word does not strictly need this (it can resolve a custom algorithm's `forEach`
   dynamically, per the `custom-chain1.docx` baseline) but LibreOffice does.
3. A `colorsDef` (`colors1.xml`) — confirmed can be entirely self-authored.
4. A `styleDef` (`quickStyle1.xml`) — confirmed necessary, and confirmed **entirely self-authored**
   works exactly as well as Word's real one (`custom-chain1-ownerstyle.docx`, item 6 above).

All four pieces have now been directly verified as self-authorable, individually and in
combination (`custom-chain1-ownerstyle.docx` uses none of Word's own files at all and still
renders correctly under LibreOffice). This is a materially different, better outcome than Round
4's conclusion assumed: LibreOffice's blank renders were never about "custom vs. built-in"
algorithms — they were about **which parts are present**, exactly the same set of conditions
(`pres` mirror, `colors`, `quickStyle`) that governed the real `hierarchy1` results in Round 2-4.
A generator that emits all four self-authored pieces above works everywhere, with **no depth-4
ceiling** (that was specific to how many levels Word's own `hierarchy1` happens to define) and
**no redistribution risk** whatsoever.

## Explicitly out of scope for this spike (per task boundaries)

- No ADR — this is the spike a human reviews before writing one.
- No change to `packages/cli/src/postprocess.mjs` or anything under `packages/`.
- No new npm dependency (`unzip`/`zip` invoked via `execFileSync` with argument arrays; XML
  well-formedness checked with Python's standard-library `xml.parsers.expat`).
- No generalization to arbitrary child counts, no `conn`-algorithm connectors, no
  colors/quickStyle parts (per §3's MVP decision) — all deliberate simplifications for a
  feasibility spike, not gaps to close here.
