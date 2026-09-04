/**
 * OOXML/DrawingML translator: AST + layout coordinates -> a self-contained
 * WordprocessingML paragraph containing a `wpc:wpc` (drawing canvas) of
 * ungrouped shapes, as an XML string.
 *
 * This is the heart of the project (spec §5.3). It is a pure function from
 * (Flowchart, Layout) to a single XML string that can be injected verbatim into
 * a Pandoc `RawBlock('openxml', ...)` (ADR 0002). "Pure" is load-bearing: the
 * same inputs must always produce byte-identical output, so all shape ids are
 * allocated by a per-call counter (a module-level counter would leak state
 * across calls and break the golden tests' determinism).
 *
 * The emitted fragment is a complete `w:p` paragraph wrapping the drawing in
 * the schema-required hierarchy `w:p -> w:r -> w:drawing -> wp:inline ->
 * a:graphic -> a:graphicData -> wpc:wpc -> [shapes]`. A bare `wpc:wpc` cannot
 * be a direct child of `w:body`; emitting the full paragraph is what makes the
 * `.docx` open cleanly in Word (spec §5.3 "Encapsulation en `<wpg:wgp>` ...
 * inséré dans `<w:drawing><wp:inline>...`" — the spec's own wording predates
 * this file dropping the `wpg:wgp` group it originally described, see
 * `renderContent`'s doc comment; the paragraph-wrapping requirement itself is
 * unchanged). No shape is ever grouped (`wpg:wgp`/`wpg:grpSp`) any more — see
 * `renderContent` and `renderSubgraph`'s doc comments for why.
 *
 * The element structure follows the official Microsoft schemas
 * (ECMA-376 + MS-OE376, as published in the Open XML SDK) and was diffed
 * against a real Word-authored document (`tools/word-reference/`):
 *   - `wps:wsp` requires `wps:cNvPr`, then either `wps:cNvSpPr` (shape) or
 *     `wps:cNvCnPr` (connector), then `wps:spPr`, optional `wps:style`,
 *     optional `wps:txbx`, and `wps:bodyPr`.
 *   - `wp:inline` requires `wp:extent` and `wp:docPr` before `a:graphic`.
 *   - Every `id` in a drawing (`wp:docPr`, `wps:cNvPr`) must be distinct, or
 *     Word reports the file as corrupt and offers to repair it.
 *
 * Security invariants (AGENTS.md):
 * - Every user-controlled string is XML-escaped (rule #2) via {@link escapeXml}.
 * - Colors reaching an XML attribute are validated as 6-digit hex
 *   ({@link hexColor}), not merely escaped: `a:srgbClr/@val` is attacker-
 *   reachable through `classDef` and through the public `TranslateOptions`.
 * - No external OOXML relationship is ever emitted (rule #3): the output is
 *   fully self-contained, with all namespaces declared inline.
 */

import { SUBGRAPH_TITLE_HEIGHT, estimateTextWidth } from '../layout/layout.js';
import type {
  EdgeType,
  Flowchart,
  Layout,
  LabelToken,
  LayoutPoint,
  LayoutResult,
  NodeShape,
  Subgraph,
} from '../types.js';
import { labelLines } from '../label-runs.js';
import { escapeXml } from './xml-escape.js';

/** Pixels -> EMU (English Metric Units). Word uses 914400 EMU per inch; at 96
 * DPI that is 9525 EMU per pixel. */
const EMU_PER_PX = 9525;

/** Default shape fill/line colors (spec §6.1). */
const DEFAULT_FILL = 'D9E2F3';
const DEFAULT_LINE = '2F5496';

/** Subgraph cluster container colors (`renderSubgraph`) -- deliberately
 * neutral gray, not `DEFAULT_FILL`/`DEFAULT_LINE`, so a cluster box reads as
 * "container" rather than "another node" (matches Mermaid's own subgraph
 * convention: a gray dashed border, not a themed one). */
const SUBGRAPH_FILL = 'E8E8E8';
const SUBGRAPH_LINE = '999999';
/** ~1pt at 96 DPI (`EMU_PER_PX` below), matching a typical Mermaid cluster border weight. */
const SUBGRAPH_BORDER_WIDTH_EMU = 9525;

/**
 * Node/subgraph-title text's effective size in half-points (`w:sz`'s unit):
 * 24 = 12pt, Pandoc's `reference.docx` inherited default (`layout.ts`'s
 * `FONT_SIZE_PX` doc comment) — node text never used to declare `w:sz`
 * explicitly, just relying on that inherited default. It has to become
 * explicit now that the root `wpg:wgp` group is gone (`renderContent`'s doc
 * comment): that group used to make an oversized/scaled-down diagram's
 * *rendered* text shrink along with its geometry as one visual unit, for
 * free, regardless of the literal point size declared in the XML — verified
 * directly (2026-09-02): a 3-subgraph diagram scaled to ~40% by
 * `scaledExtent` still rendered legible, properly-proportioned text under
 * the old group-based approach, but rendered blank boxes with text
 * overflowing far outside them once the group (and its free visual scaling)
 * was removed and geometry alone was pre-scaled. Without a group, nothing
 * shrinks text automatically any more, so every text run's `w:sz` is scaled
 * by the same `scale` factor as its container's geometry ({@link
 * scaledFontSizeHalfPt}) to reproduce that same proportion explicitly.
 */
const NODE_FONT_SIZE_HALFPT = 24;
/** Never scale a run below this — a diagram scaled small enough to hit this
 * floor already has other legibility problems (see TODO.md's "lisibilité
 * des gros diagrammes" entry); this only prevents an invalid/zero `w:sz`. */
const MIN_FONT_SIZE_HALFPT = 4;

/** Scale a base `w:sz` (half-points) by the diagram's overall scale factor,
 * floored so it never reaches zero (see {@link MIN_FONT_SIZE_HALFPT}). */
function scaledFontSizeHalfPt(baseHalfPt: number, scale: number): number {
  return Math.max(MIN_FONT_SIZE_HALFPT, Math.round(baseHalfPt * scale));
}

/** Never scale a stroke below this (EMU) — same rationale as
 * {@link MIN_FONT_SIZE_HALFPT}, just in the other unit. */
const MIN_LINE_WIDTH_EMU = 3175; // 0.25pt

/**
 * Scale a base `a:ln`/`w` stroke width (EMU) by the diagram's overall scale
 * factor, floored so it never reaches zero (see {@link MIN_LINE_WIDTH_EMU}).
 *
 * Found 2026-09-02 (user report, real Word, a heavily-scaled-down large
 * diagram): node borders and — much more visibly — connector arrowheads were
 * declared at a fixed width regardless of `scale`, same class of bug as the
 * one {@link scaledFontSizeHalfPt} already fixes for text. `a:tailEnd`'s
 * `w`/`len` (arrowhead size) are enums (`sm`/`med`/`lg`, not a numeric EMU
 * value — no equivalent scaling possible there directly), but their
 * *rendered* physical size is proportional to the connector's own `a:ln w`,
 * so scaling that stroke width alone is enough to make the arrowhead shrink
 * along with the geometry it decorates, without touching the enum itself.
 */
function scaledLineWidth(baseEmu: number, scale: number): number {
  return Math.max(MIN_LINE_WIDTH_EMU, Math.round(baseEmu * scale));
}

/**
 * Pick `a:headEnd`/`a:tailEnd`'s `w`/`len` enum (`sm`/`med`/`lg`, no numeric
 * value exists — see {@link scaledLineWidth}'s doc comment) for a connector
 * whose stroke width came out floored at {@link MIN_LINE_WIDTH_EMU}.
 *
 * Found 2026-09-04 (`docs/specs/FUTURE_full_mermaid_coverage_SPEC.md`'s
 * punch list item 2, root-caused via a real LibreOffice render at 600 DPI —
 * see `test-corpus/visual/fixtures/edge-types-extended.mmd`'s history in
 * TODO.md for the original symptom report): a marker's rendered physical
 * size is proportional to `a:ln w` (confirmed by `scaledLineWidth`'s own
 * 2026-09-02 fix), but every *other* coordinate in this file — including the
 * gap between two adjacent nodes — is multiplied by the uncapped `scale`
 * factor directly (`renderContent`'s doc comment). Once `scale` is small
 * enough to hit the width floor, the marker stops shrinking any further
 * while the gap it sits in keeps shrinking with the uncapped `scale`: at
 * `'med'` (the enum this translator always used before this fix), that gap
 * closes entirely on a long enough compressed chain. A single-headed arrow
 * just looks oversized when that happens; a two-headed one (`<-->`/`o--o`/
 * `x--x`) has its two markers fully overlap into what reads as one solid
 * diamond, with the connecting line itself no longer visible at all —
 * reproduced on a 14-node `flowchart LR` chain, confirmed fixed by this
 * function at the same scale.
 *
 * `'sm'` isn't proportional to how far below the floor the *unfloored*
 * width would have landed — OOXML only offers 3 discrete sizes — but it
 * measurably shrinks the marker-to-gap ratio, and every diagram that never
 * hits the floor (the vast majority — `scale` reaches 1 for anything that
 * already fits the page) is completely unaffected, keeping `'med'` exactly
 * as before.
 */
