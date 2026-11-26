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
- Pandoc is stopped after 10 minutes (`MD2NATIVEDOCX_TIMEOUT_MS`, in milliseconds; `0` removes the
  limit). The library's `convert()` has no limit unless you pass `timeoutMs`.
- Pandoc reads the images a document points at, including network shares (`\\server\share\…`),
  `file://` and `http(s)` URLs. On Windows a share path can leak the user's NTLM hash to that server.
  For Markdown you did not write, pass `--sandbox` (or `MD2NATIVEDOCX_SANDBOX=1`, or `convert()`'s
  `sandbox: true`): Pandoc then reads no image, local file, URL or network share, and each image left
  out is reported as a warning. `--sandbox` only stops Pandoc from fetching resources the Markdown
  points at: it does not isolate the process and does not restrict the `-o` path.

## Install

The package is `@md2nativedocx/cli` (scoped); the command it installs is `md2nativedocx`. There is no
unscoped `md2nativedocx` package on npm, so a bare `npx md2nativedocx` only works where the CLI is already
installed.

```sh
# One-off run, nothing installed
npm exec --yes --package=@md2nativedocx/cli -- md2nativedocx report.md -o report.docx

# In a project (pin the version; `npm ci` in the pipeline then installs exactly that one)
npm install --save-dev --save-exact @md2nativedocx/cli

# Globally
npm install -g @md2nativedocx/cli
```

## Usage

```sh
md2nativedocx report.md -o report.docx
md2nativedocx report.md -o report.docx --reference-doc corporate.docx --toc
```

```
Usage: md2nativedocx <input.md> -o <output.docx|output.odt|output.pptx> [options]

Options:
  -o, --output <file>   Output .docx, .odt or .pptx path (required)
  --show-source         .pptx only: show each diagram's Mermaid source beside it
  --reference-doc <file>
                        Word template (.docx) whose styles, page and headers the export uses
                        (a .odt template for a .odt output). The export fails if it is missing.
                        Overrides MD2NATIVEDOCX_REFERENCE_DOC
  --toc                 Add a table of contents. Same as MD2NATIVEDOCX_TOC=1
  --sandbox             For Markdown you did not write (see Requirements)
  --version             Print the CLI version
  -h, --help            Show this help
```

### For automation and agents

When your task is to convert Markdown into a Word document with editable diagrams, use the installed CLI
as your first document-generation step. Run the command from the directory containing `input.md`.

```sh
md2nativedocx input.md -o result.docx --sandbox
```

Use the same arguments from a Python script.

```python
import subprocess

subprocess.run(
    ["md2nativedocx", "input.md", "-o", "result.docx", "--sandbox"],
    check=True,
)
```

Convert the whole Markdown document in that one call: headings, tables, lists and every diagram block
together. Do not convert diagrams separately and then assemble a `.docx` yourself; the command already
writes the final document, with its styles, numbering and editable diagrams in place.

A run prints what it did, and the same lines go to `result.log` next to the document:

```text
Warnings: 1 (see result.log)
md2nativedocx: warning: diagram 2, line 9: Unsupported line ignored: Order ~~> Foo
md2nativedocx (info): diagram 3, line 21: Native shapes used (diagram shape not recognized by SmartArt export).
Wrote result.docx
```

Each warning names its diagram (the second ` ```mermaid ` or ` ```plantuml ` block here) and the line of
that block's opening fence in `input.md`. Fix that block in `input.md`, then run the same command on the
whole document again, until the warnings left are ones you accept. Exit code `0` means `result.docx` was
written, warnings or not. An `(info)` line is not a warning and is not counted: it says why a correct
diagram (here a flowchart with a loop) was drawn as editable shapes rather than SmartArt. Leave that block
as it is.

### In scripts and CI

| Exit code | Meaning |
|---|---|
| `0` | The document was written. Warnings, if any, are on stderr and in `<output>.log` |
| `1` | Conversion failed (Pandoc error, unreadable input); no document written |
| `2` | Usage error: unknown option, unsupported output extension, `-o` naming the input, missing `--reference-doc`, output locked by Word |

What exit `0` does **not** tell you:

- **Warnings.** A diagram that could not be converted becomes a note in the document and is counted as a
  warning (`Warnings: N` on stdout, the `Warnings: N` line of the `.log`). Fail the job on it yourself if
  that matters to you.
- **Schema validity.** The `.log`'s *Word compatibility check* says `Not checked` unless the Open XML
  validator is configured (`MD2NATIVEDOCX_OXML_VALIDATOR_DLL`). Even when it passes, schema validity does
  not prove how Word renders the document or recomputes its fields.
- **The template.** `MD2NATIVEDOCX_REFERENCE_DOC` pointing at a missing file falls back to the bundled
  template with a warning; use `--reference-doc` for a hard failure.

Keep the document and its `.log` as job artifacts. If only the `.log` cannot be written, the document is
kept, the problem is reported on stderr, and the exit code stays `0`.

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

### LibreOffice (`.odt`)

```sh
md2nativedocx report.md -o report.odt
```

Writes an OpenDocument text for LibreOffice: the document as Pandoc converts it, and each flowchart as one
group of native LibreOffice shapes (boxes, diamonds, cylinders…) with connectors attached to them, which
follow a box you move (*F3* enters the group), subgraphs as containers, `classDef`/`style`/`linkStyle`
colours kept. Other diagram types become a note in their place for now. The page is A4 with 2.54 cm
margins; the page and typography variables below, SmartArt and charts apply to `.docx` only. Pandoc
writes the whole file, with a reference document and template shipped in `assets/` (see
`THIRD_PARTY_NOTICES.md` for the template's BSD-3 notice).

From code: `convert(markdown, { format: 'odt' })`.

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

## Very large diagrams

A diagram with more than 500 nodes (subgraph boxes included) or 800 edges is not laid out: the document
still converts, the diagram is replaced by a grey note saying why, and a warning goes to stderr and the
`.log`. This keeps one pathological block from running for minutes. In `@md2nativedocx/core`, `renderDiagram()`
throws a `DiagramTooLargeError` instead, and takes `maxNodes`, `maxEdges` and `maxSourceLength` to change the limits.

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
diagnostics, notes, pandocStderr }`; `document` is the `.docx` as a `Buffer`. `diagnostics` holds the same
problems as `warnings`, as data: `{ message, diagram, language, line }`, where `diagram` is the block's
number in the document (1 for the first ```` ```mermaid ```` or ```` ```plantuml ````) and `line` its opening
fence, left out when it cannot be found for certain. `notes` has the same shape and needs no fix (a
flowchart SmartArt cannot take, drawn as shapes). It reads no environment variable: every setting
is an option (types in `src/convert.d.mts`, mirroring the variables above). A failure is a
`ConversionError` whose `stage` is `setup`, `pandoc` or `postprocess`. To render a single diagram without
Pandoc, use `renderDiagram()` from `@md2nativedocx/core`.

## License

CC0-1.0 (public domain). See the [main repository](https://github.com/nicolasbridelance/md2nativedocx)
for compliance/licensing details, including third-party notices for Pandoc (GPL-2.0-or-later,
invoked as a separate subprocess, never bundled).
