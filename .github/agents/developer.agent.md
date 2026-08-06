---
name: "md2nativedocx Developer Agent"
description: This custom agent is the primary developer agent for the md2nativedocx project
argument-hint: "You are the primary developer agent for the md2nativedocx project. You are responsible for implementing the features and fixes described in the CAHIER_DES_CHARGES.md file see also UX_SPEC.md. You should follow the instructions in the developer agent instructions file and adhere to the non-negotiable rules, repo structure, build/test/lint commands, coding conventions, security requirements, CI/CD, licensing, and contribution workflow outlined in the developer agent instructions file. You should escalate to a human for any changes to the public API, new dependencies, exceptions to security rules, or licensing questions."
target: vscode
tools: [vscode, execute, read, agent, vscodeGeneral/rename, vscodeGeneral/usages, vscodeNotebooks/createJupyterNotebook, vscodeNotebooks/editNotebook, GitHub.vscode-pull-request-github/issue_fetch, GitHub.vscode-pull-request-github/labels_fetch, GitHub.vscode-pull-request-github/notification_fetch, GitHub.vscode-pull-request-github/doSearch, GitHub.vscode-pull-request-github/activePullRequest, GitHub.vscode-pull-request-github/pullRequestStatusChecks, GitHub.vscode-pull-request-github/openPullRequest, GitHub.vscode-pull-request-github/create_pull_request, GitHub.vscode-pull-request-github/resolveReviewThread, edit, search, web, todo]  
---
# AGENTS.md