function arrowMarkerSize(baseWidthEmu: number, scale: number): 'sm' | 'med' {
  return baseWidthEmu * scale < MIN_LINE_WIDTH_EMU ? 'sm' : 'med';
}

/**
 * Usable page area in EMU for Pandoc's default reference document (US Letter,
 * 1 inch margins => 6.5in x 9in). A drawing larger than this is scaled down
 * uniformly rather than being clipped by Word: `wp:extent` and the group's
 * `a:ext` shrink while `a:chOff`/`a:chExt` stay in native coordinates, so Word
 * applies the homothety to every child shape for us.
 *
 * Height IS capped, on purpose, even though the drawing is `wp:inline` (flows
 * with the text) and one might expect Word to paginate an over-height inline
 * object the way it does an oversized picture. It does not, for this element
 * — see {@link MIN_SAFE_ASPECT_RATIO} for what's actually going on and why a
 * height cap alone was never the whole story. Not verified against real
 * Word; treat the multi-page case as genuinely unresolved (see TODO.md).
 */
const MAX_DRAWING_CX = 5943600;
const MAX_DRAWING_CY = 8229600;

/**
 * Above this native (unscaled) height, a `wpc:wpc`/`wpg:wgp` group renders in
 * LibreOffice ONLY IF its width:height ratio is at least
 * {@link MIN_SAFE_ASPECT_RATIO} — narrower than that, and headless
 * `soffice --convert-to png/pdf` produces nothing at all for it: no shapes,
 * no error, no partial output, just the surrounding document text. Below this
 * height, any ratio renders fine, however narrow (verified down to 0.09).
 *
 * Found empirically with ~25 controlled renders (fixed content, only height
 * and/or width varied): e.g. at a fixed native height of 13.75in, width
 * 10.62in (ratio 0.77) rendered nothing while width 12.5in (ratio 0.91)
 * rendered correctly — same height, only the ratio changed. Bracketed the
 * height cliff itself (at ratio-safe / unscaled shapes) between 7.92in
 * (renders) and 9.38in (does not). Neither boundary was pinned to exact
 * precision, so both constants below carry a safety margin: 7.5in is below
 * the lowest observed safe height, 1.0 is above the highest observed unsafe
 * ratio. Not explained by LibreOffice's source (no access to it), and not
 * verified in real Word.
 */
const TALL_RATIO_RISK_HEIGHT = 6858000; // 7.5in
const MIN_SAFE_ASPECT_RATIO = 1.0;

/**
 * Map a node shape to its DrawingML preset geometry (spec §6.1, extended to
 * the v11.3+ `@{ shape: ... }` catalog — see `SHAPE_ALIAS_MAP` in
 * `parser.ts` for which Mermaid shape names route here). The `flowChart*`
 * family is Word/PowerPoint's own built-in flowchart shape gallery, so most
 * of these are exact matches rather than approximations.
 */
const PRST_BY_SHAPE: Readonly<Record<NodeShape, string>> = {
  rect: 'rect',
  roundRect: 'roundRect',
  stadium: 'roundRect', // stadium approximated by roundRect with max adj
  diamond: 'diamond',
  cylinder: 'can', // cylinder approximated by `can`
  ellipse: 'ellipse',
  hexagon: 'hexagon',
  parallelogram: 'parallelogram',
  parallelogramAlt: 'parallelogram', // mirrored via flipH, see FLIP_BY_SHAPE
  trapezoid: 'trapezoid',
  trapezoidAlt: 'trapezoid', // mirrored via flipV, see FLIP_BY_SHAPE
  subroutine: 'flowChartPredefinedProcess', // rect with the two inset bars Mermaid draws
  doubleCircle: 'ellipse', // no double-ring preset exists; approximated by a single ellipse
  document: 'flowChartDocument',
  card: 'flowChartPunchedCard',
  delay: 'flowChartDelay',
  triangle: 'flowChartExtract',
  triangleInverted: 'flowChartExtract', // mirrored via flipV, see FLIP_BY_SHAPE
  windowPane: 'flowChartInternalStorage',
  hourglass: 'flowChartCollate',
  curvedTrapezoid: 'flowChartDisplay',
  bolt: 'lightningBolt',
  braceLeft: 'leftBrace',
  braceRight: 'rightBrace',
  bracePair: 'bracePair',
  crossedCircle: 'flowChartOr',
  filledCircle: 'flowChartSummingJunction', // no plain-filled-dot preset; closest built-in junction symbol
  paperTape: 'flowChartPunchedTape',
  horizontalCylinder: 'flowChartMagneticDisk',
  linedCylinder: 'flowChartMagneticDrum',
  manualInput: 'flowChartManualInput',
  asymmetric: 'homePlate', // Mermaid's asymmetric/flag shape (id>Text]); closest built-in preset
};

/**
 * Preset geometries are directional (e.g. `trapezoid` is narrow-top/wide-bottom
 * by default): Mermaid's mirrored syntaxes (`[\Text\]`, `[\Text/]`) reuse the
 * same preset and flip it on one axis instead of needing a second preset.
 * Same idea for `triangleInverted` (Mermaid's "Manual File" shape, `@{shape:
 * flipped-triangle}`), which is `triangle` flipped vertically.
 */
const FLIP_BY_SHAPE: Readonly<Partial<Record<NodeShape, 'flipH' | 'flipV'>>> = {
  parallelogramAlt: 'flipH',
  trapezoidAlt: 'flipV',
  triangleInverted: 'flipV',
};

/**
 * Arrowhead marker at one connector end (`a:headEnd`/`a:tailEnd` `@type`).
 * `cross` (Mermaid's `--x`/`x--x`) has no built-in DrawingML marker — no enum
 * value draws an X — so it is approximated by `diamond`, the built-in shape
 * least likely to be confused with `triangle` (arrow) or `oval` (circle).
 */
type ArrowMarker = 'none' | 'triangle' | 'oval' | 'diamond';

/**
 * Map an edge type to its connector line style (spec §6.2): dash pattern,
 * stroke width, and the marker at each end (`headEnd` = the `from` node,
 * `tailEnd` = the `to` node — Word's connector direction always runs
 * start-to-end regardless of Mermaid's arrow direction). `invisible` (`~~~`)
 * still gets a real connector (so Word's Selection Pane and any future
 * docx2mermaid reader see it) but with `<a:noFill/>` instead of a stroke —
 * the edge stays in the AST purely for Dagre's ranking, same as Mermaid's
 * own behavior for invisible links.
 */
const LINE_STYLE_BY_EDGE: Readonly<
  Record<EdgeType, { dash: string; width: number; headEnd: ArrowMarker; tailEnd: ArrowMarker; invisible?: boolean }>
> = {
  arrow: { dash: 'solid', width: 12700, headEnd: 'none', tailEnd: 'triangle' },
  line: { dash: 'solid', width: 12700, headEnd: 'none', tailEnd: 'none' },
  dotted: { dash: 'dash', width: 12700, headEnd: 'none', tailEnd: 'triangle' },
  dottedLine: { dash: 'dash', width: 12700, headEnd: 'none', tailEnd: 'none' },
  thick: { dash: 'solid', width: 25400, headEnd: 'none', tailEnd: 'triangle' },
  thickLine: { dash: 'solid', width: 25400, headEnd: 'none', tailEnd: 'none' },
  bidirectional: { dash: 'solid', width: 12700, headEnd: 'triangle', tailEnd: 'triangle' },
  circle: { dash: 'solid', width: 12700, headEnd: 'none', tailEnd: 'oval' },
  cross: { dash: 'solid', width: 12700, headEnd: 'none', tailEnd: 'diamond' },
  circleBoth: { dash: 'solid', width: 12700, headEnd: 'oval', tailEnd: 'oval' },
  crossBoth: { dash: 'solid', width: 12700, headEnd: 'diamond', tailEnd: 'diamond' },
  invisible: { dash: 'solid', width: 12700, headEnd: 'none', tailEnd: 'none', invisible: true },
};

