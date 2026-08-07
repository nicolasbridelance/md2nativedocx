# Fixtures parked out of `test:visual`

These `.mmd` fixtures reproduce a known, unfixed rendering defect. They live
here — not in `../fixtures/` — so `npm run test:visual` stays green without a
baseline PNG silently canonizing a bug as "correct". See `TODO.md` for the
tracked follow-up. Once a fixture's defect is fixed, move it back into
`../fixtures/` and generate its baseline with
`node scripts/test-visual.mjs --update-baseline`.

## `subgraph.mmd`

The subgraph title (e.g. "Groupe externe") renders on top of the first
contained node instead of above it. Dagre sizes a cluster's box tightly around
its child nodes; nothing reserves the extra vertical space `renderSubgraph`
(`packages/core/src/translator/ooxml-translator.ts`) needs for the title
strip. Fixing it means having `layout.ts` grow each subgraph's box by the
title height and shift its descendants down accordingly — recursively, since a
subgraph can nest inside another subgraph and both need their own reserved
strip. Not attempted here: it is layout-tree surgery, not a translator-local
fix, and deserves its own change with layout unit tests, not a rider on the
connector-geometry fixes this fixture was found alongside.
