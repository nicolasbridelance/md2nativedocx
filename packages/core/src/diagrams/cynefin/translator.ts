/**
 * OOXML translator for a Mermaid `cynefin-beta` diagram — Family D per
 * `FUTURE_full_mermaid_coverage_SPEC.md` (calculated shapes on a `wpc:wpc`
 * canvas, no Dagre, no `c:chart` — same shape as `../quadrant/translator.ts`/
 * `../venn/translator.ts`), not a reuse of `quadrantChart`'s own translator:
 * see `types.ts`'s doc comment for why the two AST shapes actually differ
 * once the real grammar was checked.
 *
 * The five domains sit at Mermaid's own documented fixed screen positions
 * (Complex top-left, Complicated top-right, Chaotic bottom-left, Clear
 * bottom-right, Confusion center) regardless of source declaration order —
 * this project has no notion of a configurable layout for them either
 * (`width`/`height`/`padding` are frontmatter-only, unsupported, see
 * `types.ts`'s doc comment).
 *
 * Two deliberate v1 simplifications, both surfaced as documented, not
 * silent, gaps:
 * - **The signature wavy/organic domain boundary is a plain straight
 *   line** (each domain's own `rect()` border) — reproducing Mermaid's
 *   deterministic-but-organic boundary would need a hand-authored
 *   `a:custGeom` freeform path; a straight divider is this project's usual
 *   "computed geometry, not exact visual fidelity" trade-off for Family D
 *   (see `venn-beta`'s own "classic symmetric layouts, not true N-way
 *   proportional Venn" precedent).
 * - **`showDomainDescriptions` is always on** (hardcoded to Mermaid's own
 *   default `true`, the only value reachable without frontmatter support)
 *   — each domain's decision-model/practice-type subtitle is sourced
 *   directly from the docs' own domain descriptions, not invented.
 */

import type { CynefinDiagram, CynefinDomain } from './types.js';
import { estimateTextWidth } from '../../layout/layout.js';
import { createIdAllocator, scaledExtent, scaledFontSizeHalfPt, scaledLineWidthEmu, wrapDrawingCanvas } from '../../translator/canvas.js';
import { connector, edgePoint, ellipse, parallelEdgeOffset, perpendicularUnit, rect, scalePt, shiftPoint, textBoxLines } from '../../translator/graph-shapes.js';

const GRID_SIZE = 480;
const MARGIN = 30;
const MARGIN_BOTTOM = 20;
const TITLE_H = 34;
const NO_TITLE_TOP_MARGIN = 16;
const CONFUSION_R = 68;
const GRID_BORDER = 'BFBFBF';
const ARROW_COLOR = '595959';

const DOMAIN_FILL: Readonly<Record<CynefinDomain, string>> = {
  complex: 'FFF2CC',
  complicated: 'D9E2F3',
  clear: 'E2EFDA',
  chaotic: 'F8CBAD',
  confusion: 'D9D9D9',
};

const DOMAIN_LABEL: Readonly<Record<CynefinDomain, string>> = {
  complex: 'Complex',
  complicated: 'Complicated',
  clear: 'Clear',
  chaotic: 'Chaotic',
  confusion: 'Confusion',
};

/** Sourced verbatim from `docs/syntax/cynefin.md`'s own domain
 * descriptions, not invented. */
const DOMAIN_SUBTITLE: Readonly<Record<CynefinDomain, string>> = {
  complex: 'Probe → Sense → Respond — emergent practices',
  complicated: 'Sense → Analyse → Respond — good practices',
  clear: 'Sense → Categorise → Respond — best practices',
  chaotic: 'Act → Sense → Respond — novel practices',
  confusion: 'Move items to a known domain',
};

interface Region {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  /** Top-left box origin for the 4 rectangular domains; confusion (an
   * ellipse) has no box, `undefined`. */
  box?: { x: number; y: number; w: number; h: number };
}

