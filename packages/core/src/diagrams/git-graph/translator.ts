/**
 * OOXML translator for a Mermaid `gitGraph` diagram — Family F ("lanes
 * fixes" per `FUTURE_full_mermaid_coverage_SPEC.md`'s re-classification, see
 * `types.ts`'s doc comment): branches are fixed lanes, commits sit on a
 * fixed grid along one axis by declaration order (`GitCommit.seq`), no
 * Dagre involved — same non-Dagre shape as `../gantt/translator.ts`'s
 * calendar layout, straight AST -> XML.
 *
 * Orientation (`LR` default, `TB`, `BT`) picks which pixel axis is "main"
 * (commit sequence) vs. "cross" (branch lane): `LR` = commits left-to-right,
 * branches stacked as rows (matches Mermaid's own default); `TB` = commits
 * top-to-bottom, branches as columns; `BT` = same as `TB` with the sequence
 * axis reversed (latest commit nearest the top). `place()` is the one
 * function that knows this mapping — everything else works in an abstract
 * (seq, laneIndex) space.
 *
 * V1 shape approximations, each a deliberate simplification (documented,
 * not a silent gap, matching this project's established Family-B/D
 * precedent of trading exact Mermaid fidelity for a native-editable-shape
 * .docx that's simple to generate):
 * - `NORMAL` commit: solid circle. `REVERSE`: solid circle with a white X
 *   drawn on top (Mermaid draws a crossed circle too, just with thinner
 *   strokes). `HIGHLIGHT`: filled rounded square (Mermaid's own choice).
 *   A merge commit's default shape (`MERGE`, i.e. no explicit `type`
 *   override) is a "bullseye" — an outer filled circle with a smaller white
 *   circle centered on top — approximating Mermaid's "filled double circle"
 *   without a true concentric-outline primitive in this project's shape
 *   vocabulary.
 * - Every parent edge (a commit to each of its 1-2 parents) is a straight
 *   `connector()` line, center-to-center (the commit circles are small
 *   enough that this reads fine, same choice `../mindmap/translator.ts`
 *   makes), colored by **the parent's own branch** — so a branch-point edge
 *   (a new branch's first commit back to the branch-off commit on another
 *   lane) visibly reads as forking from that other lane's color, and an
 *   ordinary same-branch continuation is just that branch's own color.
 * - A `cherry-pick` commit renders as an ordinary (typed) commit plus a
 *   dashed gray traceability line back to its source commit, and its id
 *   label is suffixed `(cherry-pick of <source id>)` — no dedicated cherry
 *   icon (no OOXML preset for one, same "no exact icon" precedent
 *   `architecture-beta`'s translator already sets for `cloud`/`database`
 *   icons it can't reproduce exactly either).
 * - Commit id labels are never rotated 45° — see `types.ts`'s doc comment.
 */

import type { GitBranch, GitCommit, GitCommitType, GitGraphDiagram, GitOrientation } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { createIdAllocator, scaledExtent, scaledFontSizeHalfPt, scaledLineWidthEmu, wrapDrawingCanvas } from '../../translator/canvas.js';
import { connector, ellipse, rect, scalePt, textBoxLines } from '../../translator/graph-shapes.js';

/** This project's own 8-color cyclic branch palette (Mermaid's real
 * `git0`..`git7` theme-variable defaults depend on the active theme and
 * aren't reproduced pixel-for-pixel here — same "own tasteful palette, not
 * a theme-matching exercise" choice `../gantt/translator.ts`'s `BAR_COLORS`
 * already makes). Indexed by `GitBranch.colorIndex`, already `% 8` from the
 * parser. */
const PALETTE: readonly string[] = ['4472C4', 'ED7D31', '70AD47', 'FFC000', '5B9BD5', '9E480E', '264478', '7030A0'];

const NODE_R = 8;
const LANE_GAP = 64;
const MIN_COMMIT_GAP = 60;
const MARGIN = 30;
const CROSS_PAD = 40;
const LABEL_GAP = 6;
const TITLE_H = 34;
const TITLE_SIZE_HALFPT = 28;
const ID_LABEL_SIZE_HALFPT = 15;
const TAG_LABEL_SIZE_HALFPT = 14;
const BRANCH_LABEL_SIZE_HALFPT = 19;
const LINE_COLOR = '404040';
const TAG_FILL = 'FFF2CC';
const TAG_LINE = 'BF8F00';
const TAG_TEXT_COLOR = '7F6000';
const CHERRY_LINE_COLOR = '808080';

function branchColor(branch: GitBranch): string {
  return PALETTE[branch.colorIndex % PALETTE.length]!;
}

function idLabelText(c: GitCommit): string {
  return c.cherryPickFrom ? `${c.id} (cherry-pick of ${c.cherryPickFrom})` : c.id;
}

/** A commit's fixed-shape marker, per `type` — see this module's doc
 * comment for the shape-per-type rationale. */
