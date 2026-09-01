# Changelog

All notable changes to `md2nativedocx` are documented here. Format inspired by
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — Unreleased

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
