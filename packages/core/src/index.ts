/**
 * md2nativedocx-core — public API.
 *
 * A pure TypeScript engine: Mermaid flowchart text -> intermediate AST ->
 * layout coordinates -> OOXML/DrawingML XML string. It has zero knowledge of
 * Pandoc, VS Code, or Office.js, so it is importable from Node (CLI/Pandoc
 * filter) and bundleable for the browser (future Office.js add-in).
 *
 * This is the one part of the codebase other packages and future contributors
 * depend on without reading the implementation, so every export is documented
 * here.
 */

// Parser: Mermaid text -> AST
export { parseMermaid, MermaidParseError } from './parser/index.js';
export type { ParseResult } from './parser/index.js';

// Diagram-type guard-rail (docs/specs/FUTURE_full_mermaid_coverage_SPEC.md §4
// "Phase 0", item 1): classify the first significant line of raw Mermaid
// text before ever calling parseMermaid(), so a recognized non-flowchart
// diagram (gitGraph, mindmap, sequenceDiagram, ...) gets a clean rejection
// instead of a silently-wrong flowchart-shaped parse.
export { detectDiagramType } from './parser/diagram-type.js';
export type { DiagramType, DiagramTypeInfo } from './parser/diagram-type.js';

// Layout: AST -> pixel coordinates (Dagre, ADR 0001)
export { layout, boundingBox, NODE_WIDTH, NODE_HEIGHT } from './layout/layout.js';
export type { LayoutOptions } from './layout/layout.js';

// Translator: AST + layout -> OOXML/DrawingML XML string
export { translateToOoxml } from './translator/ooxml-translator.js';

// Note shown in place of a diagram whose type is recognized but not yet
// implemented (see detectDiagramType above). Mirrors
// buildSmartArtFallbackNoteXml's "visible note, never a silent blank canvas"
// rule for this different guard-rail.
export { buildUnsupportedDiagramTypeNoteXml } from './translator/unsupported-diagram-note.js';
export type { TranslateOptions } from './translator/ooxml-translator.js';

// XML escaping for user-controlled text (rule #2)
export { escapeXml } from './translator/xml-escape.js';

// Quadrant chart diagram module (docs/smartart-full-catalog-cross-mermaid.md
// archetype #9 "Matrice", docs/specs/FUTURE_full_mermaid_coverage_SPEC.md §4
// item 2 naming convention: packages/core/src/diagrams/<type>/). Independent
// AST/parser/translator, no Dagre layout step — see
// diagrams/quadrant/translator.ts's module doc comment for why this renders
// as plain OOXML shapes rather than a SmartArt dgm:layoutDef.
export { parseQuadrantChart } from './diagrams/quadrant/parser.js';
export type { QuadrantParseResult } from './diagrams/quadrant/parser.js';
export { translateQuadrantToOoxml } from './diagrams/quadrant/translator.js';
export type { QuadrantChart, QuadrantAxis, QuadrantLabels, QuadrantPoint } from './diagrams/quadrant/types.js';

// Venn diagram module (docs/smartart-full-catalog-cross-mermaid.md archetype
// #11 "Venn"). Same independent-module convention and "plain OOXML shapes,
// not SmartArt dgm:" strategy as the quadrant chart above — see
// diagrams/venn/translator.ts's module doc comment.
export { parseVennChart } from './diagrams/venn/parser.js';
export type { VennParseResult } from './diagrams/venn/parser.js';
export { translateVennToOoxml } from './diagrams/venn/translator.js';
export type { VennChart, VennSet, VennUnion } from './diagrams/venn/types.js';

// Mindmap diagram module (docs/smartart-full-catalog-cross-mermaid.md
// archetype #5 "Radial") — fixes the exact silent-misparse bug that
// motivated FUTURE_full_mermaid_coverage_SPEC.md §1 (`root((mindmap))`
// coincidentally valid as flowchart circle syntax). Same independent-module,
// plain-OOXML-shapes convention as quadrant/venn above.
export { parseMindmap } from './diagrams/mindmap/parser.js';
export type { MindmapParseResult } from './diagrams/mindmap/parser.js';
export { translateMindmapToOoxml } from './diagrams/mindmap/translator.js';
export type { MindmapChart, MindmapNode, MindmapShape } from './diagrams/mindmap/types.js';

