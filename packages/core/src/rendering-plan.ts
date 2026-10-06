/**
 * What a Mermaid diagram will become in Word, without generating it — for editors that tell the user before
 * they export (the VS Code extension's CodeLens and hover, docs/specs/UX_REVIEW_2026-10.md §3.2-3.3).
 *
 * Mirrors the dispatch in `packages/pandoc-filter/bin/md2nativedocx-core.mjs`: a flowchart goes to SmartArt
 * when SmartArt is on and {@link classifyTopology} accepts it; `mindmap` / single-root `treeView-beta` go to
 * a SmartArt hierarchy when SmartArt is on; `pie` / `xychart` / `radar` become native Word charts when those
 * are on; everything else becomes editable Word shapes. It also says what the *other* setting would change
 * (`smartArtWouldApply`, `chartWouldApply`), so an editor can offer to turn it on.
 *
 * Pure and cheap (parsing and classification only, no layout, no XML), safe to call on every keystroke.
 */

import { detectDiagramType, type DiagramType } from './parser/diagram-type.js';
import { parseMermaid } from './parser/index.js';
import {
  MAX_TREE_DEPTH,
  classifyTopology,
  flowchartTreeDepth,
  type SmartArtIneligible,
  type SmartArtLayout,
} from './smartart/classify.js';
import { parseMindmap } from './diagrams/mindmap/parser.js';
import { parseTreeView } from './diagrams/tree-view/parser.js';
import { mindmapToFlowchart, treeViewToFlowchart } from './smartart/from-tree.js';
import type { Flowchart } from './types.js';

/** Which settings the export will run with. */
export interface RenderingSettings {
  /** SmartArt export on (`MD2NATIVEDOCX_ENABLE_SMARTART`, VS Code `md2nativedocx.smartArt.enabled`). */
  smartArt: boolean;
  /** Native Word charts on (`MD2NATIVEDOCX_NATIVE_CHARTS`, VS Code `md2nativedocx.nativeCharts.enabled`). */
  nativeCharts: boolean;
}

/** What a diagram will become in the Word document. */
export interface RenderingPlan {
  /** Detected Mermaid type (`unknown` is treated as a flowchart, as the exporter does). */
  type: DiagramType;
  /** Mermaid's own name for the type. */
  label: string;
  /** `smartart`: a SmartArt graphic · `chart`: a native Word chart · `shapes`: editable Word shapes ·
   * `invalid`: the source does not parse (the export will report it). */
  rendering: 'smartart' | 'chart' | 'shapes' | 'invalid';
  /** `rendering === 'smartart'`: which SmartArt family, and for a tree its number of levels. */
  smartArt?: { layout: SmartArtLayout; depth?: number };
  /** SmartArt is on but this flowchart cannot be one: the structured reason (merge, subgraph…). */
  smartArtRejected?: SmartArtIneligible;
  /** SmartArt is off, and turning it on would make this diagram a SmartArt graphic. */
  smartArtWouldApply?: boolean;
  /** Native charts are off, and turning them on would make this diagram a Word chart. */
  chartWouldApply?: boolean;
  /** `rendering === 'invalid'`: the parser's message. */
  error?: string;
}

const CHART_TYPES: ReadonlySet<DiagramType> = new Set(['pie', 'xychart', 'radar']);

/** SmartArt shape of a tree-shaped diagram (`mindmap`, `treeView`), or `undefined` if it cannot be one. */
function treeSmartArt(flowchart: Flowchart | null): { layout: SmartArtLayout; depth: number } | undefined {
  if (!flowchart || flowchart.nodes.length < 2) return undefined;
  const depth = flowchartTreeDepth(flowchart);
  return depth >= 2 && depth <= MAX_TREE_DEPTH ? { layout: 'tree', depth } : undefined;
}

/**
 * Plan the rendering of one Mermaid diagram (the text inside a ```mermaid block, or a `.mmd` file) under
 * `settings`. Never throws: a source that does not parse yields `rendering: 'invalid'`.
 */
export function planRendering(source: string, settings: RenderingSettings): RenderingPlan {
  const { type, label } = detectDiagramType(source);
  try {
    if (CHART_TYPES.has(type)) {
      return settings.nativeCharts ? { type, label, rendering: 'chart' } : { type, label, rendering: 'shapes', chartWouldApply: true };
    }
    if (type === 'mindmap' || type === 'treeView') {
      const shape =
        type === 'mindmap' ? treeSmartArt(mindmapToFlowchart(parseMindmap(source).ast)) : treeSmartArt(treeViewToFlowchart(parseTreeView(source).ast));
      if (!shape) return { type, label, rendering: 'shapes' };
      return settings.smartArt
        ? { type, label, rendering: 'smartart', smartArt: shape }
        : { type, label, rendering: 'shapes', smartArtWouldApply: true };
    }
    if (type !== 'flowchart' && type !== 'unknown') return { type, label, rendering: 'shapes' };

    const { ast } = parseMermaid(source);
    const classification = classifyTopology(ast);
    if (!classification.eligible) {
      return settings.smartArt
        ? { type, label, rendering: 'shapes', smartArtRejected: classification }
        : { type, label, rendering: 'shapes' };
    }
    const smartArt =
      classification.layout === 'tree' ? { layout: classification.layout, depth: flowchartTreeDepth(ast) } : { layout: classification.layout };
    return settings.smartArt
      ? { type, label, rendering: 'smartart', smartArt }
      : { type, label, rendering: 'shapes', smartArtWouldApply: true };
  } catch (err) {
    return { type, label, rendering: 'invalid', error: err instanceof Error ? err.message : String(err) };
  }
}
