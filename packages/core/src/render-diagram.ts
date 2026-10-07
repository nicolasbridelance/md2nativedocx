/**
 * `renderDiagram()`: one Mermaid diagram in, one Word fragment out, whatever its type (ADR 0012 rule 1,
 * `docs/specs/01-v2-engine-spec.md` §4).
 *
 * This is the dispatch that used to live in `packages/pandoc-filter/bin/md2nativedocx-core.mjs`, moved
 * here unchanged in behavior: detect the type, run its parser, try SmartArt or a native Word chart when
 * the caller allows it, fall back to the shape-built translator. It centralizes orchestration only; the
 * type-specific intelligence stays in each `diagrams/<type>/` module and in `smartart/`.
 *
 * Pure, like the rest of `core`: no filesystem, no environment variables, no stderr. What the bridge
 * used to write to disk (SmartArt and chart parts) is returned as data in {@link RenderResult.parts};
 * what it used to print to stderr is returned in {@link RenderMetadata.warnings}. Wiring the parts into
 * a `.docx` package stays the caller's job (`packages/cli/src/postprocess.mjs`, `chartParts.mjs`).
 */

import { detectDiagramType, type DiagramType } from './parser/diagram-type.js';
import { parseMermaid } from './parser/index.js';
import { layout } from './layout/layout.js';
import { translateToOoxml } from './translator/ooxml-translator.js';
import type { CanvasOptions } from './translator/canvas.js';
import { escapeXml } from './translator/xml-escape.js';
import type { ChartWorkbook, NativeChart, NativeChartOptions } from './translator/native-chart.js';
import { classifyTopology } from './smartart/classify.js';
import { generateSmartArt, type SmartArtGenerated } from './smartart/dispatch.js';
import { DRAWING_REL_TOKEN } from './smartart/drawing.js';
import { buildSmartArtDrawingXml, buildSmartArtFallbackNoteXml } from './smartart/embed.js';
import type { SmartArtGenerateOptions } from './smartart/generate-options.js';
import { SMARTART_STYLES, type SmartArtStyle } from './smartart/styles.js';
import { generateMindmapSmartArt, generateTreeViewSmartArt } from './smartart/from-tree.js';
import { generateJourneySmartArt, generateTimelineSmartArt } from './smartart/from-timeline.js';
import { generateKanbanSmartArt } from './smartart/kanban.js';
import { generateClassDiagramSmartArt, generateGitGraphSmartArt, generateStateDiagramSmartArt } from './smartart/from-graph.js';
import { parseQuadrantChart } from './diagrams/quadrant/parser.js';
import { translateQuadrantToOoxml } from './diagrams/quadrant/translator.js';
import { parseVennChart } from './diagrams/venn/parser.js';
import { translateVennToOoxml } from './diagrams/venn/translator.js';
import { parseMindmap } from './diagrams/mindmap/parser.js';
import { translateMindmapToOoxml } from './diagrams/mindmap/translator.js';
import { parseClassDiagram } from './diagrams/class-diagram/parser.js';
import { translateClassDiagramToOoxml } from './diagrams/class-diagram/translator.js';
import { parseStateDiagram } from './diagrams/state-diagram/parser.js';
import { translateStateDiagramToOoxml } from './diagrams/state-diagram/translator.js';
import { parseErDiagram } from './diagrams/er-diagram/parser.js';
import { translateErDiagramToOoxml } from './diagrams/er-diagram/translator.js';
import { parseRequirementDiagram } from './diagrams/requirement-diagram/parser.js';
import { translateRequirementDiagramToOoxml } from './diagrams/requirement-diagram/translator.js';
import { parseArchitectureDiagram } from './diagrams/architecture-diagram/parser.js';
import { translateArchitectureDiagramToOoxml } from './diagrams/architecture-diagram/translator.js';
import { parseGanttChart } from './diagrams/gantt/parser.js';
import { translateGanttToOoxml } from './diagrams/gantt/translator.js';
import { parseC4Diagram } from './diagrams/c4/parser.js';
import { translateC4DiagramToOoxml } from './diagrams/c4/translator.js';
import { parseGitGraphDiagram } from './diagrams/git-graph/parser.js';
import { translateGitGraphToOoxml } from './diagrams/git-graph/translator.js';
import { parseCynefinDiagram } from './diagrams/cynefin/parser.js';
import { translateCynefinToOoxml } from './diagrams/cynefin/translator.js';
import { parsePieChart } from './diagrams/pie/parser.js';
import { translatePieToOoxml } from './diagrams/pie/translator.js';
import { translatePieToChart } from './diagrams/pie/chart.js';
import { parseTimeline } from './diagrams/timeline/parser.js';
import { translateTimelineToOoxml } from './diagrams/timeline/translator.js';
import { parseKanban } from './diagrams/kanban/parser.js';
import { translateKanbanToOoxml } from './diagrams/kanban/translator.js';
import { parsePacketDiagram } from './diagrams/packet/parser.js';
import { translatePacketToOoxml } from './diagrams/packet/translator.js';
import { parseTreemap } from './diagrams/treemap/parser.js';
import { translateTreemapToOoxml } from './diagrams/treemap/translator.js';
import { parseJourney } from './diagrams/journey/parser.js';
import { translateJourneyToOoxml } from './diagrams/journey/translator.js';
import { parseTreeView } from './diagrams/tree-view/parser.js';
import { translateTreeViewToOoxml } from './diagrams/tree-view/translator.js';
import { parseRadar } from './diagrams/radar/parser.js';
import { translateRadarToOoxml } from './diagrams/radar/translator.js';
import { translateRadarToChart } from './diagrams/radar/chart.js';
import { parseIshikawa } from './diagrams/ishikawa/parser.js';
import { translateIshikawaToOoxml } from './diagrams/ishikawa/translator.js';
import { parseXyChart } from './diagrams/xychart/parser.js';
import { translateXyChartToOoxml } from './diagrams/xychart/translator.js';
import { translateXyChartToChart } from './diagrams/xychart/chart.js';
import { parseBlock } from './diagrams/block/parser.js';
import { translateBlockToOoxml } from './diagrams/block/translator.js';
import { parseSankey } from './diagrams/sankey/parser.js';
import { translateSankeyToOoxml } from './diagrams/sankey/translator.js';
import { parseWardley } from './diagrams/wardley/parser.js';
import { translateWardleyToOoxml } from './diagrams/wardley/translator.js';
import { parseEventModeling } from './diagrams/event-modeling/parser.js';
import { translateEventModelingToOoxml } from './diagrams/event-modeling/translator.js';
import { parseSequence } from './diagrams/sequence/parser.js';
import { translateSequenceToOoxml } from './diagrams/sequence/translator.js';
import { parseZenuml } from './diagrams/zenuml/parser.js';

