/**
 * `renderDiagramOdf()`: one Mermaid diagram in, one ODF drawing out, for a `.odt` (ADR 0013
 * decision 1, spec 05).
 *
 * A function of its own rather than a format option on `renderDiagram()`, whose result is shaped for
 * Word (SmartArt and chart parts, WordprocessingML). Phase 1 covers flowcharts; every other type
 * becomes a visible note saying so, never a silent gap.
 *
 * Pure, like the rest of `core`.
 */

import { prepareSource } from './parser/frontmatter.js';
import { escapeXml } from './translator/xml-escape.js';
import { detectDiagramType } from './parser/diagram-type.js';
import { parseMermaid } from './parser/index.js';
import { parsePlantUmlActivity } from './diagrams/plantuml/activity-parser.js';
import { parseAgentflow } from './diagrams/agentflow/parser.js';
import { parseUseCase } from './diagrams/usecase/parser.js';
import type { DiagramType } from './parser/diagram-type.js';
import type { Flowchart } from './types.js';
import { layout } from './layout/layout.js';
import { DiagramTooLargeError } from './layout/graph-limits.js';
import type { CanvasOptions } from './translator/canvas.js';
import { buildOdfNote, ODF_ID_PREFIX, translateToOdf } from './translator/odf-translator.js';
import { DEFAULT_MAX_SOURCE_LENGTH, type RenderMetadata } from './render-diagram.js';

/** How {@link renderDiagramOdf} may render a diagram. Every field is optional. */
export interface OdfRenderOptions extends CanvasOptions {
  /**
   * Prefix of every `xml:id`, `draw:id` and style name of this diagram (default `md2n`). They must be
   * unique in the document, so give each diagram its own prefix. Must match
   * `[A-Za-z][A-Za-z0-9_-]{0,31}`; anything else throws a `RangeError`.
   */
  idPrefix?: string;
  /** Longest accepted Mermaid source, in characters (default {@link DEFAULT_MAX_SOURCE_LENGTH}). */
  maxSourceLength?: number;
}

/** One diagram rendered for a `.odt`. */
export interface OdfRenderResult {
  /**
   * One `<text:p>` holding one `draw:g` anchored as a character (after a title paragraph when the
   * source has a frontmatter `title:`), or a note paragraph. Not a
   * standalone document: it uses the `text:`, `draw:`, `svg:` and `xml:` prefixes the enclosing
   * `office:document-content` declares (Pandoc's `opendocument` writer declares them all).
   */
  fragment: string;
  /**
   * `<style:style>` elements the fragment refers to, for `office:automatic-styles` (through the derived
   * Pandoc template). The fragment also refers to the `office:styles` definitions in
   * `ODF_GRAPHIC_DEFINITIONS`, which the `reference.odt` must carry.
   */
  automaticStyles: string[];
  metadata: RenderMetadata;
}

/** The diagram types drawn as flowcharts, with their parser (`.odt` draws these only, for now). */
const FLOWCHART_PARSERS: Partial<Record<DiagramType, (source: string) => { ast: Flowchart; warnings: string[] }>> = {
  flowchart: parseMermaid,
  unknown: parseMermaid,
  plantumlActivity: parsePlantUmlActivity,
  agentflow: parseAgentflow,
  usecase: parseUseCase,
};

/**
 * Render one Mermaid diagram as native, editable LibreOffice shapes: one shape per node, one connector
 * attached to its two shapes per edge, subgraphs as containers drawn behind their nodes.
 *
 * Only flowcharts (and text with no recognised header, read as one) are drawn for now. Any other
 * recognised type returns a note paragraph and a warning.
 *
 * Every label and title from `source` is XML-escaped and every colour validated before it reaches the
 * fragment or a style. No link, image, object, script or event listener is ever produced.
 *
 * @throws {DiagramTooLargeError} when the source or the graph exceeds the limits in {@link OdfRenderOptions}.
 * @throws {RangeError} when `idPrefix` does not match the pattern above.
 */
export function renderDiagramOdf(source: string, options: OdfRenderOptions = {}): OdfRenderResult {
  const idPrefix = options.idPrefix ?? 'md2n';
  if (!ODF_ID_PREFIX.test(idPrefix)) {
    throw new RangeError(`idPrefix ${JSON.stringify(idPrefix)} must match ${ODF_ID_PREFIX}`);
  }
  const maxSource = options.maxSourceLength ?? DEFAULT_MAX_SOURCE_LENGTH;
  if (source.length > maxSource) throw new DiagramTooLargeError('source', source.length, maxSource);
  const { type, label } = detectDiagramType(source);
  const warnings: string[] = [];

  // PlantUML activity diagrams, agent flows and use case diagrams are flowcharts once parsed: drawn here too.
  if (!(type in FLOWCHART_PARSERS)) {
    const message = `${label} not converted: .odt output draws flowcharts (and the types drawn as flowcharts) only for now.`;
    warnings.push(message);
    return { ...buildOdfNote(message, idPrefix), metadata: { diagramType: type, label, warnings } };
  }

  const prepared = prepareSource(source, type);
  warnings.push(...prepared.warnings);
  const parsed = (FLOWCHART_PARSERS[type] ?? parseMermaid)(prepared.source);
  warnings.push(...parsed.warnings);
  if (parsed.ast.edges.some((e) => e.type === 'generalization' || e.type === 'realization')) {
    warnings.push('Hollow triangles (`--|>`, `..|>`) are drawn as plain arrows in a .odt.');
  }
  const canvas: CanvasOptions = {};
  if (options.maxDrawingCx !== undefined) canvas.maxDrawingCx = options.maxDrawingCx;
  if (options.maxDrawingCy !== undefined) canvas.maxDrawingCy = options.maxDrawingCy;
  if (options.maxNodes !== undefined) canvas.maxNodes = options.maxNodes;
  if (options.maxEdges !== undefined) canvas.maxEdges = options.maxEdges;
  if (options.maxWork !== undefined) canvas.maxWork = options.maxWork;
  const result = layout(parsed.ast, canvas);
  warnings.push(...result.warnings);
  const drawing = translateToOdf(parsed.ast, result, { ...canvas, idPrefix });
  if (prepared.title === undefined) return { ...drawing, metadata: { diagramType: type, label, warnings } };
  // A frontmatter `title:` is drawn above the diagram, as in the .docx: bold, aligned with the drawing's
  // left edge, kept with it.
  const titleStyle = `${idPrefix}-title`;
  return {
    fragment: `<text:p text:style-name="${titleStyle}">${escapeXml(prepared.title)}</text:p>${drawing.fragment}`,
    automaticStyles: [
      `<style:style style:name="${titleStyle}" style:family="paragraph"><style:paragraph-properties fo:text-align="start" fo:keep-with-next="always"/><style:text-properties fo:font-weight="bold" fo:font-size="14pt"/></style:style>`,
      ...drawing.automaticStyles,
    ],
    metadata: { diagramType: type, label, warnings },
  };
}

/**
 * The note paragraph shown in place of a diagram that exceeded the size limits, for a `.odt` (the
 * counterpart of `buildDiagramTooLargeNoteXml`), with the automatic style it uses.
 */
export function buildOdfDiagramTooLargeNote(
  error: Pick<Error, 'message'>,
  idPrefix = 'md2n',
): { fragment: string; automaticStyles: string[] } {
  if (!ODF_ID_PREFIX.test(idPrefix)) {
    throw new RangeError(`idPrefix ${JSON.stringify(idPrefix)} must match ${ODF_ID_PREFIX}`);
  }
  return buildOdfNote(`This diagram was not converted: ${error.message}.`, idPrefix);
}
