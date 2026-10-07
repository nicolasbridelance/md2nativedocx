# @md2nativedocx/cli

Convert **Markdown to native Word (`.docx`)** — a complete document conversion (text, tables, footnotes, math)
in which every embedded **Mermaid** diagram becomes real Word objects (editable OOXML shapes, SmartArt, charts),
not flattened PNGs. (`md` = Markdown, the input; *native* describes the Word output.) Standalone CLI counterpart to the
[md2nativedocx VS Code extension](https://marketplace.visualstudio.com/items?itemName=md2nativedocx.md2nativedocx),
useful for CI pipelines, scripts, Git hooks, or any editor other than VS Code.

Full project: <https://github.com/nicolasbridelance/md2nativedocx>

## Requirements

- Node.js 18+
- [Pandoc](https://pandoc.org) 3.1.3+ on `PATH` (or point `MD2NATIVEDOCX_PANDOC_BIN` at a specific
  binary). Unlike the VS Code extension, this standalone CLI does not auto-download Pandoc for you.

## Install

```sh
npm install -g @md2nativedocx/cli
```

## Usage

```sh
md2nativedocx report.md -o report.docx
```

```
Usage: md2nativedocx <input.md> -o <output.docx> [options]

Options:
  -o, --output <file>   Output .docx path (required)
  -h, --help            Show this help
```

Every ` ```mermaid ` code block in the Markdown becomes native, editable Word objects, never an embedded
image: a SmartArt graphic when the diagram fits one (processes, cycles, org charts, mindmaps, timelines,
kanban boards…), a Word chart with editable data for `pie`, `xychart` and `radar`, and individually
selectable shapes otherwise. Everything else (headings, tables, lists, LaTeX math, ...) is handled by
Pandoc as usual. Per-type detail:
[`docs/coverage.md`](https://github.com/nicolasbridelance/md2nativedocx/blob/main/docs/coverage.md).

| Variable | Effect |
|---|---|
| `MD2NATIVEDOCX_ENABLE_SMARTART=0` | No SmartArt: every diagram as shapes |
| `MD2NATIVEDOCX_NATIVE_CHARTS=0` (or `pie,xychart`) | No Word charts (or only those types) |
| `MD2NATIVEDOCX_SMARTART_STYLE` | SmartArt look: `simple`, `subtle`, `moderate`, `intense-accent`, `colorful` (default), `colorful-moderate`, `intense` |

## Configuration

Page layout, typography, table of contents, and other export options are set via environment
variables (the same ones the VS Code extension's settings map to) — see
[`docs/specs/export_customization_SPEC.md`](https://github.com/nicolasbridelance/md2nativedocx/blob/main/docs/specs/export_customization_SPEC.md)
in the main repository for the full list.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Written. Diagram warnings, if any, are on stderr and in the `.log` next to the output. |
| `1` | No document: input file not found, Pandoc missing or failed, post-processing failed. |
| `2` | Bad command line: unknown option, missing input or `-o`, a path outside the working directory. |

## From Node: `convert()`

The same conversion as a function, for a Node application, a build script or a server, without spawning
the CLI. Pandoc must still be installed.

```js
import { writeFile } from 'node:fs/promises';
import { convert, ConversionError } from '@md2nativedocx/cli';

const { document, warnings } = await convert('# Report\n\n```mermaid\ngraph LR\n  A --> B\n```\n', {
  layout: { pageSize: 'A4', margins: 'narrow' },
  toc: true,
});
await writeFile('report.docx', document);
```

`convert()` takes Markdown text, or `{ path }` of a file, and resolves to `{ document, warnings,
pandocStderr }`; `document` is the `.docx` as a `Buffer`. It reads no environment variable: every setting
is an option (types in `src/convert.d.mts`, mirroring the variables above). A failure is a
`ConversionError` whose `stage` is `setup`, `pandoc` or `postprocess`. To render a single diagram without
Pandoc, use `renderDiagram()` from `@md2nativedocx/core`.

## License

CC0-1.0 (public domain). See the [main repository](https://github.com/nicolasbridelance/md2nativedocx)
for compliance/licensing details, including third-party notices for Pandoc (GPL-2.0-or-later,
invoked as a separate subprocess, never bundled).