/** Diagram types that can become a native Word chart (ADR 0011). */
export type NativeChartType = 'pie' | 'xychart' | 'radar';

/** How {@link renderDiagram} may render a diagram. Every field is optional. */
export interface RenderOptions extends CanvasOptions {
  /**
   * Try SmartArt for the diagrams that can be one (flowchart chain/tree/cycle, mindmap, treeView,
   * timeline, journey, kanban, and the simple cases of gitGraph, state and class diagrams). Off by
   * default: a SmartArt result comes with {@link SmartArtPart}s the caller must add to the package.
   */
  smartArt?: boolean;
  /** SmartArt look (default `colorful`). An unknown value falls back to the default. */
  smartArtStyle?: SmartArtStyle;
  /**
   * Include the pre-rendered `dsp:drawing` part, so Word and LibreOffice show the same geometry
   * (default `true`). `false` lets Word lay the SmartArt out itself.
   */
  smartArtDrawing?: boolean;
  /**
   * Render `pie` / `xychart` / `radar` as native Word charts: `true` for all three, or the list of types
   * to chart. Off by default: a chart result comes with a {@link ChartPart} the caller must add.
   */
  nativeCharts?: boolean | readonly NativeChartType[];
  /**
   * Id generator for the parts of a SmartArt or chart result, embedded in the placeholders of the
   * fragment. Default: `crypto.randomUUID()`. Ids must be unique across one document and match
   * `[A-Za-z0-9_-]{1,64}`; pass a counter for reproducible output.
   */
  newPartId?: () => string;
}

