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
- `nested-3-levels.docx` (first round): rendered, but the nested subgraphs showed **no visible
  container box** — only a small floating title label. Since resolved, unrelated to this report:
  `ooxml-translator.ts`'s `renderSubgraph()` now draws a filled/bordered box for the whole cluster
  (`SUBGRAPH_FILL`/`SUBGRAPH_LINE`, dashed border) rather than only the title, landed the same day
  as this report's first round (`TODO.md`, "Boîte de conteneur de sous-graphe — corrigé"). No
  longer an open finding.

**Result (2026-09-04, second round)**:

- `medium-realistic.docx`: **confirmed** — renders correctly in real Word, all 3 baseline checks
  pass, fill colors (blue/yellow/green) match `classDef`, the loop-back arrow (`Retenter` →
  `Donnees-ok?`) is legible.
- `minimal.docx`: **failed to open at all** — "Word a rencontré une erreur lors de l'ouverture du
  fichier". Root cause found and is unrelated to the harness bug above: this fixture's diagram
  (`A-->B-->C-->A`, a 3-node cycle) is SmartArt-eligible, and the committed `minimal.docx` had been
  generated with SmartArt forced on rather than the CLI's actual default (off since 2026-09-03,
  see "Incident SmartArt cycle" in `TODO.md`) — so it hit that exact, already-documented, still-
  unfixed corruption bug (`cycle.ts`'s output is missing a `dsp:drawing` fallback part real Word
  requires). All 5 `test-corpus/word-verification/` fixtures regenerated with default settings
  (`CHECKLIST.md` §1 has the full detail); `minimal.docx` is the only one whose generation mode
  actually changed, since none of the other 4 source diagrams happens to be SmartArt-eligible.
  **Re-verification of the regenerated file is still pending.**
- New fixture added this round: `direction-and-asymmetric-shape.docx` (`RL` direction + the
  `id>Text]` asymmetric/flag shape, both new this session) — not yet checked in real Word.

**Outstanding before this item can be checked off in `TODO.md`**:
- [ ] Re-verify the regenerated `minimal.docx` in real Word (default-settings wpc:wpc output, no
      longer SmartArt).
- [ ] Check `direction-and-asymmetric-shape.docx` (`CHECKLIST.md` §6): `RL` flow direction and the
      `homePlate`-preset asymmetric shape, both first-time real-Word signal.
- [ ] The drag-a-box-and-connector-stays-attached check (§9, third manual criterion) not yet
      explicitly confirmed in either round.

Word version / OS used for this round: *(fill in)*.
