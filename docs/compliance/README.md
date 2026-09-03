# Compliance & trust

`md2nativedocx` is meant to be installed at the core of enterprise IT tooling — not just used
once on an isolated machine. This page exists so that everyone involved in an approval process
finds directly the information relevant to them, sourced and current, without having to read the
whole repository.

## The problem this tool solves

A Mermaid diagram is unreadable for most non-technical reviewers — it's structured text, not a
document. A Word report written entirely by an AI, sentence by sentence, is verbose, slow to
produce, and costly to proofread — it isn't the format an AI reasons best in. Between the two,
there was no lossless bridge: either you kept the technical Markdown/Mermaid, or you froze it
into a PNG image inside a Word document — either way, a one-way trip.

`md2nativedocx` is that bridge: an AI (or a developer) writes in Markdown + Mermaid — the dense,
versionable format an LLM is most reliable in — and the tool produces a real `.docx` with native,
editable OOXML shapes that any business reviewer opens and edits in Word without installing or
learning anything. In a world where human/AI communication is becoming a permanent workflow
rather than a one-off use case, this kind of lossless bridge stops being a convenience and becomes
infrastructure.

## Who are you?

| You are... | What you care about | Document |
|---|---|---|
| **Legal / procurement** | Code license, third-party dependency audit, Pandoc (GPL) handling, absence of telemetry, data flows | [`legal.md`](legal.md) |
| **IT / security / CISO** | Risk analysis, CI pipeline (tests, SAST, secrets, dependency audit), infrastructure footprint and real cost | [`it-security.md`](it-security.md) |
| **Business / non-technical** | How this works for me, without reading a line of code | [`non-technical-guide.md`](non-technical-guide.md) |

## At a glance

The badges at the top of the [`README`](../../README.md) show the **live** state (latest CI run
on `main`) — no need to trust a number frozen on a doc page.

| | |
|---|---|
| Code license | **CC0 1.0 Universal** (public domain) |
| Runtime dependencies | 6 packages, **100% MIT** (see [`legal.md`](legal.md)) |
| External tool invoked | Pandoc (GPL-2.0-or-later), as a subprocess, never linked into the code |
| Automated tests | 214 (3 of them property-based, re-run independently in CI to cover more random cases) — see the CI badge |
| Coverage (`packages/core`) | see the latest run's dated report (below) |
| Known vulnerabilities (`npm audit`) | see the CI badge + the latest run's `npm-audit-<sha>` artifact |
| Static analysis (SAST) | CodeQL, on every push/PR + weekly |
| Secret scanning | gitleaks, on every push/PR |
| Dependency updates | Dependabot, weekly |
| Undocumented telemetry / network call | **None** — see [`legal.md`](legal.md) |

These numbers aren't a snapshot copied by hand: every CI run on `main` produces a dated summary
(Job Summary, visible in the **Actions** tab) and downloadable reports (`junit.xml`, `lcov.info`,
`npm-audit.json`, kept 90 days, tied to the exact commit) — full detail, and where each test's
source files live, in [`it-security.md`](it-security.md) → *Automated, dated reports*. See also
[`TESTING.md`](../../TESTING.md) for the six test chapters and
[`AGENTS.md`](../../AGENTS.md) → *Security requirements* for the complete risk table.
