# MVP acceptance report (spec §9)

Evidence for the two MVP acceptance items in `docs/specs/cahier_des_charges.md` §9 /
`TODO.md`. Written 2026-09-03. Supersedes "checked by eye during visual-baseline review" as the
basis for these claims.

## 1. Flowchart ≤15 nodes: 0 crossings requiring manual rearrangement, >90% of tested cases

**Method**: `scripts/mvp-crossing-report.mjs` runs the real parser + Dagre layout on every fixture
in `test-corpus/visual/fixtures/`, then geometrically checks every pair of routed edge polylines
for intersection (excluding edges that legitimately share an endpoint node). This replaces
eyeballing a render with an objective count on the same coordinates the OOXML translator draws.

**Corpus**: the 22 existing visual fixtures, plus 2 added for this report specifically to stress
crossing-prone topologies that the existing corpus under-represented (it's mostly one fixture per
*feature* — colors, shapes, escape-xml — not adversarial graph shapes):
- `crossing-stress-15node.mmd`: 13 nodes, near the 15-node cap, mixing branch/merge/skip-level edges.
- `crossing-stress-bipartite.mmd`: 8 nodes, near-complete bipartite (4×4, 12 edges) — the
  graph-theoretic worst case for edge crossings, deliberately adversarial.

**Result**: 23/24 = **95.8%** pass (>90% threshold met).

The one failure is `crossing-stress-bipartite.mmd`: 12 geometric crossings. This is expected and
not a layout defect — a near-complete bipartite graph between two ranks is a classical
crossing-heavy case for *any* layered graph-drawing algorithm (crossing minimization on such graphs
is NP-hard in general; Dagre's heuristic does not claim optimality). It is not representative of
typical flowcharts, which is why the spec's own corpus target is "3 to 50-node diagrams with
subgraphs" rather than dense bipartite graphs. Manually reviewed in real Word
(`test-corpus/word-verification/crossing-stress-bipartite.docx`): busy but every shape stays
individually selectable, no silent render failure — see §3.

Reproduce: `npm run build -w packages/core && node scripts/mvp-crossing-report.mjs`.

## 2. Manual test in real Word before release

**Method**: `test-corpus/word-verification/` holds a small hand-picked set of generated `.docx`
files plus `CHECKLIST.md`. This cannot be produced from this Linux environment — opened and
checked directly in desktop Word by the maintainer.

**Result (2026-09-03, partial pass — first round)**:

- `order-flow.docx`, `crossing-stress-bipartite.docx`: render correctly, shapes selectable, no
  crossing-through-shape issue on the skip-level edge.
- `minimal.docx`, `medium-realistic.docx` (first round): rendered as raw, unconverted Markdown
  text instead of a diagram. **Root cause identified: a harness bug in how this report's own
  verification `.md` files were generated** (missing trailing newline in 2 of the 5 source `.mmd`
  fixtures caused the closing code-fence to glue onto the last content line, so the fence never
  closed and the Lua filter never saw a valid mermaid code block). Not a `packages/core` or
  `pandoc-filter` bug. Fixed and regenerated — **re-verification of these two in real Word is still
  pending**.
- `nested-3-levels.docx`: renders, but the nested subgraphs show **no visible container box** —
  only a small floating title label ("Niveau 1/2/3"), no border or background around the member
  nodes. Confirmed this is **not** a Word-vs-LibreOffice divergence: the checked-in LibreOffice
  baseline (`test-corpus/visual/baseline/nested-3-levels.png`) shows the identical gap, and has
  since the fixture was accepted — visual-diff testing never caught it because it only diffs
  against a previously-accepted baseline that already had the gap. **Confirmed as deliberate, not
  accidental**: `ooxml-translator.ts`'s `renderSubgraph()` explicitly sets `<a:noFill/>` and
  `<a:ln w="0"><a:noFill/></a:ln>` on the subgraph shape — only the title bar is drawn, the cluster
  body was never meant to get a border/fill. This is a real fidelity gap against the README's
  "Fidelity to the Mermaid preview: ✅" claim (Mermaid's own renderer draws a visible box around a
  subgraph's members) — worth disclosing before any public claim, not blocking for nodes/edges
  themselves which remain individually selectable and correctly positioned.

**Outstanding before this item can be checked off in `TODO.md`**:
- [ ] Re-verify `minimal.docx` / `medium-realistic.docx` in real Word after the harness fix.
- [ ] Decide/document: is "no visible subgraph container box" an acceptable V1 gap (documented
      known-limitation) or does it block release? Recommendation: document it — it doesn't affect
      the §9 crossing criterion (which is about edges, not subgraph decoration) or shape
      selectability, but should not be silently discovered by a user or a LinkedIn commenter.
- [ ] The drag-a-box-and-connector-stays-attached check (§9, third manual criterion) not yet
      explicitly confirmed in this round.

Word version / OS used for this round: *(fill in)*.