function regionsFor(gridX0: number, gridY0: number): Record<CynefinDomain, Region> {
  const half = GRID_SIZE / 2;
  const quarter = half / 2;
  const box = (x: number, y: number): Region => ({ cx: x + quarter, cy: y + quarter, halfW: quarter, halfH: quarter, box: { x, y, w: half, h: half } });
  const gridCx = gridX0 + half;
  const gridCy = gridY0 + half;
  return {
    complex: box(gridX0, gridY0),
    complicated: box(gridX0 + half, gridY0),
    chaotic: box(gridX0, gridY0 + half),
    clear: box(gridX0 + half, gridY0 + half),
    confusion: { cx: gridCx, cy: gridCy, halfW: CONFUSION_R, halfH: CONFUSION_R },
  };
}

function itemBadge(nextId: () => number, text: string, x: number, y: number, s: number): { xml: string[]; height: number } {
  const w = estimateTextWidth(text, 8) + 12;
  const h = 16;
  return {
    xml: [
      rect(nextId(), scalePt(x, s), scalePt(y, s), scalePt(w, s), scalePt(h, s), 'FFFFFF', GRID_BORDER, `Item ${text}`, true),
      textBoxLines(nextId(), scalePt(x, s), scalePt(y, s), scalePt(w, s), scalePt(h, s), [text], scaledFontSizeHalfPt(13, s), { align: 'ctr', color: '404040' }),
    ],
    height: h,
  };
}

/** Translate a parsed Cynefin diagram into a self-contained WordprocessingML
 * paragraph. The 5 fixed domains always render, even with zero items on
 * every one — matching the docs' own "Empty framework" example — so there
 * is no "zero content" note path here unlike every other Family D
 * translator (a Cynefin diagram is never truly empty). */
