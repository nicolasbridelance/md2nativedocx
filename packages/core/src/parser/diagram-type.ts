/**
 * Cheap diagram-type guard-rail (`docs/specs/FUTURE_full_mermaid_coverage_SPEC.md`
 * §4 "Phase 0", item 1). `parseMermaid()` has zero notion of "this isn't a
 * flowchart" — it just reads whatever text it's given and does its best to
 * find flowchart-shaped statements in it. That's fine for actual flowcharts
 * (and for genuinely malformed input — the fuzz suite requires `parseMermaid`
 * to never throw on arbitrary text), but it means a diagram written in one of
 * Mermaid's other ~28 syntaxes can produce a silently-wrong result: `gitGraph`
 * bare words and `mindmap` `((...))` bullets happen to look enough like valid
 * flowchart node syntax to "parse" into a nonsense diagram instead of being
 * cleanly rejected.
 *
 * This module is deliberately separate from `parser.ts` and knows nothing
 * about OOXML — it only classifies the *first significant line* of the raw
 * Mermaid text. Callers (`packages/pandoc-filter/bin/md2nativedocx-core.mjs`)
 * use it to decide, before ever calling `parseMermaid()`, whether to run the
 * flowchart pipeline at all.
 */

/** One of Mermaid's ~28 non-flowchart diagram types that this project does
 * not implement yet, or `'flowchart'`/`'unknown'`. See module doc comment. */
export type DiagramType =
  | 'flowchart'
  | 'unknown'
  | 'swimlane'
  | 'sequence'
  | 'class'
  | 'state'
  | 'er'
  | 'journey'
  | 'gantt'
  | 'pie'
  | 'quadrant'
  | 'requirement'
  | 'gitGraph'
  | 'c4'
  | 'mindmap'
  | 'timeline'
  | 'zenuml'
  | 'sankey'
  | 'xychart'
  | 'block'
  | 'packet'
  | 'kanban'
  | 'architecture'
  | 'radar'
  | 'eventModeling'
  | 'treemap'
  | 'venn'
  | 'ishikawa'
  | 'wardley'
  | 'cynefin'
  | 'treeView';

export interface DiagramTypeInfo {
  type: DiagramType;
  /** Mermaid's own name for the type, for warnings/notes shown to the user. */
  label: string;
}

const FLOWCHART: DiagramTypeInfo = { type: 'flowchart', label: 'Flowchart' };
const UNKNOWN: DiagramTypeInfo = { type: 'unknown', label: 'Unknown' };

// Header keyword -> type, checked in order against the first significant
// line. Verified against mermaid.js.org (2026-09-04) — see the spec's §2
// table. `graph`/`flowchart` are handled separately below, not in this list.
const NON_FLOWCHART_HEADERS: Array<{ type: DiagramType; label: string; pattern: RegExp }> = [
  { type: 'swimlane', label: 'Swimlanes', pattern: /^swimlane-beta\b/i },
  { type: 'sequence', label: 'Sequence diagram', pattern: /^sequenceDiagram\b/i },
  { type: 'class', label: 'Class diagram', pattern: /^classDiagram\b/i },
  { type: 'state', label: 'State diagram', pattern: /^stateDiagram(?:-v2)?\b/i },
  { type: 'er', label: 'Entity Relationship diagram', pattern: /^erDiagram\b/i },
  { type: 'journey', label: 'User Journey diagram', pattern: /^journey\b/i },
  { type: 'gantt', label: 'Gantt chart', pattern: /^gantt\b/i },
  { type: 'pie', label: 'Pie chart', pattern: /^pie\b/i },
  { type: 'quadrant', label: 'Quadrant chart', pattern: /^quadrantChart\b/i },
  { type: 'requirement', label: 'Requirement diagram', pattern: /^requirementDiagram\b/i },
  { type: 'gitGraph', label: 'GitGraph', pattern: /^gitGraph\b/i },
  { type: 'c4', label: 'C4 diagram', pattern: /^C4(?:Context|Container|Component|Dynamic|Deployment)\b/i },
  { type: 'mindmap', label: 'Mindmap', pattern: /^mindmap\b/i },
  { type: 'timeline', label: 'Timeline', pattern: /^timeline\b/i },
  { type: 'zenuml', label: 'ZenUML', pattern: /^zenuml\b/i },
  { type: 'sankey', label: 'Sankey diagram', pattern: /^sankey-beta\b/i },
  { type: 'xychart', label: 'XY chart', pattern: /^xychart-beta\b/i },
  { type: 'block', label: 'Block diagram', pattern: /^block-beta\b/i },
  { type: 'packet', label: 'Packet diagram', pattern: /^packet(?:-beta)?\b/i },
  { type: 'kanban', label: 'Kanban board', pattern: /^kanban\b/i },
  { type: 'architecture', label: 'Architecture diagram', pattern: /^architecture-beta\b/i },
  { type: 'radar', label: 'Radar chart', pattern: /^radar-beta\b/i },
  { type: 'eventModeling', label: 'Event Modeling diagram', pattern: /^eventmodeling\b/i },
  { type: 'treemap', label: 'Treemap', pattern: /^treemap-beta\b/i },
  { type: 'venn', label: 'Venn diagram', pattern: /^venn-beta\b/i },
  { type: 'ishikawa', label: 'Ishikawa diagram', pattern: /^ishikawa-beta\b/i },
  { type: 'wardley', label: 'Wardley map', pattern: /^wardley-beta\b/i },
  { type: 'cynefin', label: 'Cynefin framework', pattern: /^cynefin-beta\b/i },
  { type: 'treeView', label: 'TreeView', pattern: /^treeView-beta\b/i },
];

/**
 * Classify raw Mermaid text by its first significant line (skipping blank
 * lines and `%%`-prefixed comments/init directives, same convention as
 * `parseMermaid()`).
 *
 * Returns `'unknown'` — not a diversion type — when nothing recognized
 * matches, including a missing `graph`/`flowchart` header entirely. This is
 * deliberate: real Mermaid requires that header, but `parseMermaid()` itself
 * has never enforced it (the fuzz suite requires it to accept arbitrary text
 * without throwing), so treating "no recognized header" as license to divert
 * away from the flowchart pipeline would be a behavior change with no actual
 * evidence backing it. Only an *explicitly recognized* non-flowchart keyword
 * should divert — that's the one case with a real, cheaply-detectable signal.
 */
export function detectDiagramType(text: string): DiagramTypeInfo {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;

    if (/^(?:graph|flowchart)\b/i.test(line)) return FLOWCHART;

    for (const candidate of NON_FLOWCHART_HEADERS) {
      if (candidate.pattern.test(line)) return { type: candidate.type, label: candidate.label };
    }

    return UNKNOWN;
  }
  return UNKNOWN;
}