/** Namespaces declared inline on the root `wpg:wgp` (self-contained, rule #3). */
const NS = {
  wpg: 'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"',
  wps: 'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
  wp: 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  a: 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  pic: 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  r: 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  w: 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
};

export interface TranslateOptions {
  /** Fill color (hex, no `#`) for node shapes. */
  fill?: string;
  /** Line color (hex, no `#`) for node shapes and edges. */
  line?: string;
}

/** A rectangle in logical pixels. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Allocates the distinct `id` values a drawing needs. Word treats
 * `wp:docPr/@id` and every `cNvPr/@id` in the same drawing as one id space and
 * flags the document as corrupt on a collision, so a single counter feeds them
 * all. It is per-call so the translator stays a pure function.
 */
function createIdAllocator(): () => number {
  let next = 1;
  return () => next++;
}

/**
 * Validate a color as 6 hexadecimal digits, falling back to `fallback` when it
 * is not. Applied to every color that reaches an `a:srgbClr/@val` attribute:
 * `classDef` fills and the public {@link TranslateOptions} are both
 * user-controlled, and escaping alone would still let a bad value through into
 * the rendered XML.
 */
function hexColor(value: string | undefined, fallback: string): string {
  return value !== undefined && /^[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : fallback;
}

/**
 * Pick a readable text color for a shape fill, so labels stay visible on both
 * light and dark fills. Word resolves shape text color from the theme
 * (`a:fontRef` -> `lt1`, i.e. white), which is invisible on the light default
 * fill; an explicit run color overrides it.
 */
function textColorFor(fillHex: string): string {
  const r = parseInt(fillHex.slice(0, 2), 16);
  const g = parseInt(fillHex.slice(2, 4), 16);
  const b = parseInt(fillHex.slice(4, 6), 16);
  // Relative luminance (sRGB coefficients, WCAG's simplified form).
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '000000' : 'FFFFFF';
}

/** Default node-text insets (EMU, unscaled): 0.1in left/right, 0.05in
 * top/bottom — Word's own defaults for a text-bearing shape. */
const NODE_TEXT_INSET_X = 91440;
const NODE_TEXT_INSET_Y = 45720;

/**
 * The full `wps:bodyPr` element Word emits for a text-bearing shape, with all
 * the attributes needed for the fill to render (a bare `<wps:bodyPr/>` makes
 * Word render the group as an empty gray rectangle).
 *
 * Insets scale with `scale` like everything else (`renderContent`'s doc
 * comment): left at a fixed 91440/45720 EMU regardless of how small `scale`
 * has made the surrounding box, a significantly scaled-down node's insets
 * alone can consume the entire box width, leaving no room to lay out the
 * text at all — found rendering a 3-subgraph diagram scaled to ~40%, where
 * every node's label rendered as blank (vertOverflow pushed it entirely
 * outside the visible box) until these insets scaled down too.
 */
function bodyPr(scale: number): string {
  const insX = Math.round(NODE_TEXT_INSET_X * scale);
  const insY = Math.round(NODE_TEXT_INSET_Y * scale);
  return [
    '<wps:bodyPr rot="0" spcFirstLastPara="0" vertOverflow="overflow" horzOverflow="overflow"',
    `  vert="horz" wrap="square" lIns="${insX}" tIns="${insY}" rIns="${insX}" bIns="${insY}"`,
    '  numCol="1" spcCol="0" rtlCol="0" fromWordArt="0" anchor="ctr" anchorCtr="0"',
    '  forceAA="0" compatLnSpc="1">',
    '  <a:prstTxWarp prst="textNoShape"><a:avLst/></a:prstTxWarp>',
    '  <a:noAutofit/>',
    '</wps:bodyPr>',
  ].join('\n');
}

/**
 * The `wps:style` element Word emits for a shape, referencing the document
 * theme. Required for the shape fill/line to render (the `a:solidFill`/`a:ln`
 * in `wps:spPr` alone are not enough — Word resolves the visual style from
 * these theme references).
 */
function style(): string {
  return [
    '<wps:style>',
    '  <a:lnRef idx="2"><a:schemeClr val="accent1"><a:shade val="15000"/></a:schemeClr></a:lnRef>',
    '  <a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>',
    '  <a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef>',
    '  <a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef>',
    '</wps:style>',
  ].join('\n');
}

/**
 * Translate a flowchart + its layout into a self-contained WordprocessingML
 * paragraph (`w:p`) wrapping the drawing in the schema-required hierarchy.
 *
 * @param flowchart - The parsed flowchart AST.
 * @param layout - Layout result (node + subgraph coordinates) from `layout/layout.ts`.
 * @param options - Optional color overrides.
 * @returns A single XML string (a complete `w:p` paragraph), ready to inject
 *   into a Pandoc `RawBlock('openxml', ...)` (ADR 0002).
 */
export function translateToOoxml(
  flowchart: Flowchart,
  layout: LayoutResult,
  options: TranslateOptions = {},
): string {
  const fill = hexColor(options.fill, DEFAULT_FILL);
  const line = hexColor(options.line, DEFAULT_LINE);
  const nextId = createIdAllocator();

  // `wp:docPr` shares its id space with the shapes below it, so it draws from
  // the same allocator and must be taken before the group is rendered.
  const docPrId = nextId();
  const bb = computeBoundingBox(layout);
  // Every child coordinate is pre-multiplied by this factor (see
  // `renderContent`'s doc comment) instead of relying on an enclosing
  // group's chOff/chExt-vs-ext transform to apply it implicitly.
  const { scale } = scaledExtent(bb);
  const content = renderContent(flowchart, layout, fill, line, nextId, scale);
  return wrapInParagraph(content, bb, docPrId);
}

/**
 * Render subgraphs + nodes + edges as siblings directly under the drawing
 * canvas (`wpc:wpc`, `wrapInParagraph`) — no enclosing root `wpg:wgp`.
 *
 * A `wpg:wgp`/`wpg:grpSp` is a real Word "Group" object: Word treats its
 * contents as one bundled unit on first click (double-click, or "Ungroup",
 * to select an individual shape inside it) and, per user report, visibly
 * doubles the selection outline (the canvas frame plus the group's own
 * boundary) around the whole diagram. Subgraphs don't use `wpg:grpSp` either
 * any more (`renderSubgraph`'s doc comment) — nothing in this translator's
 * output groups shapes at all now. `wpc:wpc` already accepts `wps:wsp`
 * directly per the OOXML schema, with no group needed to hold shapes
 * together as one drawing.
 *
 * Dropping the root group loses its chOff/chExt-vs-ext trick for scaling an
 * oversized diagram down to the page (`scaledExtent`) — that trick worked by
 * giving every descendant coordinate a *native* value and letting Word's
 * single group transform apply the visual shrink uniformly. Without a group,
 * `scale` is applied directly to every coordinate at emission time instead:
 * mathematically the same result (every descendant coordinate ends up
 * multiplied by the same factor either way), just computed here rather than
 * left to Word.
 */
function renderContent(
  flowchart: Flowchart,
  layout: LayoutResult,
  fill: string,
  line: string,
  nextId: () => number,
  scale: number,
): string {
  const parts: string[] = [];

  // Pre-assign a unique numeric id to every node so connectors (stCxn/endCxn)
  // can reference the shape ids (the `wps:cNvPr id` attribute). Mermaid node
  // ids are arbitrary strings; the OOXML shape id must be a unique number.
  const nodeIds = new Map<string, number>();
  for (const node of flowchart.nodes) {
    nodeIds.set(node.id, nextId());
  }

  // Render subgraph titles (spec §6.1) as flat shapes, then nodes and edges.
  const renderedSubgraphs = new Set<string>();
  for (const sg of flowchart.subgraphs) {
    parts.push(renderSubgraph(sg, flowchart, layout, renderedSubgraphs, nextId, scale));
  }

  for (const node of flowchart.nodes) {
    const box = layout.nodes[node.id];
    if (!box) continue;
    // Per-node fill/stroke from classDef/style/`:::` take priority over the
    // global default (spec §6.3).
    const nodeFill = hexColor(node.fill, fill);
    const nodeLine = hexColor(node.stroke, line);
    parts.push(
      renderNode(
        nodeIds.get(node.id)!,
        node.id,
        node.label,
        node.labelRuns,
        node.shape,
        box,
        nodeFill,
        nodeLine,
        scale,
      ),
    );
  }

  flowchart.edges.forEach((edge, i) => {
    const from = layout.nodes[edge.from];
    const to = layout.nodes[edge.to];
    if (!from || !to) return;
    const fromId = nodeIds.get(edge.from);
    const toId = nodeIds.get(edge.to);
    if (fromId === undefined || toId === undefined) return;
    const dagrePoints = layout.edges[i] ?? [];
    // Every other node's box, i.e. what this connector must NOT be drawn
    // through — see connectorGeometry's doc comment for why this is checked
    // geometrically rather than trusted from Dagre's point count.
    const otherBoxes = Object.entries(layout.nodes)
      .filter(([id]) => id !== edge.from && id !== edge.to)
      .map(([, box]) => box);
    // Per-edge stroke color/width from `linkStyle` takes priority over the
    // global default (spec §6.3).
    const edgeLine = hexColor(edge.stroke, line);
    parts.push(
      renderEdge(
        fromId,
        toId,
        edge.from,
        edge.to,
        edge.type,
        from,
        to,
        dagrePoints,
        otherBoxes,
        edgeLine,
        edge.strokeWidth,
        nextId,
        scale,
      ),
    );
    if (edge.label && edge.labelRuns) {
      parts.push(renderEdgeLabel(edge.labelRuns, from, to, dagrePoints, otherBoxes, nextId(), scale));
    }
  });

  return parts.join('\n');
}

/**
 * Wrap a `wpg:wgp` group in the schema-required paragraph hierarchy so Word
 * accepts the fragment as a drawing:
 * `w:p -> w:r -> w:drawing -> wp:inline -> a:graphic -> a:graphicData ->
 * wpc:wpc -> [shapes]`.
 *
 * The drawing is **inline** (spec §5.3), so it flows with the surrounding text
 * instead of floating over it, and it sits inside a drawing canvas (`wpc:wpc`)
 * — the container Word itself uses for a set of shapes, hence the
 * `wordprocessingCanvas` `a:graphicData` URI. Content's top-level shapes are
 * direct children of the canvas rather than wrapped in a `wpg:wgp` group
 * (`renderContent`'s doc comment) — `wpc:wpc`'s content model accepts
 * `wps:wsp`/`wpg:grpSp` directly, no enclosing group required — so the
 * `wpg`/`wps`/`pic`/`r` namespaces those children need are declared here,
 * on the canvas, instead of on a root group element that no longer exists.
 */
function wrapInParagraph(
  content: string,
  bb: { width: number; height: number },
  docPrId: number,
): string {
  const { cx, cy } = scaledExtent(bb);
  return [
    `<w:p ${NS.w}>`,
    '  <w:r>',
    '    <w:drawing>',
    `      <wp:inline ${NS.wp} distT="0" distB="0" distL="0" distR="0">`,
    `        <wp:extent cx="${cx}" cy="${cy}"/>`,
    '        <wp:effectExtent l="0" t="0" r="0" b="0"/>',
    `        <wp:docPr id="${docPrId}" name="Diagram ${docPrId}"/>`,
    '        <wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>',
    `        <a:graphic ${NS.a}>`,
    '          <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas">',
    `            <wpc:wpc xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ${NS.wpg} ${NS.wps} ${NS.pic} ${NS.r}>`,
    '              <wpc:bg><a:solidFill><a:prstClr val="white"/></a:solidFill></wpc:bg>',
    '              <wpc:whole/>',
    content,
    '            </wpc:wpc>',
    '          </a:graphicData>',
    '        </a:graphic>',
    '      </wp:inline>',
    '    </w:drawing>',
    '  </w:r>',
    '</w:p>',
  ].join('\n');
}

/**
 * The native (unscaled) EMU size of the drawing frame, widened past the
 * content's actual width when needed to stay clear of the LibreOffice
 * narrow-tall rendering failure (see {@link MIN_SAFE_ASPECT_RATIO}). The
 * padding is inert canvas margin to the right of the content — it does not
 * move or resize any node, subgraph, or edge, it only makes the frame's own
 * declared bounding box wide enough to render at all. `wp:extent`
 * (via {@link scaledExtent}) derives from this same padded value.
 */
function nativeExtent(bb: { width: number; height: number }): { cx: number; cy: number } {
  const nativeCx = Math.max(1, Math.round(bb.width * EMU_PER_PX));
  const nativeCy = Math.max(1, Math.round(bb.height * EMU_PER_PX));
  if (nativeCy > TALL_RATIO_RISK_HEIGHT && nativeCx / nativeCy < MIN_SAFE_ASPECT_RATIO) {
    return { cx: Math.round(nativeCy * MIN_SAFE_ASPECT_RATIO), cy: nativeCy };
  }
  return { cx: nativeCx, cy: nativeCy };
}

/**
 * Convert a pixel bounding box to the EMU extent of the drawing frame, scaled
 * down uniformly if it would not fit the usable page area. Returns the scale
 * factor so the group's `a:ext` can shrink in step with `wp:extent` while its
 * `a:chExt` stays in native coordinates.
 */
function scaledExtent(bb: { width: number; height: number }): {
  cx: number;
  cy: number;
  scale: number;
} {
  const { cx: nativeCx, cy: nativeCy } = nativeExtent(bb);
  const scale = Math.min(1, MAX_DRAWING_CX / nativeCx, MAX_DRAWING_CY / nativeCy);
  return {
    cx: Math.max(1, Math.round(nativeCx * scale)),
    cy: Math.max(1, Math.round(nativeCy * scale)),
    scale,
  };
}

/**
 * Render a subgraph's title as a plain top-level `wps:wsp` text box (spec
 * §6.1), positioned with the same absolute (pre-scaled) coordinates as a
 * node rather than nested in a `wpg:grpSp` group. Nested subgraphs are
 * rendered recursively, each contributing its own flat title box.
 *
 * Not wrapped in a group any more (found 2026-09-02, alongside dropping the
 * root `wpg:wgp` — `renderContent`'s doc comment): a subgraph never actually
 * groups real content in the first place — member nodes are always rendered
 * as separate top-level shapes at absolute coordinates (`renderContent`'s
 * node loop), never nested inside the subgraph's own group — so the
 * `wpg:grpSp` here only ever held a single title textbox positioned at
 * (0,0) local to it. That's not just redundant, it's actively broken
 * without a `wpg:wgp` ancestor: verified directly (2026-09-02) that
 * LibreOffice renders a `wpg:grpSp` nested directly under `wpc:wpc` (no
 * enclosing `wpg:wgp`) at the wrong position — its declared `a:off` is not
 * honored — while the exact same title rendered as a plain top-level
 * `wps:wsp` at the equivalent absolute coordinates lands correctly. A flat
 * shape sidesteps the whole question, and needs no group logic at all.
 */
function renderSubgraph(
  sg: Subgraph,
  flowchart: Flowchart,
  layout: LayoutResult,
  rendered: Set<string>,
  nextId: () => number,
  scale: number,
): string {
  if (rendered.has(sg.id)) return '';
  rendered.add(sg.id);

  const box = layout.subgraphs[sg.id];
  if (!box) return '';
  const x = Math.round(box.x * EMU_PER_PX * scale);
  const y = Math.round(box.y * EMU_PER_PX * scale);
  const w = Math.max(1, Math.round(box.width * EMU_PER_PX * scale));
  const h = Math.max(1, Math.round(box.height * EMU_PER_PX * scale));
  const safeTitle = escapeXml(sg.title);
  const insX = Math.round(NODE_TEXT_INSET_X * scale);
  const insY = Math.round(NODE_TEXT_INSET_Y * scale);

  const parts: string[] = [];

  // Cluster container: a full-size box behind the title/nodes (spec §6.1,
  // "fidelity to the Mermaid preview" — Mermaid's own renderer draws a
  // visible rect around a subgraph's members, this translator's box used to
  // draw only the floating title below with `noFill`/`ln w="0"`, see git
  // history around 2026-09-03). Neutral gray, not the node fill/line colors,
  // matching Mermaid's own convention of a cluster border that reads as
  // "container", not "another node" -- and dashed, also matching Mermaid's
  // default subgraph border style. Rendered first (behind, per emission
  // order = z-order in this format) so it never occludes member nodes/edges,
  // which are drawn later in `renderContent`.
  parts.push('  <wps:wsp>');
  parts.push(`    <wps:cNvPr id="${nextId()}" name="${safeTitle} (container)"/>`);
  parts.push('    <wps:cNvSpPr/>');
  parts.push('    <wps:spPr>');
  parts.push('      <a:xfrm>');
  parts.push(`        <a:off x="${x}" y="${y}"/>`);
  parts.push(`        <a:ext cx="${w}" cy="${h}"/>`);
  parts.push('      </a:xfrm>');
  parts.push('      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>');
  parts.push(`      <a:solidFill><a:srgbClr val="${SUBGRAPH_FILL}"><a:alpha val="40000"/></a:srgbClr></a:solidFill>`);
  parts.push(
    `      <a:ln w="${SUBGRAPH_BORDER_WIDTH_EMU}"><a:solidFill><a:srgbClr val="${SUBGRAPH_LINE}"/></a:solidFill>` +
      '<a:prstDash val="dash"/></a:ln>',
  );
  parts.push('    </wps:spPr>');
  parts.push('    <wps:bodyPr/>');
  parts.push('  </wps:wsp>');

  parts.push('  <wps:wsp>');
  parts.push(`    <wps:cNvPr id="${nextId()}" name="${safeTitle}"/>`);
  parts.push('    <wps:cNvSpPr/>');
  parts.push('    <wps:spPr>');
  parts.push('      <a:xfrm>');
  parts.push(`        <a:off x="${x}" y="${y}"/>`);
  parts.push(`        <a:ext cx="${w}" cy="${Math.round(SUBGRAPH_TITLE_HEIGHT * EMU_PER_PX * scale)}"/>`);
  parts.push('      </a:xfrm>');
  parts.push('      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>');
  parts.push('      <a:noFill/>');
  parts.push('      <a:ln w="0"><a:noFill/></a:ln>');
  parts.push('    </wps:spPr>');
  parts.push('    <wps:txbx>');
  parts.push('      <w:txbxContent>');
  parts.push('        <w:p>');
  parts.push('          <w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>');
  parts.push('          <w:r>');
  parts.push(
    `            <w:rPr><w:color w:val="000000"/><w:sz w:val="${scaledFontSizeHalfPt(NODE_FONT_SIZE_HALFPT, scale)}"/></w:rPr>`,
  );
  parts.push(`            <w:t xml:space="preserve">${safeTitle}</w:t>`);
  parts.push('          </w:r>');
  parts.push('        </w:p>');
  parts.push('      </w:txbxContent>');
  parts.push('    </wps:txbx>');
  parts.push(
    `    <wps:bodyPr lIns="${insX}" tIns="${insY}" rIns="${insX}" bIns="${insY}" anchor="ctr" anchorCtr="0"/>`,
  );
  parts.push('  </wps:wsp>');

  // Nested subgraphs, each its own flat title box.
  for (const childId of sg.subgraphIds) {
    const child = flowchart.subgraphs.find((s) => s.id === childId);
    if (child) parts.push(renderSubgraph(child, flowchart, layout, rendered, nextId, scale));
  }

  return parts.join('\n');
}

/**
 * Render a single node as a `wps:wsp` (wordprocessing shape).
 *
 * `mermaidId` is stored in `cNvPr/descr` (not `name`): `name` stays the human
 * label, which is what Word shows in its Selection Pane (a friendlier UX than
 * a raw Mermaid id like "A" or "decision1"), while `descr` — a standard OOXML
 * accessibility field, invisible in Word — carries the original id so a
 * future docx2mermaid reader can recover it (`docs/specs/FUTURE_docx2mermaid_SPEC.md`
 * §4). Cheap to add now, while the translator is still actively worked on;
 * expensive to retrofit once the output format and golden tests are frozen.
 */
function renderNode(
  id: number,
  mermaidId: string,
  label: string,
  labelRuns: LabelToken[],
  shape: NodeShape,
  box: Box,
  fill: string,
  line: string,
  scale: number,
): string {
  const x = Math.round(box.x * EMU_PER_PX * scale);
  const y = Math.round(box.y * EMU_PER_PX * scale);
  const w = Math.max(1, Math.round(box.width * EMU_PER_PX * scale));
  const h = Math.max(1, Math.round(box.height * EMU_PER_PX * scale));
  const prst = PRST_BY_SHAPE[shape] ?? 'rect';
  const flip = FLIP_BY_SHAPE[shape];
  const flipAttr = flip === 'flipH' ? ' flipH="1"' : flip === 'flipV' ? ' flipV="1"' : '';
  const safeLabel = escapeXml(label);
  const safeMermaidId = escapeXml(mermaidId);
  const textColor = textColorFor(fill);

  return [
    '  <wps:wsp>',
    `    <wps:cNvPr id="${id}" name="${safeLabel}" descr="${safeMermaidId}"/>`,
    '    <wps:cNvSpPr/>',
    '    <wps:spPr>',
    `      <a:xfrm${flipAttr}>`,
    `        <a:off x="${x}" y="${y}"/>`,
    `        <a:ext cx="${w}" cy="${h}"/>`,
    '      </a:xfrm>',
    `      <a:prstGeom prst="${prst}">`,
    '        <a:avLst/>',
    '      </a:prstGeom>',
    `      <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`,
    `      <a:ln w="${scaledLineWidth(12700, scale)}" cap="flat" cmpd="sng" algn="ctr">`,
    `        <a:solidFill><a:srgbClr val="${line}"/></a:solidFill>`,
    '        <a:prstDash val="solid"/>',
    '      </a:ln>',
    '    </wps:spPr>',
    style(),
    '    <wps:txbx>',
    '      <w:txbxContent>',
    // <w:spacing w:before="0" w:after="0"/> overrides Pandoc's reference.docx
    // docDefaults (w:pPrDefault -> w:spacing w:after="200", i.e. 10pt after
    // every paragraph unless overridden). Found from a real Word screenshot
    // (2026-09-02): with `anchor="ctr"` centering the whole paragraph box —
    // including that trailing 10pt nothing renders into — the visible glyphs
    // sat noticeably higher than centered, a bigger gap below the text than
    // above it. No w:before default exists to match, so the extra space was
    // one-sided rather than at least being symmetric.
    '        <w:p>',
    '          <w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>',
    renderLabelRuns(labelRuns, textColor, scaledFontSizeHalfPt(NODE_FONT_SIZE_HALFPT, scale)),
    '        </w:p>',
    '      </w:txbxContent>',
    '    </wps:txbx>',
    bodyPr(scale),
    '  </wps:wsp>',
  ].join('\n');
}

/**
 * Render a label's rich-text body (`types.ts`'s `LabelToken[]` — bold/italic
 * runs and `<br/>` line breaks, spec follow-up "rich-text runs") as the
 * `w:r`/`w:br` children of one `w:p`, shared by {@link renderNode} and
 * {@link renderEdgeLabel} (identical shape, only color/size differ). A break
 * token is its own run holding a bare `w:br` — WordprocessingML requires the
 * break element inside a run, but that run carries no `w:rPr`/`w:t` of its
 * own — so a `<br/>` moves to a new line within this same paragraph instead
 * of starting a new (differently-spaced) paragraph.
 */
function renderLabelRuns(tokens: LabelToken[], color: string, sizeHalfPt: number): string {
  return tokens
    .map((token) => {
      if ('break' in token) {
        return ['          <w:r>', '            <w:br/>', '          </w:r>'].join('\n');
      }
      const rPr = [`<w:color w:val="${color}"/>`, `<w:sz w:val="${sizeHalfPt}"/>`];
      if (token.bold) rPr.push('<w:b/>');
      if (token.italic) rPr.push('<w:i/>');
      return [
        '          <w:r>',
        `            <w:rPr>${rPr.join('')}</w:rPr>`,
        `            <w:t xml:space="preserve">${escapeXml(token.text)}</w:t>`,
        '          </w:r>',
      ].join('\n');
    })
    .join('\n');
}

/**
 * The `wps:style` element Word emits for a connector, referencing the document
 * theme. Unlike a shape, a connector has no fill (`fillRef idx="0"`) and uses
 * the text-1 font (`fontRef val="tx1"`).
 */
function connectorStyle(): string {
  return [
    '<wps:style>',
    '  <a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef>',
    '  <a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef>',
    '  <a:effectRef idx="1"><a:schemeClr val="accent1"/></a:effectRef>',
    '  <a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef>',
    '</wps:style>',
  ].join('\n');
}

/**
 * Connection-site indices for the built-in preset geometries used here (rect,
 * roundRect, diamond, ellipse, can): 0=top, 1=left, 2=bottom, 3=right —
 * counter-clockwise from the top, 0-based.
 *
 * Corrected 2026-09-02 (previously `{ top: 0, right: 1, bottom: 2, left: 3 }`,
 * i.e. right/left swapped). The only empirical check this ever had
 * (`tools/word-reference/`) used a *vertical* connector between two stacked
 * rectangles, which only exercises idx 0 (top) and 2 (bottom) — the
 * right/left half of the mapping was never actually tested, just assumed
 * clockwise-from-top by symmetry. That assumption was wrong: decoded
 * directly from LibreOffice's `oox-drawingml-cs-presets` (its own mirror of
 * Microsoft's official `presetShapeDefinitions.xml`, per
 * https://learn.microsoft.com/en-us/archive/blogs/openspecification/how-to-use-the-presetshapedefinitions-xml-file-and-fun-with-drawingml),
 * both `rect` and `diamond`'s `GluePoints` (OOXML `cxnLst` equivalent) list
 * connection sites in the order top(0)/left/(1)/bottom(2)/right(3) — the
 * same for both shapes, so this isn't diamond-specific.
 *
 * This only affects the `idx` we *stamp* on `stCxn`/`endCxn` (the magnetic
 * attachment Word uses to keep a connector attached to a shape when it's
 * dragged, and — per user report — appears to influence initial rendering
 * too); the connector's own drawn path (`bentConnectorGeometry`/
 * `straightConnectorGeometry`) is a literal point list computed by
 * `sitePoint()` below, unaffected by this constant and geometrically correct
 * either way. That's why the old (wrong) mapping never produced a visibly
 * broken connector in LibreOffice — LibreOffice draws the literal path we
 * provide — but did in a real Word, which appears to prefer its own
 * connection-site semantics over the static geometry for at least some
 * shapes/paths. Not independently re-verified against a real Word document
 * with a horizontal connector (`tools/word-reference/` only has the vertical
 * case) — flagged in TODO.md.
 */
const SITE = { top: 0, right: 3, bottom: 2, left: 1 } as const;

/** The point where a connector attaches to a box for a given connection site. */
function sitePoint(box: Box, side: number): { x: number; y: number } {
  switch (side) {
    case SITE.right:
      return { x: box.x + box.width, y: box.y + box.height / 2 };
    case SITE.bottom:
      return { x: box.x + box.width / 2, y: box.y + box.height };
    case SITE.left:
      return { x: box.x, y: box.y + box.height / 2 };
    case SITE.top:
    default:
      return { x: box.x + box.width / 2, y: box.y };
  }
}

/**
 * Pick which side of each box a connector leaves/arrives from, based on the
 * relative position of the two boxes (spec §6.2 magnetic connectors).
 */
function chooseSides(from: Box, to: Box): { stSide: number; endSide: number } {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy > 0 ? { stSide: SITE.bottom, endSide: SITE.top } : { stSide: SITE.top, endSide: SITE.bottom };
  }
  return dx > 0 ? { stSide: SITE.right, endSide: SITE.left } : { stSide: SITE.left, endSide: SITE.right };
}

