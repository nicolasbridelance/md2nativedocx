# Security Policy

> Pour une analyse de risque complète (table des menaces, pipeline CI, coût/empreinte
> d'infrastructure), voir [`docs/compliance/it-security.md`](docs/compliance/it-security.md).

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
- Which component is affected: the core translator (`packages/core`), the Pandoc filter, the CLI,
  or the VS Code extension.

## What counts as in scope

Given this project's specific risk profile (see `AGENTS.md`'s Security table), reports are
especially welcome on:
- Any input that causes the translator to emit unescaped user text into generated XML.
- Any way to make the translator emit an external OOXML relationship (`TargetMode="External"`) or
  otherwise reference remote content — this should be structurally impossible (see `AGENTS.md` rule
  3), so a working example is a genuine finding.
- Command injection via the CLI's invocation of Pandoc.
- Path traversal via CLI input/output paths or the VS Code extension.

## Response

This is currently a single-maintainer project — best-effort response, no formal SLA yet. That will
be revisited if the project's usage grows to a point where it matters more.
