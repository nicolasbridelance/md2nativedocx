/**
 * Layered graph layout engine producing pixel coordinates.
 *
 * V1 delegates to **Dagre** (the same engine Mermaid uses internally, spec §5.2,
 * ADR 0001). This is a thin, pure wrapper: AST -> Dagre graph -> pixel
 * coordinates. Graphviz-WASM remains an optional future fallback for dense
 * graphs (>25 nodes) via the `engine` option, without changing the output
 * contract (pixel coordinates).
 *
 * This module is a pure function from AST to coordinates. It has no knowledge
 * of OOXML.
 */

import dagre from 'dagre';
import type {
  Flowchart,
  Layout,
  LayoutBox,
  LayoutPoint,
  LayoutResult,
  NodeShape,
  Subgraph,
  SubgraphBox,
} from '../types.js';

/**
 * Minimum node dimensions in logical pixels — a floor under
 * {@link nodeDimensions}'s text-driven sizing, not the fixed size every node
 * used to get regardless of its label. Kept as the public export name for
 * source compatibility (`packages/core`'s barrel, `index.ts`).
 */
export const NODE_WIDTH = 70;
export const NODE_HEIGHT = 40;
/** Horizontal gap between nodes in the same rank. */
const RANK_GAP = 60;
/** Vertical gap between ranks. */
const LEVEL_GAP = 80;
/**
 * Vertical space reserved at the top of every subgraph box for its title bar.
 * Dagre sizes a cluster tightly around its child nodes with no allowance for
 * a label, so without this a subgraph's title (drawn by the translator at the
 * top of the box) overlaps the first contained node. Shared with
 * `ooxml-translator.ts`, which sizes the title textbox to this same height
 * (in EMU) — a single source of truth so the two can't drift apart.
 */
export const SUBGRAPH_TITLE_HEIGHT = 24;

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  /** Layout engine. `dagre` is the default; `graphviz` is reserved for future use. */
  engine?: 'dagre' | 'graphviz';
}

/**
 * Text-driven node sizing (spec follow-up, found 2026-09-02): every node used
 * to get the exact same fixed box (`NODE_WIDTH`x`NODE_HEIGHT`) regardless of
 * its label — short labels sat lost in an oversized box, long ones wrapped
 * awkwardly, and a `diamond`'s usable interior (a diamond's inscribed text
 * area is much smaller than its bounding box) was routinely too small for
 * its own label, which is what produced the severe text clipping/corruption
 * documented in TODO.md. Mermaid's own renderer sizes every node to its
 * text; this is the same idea, minus real font-metrics measurement (no DOM,
 * no canvas, no new dependency — rule #6, AGENTS.md) — a per-character-class
 * average-width estimate instead. It won't match Word's actual glyph metrics
 * pixel-for-pixel (nothing short of asking Word to lay out the text could),
 * but it only has to get the box roughly right: Word still wraps the text
 * itself at render time (`wrap="square"` in `bodyPr()`), this just has to
 * stop being wrong by a factor of 2-3x.
 */

/** Effective font size node/subgraph-title text renders at: no explicit
 * `w:sz` is set on that text (`ooxml-translator.ts`), so it inherits Pandoc's
 * reference.docx `docDefaults` (`w:sz w:val="24"` = 12pt = 16px at 96 DPI) —
 * which, calibrating against it, turns out to already be close to Mermaid's
 * own 16px default. Duplicated here rather than imported: the translator
 * doesn't set this value, it merely doesn't override the inherited default,
 * so there is no single source of truth to import from. */
const FONT_SIZE_PX = 16;
/** Roughly 1.25x font size, the usual single-line-height rule of thumb. */
const LINE_HEIGHT_PX = 20;
/** Horizontal/vertical padding between a node's text and its border. */
const PAD_X = 16;
const PAD_Y = 12;
/**
 * Width `wrapEstimate`'s greedy word-packing wraps to a new line past —
 * otherwise a long label would produce an arbitrarily wide, increasingly
 * implausible box. Mermaid does the same (wrap past a threshold rather than
 * grow forever). Safe to size on the generous side now that wrapping only
 * ever happens at a word boundary (never mid-word, see `wrapEstimate`):
 * wrapping a little earlier than strictly necessary just costs a bit of
 * vertical space, which is a much smaller problem than the mid-word breaks
 * an earlier, lower value caused.
 */