/**
 * Which connection site a point sits closest to, by perpendicular distance
 * to each of the box's 4 sides (extended as infinite lines, not clamped to
 * the segment) — used for a self-loop's connection sites, where the point
 * isn't the sitePoint()-computed midpoint of a side but one of Dagre's own
 * loop-route endpoints (still on the box's perimeter, just not centered).
 */
function nearestSite(box: Box, point: { x: number; y: number }): number {
  const distances: Array<[number, number]> = [
    [SITE.top, Math.abs(point.y - box.y)],
    [SITE.bottom, Math.abs(point.y - (box.y + box.height))],
    [SITE.left, Math.abs(point.x - box.x)],
    [SITE.right, Math.abs(point.x - (box.x + box.width))],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0]![0];
}

/** A connector's full route, in pixel space. */
interface ConnectorGeometry {
  stSide: number;
  endSide: number;
  /** Every point the connector passes through, start to end, in order. */
  points: { x: number; y: number }[];
}

/** Whether point (x,y) falls within (or on the boundary of) a box. */
function pointInBox(x: number, y: number, box: Box): boolean {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

/** Whether segments (a1,a2) and (b1,b2) cross (standard orientation test). */
function segmentsIntersect(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): boolean {
  const ccw = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (r.y - p.y) * (q.x - p.x) > (q.y - p.y) * (r.x - p.x);
  return ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2);
}

