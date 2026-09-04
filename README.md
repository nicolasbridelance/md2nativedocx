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
                                      └─►  core (per-type parser → layout → OOXML translator)
                                              │
                                              └─►  native shapes (or SmartArt) injected into the .docx
```

The architecture delegates everything that isn't a diagram (Markdown parsing, tables, styling, ZIP
manipulation) to Pandoc, and builds only the missing piece: layout + OOXML translation of a
diagram. See `docs/specs/cahier_des_charges.md` (French) for the full detail.

## Supported diagram types

**Flowchart** (`graph`/`flowchart`) is the primary, most complete target — see
`docs/markdown-mermaid-compliance-table.md` for its full syntax coverage. A chain/tree/cycle-shaped
flowchart exports as a native, editable Word **SmartArt** graphic instead of plain shapes when
possible (toggle: `md2nativedocx.smartArt.enabled`); everything else still gets individually
selectable/editable OOXML shapes with dynamic connectors.

Three more diagram types export as native OOXML shapes: **`quadrantChart`**, **`venn-beta`** (2-3
sets, true overlapping-circle geometry), and **`mindmap`** (radial layout, all 6 node shapes). Any
other Mermaid diagram type is recognized and gets a clear in-document note rather than a silently
wrong flowchart-shaped guess — see `docs/smartart-full-catalog-cross-mermaid.md` and
`docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` for the roadmap covering the rest.

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

Every ```` ```mermaid ```` block in the document is converted into a native Word drawing
(individually selectable/editable vector shapes, dynamic connectors, native text — or a SmartArt
graphic for an eligible flowchart) — see "Supported diagram types" above.

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

- `HANDOVER.md` — latest session handover note: what shipped, what's verified, what's next.
- `docs/specs/cahier_des_charges.md` (French) — the **what** and **why** (spec, phases, scope).
- `AGENTS.md` — the **how** (conventions, non-negotiable security rules).
- `docs/adr/` — architecture decisions (layout engine, Pandoc integration).
- `TESTING.md` — the seven testing chapters, what each one guarantees, where it lives.
- `docs/compliance/` — license, dependencies, IT risk analysis, non-technical guide.
- `CONTRIBUTING.md` — how to contribute.

## License

**CC0 1.0 Universal** — public domain. See `LICENSE` for the full legal text.

> Note: Pandoc (GPL-2.0-or-later) is invoked as an external subprocess — never linked into this
> codebase. In the VS Code extension, it's downloaded automatically on first export if missing
> (official, unmodified binary, verified by SHA-256 checksum, never bundled inside the `.vsix`).
> See `AGENTS.md` → Licensing.
