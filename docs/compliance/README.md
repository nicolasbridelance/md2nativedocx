# Compliance & trust

`md2nativedocx` is meant to be approved and installed inside organizations, not only tried once on an
isolated machine. This page sends each person in an approval process to the information they need,
sourced and current, without reading the whole repository.

## The problem this tool solves

A Mermaid diagram is unreadable for most non-technical reviewers: it is structured text, not a document.
A Word report written by an AI sentence by sentence is verbose, slow to produce and costly to proofread.
Between the two there was no lossless bridge: either you kept the technical Markdown/Mermaid, or you froze
it into a PNG inside a Word document, a one-way trip.

`md2nativedocx` is that bridge. An AI (or a developer) writes Markdown and Mermaid, the dense, versionable
format an LLM is most reliable in, and the tool produces a real `.docx` whose diagrams are native Word
shapes, SmartArt and charts that any reviewer opens and edits in Word without installing or learning
anything. It also writes `.odt` for LibreOffice and `.pptx` decks from the same input.

## Who are you?

| You are... | What you care about | Document |
|---|---|---|
| **Legal / procurement** | Code license, third-party licenses per distribution channel, Pandoc (GPL) handling, data flows, telemetry | [`legal.md`](legal.md) |
| **IT / security / CISO** | Footprint and cost, risk analysis, what CI checks, how releases are built, what is not covered yet | [`it-security.md`](it-security.md) |
| **Business / non-technical** | What it does for me and how to use it, without reading code | [`non-technical-guide.md`](non-technical-guide.md) |

## Ways to get it

| Channel | What it is | Runs where |
|---|---|---|
| [Browser converter](https://nicolasbridelance.github.io/md2nativedocx/) | A static web page on GitHub Pages | Entirely in the visitor's browser; nothing is sent to a server |
| VS Code extension | VS Code Marketplace and Open VSX | The user's machine |
| `@md2nativedocx/cli` | Command-line tool on npm | The user's machine or a CI runner |
| `@md2nativedocx/mcp` | MCP server for AI assistants, over stdio | The user's machine, started by the assistant |
| `@md2nativedocx/core`, `pandoc-filter`, `pptx` | Libraries on npm | Inside the integrator's own program |

## At a glance

The badges at the top of the [`README`](../../README.md) show the live state of the latest CI run on
`main`. Figures below marked with a date are a snapshot; the CI reports described in
[`it-security.md`](it-security.md) give them for any commit.

| | |
|---|---|
| Code license | **CC0 1.0 Universal** (public domain), every package |
| Third-party code shipped | MIT only in the extension, the CLI and the browser page; MIT, ISC and BSD in the MCP server (see [`legal.md`](legal.md)). No copyleft library |
| External program used | Pandoc (GPL-2.0-or-later): run as a separate program, never linked; the browser page hosts its official `pandoc.wasm` with its source |
| Automated tests | 1,276 on 2026-11-20 (commit `605b50f`), on Linux, Windows and macOS; property-based tests on the input boundary |
| Output validation | Every CI run checks generated `.docx` against Microsoft's Open XML schema and `.odt` against the ODF schema |
| Static analysis (SAST) | CodeQL on every push and PR, and weekly |
| Secret scanning | gitleaks on every push and PR |
| Known vulnerabilities | `npm audit` on every push and PR; shipped dependencies: no exception allowed |
| Dependency updates | Dependabot, weekly (npm and GitHub Actions) |
| npm releases | Built and published by GitHub Actions with npm trusted publishing (no long-lived token) and provenance |
| Telemetry, analytics | **None** in any channel |

Where each figure comes from, and how to check it for a given date or commit:
[`it-security.md`](it-security.md) → *Dated reports*. The eight test chapters are described in
[`TESTING.md`](../../TESTING.md); the complete risk table is in [`AGENTS.md`](../../AGENTS.md) →
*Security requirements*.