Operating instructions for any AI coding agent (Claude Code, Cursor, Codex, or similar) working on
[`md2nativedocx`](https://github.com/nicolasbridelance/md2nativedocx).

> Written in English deliberately, even though `CAHIER_DES_CHARGES.md` is in French: this file is read by
> both the agent and any external contributor, and this project targets an international audience
> (see positioning strategy in the spec, §12). `CAHIER_DES_CHARGES.md` is the source of truth for
> **what** and **why**. This file is the source of truth for **how to work in this repo**. If they
> ever conflict, stop and ask the maintainer — don't silently pick one.

---

## Non-negotiable rules — read before writing any code

1. **Stay inside scope.** The spec (§2) explicitly delegates generic Markdown parsing, tables,
   styling, and `.docx` ZIP manipulation to Pandoc. If a task starts to look like "let's also
   handle X ourselves, it's easier," stop and flag it instead of doing it. Scope creep here is the
   single biggest risk to this project ever shipping.
2. **Escape every user-controlled string before it enters generated XML.** Node labels, edge
   labels, and subgraph titles come from untrusted Mermaid/Markdown text — including text an AI
   generated on someone else's behalf, which this project cannot assume is well-formed. Any of
   `& < > " '` in that text MUST be converted to XML entities before being written into an `<a:t>`
   run or any other XML fragment. No exceptions, no "it's probably fine for a diagram label."
3. **Never emit an external OOXML relationship.** No `TargetMode="External"`, no remote template
   reference, no URL a `.docx` produced by this project could ever be made to fetch. CVE-2022-30190
   ("Follina") showed exactly this packaging feature being used as a delivery mechanism for RCE.
   This project only emits self-contained, internal drawing XML — that's a hard constraint on the
   translator's output, not a style preference.
4. **Never build a subprocess command by string-concatenating input.** The Pandoc bridge (§5.4.a of
   the spec) must invoke Pandoc via `execFile`/`spawn` with an argument array, never via a shell
   string that interpolates a file path or diagram text.
5. **Disable DTD processing and external entity resolution on every XML parser used anywhere in
   this codebase** (tests included), full stop. This is the standard XXE mitigation and there is no
   valid reason to skip it here.
6. **Don't add a dependency without a one-line justification in the PR.** Default to zero new
   dependencies. This project's credibility rests partly on being small and auditable.
7. **Don't touch `.docx` ZIP internals directly.** That's Pandoc's job by architectural decision
   (spec §0, §5.4.a) — reimplementing it is exactly the scope creep rule 1 warns about.

---

## Repo structure (target layout — scaffold it in Phase 0 if it doesn't exist yet)

```
md2nativedocx/
├── AGENTS.md
├── CAHIER_DES_CHARGES.md
├── LICENSE                     # CC0 1.0 Universal, verbatim legal text — see Licensing section
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md           # Contributor Covenant — generate via contributor-covenant.org
├── SECURITY.md                 # vulnerability disclosure process
├── package.json                 # npm workspaces monorepo root
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       ├── ci.yml
│       └── codeql.yml
├── packages/
│   ├── core/                    # md2nativedocx-core — the moat (spec §5.1–5.3)
│   │   ├── src/
│   │   │   ├── parser/          # Mermaid text -> intermediate AST
│   │   │   ├── layout/          # AST -> coordinates (Dagre default, Graphviz optional)
│   │   │   ├── translator/      # coordinates -> OOXML/DrawingML XML string
│   │   │   └── index.ts
│   │   └── test/
│   │       ├── unit/
│   │       ├── golden/          # golden XML fixtures (spec §9)
│   │       └── fuzz/            # property-based tests on the untrusted-input boundary
│   ├── pandoc-filter/            # Lua filter, thin wrapper calling core (spec §5.4.a)
│   ├── cli/                      # `npx md2nativedocx` (spec §8)
│   └── vscode-extension/         # spec §5.4.b
└── docs/
```

`packages/core` has zero knowledge of Pandoc, VS Code, or Office.js — it's a pure function from
Mermaid text to an XML string, importable from Node and bundleable for the browser (needed for the
future Office.js add-in, spec §5.4.c). Keep it that way; it's what makes the "one core, several
integration points" architecture in the spec actually hold.

---

## Development environment — GitHub Codespaces

This repo is developed inside GitHub Codespaces. That has two consequences.

**Functional: environment provisioning.** None of this project's runtime dependencies — Pandoc, a
Lua interpreter, and LibreOffice (needed headless for the visual-regression tests in spec §9) —
ship in a default Codespaces image. Scaffold `.devcontainer/devcontainer.json` (with a
`postCreateCommand` or a Dockerfile layer) to install them explicitly, version-pinned, so every
contributor — and the agent itself — gets a working, reproducible environment on first launch
instead of manually installing them each session. Keep these versions in sync with the versions
pinned in `.github/workflows/ci.yml` — drift between "works in my Codespace" and "fails in CI"
wastes everyone's time.

**Security: `.devcontainer/` and `.vscode/` are executable, not just configuration.** Codespaces
automatically runs whatever a repository's `devcontainer.json` (`postCreateCommand`, lifecycle
hooks) and `.vscode/` config specify — including when a codespace is opened on a pull request
branch. Security research published in February 2026 (Orca Security) demonstrated exactly this
being used to exfiltrate a maintainer's GitHub token the moment they open a malicious external PR
in a Codespace to review it, and Microsoft confirmed this is by design rather than a bug to be
patched — meaning the mitigation has to be procedural, not something that gets fixed upstream. This
matters specifically for this project, which wants external contributions (CC0, spec §12).
Concretely:
- Treat any PR touching `.devcontainer/` or `.vscode/` as requiring manual diff review on
  github.com **before** ever opening that branch in a Codespace — never open an unreviewed external
  PR branch directly in a Codespace.
- The agent must never modify these paths as an incidental part of an unrelated task — any change
  here gets flagged for explicit human review (see "Escalate to a human" below), never bundled
  silently into a bigger diff.
- Repo/org settings (human-configured, not agent-executable): keep Codespaces port forwarding
  private by default, and consider requiring maintainer approval before prebuilds run on forks.

---

## Build, test, lint — expected commands

None of this exists yet, so treat this list as the contract to set up during Phase 0/1, not as
already-working commands to assume:

