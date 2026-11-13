/**
 * Intermediate AST for a Mermaid `gitGraph` diagram. Grammar verified against
 * the real `mermaid-js/mermaid` docs source (`docs/syntax/gitgraph.md`,
 * fetched 2026-09-11 via raw.githubusercontent.com — same reason as `../c4/
 * types.ts`'s doc comment: the rendered mermaid.js.org page loads its
 * examples into an interactive editor a text-only fetch can't read).
 *
 * Re-classified per `FUTURE_full_mermaid_coverage_SPEC.md`'s "angle mort
 * n°2" note once its real rendering was looked at: not Family B (no Dagre
 * graph — a git history has no notion of "layout the nodes to minimize
 * crossings", it has a fixed timeline + fixed branch lanes). Closer to the
 * spec's Family F ("lanes fixes") — `translator.ts` lays branches out as
 * fixed horizontal (or vertical, see `orientation`) lanes and commits along
 * one axis by declaration order, no Dagre involved at all, same non-Dagre
 * shape as `../gantt/`'s calendar layout.
 *
 * V1 scope, deliberately (see `parser.ts`'s doc comment for the rest):
 * - No frontmatter/`config:` block support at all — this project has never
 *   parsed Mermaid frontmatter for *any* diagram type (grep confirms zero
 *   precedent), so `showBranches`/`showCommitLabel`/`mainBranchName`/
 *   `mainBranchOrder`/`parallelCommits`/theme-variable overrides are not a
 *   gitGraph-specific gap — same accepted scope boundary as every other
 *   module here.
 * - Commit position along the main axis is **declaration order** (a global
 *   sequence counter), not Mermaid's real "distance from parent" temporal
 *   algorithm — simpler, deterministic, and still visually correct for the
 *   common case (commits declared in causal order, which every real-world
 *   gitGraph example is).
 * - Commit labels are never rotated 45° (Mermaid's own default) — always
 *   horizontal, i.e. this translator's fixed behavior matches Mermaid's own
 *   `rotateCommitLabel: false` option, which needs no frontmatter to reach
 *   since it's the only behavior implemented.
 */

export type GitOrientation = 'LR' | 'TB' | 'BT';

export type GitCommitType = 'NORMAL' | 'REVERSE' | 'HIGHLIGHT' | 'MERGE';

export interface GitBranch {
  name: string;
  /** Index into an 8-color cyclic palette (`git0`..`git7` in Mermaid's own
   * theme-variable naming), assigned by branch creation order — see
   * `parser.ts`'s doc comment. */
  colorIndex: number;
  /** Global sequence number (see `GitCommit.seq`) of the commit this branch
   * forked from, or 0 for the main branch / a branch created before any
   * commit exists — used to draw the branch's label near its origin when it
   * has no commits of its own yet. */
  originSeq: number;
}

export interface GitCommit {
  id: string;
  branch: string;
  /** 0, 1 (normal commit/merge-from-checkout continuation), or 2 (merge)
   * parent commit ids. Empty for a branch's very first ever commit. */
  parents: string[];
  type: GitCommitType;
  tag?: string;
  /** Global declaration-order index — drives this commit's position along
   * the diagram's main axis (see `types.ts`'s doc comment on why this isn't
   * Mermaid's real temporal-distance algorithm). */
  seq: number;
  /** Set for a `cherry-pick`-created commit — the source commit's id, drawn
   * as a dashed connector back to it for traceability. */
  cherryPickFrom?: string;
}

export interface GitGraphDiagram {
  title?: string;
  orientation: GitOrientation;
  mainBranchName: string;
  /** In creation order — main branch is always first. */
  branches: GitBranch[];
  /** In global declaration (`seq`) order. */
  commits: GitCommit[];
}
