# Handover — 2026-09-06 (add-in Word : scaffold codé, bloqué sur les spikes)

One entry point for picking this project back up. Supersedes the earlier 2026-09-06 "planning-only"
handover (same day, follow-up session) — that session only researched and decided; this one wrote
the actual scaffold. Check `git log`/`TODO.md` for anything newer than this file's date.

## What happened this session

Picking up straight from ADR 0008 (ruban à 5 boutons décidé, rien codé, 3 spikes bloquants
identifiés — full reasoning there, not repeated here), this session scaffolded the actual add-in
project:

- **`packages/word-addin/`** — new npm workspace member, generated via `generator-office`
  (`npm create office-addin` equivalent; TypeScript, Word host, add-in-commands project type),
  then adapted to the ADR's decision: the generated taskpane was deleted entirely (no taskpane in
  this design), the manifest rewritten for a dedicated ribbon group "Md2Docx" with **6 buttons**:
  the 5 production buttons from the ADR (Charger `.md`, Enregistrer sous `.md`, Couper/Copier/
  Coller en MD) plus one temporary dev-only button, `[Dev] Vérifier les spikes`.
- **The 5 production buttons are stub handlers only** — each just logs "not implemented, blocked
  on ADR 0008 spikes" and calls `event.completed()`. This is deliberate, not an oversight: ADR
  0008 §5 says no production logic should be written on top of clipboard/`getOoxml()` behavior
  until spikes 1-2 have run in a real Word desktop, and that hasn't happened yet.
- **The spike harness button is real, working code** (`src/commands/commands.word.ts`'s
  `runSpike1Clipboard`/`runSpike2Ooxml`/`collectSpikeResults`): it round-trips
  `navigator.clipboard.writeText()`/`readText()`, calls `range.getOoxml()` on the current
  selection via `Word.run`, and opens a dialog (`src/dialogs/spike-results.html`) rendering both
  results plus a reminder to eyeball spike 3, with a "Copier tout (JSON)" button. Spike 3 (do the
  5 buttons render/behave right?) isn't something code can check — the harness just prompts for a
  manual look.
- **The 3 autonomy tools from ADR 0008 §6 are wired in**, two of them proven working this session:
  `office-addin-manifest validate manifest.xml` passes; `office-addin-mock`-based unit tests
  (`test/unit/spikes.test.ts`, 4 tests, `npm test`) exercise the spike-harness logic without any
  Office app open — including a hand-rolled `navigator.clipboard` stub, since the Clipboard API is
  a Web API office-addin-mock doesn't cover. The third tool, the repo's existing `dotnet`
  OOXML validator (`scripts/oxml-validator/`), is **not yet connected** — nothing in this package
  produces OOXML yet (that starts with "Coller en MD", still blocked on spike 1).
