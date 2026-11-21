# Changelog

All notable changes to `md2nativedocx` are documented here. Format inspired by
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **`md2nativedocx.sandbox.enabled`** (default off, also in the settings panel under *Advanced*): for Markdown
  you did not write. Pandoc then reads no image, local file, URL or network share the document names, so a
  received document cannot copy one of your files into the export, fetch a web address or send your Windows
  identity to a `\\server\share` path. Images are left out, each with a warning. Turned on at any level
  (user, workspace, folder), it stays on: a repository's `.vscode/settings.json` cannot turn it off.

### Changed
- **Sequence diagrams draw each participant as its UML symbol**, as Mermaid does: a stick figure for an actor,
  the boundary, control and entity circles, a database cylinder, stacked boxes for `collections` and a lying
  cylinder for `queue` (Mermaid `participant X@{ "type": "database" }`, PlantUML `database X`, ZenUML
  `@Database X`). They used to be plain boxes, with a warning.
- **Sequence diagram `box` groups are drawn**: a band behind the grouped participants with its title on top,
  tinted when a colour is given (Mermaid `box Purple Team`, `box rgb(33,66,99)`; PlantUML `box "Team" #LightBlue`
  ... `end box`), outlined otherwise. They used to be ignored, with a warning.
- **Central connections** (Mermaid `A->>()B`, `A()->>B`) are drawn as a dot on the lifeline at the marked end,
  as in Mermaid, instead of being ignored with a warning.
- **ER diagram groups and colours.** `subgraph` groups are drawn as titled boxes, nested, laid out like
  flowchart subgraphs (a group keeps its own `direction` unless a relationship crosses its border, as in
  Mermaid); a relationship can join two groups. `style`, `classDef` (through `:::` or `class`) and
  `classDef default` colour entities and groups. Both used to be ignored, with a warning.
- **Gantt charts: the whole time axis.** Dates are computed as Mermaid computes them (checked against its 11
  official examples): `after`/`until` may name a task declared further down, durations in `ms`, `s`, `m`
  (minutes) as well as hours to years, `dateFormat X`/`x` (Unix time), `includes`, `weekend friday`,
  `inclusiveEndDates`. The axis runs from minutes to centuries, with ticks chosen for the span, `axisFormat`,
  `tickInterval` and `weekday` applied, and a long plan fitted to the page instead of shrunk to unreadable.
  Excluded days are shaded; a milestone sits on the middle of its span; `vert` draws a dated vertical line.
  These used to be ignored or to drop the task, with a warning. An invalid duration now gives a task with no
  duration (as in Mermaid) instead of dropping it.
- **Mind maps: Markdown labels.** Every label is read as Markdown, as Mermaid reads it: bold, italic, `<br/>`,
  and a quoted label may run over several lines (the official example with a three-line root used to lose two
  of its nodes). A long label wraps instead of widening its node. In the radial (shapes) layout, a circle,
  cloud, bang or hexagon is now sized to the text area of its shape: a root circle or a bang used to cut its
  text. `::icon(…)` and `:::classes` stay undrawn, with a clearer warning that names the node.

### Fixed
- The extension package now carries the license notices of all the third-party code inside it (layout,
  zip and XML libraries, the Open XML SDK of the Word compatibility check) in `dist/licenses/`; before, only
  `adm-zip` was named.

## [0.13.0] — 2026-11-20

### Added
- **Railroad diagrams** (Mermaid `railroad-ebnf-beta`, `railroad-abnf-beta`, `railroad-peg-beta` and the
  function form) become editable Word diagrams: one track per rule, with sequences, choices, optional and
  repeated parts.
- **Mermaid `agentflow-beta` and `usecase-beta`** are drawn instead of a "not converted" note, through the
  flowchart engine (layout, SmartArt for a plain chain, `.pptx` and `.odt` too). Use case actors are drawn as a
  stick figure.
- UML arrow ends: class diagrams now draw the **hollow triangle** of inheritance and realization and the
  **hollow diamond** of aggregation; use case generalization and realization get the hollow triangle too
  (a plain arrow in `.odt`, with a warning).

