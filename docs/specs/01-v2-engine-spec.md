# MD2NativeDocx — V2 Engine Specification

**Status:** Draft proposal  
**Primary goal:** turn the existing conversion capabilities into a composable engine without rewriting the existing renderers.

> **Statut au 2026-10-07 : proposition intégrée à la roadmap, pas commencée.** Phase « V2 » de
> `docs/specs/cahier_des_charges.md` §11 ; tâches dans `TODO.md` §2bis. Règles d'évolution :
> `docs/adr/0012-evolution-by-extraction.md` (proposé). **Lire l'annexe A en premier** : elle relie
> chaque section de cette spec au code qui existe aujourd'hui, et signale les deux points où la spec
> contredit une règle d'`AGENTS.md` (emplacement de `convert()`, §10 ; post-traitement ZIP, §12).

## 1. Purpose

V2 does not redesign MD2NativeDocx from first principles. It extracts existing capabilities behind stable public contracts.

The target architecture is:

```text
CLI     Pandoc     SDK     MCP     other adapters
 |        |         |       |          |
 +--------+---------+-------+----------+
                    |
              Public Engine API
                    |
        +-----------+-----------+
        |                       |
 renderDiagram()             convert()
        |                       |
        +-----------+-----------+
                    |
            existing engine
```

V2 should make the current engine easy to consume without forcing callers to know internal dispatch, environment variables, OOXML fragments, Pandoc post-processing details, or package-part injection.

## 2. Core principle

> **Extract what exists; abstract only when a second implementation proves the abstraction.**

V2 is intentionally conservative. Existing Mermaid renderers, SmartArt logic, chart support and layout code remain the technical core.

## 3. Non-goals

V2 is not:

- a rewrite of the 29 Mermaid translators;
- a new layout engine;
- a universal diagram IR;
- a draw.io competitor;
- a graphical editor;
- a Visio backend;
- full PlantUML support;
- a SaaS platform;
- a repository-wide big-bang refactor.

## 4. First extraction: `renderDiagram()`

Introduce one public, typed entry point that encapsulates diagram detection, renderer selection and output packaging.

Conceptual API:

```ts
const result = renderDiagram(source, options);
```

> **Decided 2026-10-07 (maintainer):** `renderDiagram()` is **synchronous**: no step of it does I/O.
> Options as shipped in `packages/core/src/render-diagram.ts`: `smartArt`, `nativeCharts`,
> `smartArtStyle`, `smartArtDrawing`, `newPartId`, plus the canvas limits. A move to `async` later
> (a WASM Graphviz layout, for instance) would be a breaking change, acceptable before 1.0.
> `convert()` (§6) stays `async`: it runs Pandoc.

A caller must not need to know:

- the Mermaid diagram type;
- which parser is used;
- which translator is selected;
- whether the result should be native shapes, SmartArt or a native chart;
- which environment variables currently control rendering;
- how package parts are assembled.

### 4.1 Responsibility boundary

The type-specific intelligence remains where it is today.

```text
flowchart  -> flowchart implementation
sequence   -> sequence implementation
class      -> class implementation
...
SmartArt   -> SmartArt implementation
charts     -> chart implementation
```

`renderDiagram()` does not centralize or replace this intelligence. It centralizes orchestration.

### 4.2 Initial `RenderResult`

The precise contract should be derived from the existing code, but the target shape is approximately:

```ts
interface RenderResult {
  kind: "shapes" | "smartart" | "chart";
  fragment: string;
  parts?: PackagePart[];
  metadata: RenderMetadata;
}
```

Possible metadata:

```ts
interface RenderMetadata {
  sourceFormat: string;
  diagramType?: string;
  renderer?: string;
  objects?: RenderedObjectMetadata[];
  warnings?: RenderWarning[];
}
```

No field should be added merely because a future feature might use it. Metadata must either describe information already known during rendering or preserve identity/provenance that would otherwise be lost.

## 5. Stable semantic identity and provenance

Where a source object has a stable identity, the generated Office object should preserve that identity as far as practical.

Example:

```text
Mermaid node: payment
        |
        v
Office shape
semanticId = payment
```

