# Handover — 2026-10-08

One entry point for picking this project back up. It describes the state of the project as of this
date; `git log` has anything newer. Earlier handovers live in this file's git history.

## Where the project stands

- **The product works end to end.** Markdown with Mermaid becomes a `.docx` where every diagram is
  editable in Word, or (since 2026-10-08, flowcharts only) a `.odt` where it is editable in LibreOffice, from the VS Code extension (0.7.0 on the Marketplace, tag `vscode-v0.7.0`), the
  CLI, the Pandoc filter, or the MCP server (`packages/mcp`). The same source can also become a
  `.pptx` deck (`packages/pptx`), which opens in PowerPoint and imports into Google Slides.
- **All 29 Mermaid types are covered.** What each one becomes (SmartArt, Word chart or shapes), under
  which conditions, and what was ruled out with evidence: [`docs/coverage.md`](docs/coverage.md).
- **SmartArt and Word charts are verified in real Word** by the maintainer, round by round
  ([`test-corpus/word-verification/CHECKLIST.md`](test-corpus/word-verification/CHECKLIST.md), rounds
  4-20). 0.7.0 was also validated on the maintainer's corporate Windows machine (2026-10-07).
- **Public entry points (V2, ADR 0012).** `renderDiagram()` and `planRendering()` in `core`;
  `convert()` as the library entry point of `@md2nativedocx/cli`; size limits on every Dagre layout
  (`DiagramTooLargeError`, a visible note instead of a failed export); the MCP server runs each call in
  a child process killed at its deadline.
- **Versions.** Extension **0.8.0** published to the Marketplace on 2026-10-08 (tag `vscode-v0.8.0`):
  `.odt` export, the project's own `reference.docx`. npm: the repo is at core, pandoc-filter, cli
  **0.2.0** and pptx **0.1.1**, but the registry still serves 0.1.0: `npm publish` asked for a one-time
  password (the `NPM_TOKEN` in `.env` does not bypass 2FA). Publish with an OTP, or replace the token
  with an Automation / granular token allowed to bypass 2FA, then `npm publish --access public` in
  `packages/{core,pandoc-filter,pptx,cli}` in that order. `mcp` is not published.

## Priority since 2026-10-08: LibreOffice / ODF

LibreOffice 26.2 and Google Docs both shipped native Markdown in 2026, and neither renders Mermaid as
editable shapes. The maintainer made an ODF output (`.odt` with native `draw:` shapes and attached
connectors) the project's priority, ahead of the V2 engine work. Google itself is out of reach
(proprietary format, no shape primitive in the Docs API); Slides stays reachable through `.pptx`.

**Phase 0 (reconnaissance) is closed** by [ADR 0013](docs/adr/0013-odf-output-phase-0.md). What
it established, each point with a spike under `docs/adr/spikes/spike-odf-*`:

- Pandoc writes the `.odt` and nothing touches it afterwards: a raw `{=opendocument}` block passes
  through as is; the styles a raw block cannot declare go through one extra variable in a template
  derived from Pandoc's `opendocument` one, filled by the Lua filter; arrow `draw:marker`s live in the
  `reference.odt`.
- One diagram = one `draw:g` anchored as a character. Shapes anchored one by one make the connector
  detach on open. In the group, the connector is right on open, stays attached and follows a moved
  shape (checked through the UNO API).
- `draw:connector` needs its end points and an `svg:viewBox`: a required attribute LibreOffice
  tolerates silently; the validator caught it.
- Door B (LibreOffice renders Mermaid when it opens a `.md`) will be a **LibreOffice extension**.
  LibreOffice's Markdown import drops the code-fence language, and upstream closed keeping it as
  WONTFIX (bug 172530) and prefers Mermaid kept out of core (bug 172531). The extension recognises
  Mermaid by content: `detectDiagramType()` plus a parse that must succeed.

