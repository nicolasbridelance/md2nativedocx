# md2nativedocx

[![CI](https://github.com/nicolasbridelance/md2nativedocx/actions/workflows/ci.yml/badge.svg)](https://github.com/nicolasbridelance/md2nativedocx/actions/workflows/ci.yml)
[![CodeQL](https://github.com/nicolasbridelance/md2nativedocx/actions/workflows/codeql.yml/badge.svg)](https://github.com/nicolasbridelance/md2nativedocx/actions/workflows/codeql.yml)

Convert Markdown containing **Mermaid** diagrams into a complete `.docx` with
**native, editable OOXML vector shapes** — not flattened PNGs.

> **Positioning.** Every existing tool reduces diagrams (Mermaid, Graphviz, PlantUML) to an
> embedded PNG image. The source text is sometimes kept as a fallback, never the vector structure.
> `md2nativedocx` does the opposite: every node, every edge becomes a native Word shape,
> individually selectable and editable.

> **Compliance & trust.** License, dependencies, IT risk analysis, real cost, and a jargon-free
> guide for non-technical readers — each audience finds what's relevant to them directly in
> [`docs/compliance/`](docs/compliance/README.md).

| | Embedded PNG (existing tools) | **md2nativedocx (native OOXML)** |
|---|---|---|
| Editable shapes in Word | ❌ | ✅ Every node/edge is a shape |
| Editable text | ❌ | ✅ Native labels |
| Dynamic connectors | ❌ | ✅ Magnetic connectors (`stCxn`/`endCxn`) |
| Fidelity to the Mermaid preview | ~ | ✅ Same layout engine (Dagre) |
| Dependency on external rendering | Yes (image) | No (vector) |
| LaTeX formulas as native Word equations | Varies by tool | ✅ via Pandoc, free (see §2) |

Named comparison against competing VS Code extensions (installs, rendering method verified from
their own docs): see `docs/specs/cahier_des_charges.md` §12.1 (French), or directly the
[extension's README](packages/vscode-extension/README.md).

## How it works

```
Markdown + ```mermaid  ──►  Pandoc (MD parsing, tables, styling, ZIP)
                              │
                              └─►  md2nativedocx Lua filter
                                      │
                                      └─►  core (parser → Dagre layout → OOXML translator)
                                              │
                                              └─►  native wpg:wgp fragment injected into the .docx
```

The architecture delegates everything that isn't a diagram (Markdown parsing, tables, styling, ZIP
manipulation) to Pandoc, and builds only the missing piece: layout + OOXML translation of a
diagram. See `docs/specs/cahier_des_charges.md` (French) for the full detail.

## Installation

Prerequisites: **Node.js ≥ 18**, **Pandoc** (installed separately), and a **Lua** interpreter for
the filter.

```bash
npm install
npm run build
```

## Usage (CLI)

```bash
npx md2nativedocx report.md -o report.docx
```

Every ```` ```mermaid ```` block in the document is converted into a native Word drawing group
(`wpg:wgp`): editable vector shapes, dynamic connectors, native text.

## Development

```bash
npm run build        # build all packages
npm run typecheck    # tsc --noEmit, strict
npm run lint         # ESLint + eslint-plugin-security
npm run test         # unit + golden tests
npm run test:fuzz    # property-based tests on the untrusted-input boundary
npm run test:visual  # headless LibreOffice render + pixel-diff (CI)
```

## Documentation

- `docs/specs/cahier_des_charges.md` (French) — the **what** and **why** (spec, phases, scope).
- `AGENTS.md` — the **how** (conventions, non-negotiable security rules).
- `docs/adr/` — architecture decisions (layout engine, Pandoc integration).
- `TESTING.md` — the six testing chapters, what each one guarantees, where it lives.
- `docs/compliance/` — license, dependencies, IT risk analysis, non-technical guide.
- `CONTRIBUTING.md` — how to contribute.

## License

**CC0 1.0 Universal** — public domain. See `LICENSE` for the full legal text.

> Note: Pandoc (GPL-2.0-or-later) is invoked as an external subprocess — never linked into this
> codebase. In the VS Code extension, it's downloaded automatically on first export if missing
> (official, unmodified binary, verified by SHA-256 checksum, never bundled inside the `.vsix`).
> See `AGENTS.md` → Licensing.
