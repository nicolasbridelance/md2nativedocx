# @md2nativedocx/mcp

MCP server (stdio) over md2nativedocx. Two tools, no document logic of its own:

| Tool | Does | Calls |
|---|---|---|
| `render_diagram` | Renders one Mermaid (or PlantUML sequence or class) diagram; returns its kind, detected type, warnings, and the XML fragment on request | `renderDiagram()` from `@md2nativedocx/core` |
| `convert_document` | Converts Markdown to a `.docx` written under the server root; returns the path | `convert()` from `@md2nativedocx/cli` (needs Pandoc) |

```json
{ "mcpServers": { "md2nativedocx": { "command": "npx", "args": ["-y", "@md2nativedocx/mcp"] } } }
```

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