/**
 * The parts of one SmartArt graphic, as XML strings. The fragment references them through placeholder
 * relationship ids `SMARTART_PLACEHOLDER:<id>:dm` (data), `:lo` (layout), `:qs` (quick style) and `:cs`
 * (colors); `dataXml` references the drawing through `SMARTART_PLACEHOLDER:<id>:dr`. The caller adds
 * the parts under `word/diagrams/` and replaces each placeholder with a real relationship id.
 */
export interface SmartArtPart {
  kind: 'smartart';
  /** The id embedded in this part's placeholders. */
  id: string;
  dataXml: string;
  layoutXml: string;
  colorsXml: string;
  styleXml: string;
  /** Pre-rendered `dsp:drawing` part; absent when {@link RenderOptions.smartArtDrawing} is `false`. */
  drawingXml?: string;
}

/**
 * One native Word chart. The fragment references it through the relationship id
 * `CHART_PLACEHOLDER:<id>`; the caller adds `chartXml` under `word/charts/`, builds the embedded
 * workbook from `workbook` when `hasWorkbook` is true, and replaces the placeholder.
 */
export interface ChartPart {
  kind: 'chart';
  /** The id embedded in this part's placeholder. */
  id: string;
  /** Complete `c:chartSpace` part. */
  chartXml: string;
  /** The data the chart displays, for the embedded workbook. */
  workbook: ChartWorkbook;
  /** Whether `chartXml` references an embedded workbook (relationship id `rId1`). */
  hasWorkbook: boolean;
}

/** A package part produced alongside a fragment. */
export type RenderedPart = SmartArtPart | ChartPart;

/** What is known about a rendering besides its XML. */
export interface RenderMetadata {
  /** Detected Mermaid type (`unknown` is rendered as a flowchart). */
  diagramType: DiagramType;
  /** Mermaid's own name for the type. */
  label: string;
  /**
   * Non-fatal problems, in the order they occurred: syntax the parser ignored, a layout retried, or a
   * SmartArt/chart rendering abandoned for shapes (with the reason). Plain text, no prefix.
   */
  warnings: string[];
}

/** One rendered diagram. */
export interface RenderResult {
  /** `shapes`: editable Word shapes · `smartart`: a SmartArt graphic · `chart`: a native Word chart. */
  kind: 'shapes' | 'smartart' | 'chart';
  /**
   * WordprocessingML to insert in `word/document.xml`: one or more `<w:p>` paragraphs (a title
   * paragraph may precede a SmartArt, a note may follow a flowchart that SmartArt could not take).
   * Drawing ids (`wp:docPr/@id`, `cNvPr/@id`) restart at 1 in every fragment: renumber them across the
   * document.
   */
  fragment: string;
  /** Parts the fragment references through placeholders; empty when `kind` is `shapes`. */
  parts: RenderedPart[];
  metadata: RenderMetadata;
}

/** What one type renderer gives back; `renderDiagram` adds the metadata. */
interface Rendered {
  kind: RenderResult['kind'];
  fragment: string;
  parts: RenderedPart[];
}

/** Shared state and fallbacks handed to every type renderer. */
interface RenderContext {
  options: RenderOptions;
  canvas: CanvasOptions;
  warnings: string[];
  /** Run a SmartArt generator; `null` when SmartArt is off, not applicable, or failed (warning added). */
  smartArt(generate: (options: SmartArtGenerateOptions) => GeneratedSmartArt | null): Rendered | null;
  /** Build a native chart; `null` when charts are off for `type` or the chart failed (warning added). */
  chart(type: NativeChartType, translate: (id: string, options: NativeChartOptions) => NativeChart): Rendered | null;
}