const MAX_LINE_WIDTH_PX = 190;
/**
 * Safety margin applied to every box's text-driven dimensions, to survive
 * `scaledExtent()` shrinking the whole diagram to fit the page.
 *
 * Found empirically (2026-09-02): a box sized to exactly fit its label at
 * native scale wraps anyway once the diagram is large enough that
 * `scaledExtent()` (further down this file) scales the whole group down —
 * `wp:extent` (display size) ends up smaller than `a:chExt` (native size),
 * and Word/LibreOffice appear to scale a group's *shape geometry* by that
 * ratio without correspondingly shrinking the *literal point size* of text
 * inside its `wps:txbx` content — so the same text that fit its box at
 * native scale visibly no longer does once the group is displayed smaller.
 * Reproduced directly: the label "Traitement" fits its exactly-sized box on
 * one line in an isolated single-node diagram (never scaled down), but
 * wraps to two lines in a 5-node `flowchart LR` where the whole group is
 * scaled to ~80% to fit the page — identical computed box width in both
 * cases, different rendered outcome. There is no single correct
 * compensation factor (the actual scale ratio isn't known until the whole
 * diagram's bounding box is computed, after node sizing), so this errs
 * generous rather than trying to predict it exactly.
 */
const SCALE_SAFETY_MARGIN = 1.5;

/**
 * Per-character-class average glyph width, as a fraction of font size (em).
 * A coarse three-tier estimate — no real font metrics available without a
 * DOM/canvas or a new dependency. Calibrated empirically (2026-09-02) by
 * bisecting the real minimum non-wrapping box width for "Rectangle" (9
 * characters, no space to wrap at — the `shapes` fixture's worst case) in an
 * *unscaled* single-node diagram, isolating this baseline from the separate
 * `SCALE_SAFETY_MARGIN` effect: 120px fit, 80px didn't. A first pass at this
 * table (0.52 em/char for lowercase) implied ~77px was enough — undershooting
 * by roughly a third even before any scale-down is in play.
 */
const AVG_CHAR_WIDTH_EM = {
  upper: 0.7,
  digit: 0.58,
  space: 0.3,
  other: 0.6,
} as const;

/**
 * Estimate a label's single-line rendered width in pixels at `fontSizePx`
 * (defaults to `FONT_SIZE_PX`, node/subgraph-title text's effective size —
 * pass a different size for text that renders at an explicit `w:sz`, e.g.
 * the 8pt edge-label captions in `ooxml-translator.ts`). Exported (not part
 * of the public `packages/core` barrel, `index.ts`) so the translator can
 * size an edge-label box to its own text instead of a fixed constant, the
 * same reasoning `nodeDimensions` below already applies to node boxes.
 */
export function estimateTextWidth(text: string, fontSizePx: number = FONT_SIZE_PX): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += AVG_CHAR_WIDTH_EM.space;
    else if (ch >= '0' && ch <= '9') em += AVG_CHAR_WIDTH_EM.digit;
    else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) em += AVG_CHAR_WIDTH_EM.upper;
    else em += AVG_CHAR_WIDTH_EM.other;
  }
  return em * fontSizePx;
}

/**
 * How many lines a label wraps to, and the resulting box's inner (text)
 * width, simulating a real greedy word-wrap (pack words onto a line until
 * the next word would push it past `MAX_LINE_WIDTH_PX`, then start a new
 * line) rather than dividing the label's total width by the cap.
 *
 * That flatter approach — this function's first version — actively broke
 * things: dividing "Commande recue"'s total estimated width by a threshold
 * doesn't know where the word boundary is, so it could (and did, once the
 * threshold was lowered enough to fix the clipping below) size a box too
 * narrow for even a *single* word, forcing Word to hyphenate/break mid-word
 * ("Reserver" -> "Rese" / "rver"). Wrapping only ever happens at a space, so
 * this has to reason in words, not raw character counts. A lone word wider
 * than the cap is left on its own line at its own (over-cap) width rather
 * than force-broken — the resulting box is wider than `MAX_LINE_WIDTH_PX`
 * for that one case, which is a far smaller problem than a split word.
 *
 * `SCALE_SAFETY_MARGIN` is applied to the width each packing decision is
 * based on, not just to the final box — seeding the *packing itself* with
 * the optimistic, un-margined estimate under-packed lines relative to what
 * Word's own (wider, in practice) wrapping produced, which is what caused
 * the clipping this function was rewritten to fix in the first place: a
 * label predicted to need one line that actually needed two, with no height
 * reserved for the second.
 */
