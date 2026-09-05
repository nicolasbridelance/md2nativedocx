# Spike — `dsp:drawing` fallback for `cycle` (Milestone 0 of the SmartArt coverage plan)

Run with `node build-spike.mjs` (regenerates everything in this directory).

## Setup

1. `cycle.md` — the exact reproduction case from the original incident (TODO.md, "Incident
   SmartArt 'cycle' cassé en Word réel"): a 3-node cycle, `A --> B --> C --> A`.
2. `cycle-base.docx` — built by the **real, unmodified** CLI
   (`MD2NATIVEDOCX_ENABLE_SMARTART=1 node packages/cli/bin/md2nativedocx.mjs cycle.md -o cycle-base.docx`),
   i.e. today's production output: 4 diagram parts (`data1.xml`/`layout1.xml`/`colors1.xml`/
   `quickStyle1.xml`), no `dsp:drawing`. This is the file real Word refuses to open.
3. `cycle-with-drawing.docx` — the same file, hand-patched (`build-spike.mjs`) with a 5th part,
   `word/diagrams/drawing1.xml`, plus the matching relationship/content-type/`dsp:dataModelExt`
   reference — structurally the exact same 4 additions `handmade_samples/cycle-simple.docx`
   (a real Word-authored cycle) has and our generator lacks.

## Finding 1 — what `dsp:sp/@modelId` must reference

Inspected `handmade_samples/cycle-simple.docx` directly (beyond what TODO.md already documents):
every `<dsp:sp modelId="...">` in its `drawing1.xml` is one of `data1.xml`'s **presentation**
points (`dgm:pt/@type="pres"`), never a content point — confirmed by set-intersecting the two id
lists (6 of drawing1.xml's ids match pres points, 0 match content points). Our own generators
already have the equivalent points (`p-main{N}`, the ones carrying `presStyleLbl="node1"` — the
actually-visible shape in the presentation tree). This script reuses those ids verbatim, still as
plain strings (`"p-main1"`, not a GUID) — consistent with ADR 0004 "Round 3", which already found
modelId *format* has no bearing on rendering; only referential correctness to a real point matters.

## Finding 2 — LibreOffice's actual behavior once a `dsp:drawing` is present (unexpected)

**`cycle-base.png`** (today's production output, live `layoutDef` algorithm executed by
LibreOffice):

Renders as 3 **rounded rectangles** — LibreOffice's own interpretation of the `cycle` algorithm's
`composite`/`Main` styling, not literally an ellipse (no `prstGeom` is specified in
`CYCLE_LAYOUT_XML`'s styling, so the renderer picks its own default node shape).

**`cycle-with-drawing.png`** (with the hand-built `drawing1.xml` added):

Renders as 3 **ellipses in a triangle**, in the exact positions this spike's geometry code
computed (top/bottom-left/bottom-right) — i.e. **LibreOffice displayed the pre-rendered fallback
instead of re-running the live algorithm**, even though `dgm:extLst`/`mc:Ignorable`-style
extensions are normally meant to be safely skippable by a renderer that doesn't understand them.

This was not the expected outcome (the working hypothesis only required the fallback to exist as
a safety net for an *unfamiliar algorithm*, not to be preferentially displayed over a *known,
successfully-executing* one). It is a strong positive signal for the incident's hypothesis,
though: it means SmartArt viewers generally treat `dsp:drawing` as an authoritative cache rather
than an ignorable extension, which lines up with how real Word visibly behaves in practice (a
SmartArt diagram shows a static-looking picture until you explicitly edit text or ask it to
re-layout) — reinforcing that the *absence* of this cache, not just an unfamiliar algorithm, could
plausibly be what makes Word refuse to open the file at all rather than degrade gracefully.

## Confirmed by this spike (LibreOffice-only, see below for what's still open)

- ZIP stays valid, `data1.xml`/`drawing1.xml` stay well-formed XML after patching (`build-spike.mjs`
  step 3 asserts both).
- No regression on the parts that already worked (relationships/content-types for the 4 existing
  parts untouched, verified by diffing the two `.docx`).
- The fallback's own visual output is reasonable (matches the intended geometry, correct colors/
  text) — encouraging for a real Milestone 1 implementation, not just "does it not crash".

## Still open — needs a real Word test

Nothing here proves Word **opens** `cycle-with-drawing.docx` — this sandbox has no Word, only
LibreOffice. That is the one question this spike cannot answer by itself. See ADR 0006 for the
decision this gates.