type TypeRenderer = (source: string, ctx: RenderContext) => Rendered;

/** What every SmartArt generator returns (the dispatching one also says which layout it chose). */
type GeneratedSmartArt = Omit<SmartArtGenerated, 'layout'>;

const shapes = (fragment: string): Rendered => ({ kind: 'shapes', fragment, parts: [] });

/** Parse with `parse`, collect its warnings, return the AST. */
function parsed<T>(ctx: RenderContext, result: { ast: T; warnings: string[] }): T {
  ctx.warnings.push(...result.warnings);
  return result.ast;
}

/** A type with only a shape translator. */
function shapesOnly<T>(
  parse: (source: string) => { ast: T; warnings: string[] },
  translate: (ast: T, options: CanvasOptions) => string,
): TypeRenderer {
  return (source, ctx) => shapes(translate(parsed(ctx, parse(source)), ctx.canvas));
}

/**
 * A type that becomes SmartArt when it can, shapes otherwise. `titleOf`, for a SmartArt with no place
 * for the diagram title, puts that title in a paragraph above it.
 */
function smartArtOrShapes<T>(
  parse: (source: string) => { ast: T; warnings: string[] },
  generate: (ast: T, options: SmartArtGenerateOptions) => GeneratedSmartArt | null,
  translate: (ast: T, options: CanvasOptions) => string,
  titleOf?: (ast: T) => string | undefined,
): TypeRenderer {
  return (source, ctx) => {
    const ast = parsed(ctx, parse(source));
    const smartArt = ctx.smartArt((options) => generate(ast, options));
    if (!smartArt) return shapes(translate(ast, ctx.canvas));
    return titleOf ? { ...smartArt, fragment: smartArtTitleXml(titleOf(ast)) + smartArt.fragment } : smartArt;
  };
}

/** A type that becomes a native chart when charts are on for it, shapes otherwise. */
function chartOrShapes<T>(
  type: NativeChartType,
  parse: (source: string) => { ast: T; warnings: string[] },
  toChart: (ast: T, id: string, options: NativeChartOptions) => NativeChart,
  translate: (ast: T, options: CanvasOptions) => string,
): TypeRenderer {
  return (source, ctx) => {
    const ast = parsed(ctx, parse(source));
    return ctx.chart(type, (id, options) => toChart(ast, id, options)) ?? shapes(translate(ast, ctx.canvas));
  };
}

/**
 * The diagram title as a bold centred paragraph, for a SmartArt that has no place for it (timeline,
 * journey, gitGraph); empty when there is no title. Escaped: the title is untrusted text.
 */