function wrapEstimate(label: string): { lines: number; textWidth: number } {
  const words = label.split(' ').filter((w) => w.length > 0);
  if (words.length === 0) return { lines: 1, textWidth: 1 };

  const lineWidths: number[] = [];
  let current = words[0]!;
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (estimateTextWidth(candidate) * SCALE_SAFETY_MARGIN <= MAX_LINE_WIDTH_PX) {
      current = candidate;
    } else {
      lineWidths.push(estimateTextWidth(current) * SCALE_SAFETY_MARGIN);
      current = word;
    }
  }
  lineWidths.push(estimateTextWidth(current) * SCALE_SAFETY_MARGIN);

  return { lines: lineWidths.length, textWidth: Math.max(1, ...lineWidths) };
}

/**
 * A node's box dimensions, sized to its label instead of a fixed constant.
 *
 * `diamond` doubles both axes over what a rectangle with the same label
 * would need: a rhombus's largest centered inscribed rectangle of half-width
 * x and half-height y, within a rhombus of half-diagonals a and b, must
 * satisfy x/a + y/b <= 1 — setting the rhombus's full width/height to twice
 * the text box's is a simple sufficient (not tightest) bound that guarantees
 * the label fits without clipping, at the cost of a visibly larger diamond
 * than a tightly-fitted one. Favouring "clearly big enough" over "exactly
 * as small as provably safe" on purpose: the bug this fixes was severe text
 * corruption from a diamond sized too close to the edge, not a diamond a
 * few pixels larger than ideal.
 */
function nodeDimensions(label: string, shape: NodeShape): { width: number; height: number } {
  // wrapEstimate's textWidth already has SCALE_SAFETY_MARGIN baked in (it
  // needs it before the 1-vs-2-line decision, see its own doc comment); only
  // height still needs it applied here.
  const { lines, textWidth } = wrapEstimate(label);
  // A small fractional buffer, not a whole extra line: wrapEstimate's greedy
  // word-packing (with the same SCALE_SAFETY_MARGIN already folded into its
  // own packing decisions) is the thing actually responsible for predicting
  // the right line count now: inflating every box's height by a full line
  // regardless of whether it needs one (an earlier version of this line)
  // made every box taller than its label warranted — including single-word
  // labels that never wrap at all ("Fin" got a 96px-tall box for 3
  // characters) — which in turn made scaledExtent() shrink the whole
  // diagram more aggressively to fit the page, which made
  // SCALE_SAFETY_MARGIN's job *harder*, not easier. This buffer only has to
  // cover descender/rounding slack at a line boundary.
  const textHeight = (lines + 0.3) * LINE_HEIGHT_PX;
  const rectWidth = textWidth + 2 * PAD_X;
  const rectHeight = (textHeight + 2 * PAD_Y) * SCALE_SAFETY_MARGIN;

  if (shape === 'diamond') {
    return {
      width: Math.max(NODE_WIDTH, 2 * rectWidth),
      height: Math.max(NODE_HEIGHT, 2 * rectHeight),
    };
  }
  if (SLANTED_SHAPES.has(shape)) {
    // Like diamond above, but milder: a hexagon/parallelogram/trapezoid's
    // slanted sides eat into the corners of its bounding box, just less
    // aggressively than a rhombus does. The text box itself isn't clipped by
    // the shape outline (it's an independent overlay), but without this the
    // label visibly overhangs the slant near a corner.
    return {
      width: Math.max(NODE_WIDTH, SLANTED_WIDTH_MARGIN * rectWidth),
      height: Math.max(NODE_HEIGHT, rectHeight),
    };
  }
  return {
    width: Math.max(NODE_WIDTH, rectWidth),
    height: Math.max(NODE_HEIGHT, rectHeight),
  };
}

