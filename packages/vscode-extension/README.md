# md2nativedocx — Markdown → Word, done right

Exports any Markdown document into a **complete** `.docx` — text, tables, formatting, footnotes,
LaTeX math — with one standout difference: if the document contains Mermaid diagrams, those don't
get flattened into an image like everywhere else. They become real vector Word shapes
(OOXML/DrawingML): every box and every arrow stays individually selectable, movable, and editable
once the file is open in Word.

![Clicking Export to Word in VS Code, with a real export in progress and the success notification](docs/demo-vscode.gif)

![The resulting .docx: title, box and diamond shapes, and labeled arrows — every one of them an individually selectable native Word shape, not a flattened image](docs/demo-word.png)

*The second image is the generated `.docx` itself (rendered here for the screenshot; open
`docs/demo.docx` directly to see it, including moving a shape and watching its connectors follow).*

## Where it stands out

Full Markdown → `.docx` conversion (text, tables, formatting) is table stakes — several extensions
do it. Where `md2nativedocx` differs is what happens to a Mermaid diagram along the way. Checked
against the VS Code Marketplace (September 2026) — the most-installed Markdown-to-Word extensions
say so themselves, in their own documentation:

| Extension | Installs | Mermaid diagrams in the `.docx` |
|---|---|---|
| docu.md | 6,672 | High-resolution image |
| Doculate | 5,585 | Image |
| FusionSol Markdown Mermaid & DOCX | 892 | Image |
| CX Markdown to Word | 561 | PNG |
| Markdown Export Pro | 499 | SVG image |
| **md2nativedocx** | — | **Native Word shapes, individually editable** |

A sign the market already validated native editability as worth building: docu.md already turns
LaTeX formulas into editable Word equations — just never applied that idea to diagrams. That's
exactly the gap `md2nativedocx` fills.

## Usage

Works on any `.md` file — with or without a Mermaid diagram, text/tables/formatting export either
way — and on a raw `.mmd` Mermaid file too.

1. Open a `.md` or `.mmd` file, **or** just right-click one in the Explorer — no need to open it
   first.
2. Click **⚙️ Export to Word** (or **Export this block only** for a single diagram, above that
   block) — from the CodeLens, the status bar item, the right-click menu (Explorer or editor), or
   the Command Palette.
3. A notification offers to open the generated `.docx` or reveal it in the file explorer.

No configuration required before first use. The one optional setting,
`md2nativedocx.outputDirectory`, chooses where `.docx` files are written (default: the same
folder as the source).

A guided Getting Started walkthrough (Command Palette → *Get Started with md2nativedocx*) shows
the three steps in practice right after install.

## How it works

```
Markdown (text, tables, style, ```mermaid blocks, LaTeX math, ...)
   │
   └─►  Pandoc — builds the .docx (everything except diagrams)
           │
           └─►  md2nativedocx Lua filter — only for ```mermaid blocks
                   │
                   └─►  parser → layout (Dagre) → OOXML translator
                           │
                           └─►  native Word shapes injected into the .docx
```

Everything in the document (text, tables, lists, code, footnotes, LaTeX math) is delegated to
[Pandoc](https://pandoc.org) — a proven, 20-year-old solution, not reinvented here. Only Mermaid
diagrams get special handling, by a purpose-built engine: Mermaid parser → layout (Dagre, the same
principle as Mermaid's own official renderer) → OOXML/DrawingML generation, with magnetic
connectors (`stCxn`/`endCxn` — they follow the box when you move it in Word). A document with no
diagram at all still exports fully — the Lua filter simply has nothing to do.

**100% local processing**: no network calls, no content sent to any third-party service —
Pandoc and the translation engine run entirely on your machine.

**Bonus already included, no code written for it**: your LaTeX formulas (`$E=mc^2$`,
`$$\int_0^1 x^2\,dx$$`) also become native, editable Word equations — Pandoc already does this on
its own. Same philosophy as the diagrams, one level above a flattened image.

## Prerequisites

None — nothing to install first. The first time you export, if [Pandoc](https://pandoc.org) isn't
already on your machine, it's downloaded automatically (one-time, official unmodified binary,
checksum-verified) and cached for every export after that. Already have Pandoc installed? It's used
as-is and nothing is downloaded. If automatic setup ever fails (offline, unsupported platform), an
explicit error message with a manual install link is shown — no silent crash.

## What this extension doesn't do (yet)

- No shape editing inside VS Code — editing happens in Word once the `.docx` is open.
- No Word-rendering preview before export (VS Code already shows a native Mermaid preview in its
  built-in Markdown panel since 1.121).
- No batch conversion (whole folder) — one file at a time for now.

Roadmap and full positioning details: see the
[monorepo README](https://github.com/nicolasbridelance/md2nativedocx#readme).

## License

CC0 1.0 — public domain. Pandoc, downloaded automatically on first export (see Prerequisites), is
GPL-2.0-or-later and not covered by this project's license — see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