**Decisions taken in ADR 0013** (delegated by the maintainer): a separate `renderDiagramOdf()` in
`core` rather than a format option on `renderDiagram()`; the derived template ships under BSD-3-Clause
with Pandoc's notice; the project writes its own `reference.odt`, never Pandoc's; `AGENTS.md` rules
2, 3, 7 and the security table now cover ODF (no operation on a Pandoc-written `.odt`; no macro,
script, external link, DDE or linked object; style values validated).

**Phase 1 (flowcharts to `.odt`) is done (2026-10-08).** `md2nativedocx doc.md -o doc.odt`, or
`convert(source, { format: 'odt' })`: each flowchart becomes one group of native LibreOffice shapes
with connectors bound to them (`renderDiagramOdf()` in `core`); every other type becomes a note and a
warning. Pandoc writes the package with two project files (`packages/cli/assets/`, built by
`scripts/build-odt-assets.mjs`): a `reference.odt` written by the project (a minimal one is not
enough: LibreOffice does not supply its built-in look for a style a document cites without defining
it) and Pandoc 3.1.3's `opendocument` template plus one loop (BSD-3, `THIRD_PARTY_NOTICES.md`). End
criterion checked without a human: renders, `odfvalidator` zero errors, and through UNO
(`scripts/odf-connector-check.py`) 221 connectors in the 32 flowcharts of the corpus attached on open
and following a moved shape. Open points of phase 1 and what comes next: `TODO.md` §0 (edge-label
placement, narrow preset text areas, no page options for `.odt`; then phase 2 measurement, the `.odt`
export in the VS Code extension, door B). Released in extension 0.8.0; on npm once 0.2.0 is published (Versions above).

**Hold until there is something to show:** a comment on LibreOffice bug 172531 presenting the
extension. Public communication; the maintainer agreed to wait for a first working version.

V2 work comes second: only the tasks marked ▶ in `TODO.md` §2bis continue (they serve ODF too, or
close an open security risk); the ones marked ⏸ waited for the end of ODF phase 1, which is now
reached: their order against ODF phase 2 is to be decided.

## What changed since the last handover (2026-10-06 → 08)

- **2026-10-07, V2 extraction:** ADR 0012 accepted, `AGENTS.md` rule 7 reworded as an allowlist,
  DCO adopted; `renderDiagram()` (the bridge became a ~100-line adapter, byte-identical on 255 corpus
  sources × 5 configurations), `convert()`, size limits, the MCP server, pptx rendering in process;
  CI runs pptx tests on Windows/macOS and a DCO check; first npm publication.
- **2026-10-08, ODF phase 0:** spec [`05-libreoffice-odf-spec.md`](docs/specs/05-libreoffice-odf-spec.md),
  spikes S0-S5, ADR 0013, `AGENTS.md` extended to ODF.
- **2026-10-08, tooling:** `npm run test:odf-validate` (ODF Toolkit `odfvalidator` 0.13.0, Apache-2.0,
  jar pinned by SHA-256, zero errors required, runs in CI); LibreOffice 26.2.6 pinned next to the apt
  one as `soffice-26.2` (`scripts/install-libreoffice-pinned.sh`, called by `.devcontainer/setup.sh`
  and the `visual` CI job, which also re-runs the Markdown import check). The apt LibreOffice stays
  the visual-test renderer, so baselines did not move. 26.8 from 26.8.2 on (26.8.0 behaves the same
  on the S3 test).
- **2026-10-08, ODF phase 1** (above). Found on the way and fixed: nine visual fixtures without a
  trailing newline had never been converted (their baselines showed raw Mermaid text; 11 baselines
  replaced after review); a subgraph listing its own id crashed Dagre for both formats; the CLI's
  path check refused every relative path on Windows.