/** Node shapes whose sides slant inward, needing extra width so a label clears the corners. */
const SLANTED_SHAPES: ReadonlySet<NodeShape> = new Set([
  'hexagon',
  'parallelogram',
  'parallelogramAlt',
  'trapezoid',
  'trapezoidAlt',
]);

/** Extra width factor for {@link SLANTED_SHAPES}, well under diamond's 2x since the loss is milder. */
const SLANTED_WIDTH_MARGIN = 1.35;

/**
 * Compute pixel coordinates for every node and subgraph in the flowchart.
 * Returns a {@link LayoutResult} with node boxes and subgraph container boxes.
 */
export function layout(flowchart: Flowchart, options: LayoutOptions = {}): LayoutResult {
  // Explicit nodeWidth/nodeHeight forces every node to that fixed size, as
  // before (an escape hatch, e.g. for a caller comparing layouts head-to-head
  // without label-length noise). Omitted (the normal case): each node is
  // sized to its own label via nodeDimensions().
  const fixedSize =
    options.nodeWidth !== undefined || options.nodeHeight !== undefined
      ? { width: options.nodeWidth ?? NODE_WIDTH, height: options.nodeHeight ?? NODE_HEIGHT }
      : null;
  const engine = options.engine ?? 'dagre';

  if (engine === 'graphviz') {
    // Graphviz-WASM is a reserved future option (ADR 0001). Not wired up yet.
    throw new Error('Layout engine "graphviz" is not implemented yet (see ADR 0001).');
  }

  // Dagre's `rankdir` values are `TB`/`BT`/`LR`/`RL` — note `TB`, not `TD`.
  // Mermaid's `TD` (top-down) had been passed straight through as the literal
  // string `'TD'`, which isn't a value Dagre recognizes; it silently fell
  // back to Dagre's own default (`TB`), which happens to coincide visually
  // with `TD`, masking the mismatch. Mapped explicitly here now that `BT`/
  // `RL` are real, distinct directions this parser produces (`parser.ts`).
  const RANKDIR_BY_DIRECTION: Record<Flowchart['direction'], 'TB' | 'BT' | 'LR' | 'RL'> = {
    TD: 'TB',
    BT: 'BT',
    LR: 'LR',
    RL: 'RL',
  };

  const warnings: string[] = [];

  const buildGraph = (useClusters: boolean) => {
    const g = new dagre.graphlib.Graph({ compound: true });
    g.setGraph({
      rankdir: RANKDIR_BY_DIRECTION[flowchart.direction],
      nodesep: RANK_GAP,
      ranksep: LEVEL_GAP,
      marginx: 0,
      marginy: 0,
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const node of flowchart.nodes) {
      const { width, height } = fixedSize ?? nodeDimensions(node.label, node.shape);
      g.setNode(node.id, { width, height });
    }
    for (const edge of flowchart.edges) {
      if (g.hasNode(edge.from) && g.hasNode(edge.to)) {
        g.setEdge(edge.from, edge.to);
      }
    }

    if (useClusters) {
      // Register subgraphs as Dagre clusters and assign their nodes to them.
      for (const sg of flowchart.subgraphs) {
        g.setNode(sg.id, { width: 0, height: 0, cluster: true });
        for (const nodeId of sg.nodeIds) {
          if (g.hasNode(nodeId)) g.setParent(nodeId, sg.id);
        }
        for (const childId of sg.subgraphIds) {
          if (g.hasNode(childId)) g.setParent(childId, sg.id);
        }
      }
    }

    return g;
  };

  // Dagre has a long-standing, unfixed bug (dagre is unmaintained upstream)
  // where its `order` phase crashes — `Cannot set properties of undefined
  // (setting 'order')` — on some large graphs that combine many compound
  // clusters (subgraphs) with cycles among their members. Found empirically
  // (2026-09-04) on a 169-node/295-edge/36-subgraph real-world fixture
  // (`medium3.mmd`): reproduces with clustering on, but the identical
  // node/edge set lays out fine with clustering off, and isolating the
  // implicated subgraph alone (or pre-breaking every cycle before handing
  // the graph to Dagre) does not stop the crash — so this is Dagre's own
  // cluster+order interaction, not something this parser's output can
  // sidestep by construction. Retrying without clusters trades subgraph
  // container boxes (silently dropped by the translator when
  // `layout.subgraphs` has no entry for an id, see `renderSubgraph`) for a
  // diagram that still renders, instead of the whole export falling back to
  // ~1000 lines of raw ```mermaid text (spec §10 "surface warnings" — this
  // degradation is reported as a warning, not hidden).
  let g = buildGraph(true);
  try {
    dagre.layout(g);
  } catch (err) {
    if (flowchart.subgraphs.length === 0) throw err;
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(
      `Layout with subgraph containers failed (${message}); retried without them -- subgraph boxes are omitted from this diagram.`,
    );
    g = buildGraph(false);
    dagre.layout(g);
  }

  // Use a null-prototype object so hostile node ids like `__proto__` or
  // `constructor` cannot collide with Object.prototype members (prototype
  // pollution). This is a security boundary: node ids come from untrusted text.
  const nodes: Layout = Object.create(null) as Layout;
  for (const node of flowchart.nodes) {
    const n = g.node(node.id);
    // Dagre positions by center; convert to top-left origin.
    nodes[node.id] = {
      x: n.x - n.width / 2,
      y: n.y - n.height / 2,
      width: n.width,
      height: n.height,
    };
  }

  // Subgraph container boxes from Dagre cluster geometry.
  const subgraphs: Record<string, SubgraphBox> = Object.create(null) as Record<string, SubgraphBox>;
  for (const sg of flowchart.subgraphs) {
    const c = g.node(sg.id);
    if (c) {
      subgraphs[sg.id] = {
        x: c.x - c.width / 2,
        y: c.y - c.height / 2,
        width: c.width,
        height: c.height,
      };
    }
  }

  // The route Dagre computed for each edge (>2 points when it routed around
  // an intermediate rank's nodes — see LayoutPoint's doc comment). Captured
  // in the same raw coordinate space as `nodes`/`subgraphs` above, before
  // normalization.
  const edges: LayoutPoint[][] = flowchart.edges.map((edge) => {
    const e = g.edge({ v: edge.from, w: edge.to });
    return e ? e.points.map((p) => ({ x: p.x, y: p.y })) : [];
  });

  // Normalize so the top-left of the diagram is at (0,0), using ONE offset
  // derived from nodes AND subgraph boxes and applied consistently to both
  // (plus edges). A subgraph's cluster box is not just the tight bbox of its
  // children — Dagre pads it with its own cluster margin — so it can extend
  // further left/up than every node combined; computing the offset from
  // nodes alone (an earlier version of this function did, matching the
  // original pre-refactor code's behaviour for nodes) left such a subgraph at
  // a negative x/y, which breaks rendering entirely (verified empirically:
  // LibreOffice renders nothing at all for a drawing with a negative-origin
  // child, no partial/degraded output). (That earlier version also inherited
  // a second, previously-latent bug: subgraphs were normalized using the
  // *already-normalized* nodes' minX/minY, i.e. always 0, so they were never
  // actually shifted at all — invisible only because Dagre's raw subgraph
  // origin happened to already be non-negative in every shape tried so far.)
  const [minX, minY] = boundsOrigin(nodes, subgraphs);
  const normalizedNodes = shiftLayout(nodes, minX, minY);
  const normalizedSubgraphs = shiftSubgraphs(subgraphs, minX, minY);
  const normalizedEdges = edges.map((points) => points.map((p) => ({ x: p.x - minX, y: p.y - minY })));

  // Reserve title-bar space in every subgraph box (spec §6.1) — see
  // reserveSubgraphTitleSpace for why this is safe to do once per subgraph,
  // independent of nesting order. Edge routes are NOT shifted by this pass:
  // the translator always re-derives an edge's actual start/end from the
  // (already title-shifted) node boxes, so only an edge that both crosses a
  // subgraph boundary AND routes around an intermediate rank could show a
  // few-pixel seam at the boundary — accepted for now as a minor cosmetic
  // gap, not a correctness one.
  reserveSubgraphTitleSpace(flowchart, normalizedNodes, normalizedSubgraphs);

  return { nodes: normalizedNodes, subgraphs: normalizedSubgraphs, edges: normalizedEdges, warnings };
}

/**
 * The (minX, minY) across every node's AND every subgraph's top-left corner,
 * or (0, 0) if there are none. Must include subgraphs — see the caller.
 */
function boundsOrigin(nodes: Layout, subgraphs: Record<string, SubgraphBox>): [number, number] {
  let minX = Infinity;
  let minY = Infinity;
  for (const box of Object.values(nodes)) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
  }
  for (const box of Object.values(subgraphs)) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
  }
  return minX === Infinity ? [0, 0] : [minX, minY];
}

