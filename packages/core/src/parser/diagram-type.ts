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
  | 'treeView'
  /** PlantUML (`@startuml`) sequence diagram: same AST and drawing as `sequence`. */
  | 'plantumlSequence'
  /** PlantUML (`@startuml`) class diagram: same AST and drawing as `class`. */
  | 'plantumlClass'
  /** PlantUML (`@startuml`) state diagram: same AST and drawing as `state`. */
  | 'plantumlState'
  /** PlantUML (`@startuml`) activity diagram (current syntax): drawn as a flowchart. */
  | 'plantumlActivity'
  /** Any other PlantUML diagram (class, activity, mindmap...): not converted yet, shown as a note. */
  | 'plantuml';

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
  { type: 'sankey', label: 'Sankey diagram', pattern: /^sankey(?:-beta)?\b/i },
  { type: 'xychart', label: 'XY chart', pattern: /^xychart(?:-beta)?\b/i },
  { type: 'block', label: 'Block diagram', pattern: /^block(?:-beta)?\b/i },
  { type: 'packet', label: 'Packet diagram', pattern: /^packet(?:-beta)?\b/i },
  { type: 'kanban', label: 'Kanban board', pattern: /^kanban\b/i },
  { type: 'architecture', label: 'Architecture diagram', pattern: /^architecture-beta\b/i },
  { type: 'radar', label: 'Radar chart', pattern: /^radar-beta\b/i },
  { type: 'eventModeling', label: 'Event Modeling diagram', pattern: /^eventmodeling\b/i },
  { type: 'treemap', label: 'Treemap', pattern: /^treemap(?:-beta)?\b/i },
  { type: 'venn', label: 'Venn diagram', pattern: /^venn-beta\b/i },
  { type: 'ishikawa', label: 'Ishikawa diagram', pattern: /^ishikawa-beta\b/i },
  { type: 'wardley', label: 'Wardley map', pattern: /^wardley(?:-beta)?\b/i },
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
  let inFrontmatter = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('%%')) continue;
    if (/^@start\w+/i.test(line)) return detectPlantUmlType(line, text);

    // A leading `---` ... `---` YAML frontmatter block (`title:`/`config:`)
    // precedes the header in real Mermaid; skip it. Only honoured before any
    // other content: the first non-frontmatter line always returns below, so a stray
    // `---` later is never reached.
    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;

    // `swimlane-beta` is an alias header, not a distinct diagram type — see
    // its handling in parser.ts's header regex for why.
    if (/^(?:graph|flowchart|swimlane-beta)\b/i.test(line)) return FLOWCHART;

    for (const candidate of NON_FLOWCHART_HEADERS) {
      if (candidate.pattern.test(line)) return { type: candidate.type, label: candidate.label };
    }

    return UNKNOWN;
  }
  return UNKNOWN;
}

/**
 * Lines that only a non-sequence PlantUML diagram has (PlantUML itself decides the kind of an `@startuml`
 * block from its content). Checked before concluding "sequence".
 */
/** Lines only an activity diagram has. */
const ACTIVITY = /^(?:start|stop|endif|endwhile|fork|end fork|detach|kill)$|^:.*[;|<>\]}/]$|^if\s*\(|^while\s*\(|^repeat\b|^\|[^|]+\|/i;

const PLANTUML_KINDS: ReadonlyArray<{ kind: string; pattern: RegExp }> = [
  { kind: 'activity', pattern: ACTIVITY },
  // Before class: a state transition may carry a direction hint (`[*] -up-> First`) that class diagrams share.
  { kind: 'state', pattern: /^state\s+\S|\[\*\]/i },
  // A declaration, or a relation only class diagrams have (`<|--`, `*--`, `o--`, `..|>`...).
  {
    kind: 'class',
    pattern:
      /^[-#~+]?(?:abstract\s+class|abstract|class|interface|enum|annotation|struct|exception|protocol|metaclass|record|dataclass)\s+\S|^(?:\(\)|<>)\s+\S|(?:<\||\|>)[-.]|[-.](?:<\||\|>)|\s[*o#x}+^][-.]{2}|[-.]{2}[*o#x{+^]\s|\s-(?:left|right|up|down)-+>/i,
  },
  { kind: 'use case', pattern: /^usecase\s+\S|^\([^)]+\)/i },
  { kind: 'object', pattern: /^(?:object|map|json)\s+\S/i },
  { kind: 'component', pattern: /^(?:component|node|artifact|cloud|frame|folder|package|card|file|storage|rectangle|interface)\s+\S|^\[[^\]-]+\]/i },
];

/** Which PlantUML diagram `text` is, from its `@start...` header and, for `@startuml`, its lines. */
function detectPlantUmlType(header: string, text: string): DiagramTypeInfo {
  const start = /^@start(\w+)/i.exec(header)?.[1]?.toLowerCase() ?? '';
  if (start !== 'uml') return { type: 'plantuml', label: `PlantUML ${start}` };
  let sequenceLike = false;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  // Activity keywords and actions are unambiguous wherever they appear; a connector `(1)` before them would
  // otherwise read as a use case. An action is any line starting with `:` (no other diagram does).
  if (lines.some((l) => ACTIVITY.test(l) || /^:\S/.test(l))) return { type: 'plantumlActivity', label: 'PlantUML activity diagram' };
  let listOnly = true;
  let inStyle = false;
  for (const line of lines) {
    if (line.length === 0 || line.startsWith("'") || line.startsWith('@')) continue;
    // A `<style>` block is styling for any kind of diagram: it says nothing about which one this is.
    if (/^<style>/i.test(line)) inStyle = !/<\/style>\s*$/i.test(line);
    if (inStyle || /^<\/?style>/i.test(line)) {
      if (/^<\/style>/i.test(line)) inStyle = false;
      continue;
    }
    if (!/^[-*]{1,3}\s+\S/.test(line)) listOnly = false;
    // Groupings exist in several diagram kinds (`package`, `namespace`, `together`, or a `frame` / `folder`...
    // opening a block): their content decides.
    if (/^(?:package|namespace|together)\b/i.test(line) || /^(?:frame|folder|rectangle|node|cloud)\b.*\{$/i.test(line)) continue;
    for (const { kind, pattern } of PLANTUML_KINDS) {
      // A class relation is read before its `: label`, where any text may appear.
      if (!pattern.test(kind === 'class' ? line.replace(/(?<!:):(?!:).*$/, '') : line)) continue;
      if (kind === 'class') return { type: 'plantumlClass', label: 'PlantUML class diagram' };
      if (kind === 'state') return { type: 'plantumlState', label: 'PlantUML state diagram' };
      if (kind === 'activity') return { type: 'plantumlActivity', label: 'PlantUML activity diagram' };
      return { type: 'plantuml', label: `PlantUML ${kind}` };
    }
    if (/^(?:participant|actor|boundary|control|entity|database|collections|queue)\s/i.test(line) || /-+>|<-+/.test(line)) sequenceLike = true;
  }
  if (sequenceLike) return { type: 'plantumlSequence', label: 'PlantUML sequence diagram' };
  // Nothing but `- Action` / `* Action` lines: PlantUML's list form of an activity diagram.
  if (listOnly && lines.some((l) => /^[-*]{1,3}\s+\S/.test(l))) return { type: 'plantumlActivity', label: 'PlantUML activity diagram' };
  return { type: 'plantuml', label: 'PlantUML' };
}