### Fixed
- **Text placed where it belongs in real Word.** Word shrinks some text boxes to their text, so centred titles
  (pie, quadrant, sequence), participant names, Venn labels, quadrant axes, edge labels and mindmap nodes drifted
  sideways, and Ishikawa boxes shrank. They now stay where they are drawn, as in LibreOffice.
- Sequence diagrams: a `;` ends a statement, as in Mermaid (no more phantom `A;` participant); `alt`/`else`
  guards and block tags are no longer hidden behind activation bars.
- A Mermaid YAML frontmatter (`---` block: `title:`, `config:`...) is read for every diagram type instead of
  being reported as unsupported lines; `title:` becomes the diagram's title.
- Flowcharts: edge ids (`A e1@--> B`) and their `e1@{ ... }` statements, quoted labels spanning several lines,
  and interactive directives no longer break the diagram.
- Use case actors and their connectors render correctly in LibreOffice (`.docx`).
- Word template: `Caption` and `TOC Heading` appear in Word's style gallery.

## [0.12.1] — 2026-11-19

### Fixed
- Command line: an output with an unsupported extension (`-o report.pdf`) is refused before converting; it
  used to write a Word file under that name and report success.
- Command line: an output that names the input file itself is refused, however the path is written.
- A Word template set in the settings that no longer exists is now reported as a warning (the bundled
  template is used, as before), instead of being skipped silently.
- If the `.log` next to the document cannot be written, the export no longer reports a failure: the
  document is kept and the problem is reported.

### Added
- Command line (`@md2nativedocx/cli` 0.6.1): `--reference-doc <file>` (fails if the file is missing), `--toc`
  and `--version`; the help and the README document the exit codes for scripts and CI.

## [0.12.0] — 2026-11-19

### Added
- **PlantUML activity diagrams become editable Word flowcharts**, in `.docx`, `.pptx` and `.odt` (LibreOffice).
  Actions, start and stop, `if` / `elseif` / `else` and `switch` with their branch labels, `while` and `repeat`
  loops, `fork`, arrow labels, swimlanes and partitions (drawn as frames). A straight sequence of actions
  becomes a SmartArt process. Every example of the official reference page (plantuml.com/activity-diagram-beta)
  converts; notes and fork bars are not drawn yet (a warning says so). A `[[link]]` keeps only its text and an
  `<img:...>` is dropped: nothing is ever fetched or linked.

## [0.11.0] — 2026-11-19

### Added
- **PlantUML state diagrams become editable Word diagrams.** Start and end points, transitions with their
  labels, choice, fork and join, history states. A state's description lines (`State : text`) are drawn
  inside its box, under the name. A plain chain or loop of states becomes SmartArt, like a Mermaid one. Every
  example of the official reference page (plantuml.com/state-diagram) converts; composite states are
  flattened and notes are not drawn yet (a warning says so).

### Fixed
- State diagrams (Mermaid too): a transition from a state to itself is drawn as a loop beside the state; it
  used to be invisible, with its label written over the box.
- State diagrams: the labels of two transitions leaving the same state no longer overlap.

## [0.10.0] — 2026-11-19

### Added
- **PlantUML class diagrams become editable Word diagrams.** A ```` ```plantuml ```` block holding a class
  diagram is drawn like a Mermaid one: boxes with their attributes and methods, inheritance, realization,
  composition, aggregation, association and dependency arrows, labels. An inheritance-only tree becomes a
  SmartArt hierarchy. Every example of the official reference page (plantuml.com/class-diagram) converts;
  cardinalities, stereotypes, notes and package frames are not drawn yet (a warning says so).

### Fixed
- **A diagram element named `constructor`, `valueOf`, `toString` or `__proto__` no longer breaks the export.**
  In class, ER, state, requirement, C4 and architecture diagrams, such a name made the whole conversion fail
  (or drew the box in the wrong place).
- Class diagrams with many unrelated classes are laid out in a grid instead of one long, unreadable row.

## [0.9.1] — 2026-11-19

### Improved
- **PlantUML sequence diagrams: every example of the official reference page now converts.** The 89 examples
  of plantuml.com/sequence-diagram were run through the converter; 17 lost a line, none does now. New:
  `autoactivate on`, `partition`, multi-line participant names, `A -> "Long name" as B`, a colour after the
  receiver (`B #red : text`), `note left A` without `of`. Slanted arrows (`->(10)`), parallel `&` messages and
  `{anchor}` prefixes are drawn in a simpler form, with a warning; `<style>` blocks are skipped.

