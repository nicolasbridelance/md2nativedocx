# Legal — licenses, dependencies, data flows

> This is not legal advice. It's a factual state of affairs, verifiable via the commands listed,
> meant to speed up a legal or procurement team's review.

## Code license

All code in this repository (`packages/cli`, `packages/core`, `packages/pandoc-filter`,
`packages/vscode-extension`) is published under **CC0 1.0 Universal** — public domain. Full,
unmodified legal text in [`LICENSE`](../../LICENSE) (exact copy of
<https://creativecommons.org/publicdomain/zero/1.0/legalcode>).

Practical consequence: no attribution required, no copyleft clause, no restriction on commercial
use, no royalty. It's the most permissive license that exists — more permissive than MIT (which
still requires keeping the copyright notice).

## Embedded third-party dependencies (runtime)

The dependency tree actually executed in production (`npm ls --omit=dev --all`), not the
development/CI tooling:

| Package | Role | License |
|---|---|---|
| `dagre` | Graph layout engine (node/edge positioning) | MIT |
| `graphlib` | `dagre` dependency | MIT |
| `lodash` | `graphlib` dependency | MIT |
| `fast-check` | Property-based test case generation (parser boundary) | MIT |
| `pure-rand` | `fast-check` dependency | MIT |
| `@types/dagre` | TypeScript typings, no code executed at runtime | MIT |

**100% MIT.** No runtime dependency under a copyleft license (GPL, AGPL, LGPL) or a non-OSI
license. Verifiable with `npx license-checker --production` from the repo root.

## The Pandoc case (GPL-2.0-or-later)

The pipeline delegates to [Pandoc](https://pandoc.org) everything that isn't the diagram
conversion itself (Markdown parsing, tables, styling, `.docx` archive manipulation) — see
[`README.md`](../../README.md) → *How it works*. Pandoc is distributed under GPL-2.0-or-later
(verified directly from `jgm/pandoc`'s `COPYING.md`).

What that means in practice:

- Pandoc is **always invoked as an external subprocess** (`execFile`/`spawn` with an argument
  array, never a shell string — see `AGENTS.md` rule 4), **never linked** into this project's
  code, neither statically nor dynamically. Arm's-length invocation is generally understood not
  to impose GPL obligations on the calling program — this point still needs validation from your
  own legal team if your review requires it; this document doesn't replace that advice.
- **CLI (`packages/cli`)**: assumes Pandoc is already installed on the machine (prerequisite
  documented in `README.md`), neither downloads nor distributes it.
- **VS Code extension (`packages/vscode-extension`)**: if Pandoc is absent from `PATH`, the
  official, unmodified binary is downloaded from `jgm/pandoc`'s GitHub releases, verified against
  a SHA-256 checksum pinned in the code (`src/pandocProvisioner.ts`), and cached **outside** the
  `.vsix` — never bundled inside the package published on the Marketplace. Full detail, including
  the complete GPL-2.0 text, in
  [`packages/vscode-extension/THIRD_PARTY_NOTICES.md`](../../packages/vscode-extension/THIRD_PARTY_NOTICES.md).

## Data flows / privacy

- Processing (Markdown parsing, layout, OOXML generation) is **100% local**, inside the Node.js
  process running the CLI or the extension. No document content is sent to any third-party
  service.
- **No telemetry, no analytics SDK** in the code (reproducible via `grep`: no `fetch`/network call
  other than the ones listed below).
- The code's only network calls are, both in the VS Code extension only, on explicit user action:
  1. Downloading the official Pandoc binary from GitHub Releases (see above), once, if Pandoc is
     absent.
  2. Opening the `pandoc.org/installing.html` page in the browser if the user clicks the
     installation help link.
- The CLI and the core engine (`packages/core`) make **no** network calls at all.

## Where to verify for yourself

| Question | Command / file |
|---|---|
| License of each runtime dependency | `npx license-checker --production` |
| Project license's legal text | [`LICENSE`](../../LICENSE) |
| Third-party notices (Pandoc) | [`packages/vscode-extension/THIRD_PARTY_NOTICES.md`](../../packages/vscode-extension/THIRD_PARTY_NOTICES.md) |
| Decision and history on the license/Pandoc choice | [`AGENTS.md`](../../AGENTS.md) → *Licensing* |
| Vulnerability policy / security contact | [`SECURITY.md`](../../SECURITY.md) |