- **2026-10-08, `reference.docx` rewritten from scratch** (maintainer's licence decision): hand-written
  parts in `packages/cli/reference-docx-src/`, assembled by `scripts/build-reference-docx.mjs`.
  Pixel-identical render, no external relationship (the old one had an unused `http://example.com`),
  no schema error of its own. The table header colour patch now writes `w:shd` in schema order.

## Health (2026-10-08)

- Tests: core 797, cli 150, vscode-extension 73, pptx 26, pandoc-filter 15, mcp 7, all green.
  Typecheck and lint clean. CI green on Linux, macOS and Windows.
- `test:visual` 100/100 (68 `.docx`/`.pptx`, 32 `.odt`). `test:oxml-validate`: 0 schema errors under
  `word/diagrams/`; the rest from Pandoc's own `.docx` writer. `test:odf-validate`: three documents,
  two written by the CLI, zero errors.
- The `visual` CI job runs weekly (Monday cron), on `release/**` pushes and on demand (Actions tab;
  the Codespace token cannot dispatch it, push a `release/` branch instead). It had never run before
  2026-10-08 (no schedule trigger). First run green: 100/100 renders, `test:odf-connectors` 221
  connectors, pinned LibreOffice 26.2.6 Markdown import.
- `npm audit --omit=dev` clean; one dated audit exception (`braces`, **expires 2026-12-31**).

## Open items outside ODF

From `TODO.md` §1-§4: the Word add-in stays paused on branch `word-addin-scaffold`; demo video
postponed; the manual generator into `scripts/` (and SmartArt/charts in the manual); partly translated
extension setting descriptions; two known visual defects (`sequenceDiagram` block frame,
`crossing-stress-bipartite` connectors); the `braces` exception date; analysed SmartArt/chart tracks
and ideas not committed to.

## Conventions worth remembering

- Commit each finished unit and **push** it (a stale CI badge once came from unpushed commits).
- "Word won't open the file": run `scripts/oxml-validator` before comparing XML by hand. Same for ODF
  with `npm run test:odf-validate`: LibreOffice tolerates invalid files. PowerPoint is stricter than
  the validator: bisect with real opens there.
- Render and look at the image; unit tests on XML miss blank or broken renders.
- **LibreOffice checks need no human.** Headless `soffice`/`soffice-26.2` renders to PDF/PNG, and the
  system Python (`/usr/bin/python3`, `python3-uno`) drives LibreOffice through UNO: moving a shape and
  reading connector attachment was done that way (`docs/adr/spikes/spike-odf-connector/move-b.py`).
  Only a real mouse drag or a real Word open needs the maintainer.
- A new SmartArt mapping is done only once the maintainer has opened a `smartart-vNN-*` file in real
  Word (add a CHECKLIST round).
- Licences: check before shipping any third-party file. Pandoc's templates are GPL-2+ or BSD-3, its
  other data files (reference documents) GPL-2+ only; Word-made samples (`handmade_samples/`,
  gitignored) are read for structure only, never committed.
- Escalate before touching `packages/core`'s public API, adding a dependency, `.devcontainer/`,
  `.vscode/`, `ci.yml`, a security rule or a licence question (`AGENTS.md`).

## Where to look

| Need | File |
|---|---|
| Open work | `TODO.md` (§0 = ODF phase 1) |
| Current priority | `docs/specs/05-libreoffice-odf-spec.md`, `docs/adr/0013-odf-output-phase-0.md` |
| ODF evidence | `docs/adr/spikes/spike-odf-{connector,styles,markdown-import,validator,libreoffice-filter}/` |
| What each Mermaid type becomes | `docs/coverage.md` |
| Rules, conventions, escalation | `AGENTS.md`, `TESTING.md` |
| Product intent (French) | `docs/specs/cahier_des_charges.md` |
| What comes after V1 | `docs/specs/01-v2-engine-spec.md`, `03-v3-…`, `04-roadmap-…`, ADR 0012 |
| Decisions | `docs/adr/` (0006 SmartArt corruption, 0010 pptx, 0011 charts, 0012 evolution, 0013 ODF) |
| Bundled Word template | `packages/cli/assets/README.md`, `packages/cli/reference-docx-src/` |
| Real-Word verification log | `test-corpus/word-verification/CHECKLIST.md` |
| Closed work, incidents, old TODO | `docs/history/` |
