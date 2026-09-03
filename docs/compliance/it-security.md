# IT / security — risk analysis, pipeline, cost

## Infrastructure footprint and cost

`md2nativedocx` has **no server component**. It's an engine that runs inside the Node.js process
of the CLI, the Pandoc filter, or the VS Code extension — on the user's machine or in CI, never
on dedicated infrastructure.

| Usual cost line | Here |
|---|---|
| Software license | $0 — CC0 (own code) + 100% MIT runtime dependencies + free GPL Pandoc (see [`legal.md`](legal.md)) |
| Server / cloud infrastructure | None — local execution only |
| SaaS subscription | None |
| Software prerequisites | Node.js ≥ 18, Pandoc, a Lua interpreter — all free, all open source |
| Hardware prerequisites | Standard workstation, no dedicated resource |
| One-time download (VS Code extension only) | Official Pandoc binary, once if absent from the machine, cached locally — order of magnitude documented in `AGENTS.md` (~140 MB per platform, the figure that justified *not* bundling it inside the `.vsix`) |

The only real deployment cost is human: initial Node.js/Pandoc installation on machines, and the
security review itself.

## Risk analysis

This project accepts untrusted text (Mermaid written by a human or an AI) and produces XML that
Microsoft Word will parse and render — that's exactly the vulnerability class document formats
fall into. The table below, kept up to date in [`AGENTS.md`](../../AGENTS.md) →
*Security requirements*, is the authoritative reference; it's reproduced here to save a round
trip:

| Risk | Where | Mitigation |
|---|---|---|
| XML injection via node/edge labels | OOXML translator | Strict XML escaping (`& < > " '`) of all user text before insertion, verified by tests + property-based fuzzing |
| XXE (XML External Entity) | Any XML parsing in the pipeline, tests included | DTD/external entity resolution disabled on every parser used |
| External OOXML relationship (Follina class, CVE-2022-30190) | Translator | Never `TargetMode="External"` nor a remote reference — output is always self-contained, verified by a dedicated property-based test |
| Command injection | CLI → Pandoc bridge | `execFile`/`spawn` with an argument array only, never shell interpolation |
| Path traversal | CLI I/O paths, VS Code extension | Paths resolved and validated before any file operation |
| Zip bomb / decompression ratio | Delegated to Pandoc today | Flagged as a watch point if a contributor ever manipulates the ZIP directly |
| Supply chain | Whole repository | `npm audit` in CI (fails on high/critical) + weekly Dependabot |
| Secret leakage | Whole repository, public since the first commit | `gitleaks` scan on every push/PR |
| Untested input | Most exposed boundary: the Mermaid parser, potentially AI-generated on someone else's behalf | Property-based tests (`fast-check`) dedicated to this boundary, not just example cases |

## What CI checks on every push/PR

Source files: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) and
[`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml).

| Check | Tool | Frequency | Blocking |
|---|---|---|---|
| Strict typecheck | `tsc --noEmit` | Every push/PR | Yes |
| Lint + security rules | ESLint + `eslint-plugin-security` | Every push/PR | Yes |
| Unit + golden tests | `node --test` | Every push/PR | Yes |
| Property-based tests (fuzzing) | `fast-check` | Every push/PR | Yes |
| Dependency audit | `npm audit --audit-level=high` | Every push/PR | Yes (high/critical) |
| Secret scanning | `gitleaks` | Every push/PR | Yes |
| Static analysis (SAST) | CodeQL | Every push/PR + weekly | Yes (alerts surfaced in the GitHub Security tab) |
| Dependency updates | Dependabot | Weekly | Non-blocking, automatic PR |
| Visual regression (real render) | Headless LibreOffice + pixel-diff | Scheduled / release branches | Non-blocking on every PR (documented as an explicit trade-off) |

Live status: the badges at the top of the [`README`](../../README.md) reflect the latest run on
`main`, not a frozen snapshot.

## Where the tests' source files live

Every test is a versioned file in the repository, not a black box:

| Package | Unit/golden tests | Property-based (fuzz) tests |
|---|---|---|
| `packages/core` (engine — parser, layout, translator) | `packages/core/test/unit/`, `packages/core/test/golden/` | `packages/core/test/fuzz/` |
| `packages/cli` | `packages/cli/test/` | — |
| `packages/pandoc-filter` | `packages/pandoc-filter/test/` | — |
| `packages/vscode-extension` | `packages/vscode-extension/test/unit/` | — |

Detail on what each chapter guarantees and where the other five live (real diagram corpus, visual
regression, native Word comparison, historical spikes): [`TESTING.md`](../../TESTING.md).

## Automated, dated reports

The numbers above aren't a one-off snapshot copied by hand: every CI run on `main` (triggered on
every push, so dated and tied to a specific commit) produces and keeps:

- **A readable summary in the Actions tab**: every run shows a "Job Summary" — test count,
  pass/fail, coverage — generated by [`scripts/ci-summary.mjs`](../../scripts/ci-summary.mjs)
  from that run's own reports, not retyped.
- **Downloadable reports (GitHub Actions artifacts, kept 90 days, one per run/commit)**:
  - `test-reports-<sha>`: a `junit.xml` per package (standard format, usable by third-party
    tooling) + `lcov.info` (coverage) for `packages/core`.
  - `npm-audit-<sha>`: the full output of `npm audit --json`, including when the audit fails —
    useful to see precisely *what* failed, not just that it did.
- **CodeQL alerts**, natively dated and tracked by GitHub in the *Security* → *Code scanning* tab.

To check the exact state as of a given date: the repository's **Actions** tab → select the run
matching that date/commit → *Summary* (inline summary) or the *Artifacts* section at the bottom
of the page (raw reports).

Reproducible locally, identically to what CI runs, with:
`npm run build && npm run typecheck && npm run lint && npm run test:ci && npm run test:fuzz
&& npm audit --audit-level=high` — `test:ci` produces the same `reports/junit.xml` (and
`lcov.info` for `core`) as the CI run, under `packages/*/reports/`.

## What CI doesn't cover yet (transparency)

- **Local pre-commit hook for secret scanning** — CI has it (gitleaks), no local hook yet
  (husky/lefthook). A secret wouldn't leave the machine before being blocked at push time, but it
  would already be in the local history.
- **CODEOWNERS / required review** — single-maintainer project at this stage (see `SECURITY.md`),
  no branch-protection rule requiring a third-party review yet.
- **Visual regression test** — requires headless LibreOffice, not run on every PR by an explicit
  speed/coverage trade-off (see the comment in `ci.yml`).

## Related documents

- [`SECURITY.md`](../../SECURITY.md) — vulnerability disclosure policy, scope.
- [`TESTING.md`](../../TESTING.md) — the six test chapters and what each guarantees.
- [`AGENTS.md`](../../AGENTS.md) → *Development environment* — the specific risk around
  Codespaces/external PRs (`.devcontainer/`/`.vscode/` executing on open) and its procedural
  mitigation.