/** Whether the segment (x1,y1)-(x2,y2) passes through the given box at all. */
function segmentIntersectsBox(x1: number, y1: number, x2: number, y2: number, box: Box): boolean {
  if (pointInBox(x1, y1, box) || pointInBox(x2, y2, box)) return true;
  const p1 = { x: x1, y: y1 };
  const p2 = { x: x2, y: y2 };
  const { x: left, y: top } = box;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const corners = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
  for (let i = 0; i < 4; i++) {
    if (segmentsIntersect(p1, p2, corners[i]!, corners[(i + 1) % 4]!)) return true;
  }
  return false;
}

/**
 * Compute where a connector between two boxes actually starts and ends, i.e.
 * on the boxes' perimeter (the connection site), not their centers — the
 * `a:xfrm` off/ext must match what the connector visually is, or Word draws a
 * line straight through the shape interiors instead of stopping at their edges.
 *
 * `dagrePoints` is the route Dagre computed for this edge (`LayoutResult.edges`)
 * and `otherBoxes` is every OTHER node's box (not this edge's own source/
 * target). The straight line between the two connection sites is used as-is
 * UNLESS it actually passes through one of `otherBoxes` — only then does the
 * connector bend, reusing Dagre's own interior waypoints as the detour.
 *
 * This is deliberately a real geometric test rather than trusting Dagre's
 * point count as a proxy for "needs routing": Dagre hands back more than the
 * usual 3 points (a start, one stylistic mid-rank point, and an end — even
 * for two directly-adjacent, unobstructed nodes) for an edge that crosses a
 * *subgraph cluster* boundary too, not only for one that skips a rank. Empty
 * `otherBoxes`, or a straight line that clears everything, means the simple
 * two-point path — matching what this translator always emitted before edge
 * routing existed, with no dependency on Dagre's point count at all.
 */