## [0.9.0] — 2026-11-18

### Added
- **PlantUML sequence diagrams become editable Word shapes.** A ```` ```plantuml ```` or ```` ```puml ```` block
  (with or without `@startuml` / `@enduml`) holding a sequence diagram is drawn like a Mermaid one: participants,
  arrows, activations, notes, `alt` / `loop` / `par` / `group` frames, `autonumber`. It works in `.docx` and
  `.pptx`, with the CodeLens, the hover and "Export this diagram" above the block. Other PlantUML diagram types
  (class, activity, state…) get a note in the document and a warning. `!include` is never followed.

## [0.8.3] — 2026-11-18

### Fixed
- **A labelled arrow no longer cuts a white notch out of the box it points to.** A label wider than the gap between
  two columns of boxes overhung the box at the arrow's end (seen in PowerPoint, also present in Word). The layout
  now makes room for each label.
- Sequence diagrams: a `loop` / `alt` / `opt` frame now widens to hold the text of a message a participant sends to
  itself, and the second line of a two-line message is no longer cut off at the bottom.
- SmartArt arrows (process, cycle, timeline axis) turned black when you picked another palette or style in Word's
  SmartArt Design tab. They now follow the chosen colours, like Word's own SmartArt.

### Changed
- When a flowchart cannot become SmartArt (a merge, a self-loop, a nested subgraph…), the reason is now a warning
  in the export log ("View warnings"), no longer an English sentence written under the diagram in the document,
  where every reader saw it.
- Every setting is now described in French, German, Spanish, Russian and Chinese (43 descriptions were still shown
  in English: page layout, typography, table of contents, mirrors for locked-down networks).
- The README warns that Pandoc reads images on network shares (`\\server\share`) and URLs: avoid exporting
  Markdown you do not trust on a machine where that matters.

## [0.8.2] — 2026-11-16

### Added
- **A `direction` inside a `subgraph` is now applied** (flowcharts): the subgraph is laid out in its own direction, then
  placed as one block in the diagram. Like Mermaid, it is ignored, with a warning, when a node inside is linked to
  a node outside.
- A flowchart node's `color:` in `classDef` / `style` now sets its text colour (Word and LibreOffice).
- A warning (export log) when a flowchart is scaled down until its text is under 7 pt, with a suggestion.

### Fixed
- **Nested subgraphs keep their nesting.** A subgraph listed before the one it contains used to come out squashed
  (zero width) or with its levels stacked side by side instead of inside each other.
- Subgraph titles no longer touch or get cut by the box border on diagrams shown at full size (10 pt, was 12 pt).
- Text coming from a diagram can no longer break the file: characters that XML forbids are replaced, in the
  diagrams and in chart parts. SmartArt and chart markers are only accepted in the exact form this tool writes.
- Exports now stop after 10 minutes (`MD2NATIVEDOCX_TIMEOUT_MS`) instead of waiting forever on a stuck Pandoc, and
  a very dense diagram is refused up front with a clear message instead of freezing the editor.
- Word compatibility check: the error classification is the same in the export log and in CI.

## [0.8.1] — 2026-11-13

### Fixed
- **An export no longer overwrites a `.docx` that is open in Word.** If Word holds the file (or it cannot be
  written), the export stops before writing anything, leaves the existing file untouched and offers
  "Export as…". The result is otherwise written to a temporary file and swapped in, so a failed export never
  leaves a truncated document.
