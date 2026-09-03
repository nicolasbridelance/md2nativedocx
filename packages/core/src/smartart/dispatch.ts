/**
 * SmartArt dispatch: classify a flowchart and, if eligible, run the matching
 * generator (`docs/specs/FUTURE_mmd2smartart_SPEC.md` §7 step 5). Centralizes the
 * classification-result -> generator mapping so callers (the pandoc-filter
 * core bridge) don't each need to know which of `chain.ts`/`tree.ts`/
 * `cycle.ts` handles which {@link SmartArtLayout}.
 *
 * Still a pure function: no filesystem, no ZIP, no knowledge of Pandoc or
 * the eventual `.docx` package structure. Turning the four XML strings this
 * returns into new `word/diagrams/*.xml` parts + relationships + a
 * placeholder-bearing `<w:drawing>` fragment is the pandoc-filter/cli
 * layer's job (`packages/pandoc-filter/bin/md2nativedocx-core.mjs`,
 * `packages/cli/src/postprocess.mjs`) — this module knows nothing about
 * that, deliberately, matching `types.ts`'s "no knowledge of Pandoc, VS
 * Code, or Office.js" boundary for `packages/core`.
 */

import type { Flowchart } from '../types.js';
import { classifyTopology, type SmartArtLayout } from './classify.js';
import { generateChain } from './chain.js';
import { generateTree } from './tree.js';
import { generateCycle } from './cycle.js';

/** The four OOXML diagram parts for whichever topology `flowchart` matched. */
export interface SmartArtGenerated {
  /** Which generator produced this — lets a caller log/report the choice. */
  layout: SmartArtLayout;
  dataXml: string;
  layoutXml: string;
  colorsXml: string;
  styleXml: string;
}

/**
 * Classify `flowchart` and run its matching generator.
 *
 * Returns `null` for anything {@link classifyTopology} doesn't accept —
 * subgraphs, merge-after-branch, disconnected graphs, a tree deeper than
 * `tree.ts` supports, etc. A `null` result is the expected, common case for
 * a real-world flowchart (spec §6: merge-after-branch is probably the most
 * frequent shape) and callers should silently fall back to the existing
 * `wpg:wgp` translator, not treat it as an error.
 */
export function generateSmartArt(flowchart: Flowchart): SmartArtGenerated | null {
  const classification = classifyTopology(flowchart);
  if (!classification.eligible) return null;

  switch (classification.layout) {
    case 'chain':
      return { layout: 'chain', ...generateChain(flowchart) };
    case 'tree':
      return { layout: 'tree', ...generateTree(flowchart) };
    case 'cycle':
      return { layout: 'cycle', ...generateCycle(flowchart) };
  }
}