function commitShapes(nextId: () => number, type: GitCommitType, cxPx: number, cyPx: number, colorHex: string, s: number): string[] {
  const cx = scalePt(cxPx, s);
  const cy = scalePt(cyPx, s);
  const r = scalePt(NODE_R, s);
  const parts: string[] = [];

  if (type === 'HIGHLIGHT') {
    const half = scalePt(NODE_R * 1.15, s);
    parts.push(rect(nextId(), cx - half, cy - half, half * 2, half * 2, colorHex, LINE_COLOR, 'Commit', true));
    return parts;
  }

  if (type === 'MERGE') {
    parts.push(ellipse(nextId(), cx - r, cy - r, r * 2, r * 2, colorHex, LINE_COLOR));
    const innerR = Math.max(1, Math.round(r * 0.5));
    parts.push(ellipse(nextId(), cx - innerR, cy - innerR, innerR * 2, innerR * 2, 'FFFFFF', colorHex));
    return parts;
  }

  parts.push(ellipse(nextId(), cx - r, cy - r, r * 2, r * 2, colorHex, LINE_COLOR));
  if (type === 'REVERSE') {
    const k = Math.max(1, Math.round(r * 0.55));
    const w = scaledLineWidthEmu(6350, s);
    parts.push(connector(nextId(), cx - k, cy - k, cx + k, cy + k, 'FFFFFF', w, 'solid', 'none', 'sm', 'none', 'sm'));
    parts.push(connector(nextId(), cx - k, cy + k, cx + k, cy - k, 'FFFFFF', w, 'solid', 'none', 'sm', 'none', 'sm'));
  }
  return parts;
}

/** Translate a parsed gitGraph diagram into a self-contained WordprocessingML
 * paragraph. An empty diagram (no commits at all) renders a visible note,
 * matching every other Family B/D/F translator's zero-content convention. */