- The unsaved edits of the document are saved before an export, so the result matches what the editor shows.
- A ```` ```mermaid ```` block that is never closed is now flagged (editor warning with a quick fix, and in the
  export log). Before, everything from that block on was exported as plain text without any notice.
- The Word compatibility check in the export log now says what it validated, part by part (your diagrams and
  charts / the rest of the document, written by Pandoc), and also covers the diagrams drawn directly in the
  document body, which it used to skip. It no longer claims that remaining notes have no effect on Word.

## [0.8.0] — 2026-10-08

### Added
- **Export to LibreOffice (.odt)**, for a document or a single diagram (md2nativedocx menu, command
  palette): flowcharts become native LibreOffice shapes, with connectors attached to them that follow
  a moved box, subgraphs as containers, `classDef`/`style`/`linkStyle` colours kept. Other diagram types
  become a note for now. Uses Pandoc like the Word export, with a page and styles written by the project.

### Changed
- The Word template bundled with the extension is now written by the project itself (it was derived from
  Pandoc's own); documents look the same.

### Fixed
- A diagram whose subgraph listed its own name as a member was left as raw Mermaid text.

## [0.7.0] — 2026-10-06

### Added
- More diagrams become SmartArt (each one confirmed in real Word): a `timeline` becomes a SmartArt time
  line (one bar per section when it has sections), a `journey` a grouped time line, a `kanban` board a
  grouped list, and simple `gitGraph` (one branch), `stateDiagram` (a chain or a loop) and
  `classDiagram` (inheritance only) a process, cycle or hierarchy.
- Each flowchart node keeps its Mermaid shape inside SmartArt (diamond, circle, cylinder, hexagon…), as
  Word's own *Change Shape* writes it; *Reset Shape* goes back to the layout's box.
- Line breaks (`<br/>`) and bold/italic Markdown strings are kept in SmartArt boxes.

### Changed
- The Marketplace description and README lead with the complete Markdown-to-Word conversion (headings,
  tables, footnotes, math, table of contents), diagrams being what sets it apart.
- Smaller README images.

### Fixed
- A word could break mid-letter inside a diamond-shaped SmartArt box.

### Removed
- Setting `md2nativedocx.smartArt.preRenderedDrawing`: the pre-rendered SmartArt drawing is always
  embedded (it is what makes Word and other viewers show the same layout).

## [0.6.0] — 2026-10-06

### Changed
- **PowerPoint from the extension.** "Export to PowerPoint" (one slide per diagram) sits next to "Export to
  Word" everywhere. New setting `md2nativedocx.pptx.showSource` puts each diagram's Mermaid source beside it.
- **Clearer CodeLenses.** One line at the top of the file for the whole document — Export to Word · Export
  to PowerPoint · Settings — instead of a whole-document "Export to Word" repeated above every diagram.
  Above each diagram, **Export this diagram…** (Word or a one-slide deck) replaces "Export this block only".
- **Right-click menu** is now an `md2nativedocx` submenu (Explorer, editor, tab bar): Export to Word, Export
  to PowerPoint, and — with the cursor inside a diagram — Export this diagram to Word / PowerPoint.
  Several files selected in the Explorer are exported in one go.
- **Settings in sections** (Output · Diagrams · Page layout · Typography · Document structure · Advanced), in
  the Settings UI and in the side panel. The panel gains **Diagrams** (SmartArt on/look/drawing, Word charts,
  PowerPoint source) and **Output** (output folder, company template), and now follows VS Code's language
  (it was French only). Corporate download mirrors for Pandoc/.NET moved under Advanced.
- **New defaults: SmartArt on, native Word charts on** (`pie`, `xychart`, `radar`) — all confirmed in real Word.
  A value you set explicitly is kept.
- Marketplace title: "md2nativedocx — Markdown to Word with editable diagrams (+ PowerPoint)".
- **Know before you export.** Above each diagram, the CodeLens now says what it will become in Word —
  "SmartArt — hierarchy, 3 levels", "Word chart", "Word shapes (no SmartArt: branches merge again at B, C)" —
  and, when a setting would change that ("SmartArt possible"), clicking it turns the setting on. Hover the
  ```` ```mermaid ```` line for the details (what you can do with it in Word, what is not kept). The status bar
  tooltip tallies the document's diagrams. Same rules as the exporter (the core's `planRendering`).