This is not a V2 round-trip implementation. It is a constraint preventing V2 from discarding information that would make future round-trip work unnecessarily difficult.

Useful provenance may include:

```ts
{
  semanticId: "payment",
  sourceFormat: "mermaid",
  sourceType: "node",
  renderer: "flowchart",
  generationId: "..."
}
```

The storage mechanism remains an implementation decision.

## 6. Second extraction: `convert()`

Expose the complete document pipeline as a programmatic API.

Conceptual API:

```ts
const result = await convert(markdown, options);
```

The function owns the end-to-end path:

```text
Markdown
   |
Pandoc/document parsing
   |
diagram detection
   |
renderDiagram()
   |
package assembly
   |
post-processing
   |
validation
   |
DOCX Buffer
```

The target is that an OEM integration, MCP server or Node application can obtain a finished document without launching the CLI.

## 7. CLI after V2

The CLI becomes a thin adapter:

```ts
const input = readInput();
const result = await convert(input, options);
writeOutput(result.document);
```

The CLI remains responsible for:

- argument parsing;
- filesystem input/output;
- translating CLI flags into typed engine options;
- presenting errors and warnings;
- documented exit codes.

It should not contain document-rendering intelligence.

## 8. Typed configuration

Rendering behavior should no longer depend implicitly on environment variables, CLI flags or Pandoc metadata.

Define a typed engine configuration and adapt external configuration mechanisms into it.

```ts
interface EngineOptions {
  // Derived from real existing options.
}
```

Environment-variable compatibility may remain at adapter level for backwards compatibility.

## 9. Typed errors

Programmatic users must be able to distinguish failures without parsing console text.

Candidate categories:

- `UnsupportedDiagramError`
- `ParseError`
- `RenderError`
- `PackagingError`
- `ValidationError`
- `ConversionError`

The taxonomy should follow actual failure modes in the repository.

## 10. SDK surface

The public Node surface should make common usage obvious:

```ts
import { renderDiagram, convert } from "@md2nativedocx/core";
```

or from a dedicated high-level package if package boundaries make that cleaner.

A caller should not need:

- internal imports;
- direct OOXML manipulation;
- mandatory environment variables;
- CLI subprocesses.

## 11. MCP and agent integration

MCP is an adapter over the public API, not a place for document logic.

```text
LLM
 |
MCP
 +-- render_diagram -> renderDiagram()
 +-- convert_document -> convert()
```

The server should remain thin enough that it can be replaced without affecting rendering behavior.

## 12. Pandoc hardening

Because the DOCX path relies on Pandoc output details, V2 should explicitly treat Pandoc compatibility as a contract.

Recommended work:

- define and test a supported Pandoc version range;
- pin or document known-good versions for LTS/OEM scenarios;
- add CI coverage across the supported range where practical;
- replace fragile regex-based package mutations with XML parsing where this materially improves robustness;
- reuse existing XML dependencies where possible rather than adding unnecessary new dependencies.

## 13. Server/API guardrails

Once the engine is callable by servers or agents, local assumptions become security and reliability concerns.

V2 should provide or expose mechanisms for:

- source-size limits;
- node/edge count limits where appropriate;
- execution timeouts/cancellation;
- pathological-layout protection;
- ZIP/package size limits;
- deterministic resource cleanup.

## 14. Determinism

Investigate and test whether the same source and options can produce byte-identical output.

If timestamps are the only unstable component, support reproducible builds (for example through `SOURCE_DATE_EPOCH` where Pandoc permits it).

Do not claim byte determinism until it is tested end to end.

## 15. Word verification corpus

Schema validity and LibreOffice rendering are necessary but not sufficient.

Maintain a reference corpus whose cases are explicitly verified in real Microsoft Word.

For each important case, record at minimum:

- source fixture;
- expected feature behavior;
- schema-validation result;
- Word version used for verification;
- verification date;
- manual checklist/result.

This converts empirical compatibility knowledge into a reproducible project asset.

## 16. Architecture probes

### 16.1 PlantUML probe

PlantUML support is not a V2 product commitment.

Implement one deliberately narrow flowchart-like proof of concept to answer:

