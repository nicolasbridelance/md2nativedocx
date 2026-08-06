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