/**
 * Collect every node id transitively contained in a subgraph (direct members
 * plus members of any nested subgraph, at any depth).
 */
function descendantNodeIds(sg: Subgraph, flowchart: Flowchart): string[] {
  const ids = [...sg.nodeIds];
  for (const childId of sg.subgraphIds) {
    const child = flowchart.subgraphs.find((s) => s.id === childId);
    if (child) ids.push(...descendantNodeIds(child, flowchart));
  }
  return ids;
}

/**
 * Collect every subgraph id transitively nested inside a subgraph (its direct
 * children plus their own children, at any depth) — not including `sg`
 * itself.
 */
function descendantSubgraphIds(sg: Subgraph, flowchart: Flowchart): string[] {
  const ids: string[] = [];
  for (const childId of sg.subgraphIds) {
    ids.push(childId);
    const child = flowchart.subgraphs.find((s) => s.id === childId);
    if (child) ids.push(...descendantSubgraphIds(child, flowchart));
  }
  return ids;
}

/**
 * Grow every subgraph's box by `SUBGRAPH_TITLE_HEIGHT` and push its
 * descendants down by the same amount, mutating `nodes`/`subgraphs` in place.
 *
 * Order does not matter: each subgraph's adjustment only reads the flowchart's
 * static containment tree (`nodeIds`/`subgraphIds`), never another
 * subgraph's already-mutated box, so processing subgraphs in any order (or in
 * parallel, conceptually) yields the same final, self-consistent result. A
 * node nested two levels deep ends up shifted down by two title heights, one
 * per ancestor subgraph — correct, since there are two title bars stacked
 * above it.
 */