export function translateCynefinToOoxml(chart: CynefinDiagram): string {
  const nextId = createIdAllocator();
  const hasTitle = Boolean(chart.title);
  const topMargin = hasTitle ? TITLE_H : NO_TITLE_TOP_MARGIN;
  const canvasW = MARGIN * 2 + GRID_SIZE;
  const canvasH = topMargin + GRID_SIZE + MARGIN_BOTTOM;
  const { scale: s } = scaledExtent(canvasW, canvasH);

  const gridX0 = MARGIN;
  const gridY0 = topMargin;
  const regions = regionsFor(gridX0, gridY0);
  const parts: string[] = [];

  if (chart.title) {
    parts.push(
      textBoxLines(nextId(), 0, 0, scalePt(canvasW, s), scalePt(TITLE_H, s), [chart.title], scaledFontSizeHalfPt(28, s), { bold: true, align: 'ctr' }),
    );
  }

  // Transitions first, so every domain region draws on top of the arrow
  // endpoints rather than a line visibly poking out past its border.
  const pairGroups = new Map<string, number[]>();
  chart.transitions.forEach((t, i) => {
    const key = [t.from, t.to].sort().join('|');
    const group = pairGroups.get(key) ?? [];
    group.push(i);
    pairGroups.set(key, group);
  });
  const offsetByIndex = new Map<number, { index: number; count: number }>();
  for (const group of pairGroups.values()) {
    group.forEach((relIndex, i) => offsetByIndex.set(relIndex, { index: i, count: group.length }));
  }

  chart.transitions.forEach((t, i) => {
    const from = regions[t.from];
    const to = regions[t.to];
    const rawP1 = edgePoint(from.cx, from.cy, from.halfW, from.halfH, to.cx, to.cy);
    const rawP2 = edgePoint(to.cx, to.cy, to.halfW, to.halfH, from.cx, from.cy);
    const { index, count } = offsetByIndex.get(i)!;
    const sortedPair = [t.from, t.to].sort();
    const posA = regions[sortedPair[0]!];
    const posB = regions[sortedPair[1]!];
    const { ux, uy } = perpendicularUnit({ x: posA.cx, y: posA.cy }, { x: posB.cx, y: posB.cy });
    const amount = parallelEdgeOffset(index, count);
    const p1 = shiftPoint(rawP1, ux, uy, amount);
    const p2 = shiftPoint(rawP2, ux, uy, amount);
    parts.push(
      connector(nextId(), scalePt(p1.x, s), scalePt(p1.y, s), scalePt(p2.x, s), scalePt(p2.y, s), ARROW_COLOR, scaledLineWidthEmu(12700, s), 'solid', 'none', 'sm', 'triangle', 'sm'),
    );
    if (t.label) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const labelW = estimateTextWidth(t.label, 8) + 12;
      parts.push(
        textBoxLines(nextId(), scalePt(midX - labelW / 2, s), scalePt(midY - 9, s), scalePt(labelW, s), scalePt(18, s), [t.label], scaledFontSizeHalfPt(14, s), {
          align: 'ctr',
          color: ARROW_COLOR,
        }),
      );
    }
  });

  for (const domain of ['complex', 'complicated', 'chaotic', 'clear'] as const) {
    const { box } = regions[domain];
    if (!box) continue;
    parts.push(rect(nextId(), scalePt(box.x, s), scalePt(box.y, s), scalePt(box.w, s), scalePt(box.h, s), DOMAIN_FILL[domain], GRID_BORDER, DOMAIN_LABEL[domain]));
    parts.push(
      textBoxLines(nextId(), scalePt(box.x + 6, s), scalePt(box.y + 4, s), scalePt(box.w - 12, s), scalePt(20, s), [DOMAIN_LABEL[domain]], scaledFontSizeHalfPt(20, s), {
        bold: true,
        color: '404040',
      }),
    );
    parts.push(
      textBoxLines(nextId(), scalePt(box.x + 6, s), scalePt(box.y + 24, s), scalePt(box.w - 12, s), scalePt(16, s), [DOMAIN_SUBTITLE[domain]], scaledFontSizeHalfPt(12, s), {
        color: '808080',
      }),
    );
    let itemY = box.y + 46;
    for (const item of chart.items[domain]) {
      const badge = itemBadge(nextId, item, box.x + 6, itemY, s);
      parts.push(...badge.xml);
      itemY += badge.height + 4;
    }
  }

  // Confusion: a small center ellipse, items capped at 3 with a "+N more"
  // overflow badge — both behaviors sourced directly from the docs.
  const confusion = regions.confusion;
  parts.push(
    ellipse(nextId(), scalePt(confusion.cx - CONFUSION_R, s), scalePt(confusion.cy - CONFUSION_R, s), scalePt(CONFUSION_R * 2, s), scalePt(CONFUSION_R * 2, s), DOMAIN_FILL.confusion, GRID_BORDER),
  );
  parts.push(
    textBoxLines(nextId(), scalePt(confusion.cx - CONFUSION_R + 4, s), scalePt(confusion.cy - CONFUSION_R + 4, s), scalePt(CONFUSION_R * 2 - 8, s), scalePt(16, s), [DOMAIN_LABEL.confusion], scaledFontSizeHalfPt(16, s), {
      bold: true,
      align: 'ctr',
      color: '404040',
    }),
  );
  const confusionItems = chart.items.confusion;
  const shown = confusionItems.slice(0, 3);
  const overflow = confusionItems.length - shown.length;
  let confusionItemY = confusion.cy - CONFUSION_R + 22;
  for (const item of shown) {
    const badge = itemBadge(nextId, item, confusion.cx - CONFUSION_R + 8, confusionItemY, s);
    parts.push(...badge.xml);
    confusionItemY += badge.height + 3;
  }
  if (overflow > 0) {
    const badge = itemBadge(nextId, `+${overflow} more`, confusion.cx - CONFUSION_R + 8, confusionItemY, s);
    parts.push(...badge.xml);
  }

  const content = parts.join('\n');
  const docPrId = nextId();
  return wrapDrawingCanvas(content, canvasW, canvasH, docPrId, chart.title ?? 'Cynefin framework');
}
