/**
 * Parser for Mermaid `gitGraph` diagrams (grammar verified against the real
 * `mermaid-js/mermaid` docs source, see `types.ts`'s doc comment for the
 * fetch note and the full v1 scope).
 *
 * Line-oriented, same forgiving convention as every other module here
 * (`../gantt/parser.ts`, `../c4/parser.ts`, ...): an unrecognized line is
 * skipped with a warning rather than throwing. Statement keywords
 * (`commit`/`branch`/`checkout`/`switch`/`merge`/`cherry-pick`) each get
 * their own regex for the leading, positionally-fixed part (branch/commit
 * name), then hand any trailing `key: value` / `key: "value"` attributes
 * (order-independent, any subset) to one generic {@link parseAttrs} scanner
 * — `id`/`type`/`tag` for `commit`/`merge`, `order` for `branch`, `id`/
 * `parent` for `cherry-pick`.
 *
 * State tracked while scanning: the current branch (starts as `main`), and
 * per-branch head-commit-id (updated by every `commit`/`merge` on that
 * branch) — exactly mirrors how a real git ref would move, just entirely in
 * memory. `merge`'s two parents and `cherry-pick`'s source-commit lookup
 * both read from this state, so statement order matters (same as real git
 * history), consistent with Mermaid's own declarative, insertion-order
 * semantics.
 */

import type { GitBranch, GitCommit, GitCommitType, GitGraphDiagram, GitOrientation } from './types.js';

export interface GitGraphParseResult {
  ast: GitGraphDiagram;
  warnings: string[];
}

const MAIN_BRANCH_NAME = 'main';

// Every pattern below matches against an already-`.trim()`-ed line (see the
// parse loop), so none needs a trailing `\s*` before `$`. The header/branch
// matchers are also deliberately split into two small single-purpose
// regexes each (a quoted-name attempt, then a bare-word fallback) rather
// than one regex combining an optional group with an alternation — the
// combined form trips eslint-plugin-security's detect-unsafe-regex
// heuristic on the ambiguous optional-quantifier adjacency, even with no
// real backtracking hazard (same false-positive class already documented at
// `../quadrant/parser.ts`'s `POINT_TAIL`); splitting sidesteps the
// heuristic and reads fine either way.
const HEADER_RE = /^gitGraph\b/i;
const ORIENTATION_RE = /^(LR|TB|BT)$/i;
const TITLE_RE = /^title\s+(.+)$/i;
const COMMIT_RE = /^commit\b(.*)$/i;
const BRANCH_QUOTED_RE = /^branch\s+"([^"]*)"(.*)$/i;
const BRANCH_BARE_RE = /^branch\s+(\S+)(.*)$/i;
const BRANCH_ORDER_RE = /^order:\s*(\d+)$/i;
const CHECKOUT_RE = /^(?:checkout|switch)\s+(?:"([^"]*)"|(\S+))$/i;
const MERGE_RE = /^merge\s+(?:"([^"]*)"|(\S+))(.*)$/i;
const CHERRY_PICK_RE = /^cherry-pick\b(.*)$/i;
const ATTR_RE = /(\w+)\s*:\s*(?:"([^"]*)"|(\S+))/g;

/** Scan a trailing `key: value` / `key: "value"` attribute list (order-
 * independent, any subset present) — shared by `commit`/`merge`/
 * `cherry-pick`. */
function parseAttrs(rest: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of rest.matchAll(ATTR_RE)) {
    const key = match[1]!.toLowerCase();
    attrs[key] = match[2] !== undefined ? match[2] : (match[3] ?? '');
  }
  return attrs;
}

function normalizeCommitType(raw: string | undefined): GitCommitType | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  return upper === 'NORMAL' || upper === 'REVERSE' || upper === 'HIGHLIGHT' ? upper : undefined;
}

interface BranchState {
  name: string;
  colorIndex: number;
  originSeq: number;
  head?: string;
  hasOrder: boolean;
  order?: number;
  appearanceIndex: number;
}

