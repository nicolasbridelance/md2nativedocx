/**
 * What a Mermaid diagram will become in Word, without generating it — for editors that tell the user before
 * they export (the VS Code extension's CodeLens and hover, docs/specs/UX_REVIEW_2026-10.md §3.2-3.3).
 *
 * The per-type decision is not made here: it comes from the same table as {@link renderDiagram}
 * (`RENDERERS` in `render-diagram.ts`), whose entries each carry a cheap `plan` next to their `render`.
 * This module only applies the settings to it, and says what the *other* setting would change
 * (`smartArtWouldApply`, `chartWouldApply`), so an editor can offer to turn it on.
 *
 * Pure and cheap (parsing and classification only, no layout, no XML), safe to call on every keystroke.
 */

import { detectDiagramType, type DiagramType } from './parser/diagram-type.js';
import { chartTypeEnabled, planDiagram, type Capability, type SmartArtShape } from './render-diagram.js';
import type { SmartArtIneligible } from './smartart/classify.js';

/** Which settings the export will run with. */
export interface RenderingSettings {
  /** SmartArt export on (`MD2NATIVEDOCX_ENABLE_SMARTART`, VS Code `md2nativedocx.smartArt.enabled`). */
  smartArt: boolean;
  /** Native Word charts: `true` for every chartable type, or the list of types turned on (e.g. `['pie']`),
   * as `MD2NATIVEDOCX_NATIVE_CHARTS` takes them (`1`, or `pie,xychart`). */
  nativeCharts: boolean | readonly string[];
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
  smartArt?: SmartArtShape;
  /** SmartArt is on but this flowchart cannot be one: the structured reason (merge, subgraph…). */
  smartArtRejected?: SmartArtIneligible;
  /** SmartArt is off, and turning it on would make this diagram a SmartArt graphic. */
  smartArtWouldApply?: boolean;
  /** Native charts are off, and turning them on would make this diagram a Word chart. */
  chartWouldApply?: boolean;
  /** `rendering === 'invalid'`: the parser's message. */
  error?: string;
}

/**
 * Plan the rendering of one Mermaid diagram (the text inside a ```mermaid block, or a `.mmd` file) under
 * `settings`. Never throws: a source that does not parse yields `rendering: 'invalid'`.
 */
export function planRendering(source: string, settings: RenderingSettings): RenderingPlan {
  const { type, label } = detectDiagramType(source);
  let capability: Capability;
  try {
    capability = planDiagram(type, source);
  } catch (err) {
    return { type, label, rendering: 'invalid', error: err instanceof Error ? err.message : String(err) };
  }
  switch (capability.kind) {
    case 'chart':
      return chartTypeEnabled(settings.nativeCharts, capability.chart)
        ? { type, label, rendering: 'chart' }
        : { type, label, rendering: 'shapes', chartWouldApply: true };
    case 'smartart':
      return settings.smartArt
        ? { type, label, rendering: 'smartart', smartArt: capability.smartArt }
        : { type, label, rendering: 'shapes', smartArtWouldApply: true };
    case 'shapes':
      // The rejection reason only matters to someone who turned SmartArt on.
      return settings.smartArt && capability.smartArtRejected
        ? { type, label, rendering: 'shapes', smartArtRejected: capability.smartArtRejected }
        : { type, label, rendering: 'shapes' };
  }
}
