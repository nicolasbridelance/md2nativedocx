# Changelog

All notable changes to `md2nativedocx` are documented here. Format inspired by
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Three new Mermaid diagram types export as native, editable OOXML shapes: `quadrantChart`,
  `venn-beta` (2-3 sets, true overlapping-circle geometry), and `mindmap` (radial layout, all 6
  node shapes). No extension-side changes were needed — the same `` ```mermaid `` block detection
  and export path already worked for any diagram type, only `packages/core`'s translator gained
  the new modules. Any other still-unsupported Mermaid diagram type continues to get a clear
  in-document note instead of a silently wrong flowchart-shaped guess.

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