function connectorGeometry(
  from: Box,
  to: Box,
  dagrePoints: LayoutPoint[],
  otherBoxes: Box[],
): ConnectorGeometry {
  // A self-loop (`A --> A`): `from`/`to` are the exact same Box object here
  // (both looked up as `layout.nodes[edge.from]`/`layout.nodes[edge.to]` from
  // the same id in renderContent, never cloned) — a reliable proxy for
  // "same node" without threading the Mermaid id through this function too.
  // chooseSides()/sitePoint() below assume two *different* boxes and pick a
  // side from their relative position; for identical boxes that degenerates
  // to dx=dy=0, always resolving to "top -> bottom" — a straight line
  // through the node's own interior, not a loop, found by real-render audit
  // (2026-09-04, punch list item 5). Dagre already computes a real loop
  // bulging away from the node for a self-edge (verified across TD/LR/BT/RL
  // -- the bulge direction rotates with rankdir, but both ends always land
  // on the node's own perimeter), so a self-loop uses those points verbatim
  // instead of ever calling chooseSides()/sitePoint().
  if (from === to) {
    const start = dagrePoints[0]!;
    const end = dagrePoints[dagrePoints.length - 1]!;
    return {
      stSide: nearestSite(from, start),
      endSide: nearestSite(to, end),
      points: dagrePoints.map((p) => ({ x: p.x, y: p.y })),
    };
  }

  const { stSide, endSide } = chooseSides(from, to);
  const start = sitePoint(from, stSide);
  const end = sitePoint(to, endSide);
  const rawWaypoints = dagrePoints.length > 2 ? dagrePoints.slice(1, -1) : [];
  const needsRouting =
    rawWaypoints.length > 0 &&
    otherBoxes.some((box) => segmentIntersectsBox(start.x, start.y, end.x, end.y, box));
  const waypoints = needsRouting ? rawWaypoints : [];
  return { stSide, endSide, points: [start, ...waypoints, end] };
}

/**
 * The point at a given fraction (0..1) of the way along a polyline's total
 * length — used to place an edge label on a bent connector's actual path
 * instead of the straight-line midpoint between its two ends, which could
 * land on whatever the connector is routed around.
 */