export function parseGitGraphDiagram(text: string): GitGraphParseResult {
  const warnings: string[] = [];
  let orientation: GitOrientation = 'LR';
  let title: string | undefined;

  const branches = new Map<string, BranchState>();
  const commits: GitCommit[] = [];
  const commitsById = new Map<string, GitCommit>();
  let currentBranch = MAIN_BRANCH_NAME;
  let seq = 0;
  let autoCommitCounter = 0;
  let autoCherryCounter = 0;
  let creationCount = 0;

  function createBranch(name: string, order: { hasOrder: boolean; order?: number }): BranchState {
    const source = branches.get(currentBranch);
    const state: BranchState = {
      name,
      colorIndex: creationCount % 8,
      originSeq: source?.head ? commitsById.get(source.head)!.seq : (source?.originSeq ?? 0),
      head: source?.head,
      hasOrder: order.hasOrder,
      order: order.order,
      appearanceIndex: creationCount,
    };
    creationCount++;
    branches.set(name, state);
    return state;
  }
  createBranch(MAIN_BRANCH_NAME, { hasOrder: false });

  /** A fresh commit/merge id, disambiguated with a numeric suffix if it
   * collides with one already used — real Mermaid's behavior on a duplicate
   * custom id is undefined/an error; this project's forgiving convention is
   * to warn and keep going rather than throw. */
  function uniqueId(requested: string | undefined, autoPrefix: string): string {
    if (requested === undefined) return `${autoPrefix}-${++autoCommitCounter}`;
    if (!commitsById.has(requested)) return requested;
    warnings.push(`Duplicate commit id "${requested}" — auto-renamed to disambiguate.`);
    return `${requested}-${++autoCommitCounter}`;
  }

  function pushCommit(commit: GitCommit): void {
    commits.push(commit);
    commitsById.set(commit.id, commit);
    branches.get(commit.branch)!.head = commit.id;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;

    if (HEADER_RE.test(line)) {
      const rest = line.slice(line.match(HEADER_RE)![0].length).trim().replace(/:$/, '').trim();
      const orientationMatch = rest.match(ORIENTATION_RE);
      if (orientationMatch) orientation = orientationMatch[1]!.toUpperCase() as GitOrientation;
      continue;
    }

    const titleMatch = line.match(TITLE_RE);
    if (titleMatch) {
      title = titleMatch[1]!.trim();
      continue;
    }

    const commitMatch = line.match(COMMIT_RE);
    if (commitMatch) {
      const attrs = parseAttrs(commitMatch[1] ?? '');
      const branchState = branches.get(currentBranch)!;
      const id = uniqueId(attrs.id, 'commit');
      pushCommit({
        id,
        branch: currentBranch,
        parents: branchState.head ? [branchState.head] : [],
        type: normalizeCommitType(attrs.type) ?? 'NORMAL',
        seq: seq++,
        ...(attrs.tag ? { tag: attrs.tag } : {}),
      });
      continue;
    }

    const branchMatch = line.match(BRANCH_QUOTED_RE) ?? line.match(BRANCH_BARE_RE);
    if (branchMatch) {
      const name = branchMatch[1]!;
      const orderMatch = branchMatch[2]!.trim().match(BRANCH_ORDER_RE);
      if (branches.has(name)) {
        warnings.push(`Branch "${name}" already exists — "branch" statement ignored, still switching to it: ${line}`);
        currentBranch = name;
        continue;
      }
      createBranch(name, { hasOrder: orderMatch !== null, order: orderMatch ? Number(orderMatch[1]) : undefined });
      currentBranch = name;
      continue;
    }

    const checkoutMatch = line.match(CHECKOUT_RE);
    if (checkoutMatch) {
      const name = checkoutMatch[1] ?? checkoutMatch[2]!;
      if (!branches.has(name)) {
        warnings.push(`Unknown branch "${name}" — checkout/switch ignored: ${line}`);
        continue;
      }
      currentBranch = name;
      continue;
    }

    const mergeMatch = line.match(MERGE_RE);
    if (mergeMatch) {
      const sourceName = mergeMatch[1] ?? mergeMatch[2]!;
      if (!branches.has(sourceName)) {
        warnings.push(`Merge ignored (unknown branch "${sourceName}"): ${line}`);
        continue;
      }
      if (sourceName === currentBranch) {
        warnings.push(`Merge ignored (cannot merge a branch with itself): ${line}`);
        continue;
      }
      const attrs = parseAttrs(mergeMatch[3] ?? '');
      const targetState = branches.get(currentBranch)!;
      const sourceState = branches.get(sourceName)!;
      const parents = [targetState.head, sourceState.head].filter((p): p is string => p !== undefined);
      const id = uniqueId(attrs.id, 'merge');
      pushCommit({
        id,
        branch: currentBranch,
        parents,
        type: normalizeCommitType(attrs.type) ?? 'MERGE',
        seq: seq++,
        ...(attrs.tag ? { tag: attrs.tag } : {}),
      });
      continue;
    }

    const cherryMatch = line.match(CHERRY_PICK_RE);
    if (cherryMatch) {
      const attrs = parseAttrs(cherryMatch[1] ?? '');
      const sourceId = attrs.id;
      if (!sourceId || !commitsById.has(sourceId)) {
        warnings.push(`Cherry-pick ignored (unknown source commit id): ${line}`);
        continue;
      }
      const branchState = branches.get(currentBranch)!;
      pushCommit({
        id: `${sourceId}-cherry-pick-${++autoCherryCounter}`,
        branch: currentBranch,
        parents: branchState.head ? [branchState.head] : [],
        type: 'NORMAL',
        seq: seq++,
        cherryPickFrom: sourceId,
      });
      continue;
    }

    warnings.push(`Unsupported line ignored: ${line}`);
  }

  // Branch display order (docs/syntax/gitgraph.md "Customizing branch
  // ordering"): main always first (this project doesn't support
  // `mainBranchOrder` — no frontmatter/config support at all, see types.ts),
  // then every branch *without* an explicit `order` in appearance order,
  // then every branch *with* one, sorted ascending by that value — verified
  // against the doc's own worked example (test1 order:3/test2 order:2/test3
  // order:1 -> displayed test3,test2,test1).
  const all = [...branches.values()];
  const main = all.find((b) => b.name === MAIN_BRANCH_NAME)!;
  const rest = all.filter((b) => b.name !== MAIN_BRANCH_NAME);
  const withoutOrder = rest.filter((b) => !b.hasOrder).sort((a, b) => a.appearanceIndex - b.appearanceIndex);
  const withOrder = rest.filter((b) => b.hasOrder).sort((a, b) => a.order! - b.order! || a.appearanceIndex - b.appearanceIndex);
  const orderedBranches: GitBranch[] = [main, ...withoutOrder, ...withOrder].map((b) => ({
    name: b.name,
    colorIndex: b.colorIndex,
    originSeq: b.originSeq,
  }));

  return {
    ast: {
      ...(title ? { title } : {}),
      orientation,
      mainBranchName: MAIN_BRANCH_NAME,
      branches: orderedBranches,
      commits,
    },
    warnings,
  };
}