- Listing and READMEs now say what the name means: `md2nativedocx` converts **Markdown** to a complete Word
  `.docx` (the `md` is the input format, not Mermaid) and "native" describes the Word output (OOXML shapes,
  SmartArt, charts with an embedded workbook), Mermaid diagrams included. README openings now lead with what the
  reader of the document gains (diagrams they can edit in Word). Title: "md2nativedocx — Markdown to Word
  with editable diagrams"; the "mermaid to word / docx" search keywords stay.

### Added
- SmartArt trees with grandchildren (up to 10 levels, any width, all four directions) are now real SmartArt
  instead of falling back to native shapes; each subtree gets room in proportion to its leaves. A wide
  top-down tree switches to an org-chart layout (leaves in a column under their parent) to stay readable.
- With SmartArt on, `mindmap` (left to right) and single-root `treeView-beta` (top-down) diagrams become
  SmartArt hierarchies too. The SmartArt setting's description no longer calls it experimental.
- New settings `md2nativedocx.smartArt.style` (`simple` | `colorful` — default | `intense`) and
  `md2nativedocx.smartArt.preRenderedDrawing` (default on) for SmartArt diagrams: a different theme
  accent per shape, optionally the theme's gradient + drop shadow, and the cached drawing Word itself
  stores so Word and LibreOffice show the same shapes. They stay real, restylable SmartArt.
- New setting `md2nativedocx.nativeCharts.enabled` (off by default): a Mermaid `pie`, `xychart` or
  `radar` becomes a native Word chart with an embedded workbook — Chart Design → Edit Data changes the
  values — instead of editable shapes. A horizontal `xychart` with a line series, or a radar with fewer
  than three axes, stays shapes with a warning. Confirmed in real Word for `pie`; `xychart`/`radar` pending.

## [0.5.6] — 2026-10-05

### Changed
- Marketplace listing rewritten around what the extension actually does: the title is now
  "md2nativedocx — Mermaid to Word (.docx)", with the `Visualization` category and search keywords
  ("mermaid to word", "mermaid to docx", …), so search engines and AI summaries stop describing it as a
  generic Markdown converter.
- README: new animated demo (Mermaid source → native Word shapes), a gallery of all 29 supported
  diagram types, and a short FAQ.

## [0.5.5] — 2026-09-10