| Command | Purpose |
|---|---|
| `npm install` | install workspace dependencies |
| `npm run build --workspaces` | build all packages |
| `npm run typecheck` | `tsc --noEmit`, strict mode, must be clean |
| `npm run lint` | ESLint, including `eslint-plugin-security` (see Security section) |
| `npm run test --workspaces` | unit + golden-file tests (spec §9) |
| `npm run test:fuzz -w packages/core` | property-based tests on the parser/translator boundary |
| `npm run test:visual` | LibreOffice-headless render + pixel-diff regression (spec §9) |

A PR that doesn't pass all of the above (except `test:visual`, which needs a real environment and
may run only in CI) should not be described as done.

---

## Coding conventions

- TypeScript, `strict: true`. No `any` without an inline comment justifying it.
- One module = one responsibility, mirroring the §5 boundaries: parser, layout, translator stay
  independently testable and importable — never let translator logic leak into the parser or vice
  versa, even under deadline pressure.
- **File naming:** kebab-case (`ooxml-translator.ts`, `mermaid-parser.ts`), one primary exported
  concept per file, filename matches that concept.
- **Exports:** named exports only, no `export default`. Default exports are harder for an agent (or
  a human) to rename/refactor safely across a codebase because the imported name is arbitrary at
  each call site.
- **Branch naming:** `feat/<short-desc>`, `fix/<short-desc>`, `security/<short-desc>`,
  `docs/<short-desc>` — mirrors the Conventional Commits types below.
- **Errors:** typed error classes per package (e.g. `ParseError`, `TranslationError`), never a bare
  `throw new Error("...")` or a raw string. This lets the CLI map failures to specific exit codes
  and useful messages instead of a generic stack trace. Every `catch` block either re-throws,
  handles the error meaningfully, or has a comment explaining why swallowing it is safe — never a
  silent empty catch.
- **Public API of `packages/core`:** every exported function and type gets a TSDoc comment. This is
  the one part of the codebase other packages and future contributors depend on without reading the
  implementation, so it needs to be self-explanatory from its signature and docs alone.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `security:`). The `security:` prefix
  matters here specifically — it makes security-relevant history greppable later.
- Every function in `packages/core` that touches user-supplied text gets a test asserting it
  handles the injection cases in the Security section below, not just the happy path.

---

## Governance

Nicolas Bar Bridelance is the sole maintainer and has final say on architecture and scope
decisions for now. This is intentionally lightweight for a single-maintainer, early-stage project —
no RFC process, no maintainer team. Revisit this (co-maintainers, a lightweight RFC process for
breaking changes) if and when the contributor base actually grows; setting up governance machinery
before there's anyone to govern is wasted effort.

---

## Releases & versioning