function pointAlongPath(points: { x: number; y: number }[], fraction: number): { x: number; y: number } {
  const segments: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]!.x - points[i - 1]!.x;
    const dy = points[i]!.y - points[i - 1]!.y;
    const length = Math.hypot(dx, dy);
    segments.push(length);
    total += length;
  }
  if (total === 0) return points[0]!;

  let target = total * fraction;
  for (let i = 0; i < segments.length; i++) {
    const length = segments[i]!;
    if (target <= length || i === segments.length - 1) {
      const t = length === 0 ? 0 : target / length;
      const a = points[i]!;
      const b = points[i + 1]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    target -= length;
  }
  return points[points.length - 1]!;
}

/**
 * The `a:prstGeom`/`a:xfrm` for a straight two-point connector — the common
 * case, byte-identical to what this translator emitted before edge routing
 * existed.
 */
function straightConnectorGeometry(startX: number, startY: number, endX: number, endY: number): string {
  // `a:xfrm` is a top-left box, so a connector running right-to-left or
  // bottom-to-top has to be flipped for the arrow head to land on the target.
  const flipH = endX < startX ? ' flipH="1"' : '';
  const flipV = endY < startY ? ' flipV="1"' : '';
  return [
    `      <a:xfrm${flipH}${flipV}>`,
    `        <a:off x="${Math.min(startX, endX)}" y="${Math.min(startY, endY)}"/>`,
    `        <a:ext cx="${Math.abs(endX - startX)}" cy="${Math.abs(endY - startY)}"/>`,
    '      </a:xfrm>',
    '      <a:prstGeom prst="line">',
    '        <a:avLst/>',
    '      </a:prstGeom>',
  ].join('\n');
}

/**
 * The `a:custGeom`/`a:xfrm` for a connector Dagre routed around an
 * intermediate rank's nodes (spec §9 "0 croisement de flèches") — an explicit
 * `moveTo`/`lnTo*` path through every waypoint, rather than one of Word's
 * built-in `bentConnectorN`/`curvedConnectorN` presets: those are parametrized
 * by a handful of `adj` guide values with no documented public formula for
 * "here are N arbitrary points, produce the adj values that trace them", so
 * reproducing Dagre's routing through them would mean reverse-engineering
 * Word's own connector-routing heuristic. A custom path draws exactly the
 * route Dagre already computed, no guessing involved. `wps:cNvCnPr` still
 * carries `stCxn`/`endCxn` for the magnetic-attachment behaviour (spec §6.2)
 * — that comes from being declared a connection shape, not from the geometry.
 *
 * The path's own coordinate space is set to exactly the shape's EMU extent
 * (`w`/`h` on `a:path` equal to `a:ext`'s `cx`/`cy`), so every path point can
 * be a plain EMU offset from the bounding box's top-left with no extra scale
 * factor to track.
 */
function bentConnectorGeometry(points: { x: number; y: number }[]): string {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - minX);
  const h = Math.max(1, Math.max(...ys) - minY);
  const [first, ...rest] = points;

  return [
    `      <a:xfrm>`,
    `        <a:off x="${minX}" y="${minY}"/>`,
    `        <a:ext cx="${w}" cy="${h}"/>`,
    '      </a:xfrm>',
    '      <a:custGeom>',
    '        <a:avLst/>',
    '        <a:gdLst/>',
    '        <a:ahLst/>',
    '        <a:cxnLst/>',
    '        <a:rect l="0" t="0" r="0" b="0"/>',
    '        <a:pathLst>',
    `          <a:path w="${w}" h="${h}">`,
    `            <a:moveTo><a:pt x="${first!.x - minX}" y="${first!.y - minY}"/></a:moveTo>`,
    ...rest.map((p) => `            <a:lnTo><a:pt x="${p.x - minX}" y="${p.y - minY}"/></a:lnTo>`),
    '          </a:path>',
    '        </a:pathLst>',
    '      </a:custGeom>',
  ].join('\n');
}

/**
 * Render an edge as a `wps:wsp` connector (with `wps:cNvCnPr`), following the
 * route Dagre computed (`dagrePoints`, from `LayoutResult.edges`) when the
 * straight line between the two connection sites would actually cross
 * another node — see {@link connectorGeometry}.
 *
 * `cNvPr/name` is set to `"{mermaidFromId}--{mermaidToId}"` rather than a
 * generic label (spec follow-up, `docs/specs/FUTURE_docx2mermaid_SPEC.md` §4) — no
 * downside here, unlike node `name`: connectors don't currently carry a
 * friendlier alternative Word would otherwise show in its Selection Pane.
 *
 * A self-loop (`A --> A`) is declared `wps:cNvSpPr` (a plain shape) instead
 * of `wps:cNvCnPr` (a connector), even though its geometry (custom, from
 * {@link connectorGeometry}'s dedicated self-loop branch) is identical
 * either way — found by real-render audit (2026-09-04, punch list item 5):
 * LibreOffice **discards** a `wps:cNvCnPr` shape's own `a:custGeom`/`a:xfrm`
 * entirely and substitutes its own computed path once `stCxn`/`endCxn` name
 * the *same* shape id, whether at the same connection index (collapses to
 * an invisible zero-length line — the original bug) or two different ones
 * (a visible but unrelated auto-routed shape, ignoring the real Dagre loop
 * geometry). A plain shape's `a:custGeom` is never second-guessed this way
 * — same rendering path already trusted for a routed edge between two
 * *different* shapes (`bentConnectorGeometry`'s own doc comment) — so a
 * self-loop uses it too, verified end to end against a real LibreOffice
 * render (the "audit" — no prior attempt existed to compare against). The
 * accepted tradeoff: a self-loop won't visually follow its node if the node
 * is later dragged in Word (no real `stCxn`/`endCxn` magnetic attachment,
 * since there is nothing meaningfully different to attach the two ends
 * *to* on the very same shape) — far better than the alternatives above.
 */
function renderEdge(
  fromId: number,
  toId: number,
  mermaidFromId: string,
  mermaidToId: string,
  type: EdgeType,
  from: Box,
  to: Box,
  dagrePoints: LayoutPoint[],
  otherBoxes: Box[],
  line: string,
  strokeWidthPx: number | undefined,
  nextId: () => number,
  scale: number,
): string {
  const lineStyle = LINE_STYLE_BY_EDGE[type] ?? LINE_STYLE_BY_EDGE.arrow!;
  // `linkStyle N stroke-width:Npx` overrides the type's default line weight
  // (spec §6.3); px -> EMU the same way every other coordinate in the AST is
  // converted, not pre-scaled here since `scaledLineWidth` below applies the
  // diagram's overall `scale` uniformly to whichever width wins.
  const baseWidthEmu =
    strokeWidthPx !== undefined ? Math.max(1, Math.round(strokeWidthPx * EMU_PER_PX)) : lineStyle.width;
  const { stSide, endSide, points } = connectorGeometry(from, to, dagrePoints, otherBoxes);
  const emuPoints = points.map((p) => ({
    x: Math.round(p.x * EMU_PER_PX * scale),
    y: Math.round(p.y * EMU_PER_PX * scale),
  }));

  const geometry =
    emuPoints.length === 2
      ? straightConnectorGeometry(emuPoints[0]!.x, emuPoints[0]!.y, emuPoints[1]!.x, emuPoints[1]!.y)
      : bentConnectorGeometry(emuPoints);
  const markerSize = arrowMarkerSize(baseWidthEmu, scale);
  const headEnd =
    lineStyle.headEnd !== 'none'
      ? `        <a:headEnd type="${lineStyle.headEnd}" w="${markerSize}" len="${markerSize}"/>`
      : '';
  const tailEnd =
    lineStyle.tailEnd !== 'none'
      ? `        <a:tailEnd type="${lineStyle.tailEnd}" w="${markerSize}" len="${markerSize}"/>`
      : '';
  const safeName = escapeXml(`${mermaidFromId}--${mermaidToId}`);
  const isSelfLoop = fromId === toId;
  const connectionProps = isSelfLoop
    ? '    <wps:cNvSpPr/>'
    : [
        '    <wps:cNvCnPr>',
        `      <a:stCxn id="${fromId}" idx="${stSide}"/>`,
        `      <a:endCxn id="${toId}" idx="${endSide}"/>`,
        '    </wps:cNvCnPr>',
      ].join('\n');

  return [
    '  <wps:wsp>',
    `    <wps:cNvPr id="${nextId()}" name="${safeName}"/>`,
    connectionProps,
    '    <wps:spPr>',
    geometry,
    `      <a:ln w="${scaledLineWidth(baseWidthEmu, scale)}" cap="flat" cmpd="sng" algn="ctr">`,
    lineStyle.invisible
      ? '        <a:noFill/>'
      : [
          `        <a:solidFill><a:srgbClr val="${line}"/></a:solidFill>`,
          `        <a:prstDash val="${lineStyle.dash}"/>`,
        ].join('\n'),
    ...(lineStyle.invisible ? [] : [headEnd, tailEnd].filter(Boolean)),
    '      </a:ln>',
    '    </wps:spPr>',
    connectorStyle(),
    '    <wps:bodyPr/>',
    '  </wps:wsp>',
  ].join('\n');
}