// Class diagram module (Family B, docs/specs/FUTURE_full_mermaid_coverage_SPEC.md
// §3 — reuses Dagre for layout, unlike quadrant/venn/mindmap above, but keeps
// their same independent-module and plain-OOXML-shapes convention). Node
// rendering extends to a 3-compartment box (name/attributes/methods); see
// diagrams/class-diagram/translator.ts's module doc comment for the v1
// relationship-marker fidelity trade-offs.
export { parseClassDiagram } from './diagrams/class-diagram/parser.js';
export type { ClassDiagramParseResult } from './diagrams/class-diagram/parser.js';
export { translateClassDiagramToOoxml } from './diagrams/class-diagram/translator.js';
export type { ClassDiagram, ClassBox, ClassMember, ClassRelationship, ClassRelationType } from './diagrams/class-diagram/types.js';

// State diagram module (Family B). Second consumer of
// translator/graph-shapes.ts (extracted from class-diagram/translator.ts —
// see that module's shared-helpers note).
export { parseStateDiagram } from './diagrams/state-diagram/parser.js';
export type { StateDiagramParseResult } from './diagrams/state-diagram/parser.js';
export { translateStateDiagramToOoxml } from './diagrams/state-diagram/translator.js';
export type { StateDiagram, StateNode, StateNodeKind, StateTransition } from './diagrams/state-diagram/types.js';

// ER diagram module (Family B).
export { parseErDiagram } from './diagrams/er-diagram/parser.js';
export type { ErDiagramParseResult } from './diagrams/er-diagram/parser.js';
export { translateErDiagramToOoxml } from './diagrams/er-diagram/translator.js';
export type { ErDiagram, ErEntity, ErAttribute, ErRelationship, ErCardinality } from './diagrams/er-diagram/types.js';

// Requirement diagram module (Family B).
export { parseRequirementDiagram } from './diagrams/requirement-diagram/parser.js';
export type { RequirementDiagramParseResult } from './diagrams/requirement-diagram/parser.js';
export { translateRequirementDiagramToOoxml } from './diagrams/requirement-diagram/translator.js';
export type {
  RequirementDiagram,
  Requirement,
  RequirementElement,
  RequirementRelationship,
  RequirementRelationType,
} from './diagrams/requirement-diagram/types.js';

// Architecture diagram module (Family B).
export { parseArchitectureDiagram } from './diagrams/architecture-diagram/parser.js';
export type { ArchitectureDiagramParseResult } from './diagrams/architecture-diagram/parser.js';
export { translateArchitectureDiagramToOoxml } from './diagrams/architecture-diagram/translator.js';
export type {
  ArchitectureDiagram,
  ArchitectureNode,
  ArchitectureNodeKind,
  ArchitectureEdge,
  ArchitectureSide,
} from './diagrams/architecture-diagram/types.js';

// Gantt module (Family D, option (b): calendar shapes, no `c:chart` — see
// docs/adr/spikes/spike-gantt-parser/spike.md).
export { parseGanttChart } from './diagrams/gantt/parser.js';
export type { GanttParseResult } from './diagrams/gantt/parser.js';
export { translateGanttToOoxml } from './diagrams/gantt/translator.js';
export type { GanttChart, GanttTask, GanttTag } from './diagrams/gantt/types.js';

// C4 diagram module (Family B — C4Context/C4Container/C4Component/
// C4Dynamic/C4Deployment all collapse onto one AST, see
// diagrams/c4/types.ts's doc comment).
export { parseC4Diagram } from './diagrams/c4/parser.js';
export type { C4ParseResult } from './diagrams/c4/parser.js';
export { translateC4DiagramToOoxml } from './diagrams/c4/translator.js';
export type { C4Diagram, C4Element, C4Relationship, C4Category, C4Variant } from './diagrams/c4/types.js';