function smartArtTitleXml(title: string | undefined): string {
  return title
    ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${escapeXml(title)}</w:t></w:r></w:p>`
    : '';
}

/** Flowchart (and text with no recognized header): SmartArt when its topology allows, else Dagre + shapes. */
const renderFlowchart: TypeRenderer = (source, ctx) => {
  const ast = parsed(ctx, parseMermaid(source));
  const smartArt = ctx.smartArt((options) => generateSmartArt(ast, options));
  if (smartArt) return smartArt;
  const result = layout(ast);
  ctx.warnings.push(...result.warnings);
  let fragment = translateToOoxml(ast, result, ctx.canvas);
  // Say why only when SmartArt was attempted and rejected for a structural reason (spec §10.3); never
  // when SmartArt is off, and never for a generation error (already a warning).
  if (ctx.options.smartArt) {
    const classification = classifyTopology(ast);
    if (!classification.eligible) fragment += '\n' + buildSmartArtFallbackNoteXml(classification);
  }
  return shapes(fragment);
};

/** One renderer per detected type. A `Record` so that a new `DiagramType` cannot be forgotten here. */
const RENDERERS: Record<DiagramType, TypeRenderer> = {
  flowchart: renderFlowchart,
  unknown: renderFlowchart,
  quadrant: shapesOnly(parseQuadrantChart, translateQuadrantToOoxml),
  venn: shapesOnly(parseVennChart, translateVennToOoxml),
  // A mindmap becomes a left-to-right SmartArt hierarchy; the radial shape-built one otherwise.
  mindmap: smartArtOrShapes(parseMindmap, generateMindmapSmartArt, translateMindmapToOoxml),
  // An inheritance-only class tree becomes a SmartArt hierarchy (members in each box).
  class: smartArtOrShapes(parseClassDiagram, generateClassDiagramSmartArt, translateClassDiagramToOoxml),
  // A state machine shaped as a chain or a loop becomes a SmartArt process or cycle.
  state: smartArtOrShapes(parseStateDiagram, generateStateDiagramSmartArt, translateStateDiagramToOoxml),
  er: shapesOnly(parseErDiagram, translateErDiagramToOoxml),
  requirement: shapesOnly(parseRequirementDiagram, translateRequirementDiagramToOoxml),
  architecture: shapesOnly(parseArchitectureDiagram, translateArchitectureDiagramToOoxml),
  gantt: shapesOnly(parseGanttChart, translateGanttToOoxml),
  c4: shapesOnly(parseC4Diagram, translateC4DiagramToOoxml),
  // A main-branch-only history becomes a SmartArt process, one box per commit.
  gitGraph: smartArtOrShapes(parseGitGraphDiagram, generateGitGraphSmartArt, translateGitGraphToOoxml, (ast) => ast.title),
  cynefin: shapesOnly(parseCynefinDiagram, translateCynefinToOoxml),
  pie: chartOrShapes('pie', parsePieChart, translatePieToChart, translatePieToOoxml),
  // A section-less timeline becomes a SmartArt process, one box per period, events under it.
  timeline: smartArtOrShapes(parseTimeline, generateTimelineSmartArt, translateTimelineToOoxml, (ast) => ast.title),
  // A board becomes a SmartArt grouped list (columns, then cards) when its text fits.
  kanban: smartArtOrShapes(parseKanban, generateKanbanSmartArt, translateKanbanToOoxml),
  packet: shapesOnly(parsePacketDiagram, translatePacketToOoxml),
  treemap: shapesOnly(parseTreemap, translateTreemapToOoxml),
  // A journey becomes a SmartArt time line grouped by section (task, stars, actors per card).
  journey: smartArtOrShapes(parseJourney, generateJourneySmartArt, translateJourneyToOoxml, (ast) => ast.title),
  // A single-root file tree becomes a top-down SmartArt hierarchy.
  treeView: smartArtOrShapes(parseTreeView, generateTreeViewSmartArt, translateTreeViewToOoxml),
  radar: chartOrShapes('radar', parseRadar, translateRadarToChart, translateRadarToOoxml),
  ishikawa: shapesOnly(parseIshikawa, translateIshikawaToOoxml),
  xychart: chartOrShapes('xychart', parseXyChart, translateXyChartToChart, translateXyChartToOoxml),
  block: shapesOnly(parseBlock, translateBlockToOoxml),
  sankey: shapesOnly(parseSankey, translateSankeyToOoxml),
  wardley: shapesOnly(parseWardley, translateWardleyToOoxml),
  eventModeling: shapesOnly(parseEventModeling, translateEventModelingToOoxml),
  sequence: shapesOnly(parseSequence, translateSequenceToOoxml),
  // Same AST and translator as sequenceDiagram; only the parser differs.
  zenuml: shapesOnly(parseZenuml, translateSequenceToOoxml),
};

function chartTypeEnabled(setting: RenderOptions['nativeCharts'], type: NativeChartType): boolean {
  return setting === true || (Array.isArray(setting) && setting.includes(type));
}

/** Part ids end up in XML attribute values and package paths: keep them to a safe alphabet. */
const PART_ID = /^[A-Za-z0-9_-]{1,64}$/;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Render one Mermaid diagram (the text inside a ```` ```mermaid ```` block, or a `.mmd` file) as
 * WordprocessingML, choosing between editable shapes, SmartArt and a native Word chart.
 *
 * SmartArt and charts are off unless {@link RenderOptions} turns them on; with both off the fragment
 * is self-contained and `parts` is empty. When either is on and applies, the fragment carries
 * placeholder relationship ids and `parts` holds what they point to (see {@link SmartArtPart},
 * {@link ChartPart}). A SmartArt or chart rendering that fails falls back to shapes and adds a warning;
 * it never fails the call.
 *
 * Every label, title and other text from `source` is XML-escaped before it reaches the fragment or a
 * part. No external relationship is ever produced.
 *
 * The parsers are lenient: syntax they do not understand becomes a warning, not an error.
 *
 * @throws RangeError when {@link RenderOptions.newPartId} returns an id outside `[A-Za-z0-9_-]{1,64}`.
 * An unexpected internal error in a parser or translator propagates as is.
 */
