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

// Layout: AST -> pixel coordinates (Dagre, ADR 0001)
export { layout, boundingBox, NODE_WIDTH, NODE_HEIGHT } from './layout/layout.js';
export type { LayoutOptions } from './layout/layout.js';

// Translator: AST + layout -> OOXML/DrawingML XML string
export { translateToOoxml } from './translator/ooxml-translator.js';
export type { TranslateOptions } from './translator/ooxml-translator.js';

// XML escaping for user-controlled text (rule #2)
export { escapeXml } from './translator/xml-escape.js';

// SmartArt topology classifier (FUTURE_mmd2smartart_SPEC.md §4, ADR 0004).
// Complements the OOXML translator above; never required by it.
export { classifyTopology, MAX_TREE_DEPTH } from './smartart/classify.js';
export type {
  SmartArtLayout,
  SmartArtClassification,
  SmartArtEligible,
  SmartArtIneligible,
  SmartArtIneligibleReason,
} from './smartart/classify.js';

// SmartArt generator for the `chain` topology (FUTURE_mmd2smartart_SPEC.md
// §7 step 4, ADR 0004 "Round 5"). Original layout/colors/style — no
// Microsoft content. Caller is responsible for calling classifyTopology()
// first and only invoking this on a 'chain' result.
export { generateChain, CHAIN_LAYOUT_XML, CHAIN_COLORS_XML, CHAIN_STYLE_XML } from './smartart/chain.js';
export type { SmartArtChainOutput } from './smartart/chain.js';

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