/** Height in EMU of the transparent box holding an edge label (0.25in). */
const EDGE_LABEL_CY = 228600;
/** Point size of edge-label text (`w:sz`, half-points, so 16 = 8pt), in px
 * at 96 DPI — needed to size the box to its own text (see `edgeLabelWidth`),
 * distinct from `FONT_SIZE_PX` (node/subgraph-title text's larger effective
 * size, `layout.ts`). */
const EDGE_LABEL_FONT_SIZE_PX = (8 * 96) / 72;
/** Horizontal padding (px, each side) between an edge label's text and its
 * box edge — mirrors `bodyPr`'s `lIns`/`rIns` below, applied twice (once
 * baked into the box width, once as the inset) so a same-size rendering
 * error in `estimateTextWidth` (an approximation, no real font metrics —
 * see `layout.ts`'s `nodeDimensions` doc comment for why) still leaves the
 * text clear of the edge instead of exactly touching it. */
const EDGE_LABEL_PAD_X_PX = 8;
/**
 * Safety multiplier applied to `estimateTextWidth`'s raw estimate before
 * sizing an edge-label box. Found empirically (2026-09-02): `layout.ts`'s
 * per-character em table was calibrated against `FONT_SIZE_PX` (16px, node
 * text); scaled linearly down to `EDGE_LABEL_FONT_SIZE_PX` (~10.7px, an 8pt
 * edge-label caption), it undershot badly — bisecting the real
 * non-wrapping width for "Non" in LibreOffice landed around 42px total box
 * width (34px of interior text room after insets), while the unscaled
 * estimate for the same word predicted only ~20px. Small serif glyphs don't
 * shrink as fast as their point size at this scale, an effect the
 * single-size-calibrated table doesn't capture. 1.8x tracks the ~1.7x gap
 * observed, with a little room to spare.
 */
const EDGE_LABEL_TEXT_SAFETY_MARGIN = 1.8;
/** Floor under a computed edge-label width, so a one-character label (e.g.
 * a bare "?") doesn't get a box narrower than is comfortable to read. */
const MIN_EDGE_LABEL_WIDTH_PX = 44;

/**
 * An edge label's box width in EMU, sized to its own text instead of a fixed
 * constant — a fixed-width box (previously 0.75in for every label
 * regardless of content) was both too narrow for long captions, which then
 * overflowed past its edges (`wrap="none"`, no horizontal insets), and too
 * *wide* for short ones ("Oui", "Non"): centering an oversized box on a
 * diagonal connector's midpoint only sits the true center pixel on the
 * line, not the text itself, since the diagonal only crosses the box's
 * vertical middle at one point along its width — the wider the box, the more
 * the visible text departs from that single point, reading as the label not
 * being centered on the arrow even though the box's geometric center is
 * exact. Right-sizing the box makes that gap negligible.
 */
function edgeLabelWidthEmu(labelRuns: LabelToken[]): number {
  // A `<br/>` (rare in an edge label, but not disallowed) sizes the box to
  // its widest line, not the sum of all lines — same per-line-then-combine
  // shape as layout.ts's nodeDimensions, mirrored here since edge labels are
  // sized independently of that function.
  const widestLinePx = Math.max(
    ...labelLines(labelRuns).map((line) => estimateTextWidth(line, EDGE_LABEL_FONT_SIZE_PX)),
  );
  const textWidthPx = widestLinePx * EDGE_LABEL_TEXT_SAFETY_MARGIN;
  const widthPx = Math.max(MIN_EDGE_LABEL_WIDTH_PX, textWidthPx + 2 * EDGE_LABEL_PAD_X_PX);
  return Math.round(widthPx * EMU_PER_PX);
}

/** An edge label's box height in EMU: `EDGE_LABEL_CY` per line, growing for
 * a `<br/>`-forced multi-line label instead of clipping every line past the
 * first (the box was previously a single fixed height regardless of content,
 * back when no label could ever have more than one line). */
function edgeLabelHeightEmu(labelRuns: LabelToken[]): number {
  return EDGE_LABEL_CY * labelLines(labelRuns).length;
}

/**
 * Render an edge label (`-->|Texte|`) as a borderless, fill-free `wps:txbx`
 * centered on the midpoint of the connector's actual path (spec §6.2), not the
 * midpoint between the two node centers — a node sitting between the source
 * and target (a common case: a decision node's branches fan out past a third
 * node) would otherwise get the label superimposed on it. It is a sibling
 * shape rather than text on the connector itself: Word renders connector-owned
 * text along the line, which is unreadable for a diagram caption.
 */
function renderEdgeLabel(
  labelRuns: LabelToken[],
  from: Box,
  to: Box,
  dagrePoints: LayoutPoint[],
  otherBoxes: Box[],
  id: number,
  scale: number,
): string {
  const { points } = connectorGeometry(from, to, dagrePoints, otherBoxes);
  // The midpoint by arc length along the real (possibly bent) path, not the
  // straight line between the two ends — for a routed edge, that straight
  // line is exactly the segment the routing was drawn to avoid.
  const mid = pointAlongPath(points, 0.5);
  const cx = Math.round(edgeLabelWidthEmu(labelRuns) * scale);
  const cy = Math.round(edgeLabelHeightEmu(labelRuns) * scale);
  const x = Math.round(mid.x * EMU_PER_PX * scale - cx / 2);
  const y = Math.round(mid.y * EMU_PER_PX * scale - cy / 2);
  const insetEmu = Math.round((EDGE_LABEL_PAD_X_PX / 2) * EMU_PER_PX * scale);

  return [
    '  <wps:wsp>',
    `    <wps:cNvPr id="${id}" name="EdgeLabel"/>`,
    '    <wps:cNvSpPr txBox="1"/>',
    '    <wps:spPr>',
    '      <a:xfrm>',
    `        <a:off x="${x}" y="${y}"/>`,
    `        <a:ext cx="${cx}" cy="${cy}"/>`,
    '      </a:xfrm>',
    '      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
    '      <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>',
    '      <a:ln><a:noFill/></a:ln>',
    '    </wps:spPr>',
    '    <wps:txbx>',
    '      <w:txbxContent>',
    '        <w:p>',
    '          <w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>',
    renderLabelRuns(labelRuns, '000000', scaledFontSizeHalfPt(16, scale)),
    '        </w:p>',
    '      </w:txbxContent>',
    '    </wps:txbx>',
    `    <wps:bodyPr rot="0" vert="horz" wrap="none" lIns="${insetEmu}" tIns="0" rIns="${insetEmu}" bIns="0"`,
    '      anchor="ctr" anchorCtr="1"><a:noAutofit/></wps:bodyPr>',
    '  </wps:wsp>',
  ].join('\n');
}

/**
 * Compute the total bounding box of a layout, in pixels.
 *
 * Subgraph containers are included: a cluster box can extend past the nodes it
 * holds, and leaving it out of the extent makes Word clip the cluster.
 */
function computeBoundingBox(layout: LayoutResult): { width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const boxes: Box[] = [
    ...Object.values(layout.nodes as Layout),
    ...Object.values(layout.subgraphs),
  ];
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  // An edge route can extend past every node/subgraph box: found via a
  // self-loop audit (2026-09-04, punch list item 5) — a self-loop's route
  // (connectorGeometry's doc comment) always bulges out past its own node's
  // perimeter, so the diagram's declared canvas size (this function) has to
  // include it too, or the loop is clipped by the canvas frame even though
  // its own XML geometry is entirely correct. The same could in principle
  // happen for a normal edge routed wide around an obstacle, just less
  // reliably than a self-loop's guaranteed bulge — included here for both.
  for (const points of layout.edges) {
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (minX === Infinity) return { width: 0, height: 0 };
  return { width: maxX - minX, height: maxY - minY };
}
