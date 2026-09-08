# Changelog

All notable changes to `md2nativedocx` are documented here. Format inspired by
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