### Added
- `.qmd` (Quarto Markdown) files are now exportable everywhere `.md` already was — CodeLens,
  status bar, Command Palette, and the Explorer/editor right-click menus — since a ` ```mermaid `
  fence inside one parses exactly like it does in plain Markdown.
- Right-click **Export to Word** in the editor tab bar itself (not just inside the editor or the
  Explorer) via a new `editor/title/context` menu entry.

### Fixed
- The generated `.docx` for a `.qmd` source was misnamed (e.g. `report.qmd.docx` instead of
  `report.docx`) — the output basename only ever stripped an exact `.md` suffix.

## [0.5.4] — 2026-09-08

### Changed
- No functional/user-facing changes — release/tooling only, cut to keep the published version
  aligned with `main` after CI hardening: a macOS CI job (mirroring the Windows one added in
  0.5.3 — typecheck, the cli/core/pandoc-filter suites, and a real `.vsix` build, all now
  verified on `macos-latest`), and the packaging pipeline's own Word-compatibility-validator
  smoke test no longer depends on a local, gitignored fixture file (it generates one on the fly
  instead) — that dependency meant the packaging step could only ever succeed on a machine that
  happened to already have that file, CI included.

## [0.5.3] — 2026-09-08

### Fixed
- Every export crashed on some real Windows machines with an opaque Pandoc access violation
  ("Access violation in generated code when reading 0xffffffffffffffff") — root-caused to
  `md2nativedocx.lua` calling `os.tmpname()` for every mermaid block, which has long-standing,
  version-dependent Windows quirks and crashes outright on at least one real Pandoc build. Replaced
  with Pandoc's own `pandoc.system.with_temporary_directory`/`pandoc.path.join` primitives.
- A second, independent Windows bug, uncovered while fixing the first: the Lua filter invoked its
  Node "core bridge" as a bare `.mjs` path, which only ever worked on Unix (shebang + exec bit) —
  Windows has neither, so every diagram silently failed to render there regardless of the crash
  above. Now invoked through Node explicitly on Windows, using the editor's own bundled Node
  (`process.execPath`, threaded down via a new `MD2NATIVEDOCX_NODE_BIN` env var) rather than an
  unverified `node` on `PATH` — the same fix already applied one process up in exportService.ts for
  0.5.1, now applied one process deeper too.
- `ensurePandoc()` checked a `PATH` pandoc *before* this project's own pinned, tested build — so an
  arbitrary, unverified system pandoc (found via WinGet, Chocolatey, a prior manual install, ...)
  silently won over the build this project's own tests actually run against, and could carry its
  own unrelated bugs (confirmed by the crash above: a `PATH` pandoc 3.9.0.2 crashed where the
  pinned 3.1.3 build doesn't). Flipped: the pinned build is tried first, `PATH` is now a last
  resort only when provisioning is exhausted.
- `isBlockedByPolicy()`'s security-policy detection scanned the *whole* Pandoc-failure stderr for
  "EACCES"/"EPERM"/"1260", which could misclassify an unrelated internal failure (e.g. a transient
  antivirus file lock, already known to be retryable) as "blocked by a security policy" — a branch
  that offers no retry action at all. Scoped to the CLI's own controlled failure marker first.
- Added a Windows CI job — the actual gap that let both this release's and 0.5.2's bugs ship
  undetected: nothing had ever run this project's test suite, let alone the packaged `.vsix`
  itself, on Windows before.

## [0.5.2] — 2026-09-08

### Fixed
- Every export on a plain Windows machine (no Git Bash/WSL/third-party `zip`/`unzip` installed)
  used to fail outright: the CLI shelled out to `unzip`/`zip`, absent from stock Windows, to patch
  a handful of entries inside the generated `.docx`. Since `md2nativedocx.layout.pageSize`/
  `.orientation` default to non-empty values, this ran on every export, not just customized ones.
  Replaced with `adm-zip` (pure JS, no external binary) in `postprocess.mjs`/
  `referenceDocBuilder.mjs`. Found via a from-scratch Windows diagnostic report on v0.5.1.
- The failure above was misdiagnosed by the extension as "Pandoc could not be found on this
  machine" — `runCli()` classified *any* stderr containing the substring `ENOENT` as Pandoc
  missing, even though Pandoc itself was fully provisioned and had never run yet. Tightened to key
  off the CLI's own controlled `md2nativedocx: Pandoc failed (exit ENOENT)` marker.
- A failure while building the patched reference document used to crash the CLI with a raw,
  unprefixed Node stack trace (it ran before `main()`'s own error handling existed) instead of the
  `md2nativedocx: ... failed: ...` message every other CLI error path produces.

## [0.5.1] — 2026-09-08

### Fixed
- The export CLI is now launched with the editor's own bundled Node/Electron binary
  (`process.execPath`) instead of a bare `node` resolved from the system `PATH`. On a machine with
  no Node.js installed (the norm for a non-technical corporate workstation), that spawn used to fail
  before the child process ever started — with no stderr to inspect, it surfaced as a bare,
  undiagnosable "spawn node ENOENT", even when Pandoc/.NET were correctly provisioned by 0.5.0. This
  was a separate root cause from 0.5.0's Pandoc-provisioning hardening, and could make the export
  fail outright regardless of it.

## [0.5.0] — 2026-09-07

### Added
- Hardened Pandoc/.NET auto-provisioning so the extension works natively on a locked-down corporate
  workstation with no admin rights (implements `docs/missing_pandoc_bugfix.md` V0.5.0):
  - `md2nativedocx.pandoc.downloadUrl`/`md2nativedocx.pandoc.sha256` and
    `md2nativedocx.dotnet.downloadUrl`/`md2nativedocx.dotnet.sha512` settings let IT mirror the
    binaries internally (hash still mandatory) for networks that block the default download hosts.
  - `downloadFile()` falls back from `fetch` to `curl` (reads the OS proxy + cert store) for
    corporate networks.
  - Cached binaries are re-verified (size + re-hash against the sentinel) once per session; a
    quarantined/truncated cache is wiped and re-provisioned automatically.

### Changed
- The Pandoc-missing toast now offers **Retry (automatic install)** ahead of **Install manually
  (requires admin rights)**, re-running the exact export command and re-invoking the no-elevation
  auto-provisioning.
- A new `PandocBlockedByPolicyError` distinguishes "missing" from "blocked by AppLocker/WDAC/
  SmartScreen" (exit 1260 / EACCES / EPERM), with a dedicated toast and a **Copy technical details**
  action instead of a retry.
- `PandocMissingError` now carries the real stderr as details, and the error handler logs it before
  showing the toast — no more diagnostic black hole.
- Temp-dir cleanup in `provisionForPlatform()` is now best-effort, so a transient EDR/antivirus lock
  on the freshly-extracted binary can never silently discard a provisioning that already succeeded.

## [0.4.0] — 2026-09-05

### Added
- Page/typography export customization (page format, orientation, margins, heading/body fonts,
  base font size, line spacing, justification, theme accent color, a page-numbered footer) via 12
  new `md2nativedocx.layout.*`/`md2nativedocx.typography.*` settings. Ignored (with a note) when
  `md2nativedocx.referenceDocument` points at a custom template — its own page setup wins.
- Automatic table of contents via `md2nativedocx.toc.enabled`/`md2nativedocx.toc.depth`, placed
  after the document's title and set to refresh automatically when Word opens the file. Works
  even alongside a custom `md2nativedocx.referenceDocument`.
- Colored emoji/badge rendering (✅/⚠️/❌ and others) via `md2nativedocx.emoji.forceColorFont`
  (default: on) — forces the emoji color font on pictographic characters without affecting the
  surrounding text's own font, bold, or italic. Depends on local font substitution on
  macOS/Linux/LibreOffice; turn off if it renders worse there than doing nothing.
- A dedicated Activity Bar icon opens a configuration panel exposing every page/typography/TOC/
  emoji setting above visually (page mockup preview included), grouped by topic, always in sync
  with `settings.json`. Greys out page/typography controls when a custom
  `md2nativedocx.referenceDocument` is set.
- Wide tables now get their own landscape-oriented page section instead of being squeezed into a
  portrait page.
- Three new Mermaid diagram types export as native, editable OOXML shapes: `quadrantChart`,
  `venn-beta` (2-3 sets, true overlapping-circle geometry), and `mindmap` (radial layout, all 6
  node shapes). No extension-side changes were needed — the same `` ```mermaid `` block detection
  and export path already worked for any diagram type, only `packages/core`'s translator gained
  the new modules. Any other still-unsupported Mermaid diagram type continues to get a clear
  in-document note instead of a silently wrong flowchart-shaped guess.