> What must change to route a second textual diagram language through the existing engine?

Do not invent a universal source adapter before this probe.

If Mermaid and PlantUML naturally expose a shared structure, extract it after both implementations prove it.

### 16.2 diagrams.net / draw.io probe

draw.io is a second, different probe because it carries explicit presentation information: positions, dimensions, styles and connector geometry.

The goal is to discover whether the engine naturally needs separate semantic and presentation models.

Again, no abstraction is created before the experiment demonstrates the need.

### 16.3 Visio

Visio remains out of scope for V2. It may later serve as a strong architectural test because it introduces a substantially different native target.

## 17. V3 compatibility constraints

V2 must not unnecessarily prevent future:

- stable object identity;
- provenance reconstruction;
- relationship reconstruction;
- before/after comparison;
- semantic vs presentation change classification;
- serialization of diagram state;
- multiple source languages;
- multiple human editors;
- LLM-assisted reconciliation.

This is a preservation constraint, not permission to implement V3 inside V2.

## 18. Definition of Done — V2 Core

V2 Core is complete when:

1. `renderDiagram()` is a public supported API.
2. Existing rendering behavior remains stable.
3. `RenderResult` is useful to callers without internal knowledge.
4. essential configuration is typed.
5. programmatic errors are structured.
6. `convert()` exposes the complete Markdown-to-document path.
7. the CLI consumes the public API.
8. an SDK consumer can call the engine directly.
9. MCP can be implemented as a thin adapter.
10. regression coverage protects the extraction.
11. semantic identity/provenance needed for future investigation is not unnecessarily discarded.

PlantUML, draw.io, Visio and WYSIWYG editing are not part of this Definition of Done.

---

## Appendix A — Where each section stands in the code (2026-10-07)

Written after reading the code, so that V2 starts from what exists rather than from the diagram in
§1. Paths are relative to the repository root.

