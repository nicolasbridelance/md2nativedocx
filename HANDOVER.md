# Handover — 2026-09-06 (planification add-in Word)

One entry point for picking this project back up. Written at the end of a **planning-only**
session — no code changed, no tests run. Supersedes the earlier 2026-09-05 handover for "what to
do next"; check `git log`/`TODO.md` for anything newer than this file's date.

## What happened this session

The maintainer asked to scope a Word add-in around a ribbon with 5 buttons (Charger/Enregistrer
sous/Couper/Copier/Coller en Markdown), replacing the one-line taskpane plan that had sat in
`TODO.md`'s Phase 4 since the project started. Before committing to that shape, the Office
Add-ins platform was researched against current Microsoft Learn docs (fetched 2026-09-06, not
recalled from training data) — this changed the plan in two concrete ways, not just added detail:

- **Native right-click "Copy as MD" is genuinely buildable** (`OfficeMenu id="ContextMenuText"`),
  but only when text is selected — no equivalent exists for "Paste MD" (cursor, no selection) or
  for adding an entry to Word's native "Save As" dialog. Both are hard platform limits, not
  implementation difficulty — confirmed by reading Microsoft's own manifest reference, not
  assumed.
- **Decision made**: a dedicated ribbon (5 buttons) instead of a menu-contextuel/ribbon mix, since
  only 1 of the 5 actions could have lived in the native context menu anyway. Full reasoning,
  sources, and the clipboard-risk breakdown (write is low-risk, read from a hidden function-command
  runtime is the actual open question): **`docs/adr/0008-word-addin-ribbon-platform-spike.md`**
  (new this session).

All of this is now written into the repo (it started out only in the agent's personal memory,
which is not part of the repo and invisible to a fresh session — caught and corrected mid-session
when the maintainer asked "did you write all the documentation?"):

- `docs/adr/0008-word-addin-ribbon-platform-spike.md` — the platform research, the ribbon decision,
  the 3 required spikes, and the tooling plan (full detail, read this first).
- `TODO.md`, "Phase 4 — Add-in Word (Office.js)" — rewritten from a 3-bullet stub into the actual
  plan: pointers to ADR 0008 + the two pre-existing specs (`FUTURE_wordextension.md`,
  `FUTURE_docx2mermaid_SPEC.md`), the 3 spikes as checkboxes, the scaffold/tooling step, and the
  recommended build order (Coller → Copier → Couper → Enregistrer sous/Charger).
- `TODO.md` also got a general cleanup this session (unrelated to the add-in, done at the
  maintainer's request while preparing this handover): Phase 8, CI/CD, both closed incidents, and
  the closed half of "Retours en attente de clarification" were condensed to short pointers, with
  their full original text preserved verbatim in `docs/history/TODO_ARCHIVE.md`. `TODO.md` went
  from 1127 to ~640 lines; nothing was deleted, only moved. If something you expect to find in
  `TODO.md` looks shorter than you remember, it's in the archive under the matching section name.

## What's already in place from *before* this session (don't re-derive it)

- `docs/specs/FUTURE_wordextension.md` — functional spec for the reverse direction (Word→Markdown
  text/tables/lists, SmartArt/shapes→Mermaid), two usage modes (CLI/file, and Office.js add-in
  clipboard).
- `docs/specs/FUTURE_docx2mermaid_SPEC.md` — technical architecture for the OOXML→Mermaid diagram
  reconstruction specifically: risks (unanchored connectors, copy-paste ID duplication, new read-
  side security surface), and futur-proofing already flagged for the *forward* translator
  (`cNvPr`/`descr` carrying the original Mermaid id — already implemented, see `packages/core`'s
  translator).
- The existing `scripts/oxml-validator/` (dotnet, ADR 0007) — reusable as-is for validating any
  OOXML fragment the new reverse converter or the forward engine would hand to `insertOoxml`.

## Not done / where a fresh session should start

Nothing is coded. `TODO.md`'s Phase 4 section is the punch list; in order:

1. **Scaffold the add-in project** (`npm create office-addin`, TypeScript, Word, add-in commands),
   with `office-addin-manifest validate` and `office-addin-mock` wired in from the start, plus a
   minimal one-click spike harness (logs all 3 spikes' results to a copyable panel).
2. **Run the 3 spikes in a real Word desktop** (not Word Online) — this needs the maintainer's
   hands, it cannot be done from this Linux sandbox (no headless Word, no Microsoft 365
   credentials, no supported E2E automation pattern for Word — all confirmed by research this
   session, see ADR 0008 §5):
   - Does `navigator.clipboard.readText()` work from a function command in real Word desktop?
   - What does `range.getOoxml()` actually return for ordinary Word content (headings/lists/
     tables/bold-italic)?
   - Do the 5 ribbon buttons render/behave as expected?
3. **Build in this order** (cheapest/lowest-risk first): Coller en MD (reuses the existing
   Markdown→OOXML engine wholesale) → Copier en MD (needs the new OOXML→Markdown reverse
   converter, scoped by spike 2) → Couper en MD (trivial extension of Copier) → Enregistrer
   sous/Charger un `.md` (reuse Copier/Coller at whole-document scope).

## Where to look for more

- `docs/adr/0008-word-addin-ribbon-platform-spike.md` — everything from this session, in full.
- `TODO.md`, "Phase 4 — Add-in Word (Office.js)" — the punch list derived from it.
- `docs/specs/FUTURE_wordextension.md` / `FUTURE_docx2mermaid_SPEC.md` — the reverse-conversion
  specs this plan builds on, written in earlier sessions.
- `docs/history/TODO_ARCHIVE.md` — full detail of everything condensed out of `TODO.md` this
  session (Phase 8, CI/CD, both incidents, closed clarification items), plus all prior history.
- Previous handover content (Phase 8 shipped work, what's verified vs. still "à tester dans un
  vrai Word") is preserved in git history (`git log -- HANDOVER.md`) — not repeated here since this
  session didn't touch that code.
