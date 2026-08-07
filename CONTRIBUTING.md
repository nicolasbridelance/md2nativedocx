# Contributing to md2nativedocx

Thanks for considering a contribution. This project is small and early-stage, so this guide is
intentionally short — it will grow as the project does.

Before anything else:
- **`cahier_des_charges.md`** explains *what* this project is and *why* it's scoped the way it is.
  Read it before proposing anything that touches architecture or scope.
- **`AGENTS.md`** defines *how* code gets written here — technical conventions, security rules, and
  the non-negotiables. It applies whether the code is written by a human or an AI coding agent.
- **`CODE_OF_CONDUCT.md`** applies to every interaction in this project's spaces.

## Before you start coding

- **Non-trivial change?** Open an issue first and describe what you want to do. This project has
  already changed its own scope and name several times during planning (see
  `cahier_des_charges.md` §14) — cheap to discuss before you write code, expensive to redo after.
- **Small fix (typo, obvious bug)?** A PR directly is fine, no issue needed.
- Check the GitHub Project board (see `AGENTS.md` "Tracking roadmap progress") for what's currently
  in scope for the active phase before picking up something further down the roadmap.

## Branching and commits

- Branch names: `feat/<short-desc>`, `fix/<short-desc>`, `security/<short-desc>`,
  `docs/<short-desc>`.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `security:`).

## Pull request checklist

Your PR description should state:
- What changed and why.
- Whether it touches any row of the Security table in `AGENTS.md` — if so, say which one and how
  it's mitigated.
- Whether it adds a new dependency, and why (see `AGENTS.md` rule 6 — default to zero new
  dependencies).
- Whether it changes `packages/core`'s public API — if so, flag it explicitly, this is a versioning
  decision (`AGENTS.md`, "Releases & versioning").

"Done" means:
- CI is green (lint, typecheck, unit + golden tests, `npm audit`, secret scan — see `AGENTS.md`
  "CI/CD").
- New behavior has a test. A PR that changes what the code does without a test that would have
  failed before the change isn't reviewable as-is.
- Public API changes have updated TSDoc comments.
- Anything touching `.devcontainer/` or `.vscode/` is called out explicitly in the PR description —
  see `AGENTS.md`'s Codespaces section for why this gets extra scrutiny.

## Review process

Right now, review is a single maintainer (Nicolas Bar Bridelance) — see `AGENTS.md` "Governance".
This will be formalized (more reviewers, clearer SLAs) if and when the project grows; no point
building that process before there's a team to run it.

## Reporting a security issue

**Don't open a public issue for a security vulnerability.** See `SECURITY.md` for the private
disclosure process.

## Questions

Use GitHub Discussions for questions and ideas, and Issues for concrete bugs or well-defined
feature proposals. If you're not sure which, Discussions is the safer default — it's easy to
convert a discussion into an issue once it's concrete, harder to do the reverse gracefully.
