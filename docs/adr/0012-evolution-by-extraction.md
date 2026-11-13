# ADR 0012 — Evolution by Extraction

- **Statut :** **Accepté** (2026-10-07), avec deux précisions (règles 4 et 7, ci-dessous) et la
  décision sur l'emplacement de `convert()` (section « Decisions taken at acceptance »).
- **Décideur :** Nicolas Bridelance (mainteneur).
- **Specs liées :** `docs/specs/01-v2-engine-spec.md` (V2), `docs/specs/03-v3-human-editing-roundtrip-spec.md`
  (V3), `docs/specs/04-roadmap-and-open-decisions.md` (roadmap). Arrivé sous le nom
  `docs/specs/02-adr-evolution-by-extraction.md`, déplacé ici le 2026-10-07.

**Decision scope:** architecture evolution rules for MD2NativeDocx V2 and later.

> **Fit with the existing rules (2026-10-07).** This ADR is compatible with `AGENTS.md` as written:
> Rule 3 ("preserve working renderers") matches the module-per-type layout of `packages/core`, and
> Rule 5 ("keep adapters thin") is the "one core, several integration points" principle. One point
> needs care: `AGENTS.md` keeps `packages/core` free of any Pandoc knowledge, so `convert()` (spec 01
> §6) cannot live in `core`; see spec 04 §5.1 and the code map in spec 01, appendix A.

## Context

MD2NativeDocx already contains substantial working capability: Mermaid parsing, layout, multiple native Office translators, SmartArt, charts, DOCX packaging and PPTX adaptation.

The main architectural limitation is not the absence of a universal intermediate representation. It is that high-level capabilities are still reached through orchestration tied to the Pandoc/CLI execution path.

At the same time, future possibilities include:

- Node/OEM SDK use;
- MCP/agent integration;
- Quarto and other adapters;
- additional source languages such as PlantUML;
- structured editors such as diagrams.net;
- eventual round-trip and WYSIWYG workflows.

A premature attempt to model all of those futures would create speculative abstractions and force rewrites of working translators.

## Decision

MD2NativeDocx will evolve by **extraction before abstraction**.

### Rule 1 — Extract what already exists

When a capability is implemented but reachable only through a specific execution path, expose that capability behind an explicit public contract before redesigning its internals.

Examples:

- existing render dispatch -> `renderDiagram()`;
- existing CLI/Pandoc end-to-end pipeline -> `convert()`.

### Rule 2 — Abstract only when multiple real implementations prove the abstraction

Do not introduce universal diagram/source/presentation abstractions from imagined future needs.

A new abstraction should normally follow evidence from at least two real implementations.

Example:

```text
Mermaid -------\
                > observed common model -> candidate abstraction
PlantUML ------/
```

### Rule 3 — Preserve working renderers

The V2 extraction must not require rewriting the 29 Mermaid translators merely to fit a cleaner model.

Refactoring a translator is justified by:

- a bug;
- a concrete new capability;
- demonstrated duplication;
- a proven abstraction emerging from multiple implementations.

### Rule 4 — New integrations consume the public Engine API

No new integration may depend directly on:

- CLI internals;
- Pandoc-filter internals;
- environment-variable orchestration;
- private renderer modules;
- undocumented OOXML mutation paths.

New interfaces call supported high-level engine contracts.

*Clarification at acceptance (2026-10-07):* running the published CLI as a subprocess, with its
documented arguments and exit codes, **is** a public boundary. The VS Code extension does exactly
this today and complies with this rule; what is forbidden is importing CLI or filter modules that
are not exported as a library entry point, or driving them through undocumented environment
variables.

### Rule 5 — Keep adapters thin

CLI, MCP, SDK wrappers, Quarto integration, VS Code UI and future frontends should translate their own inputs/options into engine calls.

They must not become alternative homes for rendering intelligence.

### Rule 6 — Architecture probes are experiments, not promises

PlantUML and draw.io may be implemented as narrow probes specifically to discover architectural constraints.

Failure to discover a useful common abstraction is a valid result.

### Rule 7 — Preserve semantic identity and provenance where practical

Generated native Office objects should retain enough identity/provenance to support future comparison and round-trip investigation where this can be done without destabilizing current output.

This does not commit the project to implementing round-trip in V2.

*Clarification at acceptance (2026-10-07):* this rule applies only to diagram types that have a
real source id (flowchart node ids today; others when their syntax has one), and only once a storage
location has been chosen and verified in a real Word (spec 04 §5.2). The current location,
`cNvPr/@descr`, is the shape's alt text read by screen readers: it must **not** be extended to other
types in the meantime.

### Rule 8 — Do not destroy future round-trip information unnecessarily

If information about source identity, relation identity or rendering provenance already exists at render time, avoid discarding it solely because V1 does not consume it.

### Rule 9 — Mermaid is the first source language, not the final architectural boundary

Mermaid remains a first-class supported source and the current product's strongest path, but new public contracts should avoid needless assumptions that only Mermaid can ever enter the engine.

### Rule 10 — No V2 big bang

V2 should be deliverable incrementally.

Each extraction step must leave the repository in a working, testable state.

## Decisions taken at acceptance (2026-10-07)

- **`convert()` lives in `packages/cli`**, as a library entry point (an `exports` field and type
  declarations) next to the existing `bin`. No new package for now. A separate
  `@md2nativedocx/engine` package is extracted only when a second consumer (MCP server, Quarto)
  needs `convert()` without the command-line interface (rule 2). The decision is taken before the
  first npm publication on purpose: until then, naming and placing packages breaks nobody.
- **`AGENTS.md` rule 7** is reworded from a ban into an enumerated allowlist of package operations
  (Pandoc stays the author of the `.docx`), so that `convert()` owning post-processing stays
  checkable.

## Consequences

### Positive

- Current technical investment is preserved.
- New integrations can be added without copying orchestration.
- Architectural abstractions are based on evidence rather than prediction.
- The project can expose an SDK/API sooner.
- Future source languages and editors can be explored without committing to a universal model prematurely.

### Negative

- Some internal architecture remains inelegant during transition.
- DOCX/PPTX may continue sharing representation in ways that are not theoretically clean.
- Temporary adapters may exist until a second implementation proves a better abstraction.
- There is no guarantee that future probes will fit the existing model cleanly.

These costs are accepted in exchange for avoiding speculative rewrites.

## Explicitly deferred decisions

This ADR does not decide:

- a universal diagram IR;
- a universal shape/connector model;
- a presentation model;
- a Visio backend;
- a canonical multi-source format;
- a WYSIWYG framework;
- whether Mermaid remains the ultimate source of truth for every workflow.

Those decisions require empirical evidence from later implementations.
