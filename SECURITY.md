# Security Policy

> For the full risk analysis (threat table, CI pipeline, footprint and cost), see
> [`docs/compliance/it-security.md`](docs/compliance/it-security.md).

## Supported versions

Pre-1.0: only the latest published version on npm/the VS Code Marketplace is supported. There is no
long-term support branch at this stage of the project.

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security vulnerability.**

Instead, use [GitHub's private vulnerability reporting](https://github.com/nicolasbridelance/md2nativedocx/security/advisories/new)
for this repository (Security tab → "Report a vulnerability"). This opens a private advisory
visible only to the maintainer until a fix is ready.

Please include:
- A description of the vulnerability and its potential impact.
- Steps to reproduce, or a minimal example input (e.g. a Mermaid snippet) that triggers it.
- Which component is affected: the core engine (`packages/core`), the Pandoc filter, the `.pptx`
  writer, the CLI, the MCP server, the VS Code extension, or the browser converter (`packages/web`).

## What counts as in scope

Given this project's specific risk profile (see `AGENTS.md`'s Security table), reports are
especially welcome on:
- Any input that causes a translator (`.docx`, `.odt` or `.pptx`) to emit unescaped user text into
  generated XML.
- Any way to make the output reference remote content: an external OOXML relationship
  (`TargetMode="External"`), or in `.odt` a macro, script, link or linked object. This should be
  structurally impossible (see `AGENTS.md` rule 3), so a working example is a genuine finding.
- Command injection via the CLI's or the MCP server's invocation of Pandoc.
- Path traversal via CLI input/output paths, the VS Code extension, or a file outside the MCP server's
  root.
- Reading a local file, fetching a URL or reaching a network share through Markdown despite sandbox mode
  (CLI `--sandbox`, always on in the MCP server).
- Making the browser converter send the visitor's text anywhere, or run a `pandoc.wasm` other than the
  pinned one.
- A downloaded binary (Pandoc, .NET runtime) run by the extension without its pinned hash matching.

## Response

This is currently a single-maintainer project — best-effort response, no formal SLA yet. That will
be revisited if the project's usage grows to a point where it matters more.