- SemVer once `1.0.0` ships. Before that, breaking changes don't require a major bump — that's
  standard SemVer practice for pre-1.0 software, and this project will break its public API more
  than once before the architecture settles (see the naming/scope history already visible in
  `CAHIER_DES_CHARGES.md` §14 as a preview of how much this project's own decisions have moved).
- Conventional Commits (already required above) exist specifically so a changelog can eventually be
  generated automatically (e.g. via `changesets` or `release-please`) instead of hand-written. Pick
  a tool before the first tagged release, not before — no need to wire this up while there's
  nothing to release yet.
- Any change to `packages/core`'s exported API surface is a versioning decision, not just a code
  change — see "Escalate to a human" below.

---

## Tracking roadmap progress

`CAHIER_DES_CHARGES.md` §11 defines phases (Phase 0 spike, Phase 1 MVP, etc.) but doesn't say how
that turns into day-to-day work. Use a GitHub Project (board) with one column per phase, and link
every issue to the phase it belongs to. This makes "what's actually left in Phase 1" answerable by
looking at the board instead of re-reading the whole spec each time — useful for the maintainer, and
essential for an external contributor deciding what to pick up.

---

## Security requirements

This project accepts untrusted text and emits XML that Microsoft Word will parse and render — that
combination is exactly the shape of a document-format vulnerability class, so security isn't a
checklist tacked on at the end, it's load-bearing for the architecture itself.

| Risk | Where it applies | Required mitigation |
|---|---|---|
| XML injection via node/edge labels | Translator (§5.3) | Strict XML-escaping (`& < > " '`) of all user text before insertion into any `<a:t>` run or attribute |
| XXE (XML External Entity) | Any XML parsing anywhere in the pipeline, including tests | DTD processing and external entity resolution disabled on every parser used |
| External OOXML relationships (Follina-class, CVE-2022-30190) | Translator | Never emit `TargetMode="External"` or any remote reference — output must be fully self-contained |
| Command injection | CLI → Pandoc bridge (§5.4.a) | `execFile`/`spawn` with argument arrays only, never shell string interpolation |
| Path traversal | CLI I/O paths, VS Code extension | Resolve and validate paths against the expected root before any file operation |
| Zip bomb / decompression ratio | Out of direct scope today (delegated to Pandoc) but relevant to §2.1 (ODF contribution path) | Cap decompressed size/ratio if any contributor ever manipulates ZIP archives directly |
| Supply chain | Whole repo | `npm audit` + Dependabot/Renovate in CI; every new dependency justified in the PR (rule 6 above) |
| Secret leakage | Whole repo, public from commit #1 | Secret scanning (e.g. `gitleaks`) in pre-commit hook and CI |
| Untested untrusted input | Mermaid parser — the most exposed boundary, since input may be AI-generated on someone else's behalf | Property-based / fuzz testing (e.g. `fast-check`) specifically on this boundary, not just example-based unit tests |
| Malicious `.devcontainer/`/`.vscode/` config from an external PR | Codespaces dev environment (see dedicated section above) | Never open an unreviewed external PR branch in a Codespace; review these paths' diffs on github.com first |

---

## CI/CD (GitHub Actions)

Every PR must run, at minimum:
1. `typecheck` + `lint`
2. `test` (unit + golden)
3. `npm audit` (fail on high/critical)
4. Secret scan
5. CodeQL (GitHub's native SAST — free for public repos, and this repo is public from day one)

`test:visual` can run on a schedule or on release branches if it's too slow for every PR — flag
this trade-off explicitly in the workflow file rather than silently skipping it.

Branch protection (require CI green + at least one review before merging to `main` once external
contributors exist) is a GitHub repo setting, not something the agent can configure from inside the
codebase — note it here as a reminder for the maintainer, not as a task to execute.

---

## Licensing

- **License: CC0 1.0 Universal.** `LICENSE` at repo root must contain the verbatim legal text from
  <https://creativecommons.org/publicdomain/zero/1.0/legalcode> — copied exactly, never paraphrased
  or summarized. Use SPDX identifier `CC0-1.0` in `package.json`'s `license` field.
- **Pandoc is GPL-3.0** and is invoked as an external subprocess (installed separately by the user,
  called via CLI), not linked into this codebase. Arm's-length process invocation is generally
  understood not to impose GPL obligations on the calling program, unlike static/dynamic linking —
  this is not legal advice, and it's worth re-checking specifically if distribution ever changes to
  bundling a Pandoc binary directly inside a published package rather than requiring a separate
  install, since that would change the analysis.
- **CLA/DCO:** not required to start. If the project later wants to preserve the option to relicense
  (spec §13 flags this explicitly), the low-friction path is requiring DCO sign-off
  (`Signed-off-by:` trailer via `git commit -s`) on PRs rather than a full CLA, which tends to
  discourage casual contributors. This is a decision for the maintainer before the first external
  PR is merged — the agent should not assume either way and should flag it if it comes up.

---

## Contribution workflow

- One task = one PR, mirroring the module boundaries in spec §5.
- PR description states: what changed, why, which row of the Security table it touches (if any),
  and whether new dependencies were added and why.
- Never merge your own PR without CI green.

---

## Escalate to a human instead of deciding alone

- Any change to `packages/core`'s public API (the translator's output contract).
- Any new dependency.
- Any exception to the "no external OOXML relationships" rule — there shouldn't be one, but if a
  real use case seems to need it, that's a maintainer decision, not an agent decision.
- Any relaxation of a security lint rule or a row in the Security table above.
- Any change to `.devcontainer/` or `.vscode/` configuration files (see Codespaces section above).
- Licensing questions.