- Broader Mermaid flowchart syntax support: `BT`/`RL` directions, asymmetric node shapes,
  edge-length modifiers, mid-chain edge labels, the generic `@{shape: ...}` syntax, `style`/
  `linkStyle` statements, and `<br/>`/HTML entities/Markdown-string (`**bold**`, `*italic*`)
  formatting inside labels.
- Chain-shaped SmartArt diagrams now show a real connector arrow between consecutive boxes
  (previously just boxes, with no visual link between them).
- Every export is now validated against **the exact schema Word itself enforces**, using
  Microsoft's own Open XML SDK — not a guess, not a reimplementation. On by default
  (`md2nativedocx.wordCompatibilityCheck.enabled`, can be turned off); the result (a clean
  "0 errors", or exactly what and where otherwise) is written to the export's own `.log` file. The
  one-time `.NET` runtime download this needs is verified and cached the same way Pandoc already
  is.

### Fixed
- A SmartArt-eligible chain, cycle, or tree diagram could produce a `.docx` that real Word refused
  to open outright ("Word encountered an error and needs to close") even though it opened fine in
  LibreOffice — caused by an invalid `modelId` scheme in the generated diagram data. Found and
  confirmed fixed using the new Open XML SDK validation above.
- A tree-shaped SmartArt's root box could show an extra bulleted list of every child's text on top
  of the correctly-rendered child boxes below it, in real Word only (LibreOffice always rendered it
  correctly, which is why this one took longer to catch).
