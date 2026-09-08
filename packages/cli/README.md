# @md2nativedocx/cli

Convert Markdown containing **Mermaid** diagrams into a `.docx` with native, editable OOXML vector
shapes — not flattened PNGs. Standalone CLI counterpart to the
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

Every ` ```mermaid ` code block in the Markdown becomes a native, editable OOXML drawing — every
node and edge is an individually selectable Word shape, not an embedded image. Everything else
(headings, tables, lists, LaTeX math, ...) is handled by Pandoc as usual.

## Configuration

Page layout, typography, table of contents, and other export options are set via environment
variables (the same ones the VS Code extension's settings map to) — see
[`docs/specs/export_customization_SPEC.md`](https://github.com/nicolasbridelance/md2nativedocx/blob/main/docs/specs/export_customization_SPEC.md)
in the main repository for the full list.

## License

CC0-1.0 (public domain). See the [main repository](https://github.com/nicolasbridelance/md2nativedocx)
for compliance/licensing details, including third-party notices for Pandoc (GPL-2.0-or-later,
invoked as a separate subprocess, never bundled).