// gitGraph module (re-classified Family F — fixed branch lanes + a fixed
// commit-sequence axis, no Dagre — see diagrams/git-graph/types.ts's doc
// comment).
export { parseGitGraphDiagram } from './diagrams/git-graph/parser.js';
export type { GitGraphParseResult } from './diagrams/git-graph/parser.js';
export { translateGitGraphToOoxml } from './diagrams/git-graph/translator.js';
export type { GitGraphDiagram, GitBranch, GitCommit, GitCommitType, GitOrientation } from './diagrams/git-graph/types.js';

// cynefin-beta module (Family D — fixed 5-domain layout + calculated
// shapes, NOT a quadrantChart reuse despite both being "2x2"-shaped, see
// diagrams/cynefin/types.js's doc comment).
export { parseCynefinDiagram } from './diagrams/cynefin/parser.js';
export type { CynefinParseResult } from './diagrams/cynefin/parser.js';
export { translateCynefinToOoxml } from './diagrams/cynefin/translator.js';
export type { CynefinDiagram, CynefinDomain, CynefinTransition } from './diagrams/cynefin/types.js';

// SmartArt topology classifier (docs/specs/FUTURE_mmd2smartart_SPEC.md §4, ADR 0004).
// Complements the OOXML translator above; never required by it.
export { classifyTopology, MAX_TREE_DEPTH } from './smartart/classify.js';
export type {
  SmartArtLayout,
  SmartArtClassification,
  SmartArtEligible,
  SmartArtIneligible,
  SmartArtIneligibleReason,
} from './smartart/classify.js';

// SmartArt generator for the `chain` topology (docs/specs/FUTURE_mmd2smartart_SPEC.md
// §7 step 4, ADR 0004 "Round 5"). Original layout/colors/style — no
// Microsoft content. Caller is responsible for calling classifyTopology()
// first and only invoking this on a 'chain' result.
export {
  generateChain,
  CHAIN_LAYOUT_XML,
  CHAIN_LAYOUT_XML_TD,
  CHAIN_LAYOUT_URN,
  CHAIN_LAYOUT_TD_URN,
  CHAIN_COLORS_XML,
  CHAIN_STYLE_XML,
} from './smartart/chain.js';
export type { SmartArtChainOutput } from './smartart/chain.js';

// SmartArt generator for the `tree` topology (same recipe as `chain` above;
// depth-2 trees only, see MAX_TREE_DEPTH and tree.ts's module doc comment).
export {
  generateTree,
  TREE_LAYOUT_XML,
  TREE_LAYOUT_XML_LR,
  TREE_LAYOUT_URN,
  TREE_LAYOUT_LR_URN,
  TREE_COLORS_XML,
  TREE_STYLE_XML,
} from './smartart/tree.js';
export type { SmartArtTreeOutput } from './smartart/tree.js';

// SmartArt generator for the `cycle` topology (same self-authored recipe as
// `chain`/`tree` above).
export {
  generateCycle,
  CYCLE_LAYOUT_XML,
  CYCLE_LAYOUT_URN,
  CYCLE_COLORS_XML,
  CYCLE_STYLE_XML,
} from './smartart/cycle.js';
export type { SmartArtCycleOutput } from './smartart/cycle.js';

// SmartArt dispatch: classify + run the matching generator in one call
// (spec §7 step 5). Pure — no filesystem/ZIP knowledge, see dispatch.ts.
export { generateSmartArt } from './smartart/dispatch.js';
export type { SmartArtGenerated } from './smartart/dispatch.js';

// Build the <w:p> fragment that embeds a SmartArt diagram inline, given 4
// relationship ids (real or placeholder — see embed.ts's doc comment for why
// callers may need to pass placeholders here).
export { buildSmartArtDrawingXml } from './smartart/embed.js';
export type { SmartArtRelIds, SmartArtEmbedOptions } from './smartart/embed.js';

// Build the fallback-note <w:p> placed under a diagram that was attempted
// for SmartArt but rejected by classifyTopology() (spec §10.3). Caller-only
// responsibility: only emit this for an actual SmartArt attempt+rejection.
export { buildSmartArtFallbackNoteXml } from './smartart/embed.js';

// Shared types
export type {
  Flowchart,
  FlowNode,
  FlowEdge,
  Subgraph,
  NodeShape,
  EdgeType,
  Layout,
  LayoutBox,
} from './types.js';
