## What changed and why

<!-- One or two sentences. Link the issue this addresses, if any. -->

## Security

<!-- Does this touch any row of the Security table in AGENTS.md? If so, which one, and how is it mitigated?
     If this PR touches .devcontainer/ or .vscode/, say so explicitly here. -->

## Dependencies

<!-- New dependency added? Name it and justify it in one line. Default answer should be "none". -->

## `packages/core` public API

<!-- Does this change any exported function/type signature in packages/core? If yes, this is a
     versioning decision — see AGENTS.md "Releases & versioning". -->

## Checklist

- [ ] CI is green (lint, typecheck, unit + golden tests, `npm audit`, secret scan)
- [ ] New/changed behavior has a test that would have failed before this change
- [ ] Public API changes have updated TSDoc comments
- [ ] I've read `AGENTS.md` and this PR follows its non-negotiable rules