- Self-loop connectors (`A --> A`) rendering incorrectly.
- Arrowhead markers not shrinking along with a thin connector line's own width.
- A flowchart with clustered subgraphs could crash the layout engine in some arrangements; it now
  retries without clustering instead of failing the export.

## [0.3.0] — 2026-09-03

### Added
- A diagram with a simple chain, tree, or cycle shape now exports as a native, editable Word
  **SmartArt** graphic instead of the OOXML canvas shapes every diagram previously got — richer,
  Word-native diagram type for the cases it applies to; anything else (branches that merge,
  subgraphs, deeper structures) still falls back to the canvas shapes automatically, with a
  visible in-document note when a diagram was eligible-looking but couldn't be converted.
- `md2nativedocx.smartArt.enabled` setting (default: on) to force the canvas fallback for every
  diagram instead, e.g. for consistent shape rendering across a whole document.

### Changed
- New extension icon: a split diamond (Mermaid graph on one half, paragraph lines on the other),
  visualizing the graph → Word-text conversion the extension does.

## [0.2.0] — 2026-09-02

### Added
- Pandoc is no longer a manual prerequisite: the first export downloads Pandoc's official,
  checksum-verified binary automatically if it isn't already installed, and caches it outside the
  extension for every export after that. See README → Prerequisites and `THIRD_PARTY_NOTICES.md`.
- Full Markdown export no longer requires a Mermaid diagram: the CodeLens and the status bar item
  are now shown on any open `.md`/`.mmd` file, with or without a diagram (a document with no block
  gets a single top-of-file lens instead of the per-block pair).
- Right-click **Export to Word** in the Explorer and in the editor, on any `.md`/`.mmd` file — no
  need to open it first.
- Support for exporting a raw `.mmd` (Mermaid-only, no Markdown fencing) file directly.

### Fixed
- Marketplace README images (`demo-vscode.gif`, `demo-word.png`) resolving to broken links — the
  packaging script now passes explicit `--baseContentUrl`/`--baseImagesUrl` so relative links
  resolve into `packages/vscode-extension/` instead of the monorepo root.

### Changed
- README and Marketplace description rebalanced: led with full Markdown → `.docx` export (the
  extension's actual name/scope), with native Mermaid shapes presented as the standout feature
  rather than the whole premise.

## [0.1.0] — 2026-09-02

First functional version.

### Added
- Automatic detection of ` ```mermaid ` blocks in an open Markdown file.
- CodeLens **⚙️ Export to Word** (whole document) and **Export this block only** (a single
  diagram), above every detected block.
- Status bar item, redundant with the CodeLens, for documents containing at least one diagram.
- End-of-export notification with **Open in Word** / **Reveal in Explorer** actions.
- `md2nativedocx.outputDirectory` setting (output folder for `.docx` files, empty by default =
  same folder as the source).
- Guided 3-step Getting Started walkthrough.
- Every Mermaid diagram is translated into native OOXML shapes (`wpg:wgp`) — nodes and
  connectors stay individually selectable and editable in Word, not a flattened image.
- LaTeX math formulas (`$...$`/`$$...$$`) convert to native, editable Word equations (via
  Pandoc's own texmath support) — no code written for this, verified and locked with a
  regression test.
- UI localized into English (source language), French, Spanish, German, Russian, and Simplified
  Chinese (`vscode.l10n` for runtime strings, `package.nls.*.json` for the manifest). The
  walkthrough's in-depth pages remain English-only for now — see README.