- **Icon**: `packages/word-addin/assets/icon.svg` is a horizontal mirror of
  `packages/vscode-extension/icon.svg` (maintainer's suggestion, mid-session) — same split-diamond
  graph/text mark, flipped left-right since this add-in is the reverse direction (Word → Markdown,
  "text → graph" vs the VS Code extension's "graph → text"). Rasterized to the 5 PNG sizes the
  manifest needs (16/32/64/80/128) plus `logo-filled.png` via `rsvg-convert`.
- **Verified green this session**: `npm run validate` (manifest), `npm run typecheck`, `npm test`
  (4/4), `npm run build` (webpack production), `npm run lint` (office-addin-lint — one real
  finding fixed along the way, see below), all from `packages/word-addin/`; also confirmed the
  whole monorepo's `npm run typecheck --workspaces`, `npm run test --workspaces`, and
  `npm run build --workspaces` still pass with the new package included, and `npm run lint`
  (root) still passes.
- **Two non-obvious fixes made along the way, worth knowing about if you touch this package**:
  - Root's `eslint .` (ESLint 8) crashed outright (`TypeError: Converting circular structure to
    JSON`) when it tried to cascade into `packages/word-addin/.eslintrc.json`, because that
    config's `eslint-plugin-office-addins@4.0.10` plugin is built against newer
    `@typescript-eslint/utils` internals incompatible with ESLint 8's config validator — not just
    noisy findings, a hard crash. Fixed by adding `"root": true` to the package's own
    `.eslintrc.json` (stops the cascade) **and** excluding `packages/word-addin/` from the root
    `.eslintrc.cjs` `ignorePatterns` (belt and suspenders — root's `eslint .` still walks the
    directory tree even with the nested config's own `root: true`). Lint that package on its own
    via `npm run lint -w packages/word-addin` (`office-addin-lint check`).
  - `eslint-plugin-office-addins`'s `load-object-before-read` rule flags `ooxml.value` (in
    `runSpike2Ooxml`) as needing an explicit `.load()` call first — this is a **false positive**:
    `range.getOoxml()` returns an `OfficeExtension.ClientResult<string>`, whose `.value` is
    populated by `context.sync()` alone (no `.load()` exists or is needed for it, per Microsoft's
    own samples). The rule's static `getFunctions.json` list flags every Office.js method starting
    with `get*` by name regardless of return type, so it can't distinguish a `ClientResult`-
    returning method from a loadable `Range`/collection getter. Suppressed with a scoped
    `eslint-disable-next-line` and an explanatory comment right above it — don't "fix" this by
    adding a real `.load()` call, that would be wrong for the actual Office.js API.

## What's already in place from *before* this session (don't re-derive it)

- `docs/adr/0008-word-addin-ribbon-platform-spike.md` — the platform research, the ribbon decision,
  the 3 required spikes, and the tooling plan.
- `docs/specs/FUTURE_wordextension.md` — functional spec for the reverse direction (Word→Markdown
  text/tables/lists, SmartArt/shapes→Mermaid), two usage modes (CLI/file, and Office.js add-in
  clipboard).
- `docs/specs/FUTURE_docx2mermaid_SPEC.md` — technical architecture for the OOXML→Mermaid diagram
  reconstruction specifically.
- The existing `scripts/oxml-validator/` (dotnet, ADR 0007) — reusable as-is once a converter
  exists that hands fragments to `insertOoxml` (not yet the case).

## Not done / where a fresh session should start

1. **Run the 3 spikes in a real Word desktop (not Word Online)** — this needs the maintainer's
   hands, it cannot be done from this Linux sandbox (no headless Word, no Microsoft 365
   credentials, no supported E2E automation pattern for Word). Instructions are in `TODO.md`
   under "Comment lancer les spikes": `cd packages/word-addin && npm run start`, click
   **[Dev] Vérifier les spikes** on the Md2Docx ribbon group, read the dialog, report the 3
   results back into ADR 0008 (spike 1: clipboard write+read from a function command; spike 2:
   real shape of `getOoxml()`'s output; spike 3: do the 5 buttons render/behave correctly).
2. **Build in this order once spikes are decided** (cheapest/lowest-risk first): Coller en MD
   (reuses the existing Markdown→OOXML engine, once bundled for a browser runtime) → Copier en MD
   (needs the new OOXML→Markdown reverse converter, scoped by spike 2) → Couper en MD (trivial
   extension of Copier) → Enregistrer sous/Charger un `.md` (reuse Copier/Coller at whole-document
   scope). Remove the `[Dev] Vérifier les spikes` button once the 5 real buttons are implemented.
3. Wire the `dotnet` `scripts/oxml-validator/` into the new OOXML-producing path (Coller en MD)
   once it exists — it isn't connected to anything in `packages/word-addin` yet.

## Where to look for more

- `docs/adr/0008-word-addin-ribbon-platform-spike.md` — the platform research and ribbon decision.
- `TODO.md`, "Phase 4 — Add-in Word (Office.js)" — the punch list, including spike-running
  instructions and current status per item.
- `packages/word-addin/` — the scaffold itself; `src/commands/commands.word.ts` is the one file
  that matters most (5 stubs + the real spike-harness logic).
- `docs/specs/FUTURE_wordextension.md` / `FUTURE_docx2mermaid_SPEC.md` — the reverse-conversion
  specs this plan builds on.
- `docs/history/TODO_ARCHIVE.md` — pre-Phase-4 history condensed out of `TODO.md` in the prior
  session (Phase 8, CI/CD, closed incidents), unrelated to this work.
