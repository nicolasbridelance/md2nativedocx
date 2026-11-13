/**
 * SmartArt time lines for Mermaid `timeline` and `journey`.
 *
 * - A `timeline` without sections: `timeline.ts` — an axis, a dot per period, the period and its events in a box
 *   above or below.
 * - A `timeline` with sections, and every `journey`: `timeline-grouped.ts` — one arrow-ended bar per section
 *   with the steps as cards above and below. A journey task's card holds the task (bold), its score as stars
 *   (★★★★☆ for 4) and its actors.
 *
 * The title is never part of the SmartArt (the caller writes it as a paragraph above). A diagram too crowded for
 * whole words at 10 pt keeps its shape-built rendering.
 */

import type { LabelToken } from '../types.js';
import type { TimelineChart } from '../diagrams/timeline/types.js';
import type { JourneyChart } from '../diagrams/journey/types.js';
import type { SmartArtGenerated } from './dispatch.js';
import { generateTimeline, periodText, timelineTextFits } from './timeline.js';
import { generateGroupedTimeline, groupedTimelineTextFits, type TimeLineGroup } from './timeline-grouped.js';
import type { SmartArtGenerateOptions } from './generate-options.js';

/** Items grouped by section index in section order; items outside any section (-1) form a leading unnamed group. */
function group<T extends { sectionIndex: number }>(sections: string[], items: T[], text: (item: T) => LabelToken[]): TimeLineGroup[] {
  const groups: TimeLineGroup[] = [];
  const loose = items.filter((it) => it.sectionIndex < 0);
  if (loose.length > 0) groups.push({ label: '', steps: loose.map(text) });
  sections.forEach((label, i) => groups.push({ label, steps: items.filter((it) => it.sectionIndex === i).map(text) }));
  return groups;
}

/** The sections of a timeline that has some, else `null`. */
function timelineGroups(chart: TimelineChart): TimeLineGroup[] | null {
  return chart.sections.length > 0 ? group(chart.sections, chart.periods, (p) => periodText(p.label, p.events)) : null;
}

/** A journey task's card text: the task in bold, its score as stars, its actors. */
export function journeyTaskText(label: string, score: number, actors: string[]): LabelToken[] {
  const stars = Math.max(0, Math.min(5, Math.round(score)));
  return periodText(label, ['★'.repeat(stars) + '☆'.repeat(5 - stars), ...(actors.length > 0 ? [actors.join(', ')] : [])]);
}

function journeyGroups(chart: JourneyChart): TimeLineGroup[] {
  return group(chart.sections, chart.tasks, (t) => journeyTaskText(t.label, t.score, t.actors));
}

/** Whether `chart` becomes a SmartArt time line (enough room for whole words; a plain one needs two periods). */
export function timelineFitsSmartArt(chart: TimelineChart): boolean {
  const groups = timelineGroups(chart);
  return groups ? groupedTimelineTextFits(groups) : timelineTextFits(chart);
}

/**
 * SmartArt parts for a parsed `timeline`, or `null` when it cannot be one ({@link timelineFitsSmartArt}): the
 * caller then keeps the shape-built timeline. The title is not in the parts.
 */
export function generateTimelineSmartArt(chart: TimelineChart, options: SmartArtGenerateOptions = {}): SmartArtGenerated | null {
  if (!timelineFitsSmartArt(chart)) return null;
  const groups = timelineGroups(chart);
  return { layout: 'timeline', ...(groups ? generateGroupedTimeline(groups, options) : generateTimeline(chart, options)) };
}

/** Whether `chart` becomes a SmartArt time line (at least one task, enough room for whole words). */
export function journeyFitsSmartArt(chart: JourneyChart): boolean {
  return groupedTimelineTextFits(journeyGroups(chart));
}

/** SmartArt parts for a parsed `journey`, or `null` ({@link journeyFitsSmartArt}). The title is not in the parts. */
export function generateJourneySmartArt(chart: JourneyChart, options: SmartArtGenerateOptions = {}): SmartArtGenerated | null {
  return journeyFitsSmartArt(chart) ? { layout: 'timeline', ...generateGroupedTimeline(journeyGroups(chart), options) } : null;
}
