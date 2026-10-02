/**
 * `@md2nativedocx/pptx` — Markdown with Mermaid diagrams -> `.pptx`, one slide per diagram,
 * built by rewriting the DrawingML shapes `@md2nativedocx/core` already produces.
 */
export { exportPptx, coreBridgeProvider } from './export-pptx.js';
export type { ExportPptxOptions, ExportPptxResult, FragmentProvider } from './export-pptx.js';
export { buildPptx, diagramAreaFor } from './build-pptx.js';
export type { BuiltPptx, DiagramArea, SlideInput } from './build-pptx.js';
export { convertFragment } from './fragment-converter.js';
export type { ConvertedFragment } from './fragment-converter.js';
export { extractMermaidBlocks } from './markdown-blocks.js';
export type { MermaidBlock } from './markdown-blocks.js';
export { PptxConversionError } from './errors.js';
