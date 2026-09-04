/**
 * md2nativedocx-core — public API.
 *
 * A pure TypeScript engine: Mermaid flowchart text -> intermediate AST ->
 * layout coordinates -> OOXML/DrawingML XML string. It has zero knowledge of
 * Pandoc, VS Code, or Office.js, so it is importable from Node (CLI/Pandoc
 * filter) and bundleable for the browser (future Office.js add-in).
 *
 * This is the one part of the codebase other packages and future contributors
 * depend on without reading the implementation, so every export is documented
 * here.
 */

// Parser: Mermaid text -> AST
export { parseMermaid, MermaidParseError } from './parser/index.js';
export type { ParseResult } from './parser/index.js';

// Diagram-type guard-rail (docs/specs/FUTURE_full_mermaid_coverage_SPEC.md §4
// "Phase 0", item 1): classify the first significant line of raw Mermaid
// text before ever calling parseMermaid(), so a recognized non-flowchart
// diagram (gitGraph, mindmap, sequenceDiagram, ...) gets a clean rejection
// instead of a silently-wrong flowchart-shaped parse.
export { detectDiagramType } from './parser/diagram-type.js';
export type { DiagramType, DiagramTypeInfo } from './parser/diagram-type.js';

// Layout: AST -> pixel coordinates (Dagre, ADR 0001)
export { layout, boundingBox, NODE_WIDTH, NODE_HEIGHT } from './layout/layout.js';
export type { LayoutOptions } from './layout/layout.js';

// Translator: AST + layout -> OOXML/DrawingML XML string
export { translateToOoxml } from './translator/ooxml-translator.js';

// Note shown in place of a diagram whose type is recognized but not yet
// implemented (see detectDiagramType above). Mirrors
// buildSmartArtFallbackNoteXml's "visible note, never a silent blank canvas"
// rule for this different guard-rail.
export { buildUnsupportedDiagramTypeNoteXml } from './translator/unsupported-diagram-note.js';
export type { TranslateOptions } from './translator/ooxml-translator.js';

// XML escaping for user-controlled text (rule #2)
export { escapeXml } from './translator/xml-escape.js';

// Quadrant chart diagram module (docs/smartart-full-catalog-cross-mermaid.md
// archetype #9 "Matrice", docs/specs/FUTURE_full_mermaid_coverage_SPEC.md §4
// item 2 naming convention: packages/core/src/diagrams/<type>/). Independent
// AST/parser/translator, no Dagre layout step — see
// diagrams/quadrant/translator.ts's module doc comment for why this renders
// as plain OOXML shapes rather than a SmartArt dgm:layoutDef.
export { parseQuadrantChart } from './diagrams/quadrant/parser.js';
export type { QuadrantParseResult } from './diagrams/quadrant/parser.js';
export { translateQuadrantToOoxml } from './diagrams/quadrant/translator.js';
export type { QuadrantChart, QuadrantAxis, QuadrantLabels, QuadrantPoint } from './diagrams/quadrant/types.js';

// Venn diagram module (docs/smartart-full-catalog-cross-mermaid.md archetype
// #11 "Venn"). Same independent-module convention and "plain OOXML shapes,
// not SmartArt dgm:" strategy as the quadrant chart above — see
// diagrams/venn/translator.ts's module doc comment.
export { parseVennChart } from './diagrams/venn/parser.js';
export type { VennParseResult } from './diagrams/venn/parser.js';
export { translateVennToOoxml } from './diagrams/venn/translator.js';
export type { VennChart, VennSet, VennUnion } from './diagrams/venn/types.js';

// SmartArt topology classifier (docs/specs/FUTURE_mmd2smartart_SPEC.md §4, ADR 0004).
// Complements the OOXML translator above; never required by it.
export { classifyTopology, MAX_TREE_DEPTH } from './smartart/classify.js';
export type {
  SmartArtLayout,
  SmartArtClassification,
  SmartArtEligible,
  SmartArtIneligible,
  SmartArtIneligibleReason,
} from './smartart/classify.js';

// SmartArt generator for the `chain` topology (docs/specs/FUTURE_mmd2smartart_SPEC.md
// §7 step 4, ADR 0004 "Round 5"). Original layout/colors/style — no
// Microsoft content. Caller is responsible for calling classifyTopology()
// first and only invoking this on a 'chain' result.
export {
  generateChain,
  CHAIN_LAYOUT_XML,
  CHAIN_LAYOUT_XML_TD,
  CHAIN_LAYOUT_URN,
  CHAIN_LAYOUT_TD_URN,
  CHAIN_COLORS_XML,
  CHAIN_STYLE_XML,
} from './smartart/chain.js';
export type { SmartArtChainOutput } from './smartart/chain.js';

// SmartArt generator for the `tree` topology (same recipe as `chain` above;
// depth-2 trees only, see MAX_TREE_DEPTH and tree.ts's module doc comment).
export {
  generateTree,
  TREE_LAYOUT_XML,
  TREE_LAYOUT_XML_LR,
  TREE_LAYOUT_URN,
  TREE_LAYOUT_LR_URN,
  TREE_COLORS_XML,
  TREE_STYLE_XML,
} from './smartart/tree.js';
export type { SmartArtTreeOutput } from './smartart/tree.js';

// SmartArt generator for the `cycle` topology (same self-authored recipe as
// `chain`/`tree` above).
export {
  generateCycle,
  CYCLE_LAYOUT_XML,
  CYCLE_LAYOUT_URN,
  CYCLE_COLORS_XML,
  CYCLE_STYLE_XML,
} from './smartart/cycle.js';
export type { SmartArtCycleOutput } from './smartart/cycle.js';

// SmartArt dispatch: classify + run the matching generator in one call
// (spec §7 step 5). Pure — no filesystem/ZIP knowledge, see dispatch.ts.
export { generateSmartArt } from './smartart/dispatch.js';
export type { SmartArtGenerated } from './smartart/dispatch.js';

// Build the <w:p> fragment that embeds a SmartArt diagram inline, given 4
// relationship ids (real or placeholder — see embed.ts's doc comment for why
// callers may need to pass placeholders here).
export { buildSmartArtDrawingXml } from './smartart/embed.js';
export type { SmartArtRelIds, SmartArtEmbedOptions } from './smartart/embed.js';

// Build the fallback-note <w:p> placed under a diagram that was attempted
// for SmartArt but rejected by classifyTopology() (spec §10.3). Caller-only
// responsibility: only emit this for an actual SmartArt attempt+rejection.
export { buildSmartArtFallbackNoteXml } from './smartart/embed.js';

// Shared types
export type {
  Flowchart,
  FlowNode,
  FlowEdge,
  Subgraph,
  NodeShape,
  EdgeType,
  Layout,
  LayoutBox,
} from './types.js';