function reserveSubgraphTitleSpace(
  flowchart: Flowchart,
  nodes: Layout,
  subgraphs: Record<string, SubgraphBox>,
): void {
  for (const sg of flowchart.subgraphs) {
    const box = subgraphs[sg.id];
    if (!box) continue;

    for (const nodeId of descendantNodeIds(sg, flowchart)) {
      const n = nodes[nodeId];
      if (n) n.y += SUBGRAPH_TITLE_HEIGHT;
    }
    for (const childId of descendantSubgraphIds(sg, flowchart)) {
      const childBox = subgraphs[childId];
      if (childBox) childBox.y += SUBGRAPH_TITLE_HEIGHT;
    }
    box.height += SUBGRAPH_TITLE_HEIGHT;
  }
}

function shiftSubgraphs(
  subgraphs: Record<string, SubgraphBox>,
  offsetX: number,
  offsetY: number,
): Record<string, SubgraphBox> {
  const out: Record<string, SubgraphBox> = Object.create(null) as Record<string, SubgraphBox>;
  for (const [id, box] of Object.entries(subgraphs)) {
    out[id] = { ...box, x: box.x - offsetX, y: box.y - offsetY };
  }
  return out;
}

function shiftLayout(layout: Layout, offsetX: number, offsetY: number): Layout {
  const out: Layout = Object.create(null) as Layout;
  for (const [id, box] of Object.entries(layout)) {
    out[id] = { ...box, x: box.x - offsetX, y: box.y - offsetY };
  }
  return out;
}

/** Compute the total bounding box of a layout, in pixels. */
export function boundingBox(layout: Layout): LayoutBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of Object.values(layout)) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
