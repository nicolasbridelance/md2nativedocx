/**
 * SmartArt for a Mermaid `timeline`: the time-line generator (`timeline.ts`) — an axis, a dot per period, the
 * period and its events in a box above or below — when the timeline can be one.
 *
 * What SmartArt cannot keep, and the shape-built timeline does: sections (coloured groups of periods), so a
 * timeline with sections stays shape-built; and the title, which is not part of the SmartArt itself (the caller
 * writes it as a paragraph above). A timeline with too many periods for their words to stay whole also stays
 * shape-built.
 */

import type { TimelineChart } from '../diagrams/timeline/types.js';
import type { SmartArtGenerated } from './dispatch.js';
import { generateTimeline, timelineTextFits } from './timeline.js';
import type { SmartArtGenerateOptions } from './generate-options.js';

/** Whether `chart` becomes a SmartArt time line: at least two periods, no section, text that fits. */
export function timelineFitsSmartArt(chart: TimelineChart): boolean {
  return chart.sections.length === 0 && timelineTextFits(chart);
}

/**
 * SmartArt parts for a parsed `timeline`, or `null` when it cannot be one ({@link timelineFitsSmartArt}): the
 * caller then keeps the shape-built timeline. The title is not in the parts; a caller that has one writes it
 * above the diagram.
 */
export function generateTimelineSmartArt(chart: TimelineChart, options: SmartArtGenerateOptions = {}): SmartArtGenerated | null {
  return timelineFitsSmartArt(chart) ? { layout: 'timeline', ...generateTimeline(chart, options) } : null;
}