| Spec section | What exists today | Gap V2 has to close |
|---|---|---|
| §4 `renderDiagram()` | **It already exists, informally**: `packages/pandoc-filter/bin/md2nativedocx-core.mjs` (555 lines of JS) runs `detectDiagramType()` then an `if / else if` over the 29 types, tries SmartArt or a native chart first, falls back to shapes, prints the fragment on stdout. The Lua filter spawns it once per diagram; `packages/pptx` spawns it too (`export-pptx.ts`, `execFile`). | Move that dispatch into `packages/core` (TypeScript), returning `RenderResult` with SmartArt/chart **parts as data** instead of files written to `MD2NATIVEDOCX_SMARTART_DIR` / `MD2NATIVEDOCX_CHART_DIR`. The `.mjs` bridge then becomes a 20-line adapter. Keeps `core` pure (no filesystem), as `AGENTS.md` requires. **Done 2026-10-07** (`95cd99b`): `packages/core/src/render-diagram.ts`; the bridge is a 117-line adapter (environment → options, parts → disk), and `packages/pptx` still spawns it. |
| §4.1 dispatch duplicated | `packages/core/src/rendering-plan.ts` (`planRendering`, used by the VS Code CodeLens/hover) **re-implements the same decision** ("will this become SmartArt, a chart or shapes?") independently of the bridge. The two can drift. | Derive `planRendering` and `renderDiagram` from one dispatch table, so "what this becomes" and what is actually produced cannot disagree. This is the "identify duplicated rendering-plan logic" item of spec 04 §2. **Done 2026-10-07**: each entry of the `RENDERERS` table carries a cheap `plan` next to its `render`, and `planRendering` only applies the settings to it; a unit test checks on every fixture that the plan matches what `renderDiagram` returns. |
| §5 identity/provenance | **Flowchart only**: each node's Mermaid id is in `wps:cNvPr/@descr`, each edge's `cNvPr/@name` is `"<from>--<to>"` (`translator/ooxml-translator.ts`, `renderNode`). The 28 other types and the SmartArt points carry no source id. | (1) `descr` is the shape's **Alt Text** in Word, read aloud by screen readers; the code comment calling it "invisible in Word" is wrong, so the storage choice must be revisited (spec 04 §5.2). (2) Extend to the other types only where the source has a stable id. (3) Whether any of it survives a Word save is unknown: that is the V3.0 spike. |
| §6 `convert()` | Spread over `packages/cli/bin/md2nativedocx.mjs` (540 lines: args, Pandoc `execFile`, scratch dirs, validator), `src/postprocess.mjs` (628: namespaces, id renumbering, SmartArt part injection), `src/chartParts.mjs`, `src/referenceDocBuilder.mjs`. | Cannot go in `core` (`AGENTS.md`: core has zero Pandoc knowledge). Options in spec 04 §5.1; recommendation: a library entry in a package that already owns Pandoc (`cli` exporting `convert`, or a new `@md2nativedocx/engine` that `cli` depends on). New package = escalation. |
| §7 thin CLI | The CLI is not thin today; the VS Code extension spawns the CLI as a subprocess (`exportService.ts`, `runCli`), which is an acceptable public boundary. | Falls out of §6. |
| §8 typed options | About **38 `MD2NATIVEDOCX_*` environment variables** are the transport between CLI, Lua filter and bridge (page, margins, fonts, SmartArt, charts, scratch dirs, binaries). `core` already has typed `TranslateOptions` / `CanvasOptions` / `RenderingSettings`. | One `EngineOptions` type; env vars parsed only at the adapter edge (CLI, Lua bridge) for backward compatibility. |
| §9 typed errors | `MermaidParseError` (core), `CliError` with `exitCode` (cli), `PptxConversionError` (pptx), five error classes in the extension. The bridge never throws on SmartArt/chart failure: it falls back and writes a warning on stderr. | Warnings become `RenderResult.metadata.warnings` instead of stderr text. Exit codes 0 / 1 / 2 exist in the CLI but are not documented anywhere. |
| §11 MCP | Only an idea in `TODO.md` §4 ("thin layer around the CLI"). | Rewritten in `TODO.md`: over the public API, after `convert()`. |
| §12 Pandoc | **One version, 3.1.3**, pinned in CI (`ci.yml`, macOS/Windows jobs), in `pandocProvisioner.ts` and as the CLI's minimum. No range is tested. `postprocess.mjs` edits `word/document.xml` **by regex**, a documented trade-off to avoid a new dependency. `fast-xml-parser` (XXE-safe wrapper in `packages/pptx/src/xml-tree.ts`) is already in the monorepo. | Testing a range touches `ci.yml` (human review). Reusing `fast-xml-parser` in `cli` adds a dependency to that package (escalation, rule 6), even if not to the repo. |
| §13 limits | Per-parser caps only (`treeView` 2,000 nodes, `sankey` 200). No source-size limit, no timeout around Dagre, no ZIP size cap. | Needed before any server/MCP use. |
| §14 determinism | ZIP written with `adm-zip` (`packages/cli/src/zipUtils.mjs`); Pandoc stamps `docProps/core.xml`; chart/SmartArt ids use `randomUUID()`. Never tested. | The random ids alone rule out byte determinism today; seedable ids + `SOURCE_DATE_EPOCH` would be the first step. |
| §15 Word corpus | **Already exists**: `test-corpus/word-verification/CHECKLIST.md`, rounds 4-20, one file per type plus the SmartArt rounds, each confirmed by the maintainer in real Word. | Record the Word version and build per round (the field exists only once in the file), and an index table fixture → feature → validator result → date. |
| §16 probes | Nothing. | After §4 and §6. |

### Two conflicts with `AGENTS.md`, to settle before coding

1. **§10 shows `import { renderDiagram, convert } from "@md2nativedocx/core"`.** `renderDiagram` fits
   in `core`; `convert` does not, because it runs Pandoc. The spec already allows "a dedicated
   high-level package"; that is the option compatible with the architecture.
2. **§6 / §12 make `convert()` own package assembly and post-processing.** `AGENTS.md` rule 7 says
   not to touch `.docx` ZIP internals; it has already been relaxed twice with the maintainer's
   sign-off (id renumbering, then SmartArt and chart part injection, see `postprocess.mjs`). V2 would
   make that relaxation permanent and public. Rewording rule 7 is a security-rule change, so it is
   the maintainer's call.