export function translateGitGraphToOoxml(chart: GitGraphDiagram): string {
  if (chart.commits.length === 0) {
    return [
      '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '  <w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>',
      '  <w:r>',
      '    <w:rPr><w:i/><w:color w:val="808080"/><w:sz w:val="18"/></w:rPr>',
      '    <w:t xml:space="preserve">This gitGraph diagram has no commits to render.</w:t>',
      '  </w:r>',
      '</w:p>',
    ].join('\n');
  }

  const orientation: GitOrientation = chart.orientation;
  const laneIndexByBranch = new Map<string, number>(chart.branches.map((b, i) => [b.name, i]));
  const colorByBranch = new Map<string, string>(chart.branches.map((b) => [b.name, branchColor(b)]));
  const maxSeq = chart.commits[chart.commits.length - 1]!.seq;

  // Spacing is sized off each commit's *bare* id, not the full annotated
  // label `idLabelText()` renders (which appends `(cherry-pick of <id>)` —
  // see this module's doc comment) — a single verbose cherry-pick
  // annotation would otherwise balloon the gap for every commit in the
  // diagram. The annotated label is drawn centered on its own commit
  // regardless, so it may overflow into the neighboring gap in that
  // specific case — an accepted, documented cosmetic v1 trade-off, same
  // shape as this project's other "known but not fixed" rendering
  // simplifications (e.g. C4's rank-skipping relationship line).
  const longestIdLabel = chart.commits.reduce((max, c) => Math.max(max, estimateTextWidth(c.id, 9)), 0);
  const commitGap = Math.max(MIN_COMMIT_GAP, longestIdLabel + 24);
  const longestBranchLabel = chart.branches.reduce((max, b) => Math.max(max, estimateTextWidth(b.name, 11)), 0);
  const branchLabelRoom = Math.max(50, longestBranchLabel + 20);

  const hasTitle = Boolean(chart.title);
  const topPad = hasTitle ? TITLE_H : 0;
  const mainStart = MARGIN + branchLabelRoom;
  const crossStart = CROSS_PAD;

  function mainAxisPx(seq: number): number {
    return orientation === 'BT' ? mainStart + (maxSeq - seq) * commitGap : mainStart + seq * commitGap;
  }

  function place(seq: number, laneIdx: number): { x: number; y: number } {
    const main = mainAxisPx(seq);
    const cross = crossStart + laneIdx * LANE_GAP;
    return orientation === 'LR' ? { x: main, y: cross + topPad } : { x: cross, y: main + topPad };
  }

  const numLanes = chart.branches.length;
  const crossExtent = crossStart * 2 + Math.max(0, numLanes - 1) * LANE_GAP;
  const mainExtent = mainStart + (maxSeq + 1) * commitGap + branchLabelRoom + MARGIN;
  const canvasW = orientation === 'LR' ? mainExtent : crossExtent;
  const canvasH = topPad + (orientation === 'LR' ? crossExtent : mainExtent);
  const { scale: s } = scaledExtent(canvasW, canvasH);

  const nextId = createIdAllocator();
  const parts: string[] = [];

  if (chart.title) {
    parts.push(
      textBoxLines(nextId(), 0, 0, scalePt(canvasW, s), scalePt(TITLE_H, s), [chart.title], scaledFontSizeHalfPt(TITLE_SIZE_HALFPT, s), {
        bold: true,
        align: 'ctr',
      }),
    );
  }

  const posByCommitId = new Map<string, { x: number; y: number }>();
  for (const c of chart.commits) {
    posByCommitId.set(c.id, place(c.seq, laneIndexByBranch.get(c.branch) ?? 0));
  }

  const commitsById = new Map(chart.commits.map((c) => [c.id, c]));

  // Edges first, so every commit marker is drawn on top of its own line
  // endpoints rather than the line visibly poking out past the circle.
  for (const c of chart.commits) {
    const to = posByCommitId.get(c.id)!;
    for (const parentId of c.parents) {
      const parent = commitsById.get(parentId);
      const from = posByCommitId.get(parentId);
      if (!parent || !from) continue;
      parts.push(
        connector(
          nextId(),
          scalePt(from.x, s),
          scalePt(from.y, s),
          scalePt(to.x, s),
          scalePt(to.y, s),
          colorByBranch.get(parent.branch) ?? LINE_COLOR,
          scaledLineWidthEmu(19050, s),
          'solid',
          'none',
          'sm',
          'none',
          'sm',
        ),
      );
    }
    if (c.cherryPickFrom) {
      const from = posByCommitId.get(c.cherryPickFrom);
      if (from) {
        parts.push(
          connector(
            nextId(),
            scalePt(from.x, s),
            scalePt(from.y, s),
            scalePt(to.x, s),
            scalePt(to.y, s),
            CHERRY_LINE_COLOR,
            scaledLineWidthEmu(9525, s),
            'dash',
            'none',
            'sm',
            'none',
            'sm',
          ),
        );
      }
    }
  }

  for (const c of chart.commits) {
    const p = posByCommitId.get(c.id)!;
    const color = colorByBranch.get(c.branch) ?? PALETTE[0]!;
    parts.push(...commitShapes(nextId, c.type, p.x, p.y, color, s));

    const label = idLabelText(c);
    const labelW = estimateTextWidth(label, 9) + 8;
    if (orientation === 'LR') {
      parts.push(
        textBoxLines(
          nextId(),
          scalePt(p.x - labelW / 2, s),
          scalePt(p.y + NODE_R + LABEL_GAP, s),
          scalePt(labelW, s),
          scalePt(16, s),
          [label],
          scaledFontSizeHalfPt(ID_LABEL_SIZE_HALFPT, s),
          { align: 'ctr', color: LINE_COLOR },
        ),
      );
    } else {
      parts.push(
        textBoxLines(
          nextId(),
          scalePt(p.x + NODE_R + LABEL_GAP, s),
          scalePt(p.y - 8, s),
          scalePt(labelW, s),
          scalePt(16, s),
          [label],
          scaledFontSizeHalfPt(ID_LABEL_SIZE_HALFPT, s),
          { align: 'l', color: LINE_COLOR },
        ),
      );
    }

    if (c.tag) {
      const tagW = estimateTextWidth(c.tag, 8) + 14;
      const tagH = 16;
      const tx = orientation === 'LR' ? p.x - tagW / 2 : p.x - NODE_R - LABEL_GAP - tagW;
      const ty = orientation === 'LR' ? p.y - NODE_R - LABEL_GAP - tagH : p.y - tagH / 2;
      parts.push(rect(nextId(), scalePt(tx, s), scalePt(ty, s), scalePt(tagW, s), scalePt(tagH, s), TAG_FILL, TAG_LINE, `Tag ${c.tag}`, true));
      parts.push(
        textBoxLines(nextId(), scalePt(tx, s), scalePt(ty, s), scalePt(tagW, s), scalePt(tagH, s), [c.tag], scaledFontSizeHalfPt(TAG_LABEL_SIZE_HALFPT, s), {
          align: 'ctr',
          color: TAG_TEXT_COLOR,
        }),
      );
    }
  }

  for (const b of chart.branches) {
    const laneIdx = laneIndexByBranch.get(b.name)!;
    const labelSeq = maxSeq + 1;
    const p = place(labelSeq, laneIdx);
    const color = colorByBranch.get(b.name)!;
    const labelW = estimateTextWidth(b.name, 11) + 8;
    parts.push(
      textBoxLines(nextId(), scalePt(p.x - labelW / 2, s), scalePt(p.y - 8, s), scalePt(labelW, s), scalePt(18, s), [b.name], scaledFontSizeHalfPt(BRANCH_LABEL_SIZE_HALFPT, s), {
        align: 'ctr',
        bold: true,
        color,
      }),
    );
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, chart.title ?? 'GitGraph diagram');
}
