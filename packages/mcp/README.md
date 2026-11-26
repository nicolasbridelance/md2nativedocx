# @md2nativedocx/mcp

MCP server (stdio) over md2nativedocx. Two tools, no document logic of its own:

| Tool | Does | Calls |
|---|---|---|
| `render_diagram` | Renders one Mermaid (or PlantUML sequence, class, state or activity) diagram; returns its kind, detected type, warnings, notes, and the XML fragment on request | `renderDiagram()` from `@md2nativedocx/core` |
| `convert_document` | Converts Markdown to a `.docx` written under the server root; returns the path and the warnings, each with its diagram number and Markdown line (`diagnostics`), and the notes that need no fix | `convert()` from `@md2nativedocx/cli` (needs Pandoc) |

```json
{ "mcpServers": { "md2nativedocx": { "command": "npx", "args": ["-y", "@md2nativedocx/mcp"] } } }
```

## From Markdown to the final `.docx`

Send the whole Markdown document to `convert_document` in one call: it writes the final `.docx`, text,
tables and editable diagrams together. `render_diagram` is for checking one diagram; its fragment is not
meant to be assembled into a document by hand.

````json
{ "markdown": "# Release report\n\n```mermaid\nflowchart LR\n  A --> B\n```\n...", "outputPath": "report.docx" }
````

The reply names the file and every warning, as lines and as data, then the notes:

```json
{
  "outputPath": "/work/report.docx",
  "bytes": 13327,
  "warnings": ["warning: diagram 2, line 9: Unsupported line ignored: Order ~~> Foo"],
  "diagnostics": [
    { "message": "Unsupported line ignored: Order ~~> Foo", "diagram": 2, "language": "mermaid", "line": 9 }
  ],
  "notes": [
    { "message": "Native shapes used (diagram shape not recognized by SmartArt export).", "diagram": 3, "language": "mermaid", "line": 21 }
  ]
}
```

`diagram` counts the ` ```mermaid ` / ` ```plantuml ` blocks from 1, `line` is that block's opening fence in
the Markdown (left out when it cannot be found for certain). To fix a warning, correct that block and call
`convert_document` again with the whole document and a new `outputPath`, since an existing file is never
overwritten. `notes` need no fix: they say why a correct diagram (here a flowchart with a loop) was drawn
as editable shapes rather than SmartArt. Leave those blocks as they are.

## Guardrails

- **Deadline.** Every call runs in a child process, killed with everything it started (Pandoc, the diagram
  bridge) when the deadline passes: the tool then fails with `JobTimeoutError` and the server keeps serving.
  Defaults: 30 s for `render_diagram`, 120 s for `convert_document`.
- **Size.** Diagrams over 500 nodes or 800 edges, or 1 000 000 characters, fail with `DiagramTooLargeError`;
  Markdown is capped at 5 000 000 characters.
- **Files.** `convert_document` writes only `.docx` files inside the root, refuses `..`, absolute paths and
  symlinked directories that leave it, and never overwrites an existing file.

| Variable | Default |
|---|---|
| `MD2NATIVEDOCX_MCP_ROOT` | current directory |
| `MD2NATIVEDOCX_MCP_RENDER_TIMEOUT_MS` | `30000` |
| `MD2NATIVEDOCX_MCP_CONVERT_TIMEOUT_MS` | `120000` |

## Images are not read

`convert_document` always runs Pandoc in its sandbox mode (`convert()`'s `sandbox` option): Pandoc reads no
image, local file, URL or network share named in the Markdown, so a request cannot copy a file of the
machine into the document, make the server fetch a URL, or leak the Windows user's NTLM hash through a
`\\server\share` path. Images are left out of the `.docx`, each with a warning in the result. A request
cannot turn this off.