export function renderDiagram(source: string, options: RenderOptions = {}): RenderResult {
  const { type, label } = detectDiagramType(source);
  const warnings: string[] = [];
  const generateId = options.newPartId ?? (() => globalThis.crypto.randomUUID());
  const newPartId = (): string => {
    const id = generateId();
    if (!PART_ID.test(id)) throw new RangeError(`newPartId returned ${JSON.stringify(id)}; part ids must match ${PART_ID}`);
    return id;
  };
  const canvas: CanvasOptions = {};
  if (options.maxDrawingCx !== undefined) canvas.maxDrawingCx = options.maxDrawingCx;
  if (options.maxDrawingCy !== undefined) canvas.maxDrawingCy = options.maxDrawingCy;

  const ctx: RenderContext = {
    options,
    canvas,
    warnings,
    smartArt(generate) {
      if (!options.smartArt) return null;
      const id = newPartId();
      try {
        const style = options.smartArtStyle && SMARTART_STYLES.includes(options.smartArtStyle) ? options.smartArtStyle : 'colorful';
        const generated = generate({ drawing: options.smartArtDrawing !== false, style });
        if (!generated) return null;
        const placeholder = (rel: string): string => `SMARTART_PLACEHOLDER:${id}:${rel}`;
        const part: SmartArtPart = {
          kind: 'smartart',
          id,
          dataXml: generated.dataXml.split(DRAWING_REL_TOKEN).join(placeholder('dr')),
          layoutXml: generated.layoutXml,
          colorsXml: generated.colorsXml,
          styleXml: generated.styleXml,
          ...(generated.drawingXml !== undefined ? { drawingXml: generated.drawingXml } : {}),
        };
        const fragment = buildSmartArtDrawingXml(
          { dm: placeholder('dm'), lo: placeholder('lo'), qs: placeholder('qs'), cs: placeholder('cs') },
          generated.frame ? { widthEmu: generated.frame.cx, heightEmu: generated.frame.cy } : {},
        );
        return { kind: 'smartart', fragment, parts: [part] };
      } catch (err) {
        // Deliberate fallback: SmartArt is an alternate rendering, never guaranteed; shapes always work.
        warnings.push(`SmartArt path failed, falling back to shapes: ${errorMessage(err)}`);
        return null;
      }
    },
    chart(chartType, translate) {
      if (!chartTypeEnabled(options.nativeCharts, chartType)) return null;
      const id = newPartId();
      try {
        const chart = translate(id, { ...canvas, embedWorkbook: true });
        const part: ChartPart = { kind: 'chart', id, chartXml: chart.chartXml, workbook: chart.workbook, hasWorkbook: chart.hasWorkbook };
        return { kind: 'chart', fragment: chart.paragraphXml, parts: [part] };
      } catch (err) {
        // Deliberate fallback, e.g. a horizontal xychart with a line series, which Word cannot chart.
        warnings.push(`native chart not used, drawn as shapes instead: ${errorMessage(err)}`);
        return null;
      }
    },
  };

  const rendered = RENDERERS[type](source, ctx);
  return { ...rendered, metadata: { diagramType: type, label, warnings } };
}
