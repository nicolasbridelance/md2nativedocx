# What each Mermaid diagram becomes in Word

Status as of 2026-11-20 (release 0.13.0). Every one of the 32 Mermaid diagram types that md2nativedocx recognises exports as
something you can edit in Word. A diagram becomes one of three things:

- **SmartArt.** A real SmartArt graphic. You add a step or a branch from Word's Text Pane, switch the layout
  or restyle it from the SmartArt Design tab.
- **Word chart.** A native chart with its data in an embedded workbook. Chart Design → Edit Data opens the
  numbers.
- **Shapes.** Individually selectable Word shapes (boxes, lines, text boxes). Connectors stay attached when
  you move a box.

SmartArt is used only when the diagram's structure fits a SmartArt layout faithfully. Otherwise the diagram
falls back to shapes, which can draw anything. The VS Code extension tells you per diagram, before you
export, which of the three you will get (CodeLens line, hover, status-bar tally).

## Settings

| Switch | VS Code extension | CLI / Pandoc filter |
|---|---|---|
| SmartArt | `md2nativedocx.smartArt.enabled`, **on** by default | **on** by default; `MD2NATIVEDOCX_ENABLE_SMARTART=0` turns it off |
| Word charts | `md2nativedocx.nativeCharts.enabled`, **on** by default | **on** by default; `MD2NATIVEDOCX_NATIVE_CHARTS=0` turns them off, a list such as `pie,xychart` limits them |
| SmartArt look | `md2nativedocx.smartArt.style`, `colorful` by default | `MD2NATIVEDOCX_SMARTART_STYLE`, `colorful` by default |

With a switch off, the diagram is drawn as shapes. The PowerPoint export (`.pptx`) always uses shapes:
SmartArt and charts are `.docx`-only.

## Per type

"Confirmed" means the maintainer opened the file in desktop Word. The round numbers refer to
[`test-corpus/word-verification/CHECKLIST.md`](../test-corpus/word-verification/CHECKLIST.md).

| Mermaid type | Becomes | When SmartArt or chart applies | Otherwise, and why |
|---|---|---|---|
| `flowchart` / `graph` | **SmartArt** process, cycle or hierarchy | A simple chain, a single closed loop, or a tree of 2 to 10 levels; no `subgraph`, no merge, no self-loop, one connected piece. Each node keeps its Mermaid shape (diamond, circle, cylinder…). Confirmed, rounds 6-16 and 20. | Shapes. A merge (`A --> C`, `B --> C`) cannot be SmartArt (see below). A `subgraph` cannot either. A link to a subgraph (`A --> S`) stops at the subgraph's border, as in Mermaid. A collapsed subgraph (`S@{ view: collapsed }`) is one grey rounded box (title, then `• • •`), its contents hidden, links into it ending on the box; a diagram that folds into a chain can then become SmartArt. |
| `swimlane-beta` | Shapes | — | Lanes are subgraphs, which SmartArt cannot express. |
| `agentflow-beta` | **SmartArt** or shapes, drawn like a `flowchart` | Same rule as a flowchart (a straight chain of steps becomes a SmartArt process). `flow` … `end` blocks (nested) are subgraphs, so a diagram with agents is shapes; `global` nodes sit at the top level; node kinds (`task`, `tool`, `decision`, `input`, `refdoc`, `action`, `connector`) pick a shape; arrows, labels (`-- yes -->`), dotted and cross ends. An arrow to or from a `flow` joins its first or last node. Not drawn, with a warning: properties set on their own line (`id@{ instruction: … }`, `view`, `protocol`, `endpoint`), styling and links. Also exported to `.odt`. 8 of the 12 official examples convert with no line lost. |
| `usecase-beta` | Shapes (SmartArt for a plain chain), drawn like a `flowchart` | Actors (a stick figure, one editable shape with its label below; confirmed in PowerPoint 2026-11-19, in `.odt` the connectors attach to the label's box), use cases (ellipses, also created by an arrow), `systemBoundary` … `end` frames, `A --> B`, `-- text -->`, `..> : include B` / `extend` (dotted, labelled), reversed and `o` / `x` ends, `<<stereotype>>`, quoted and multi-line labels, notes (a card joined by a dotted line), `json` cards (name only), `classDef` / `class` / `style` / `:::` colours on nodes. `--|>` (generalization) and `..|>` (realization) end in a hollow triangle, a white polygon laid over the end of the line (it does not follow if a box is moved; in a `.odt` it is a plain arrow, with a warning). Not drawn: icons, `type` / `business` looks, animations. Also exported to `.odt`. 19 of the 24 official examples convert with no line lost. |
| `mindmap` | **SmartArt** hierarchy (left to right) | 2 to 10 levels. Confirmed, round 17. Every label is read as Markdown, as in Mermaid: `**bold**`, `*italic*`, `<br/>`, and a quoted label (`"…"` or `` "`…`" ``) may run over several lines. | Shapes (radial layout with branch lines) for a single node or more than 10 levels; a label wraps at 200 px (Mermaid's `maxNodeWidth`) and each shape is sized to its text area. Not drawn, with a warning: `::icon(…)` (needs the page's icon font) and `:::classes` (refer to the page's stylesheet); both are kept on their node in the AST. 15 of 15 official examples read exactly as Mermaid reads them (differential test); 12 convert with no warning, the other 3 use icons or classes. |
| `treeView-beta` | **SmartArt** hierarchy (top down) | Every tree hangs from Mermaid's implicit `/` root (the top box), so several top-level entries make one tree; 2 to 10 levels with the root. Confirmed, round 17. Folders in bold without their trailing `/`, a description in italics after its name, a `highlight` row filled pale amber with dark text (checked in Word and LibreOffice 2026-11-21). | Shapes, as Mermaid draws the tree (more than 10 levels, or SmartArt off): one row per entry under `/`, black connector lines, folders in bold, descriptions in green italics in one column, a `highlight` row on an amber band running to the right edge. `title` above the drawing. Read with Mermaid's grammar: box-drawing trees (`├──`, `└──`, `│`), quoted names (`"…"` or `'…'`), `:::class` / `icon(…)` / `## text` after a space. Not drawn, with a warning: `icon(…)` (icon packs of the web page; Mermaid's own folder and file icons not yet) and classes other than `highlight`; `config:` options (`showIcons`, `rowIndent`…) are not applied, like every frontmatter option. 13 of 13 official examples read exactly as Mermaid reads them (differential test); 10 convert with no warning, the other 3 use `icon(logos:react)`. |
| `classDiagram` | **SmartArt** hierarchy | Inheritance only, no `namespace` and no note; members are listed in the boxes, an annotation (`<<interface>>`) as `«interface»` above the name. Confirmed, round 19. | Shapes for any other relation (composition, association…): SmartArt has no arrowheads that tell UML relations apart. In shapes, provided interfaces (`A --() I`) are lollipops (a hollow circle on a line from the class, the name beyond it); notes (`note "x"`, `note for A "x"`) are folded-corner boxes, joined to their class by a dotted line; cardinalities (`A "1" --> "*" B`) sit next to their end, and a labelled relation gets the room its texts need; `style`, `classDef` (with `:::` or `cssClass`) and `classDef default` colour a class (fill, border, text; hex colours or CSS colour names), also in the SmartArt; a `namespace` is a titled dashed box around its classes (nested, dotted names as in Mermaid); inheritance and realization end in a hollow triangle and aggregation in a hollow diamond (white polygons over the end of the line, since a Word line end is always filled). |
| `stateDiagram` | **SmartArt** process or cycle | The ordinary states form a chain or one loop, with no choice/fork/join, no composite state and no note. The `[*]` start/end markers are set aside. Confirmed, round 19. | Shapes, with UML pseudo-states. A composite state (`state X { … }`) is a titled box around its states, nested to any depth, its content laid out in its own `direction` (top to bottom by default, as in Mermaid); its concurrent regions (`--`) sit side by side with a dashed line between them; a transition to a composite ends on its box. As in Mermaid, every `[*]` of one block is the same start (or end) node. Two transitions between the same states are drawn apart, each label beside its own line. Notes (`note left|right of X`, one line or up to `end note`) are folded-corner boxes beside their state, joined by a dotted line, moved off the state's axis when they sit where transitions come in. A transition whose straight line would cross another box follows a route around it. `classDef` (given by `class` or `:::`), `style` and `classDef default` colour a state or a composite (fill, border, text; hex colours or CSS colour names) and set bold or italic; the colours carry over to SmartArt. |
| `gitGraph` | **SmartArt** process | Main branch only, no merge, no cherry-pick. Confirmed, round 19. | Shapes (branch lanes, merge and cherry-pick lines). |
| `timeline` | **SmartArt** time line | Labels fit whole words at 10 pt. Without sections: an arrow axis with boxes alternating above and below. With sections: one arrow bar per section. Confirmed, rounds 18-19. | Shapes when the text is too dense. |
| `journey` | **SmartArt** time line (grouped) | Labels fit whole words at 10 pt; one card per task (task, score as stars, actors). Confirmed, round 19. | Shapes (score row and one row per actor). |
| `kanban` | **SmartArt** grouped list | Every column title and card fits whole words at 10 pt. Confirmed, round 19. | Shapes, with a priority stripe per card. |
| `pie` | **Word chart** | Confirmed, Edit Data works (round 4). | Shapes (pie slices) with charts off. |
| `xychart-beta` | **Word chart** (bar and/or line) | Confirmed (round 5). A numeric x axis becomes evenly spaced categories. | Shapes for a horizontal chart with a line series (Word draws lines vertically only). |
| `radar-beta` | **Word chart** (radar) | Three axes or more. Confirmed (round 5). The grid is always a polygon. | Shapes for fewer than three axes. |
| `sequenceDiagram` | Shapes | — | Lifelines and messages in time order have no SmartArt layout. |
| `zenuml` | Shapes (as a sequence diagram) | — | Same as `sequenceDiagram`. |
| `erDiagram` | Shapes | — | Crow's-foot cardinalities and labelled relations; SmartArt connectors carry neither. `subgraph` groups are titled dashed boxes, laid out by the flowchart engine (own `direction` when no relationship crosses the border); `style` / `classDef` / `:::` / `class` colour entities and groups. |
| `requirementDiagram` | Shapes | — | Boxes drawn as Mermaid draws them: the stereotype (`«Functional Requirement»`, `«Element»`), the name in bold, then `ID:`, `Text:`, `Risk:`, `Verification:` (`Type:`, `Doc Ref:` for an element), each line read as Markdown. `contains` is a solid line with a circled cross at the containing end, the 6 other relations dashed with an open arrowhead; each carries its `«type»` label on a white background. `direction`, `style`, `classDef`, `class` and `:::` applied (fill, border, text colour, bold, italic). 9 of 9 official examples read exactly as Mermaid reads them (differential test) and convert with no warning. Tree-only case as SmartArt: see the backlog. |
| `C4Context` … `C4Deployment` | Shapes | — | Drawn as Mermaid draws it: elements on a grid in declaration order (`UpdateLayoutConfig`: shapes and frames per row), boundaries as dashed frames and deployment nodes as solid ones around what they hold, nested; Mermaid's colours per category, a person with a head, `Db` as a cylinder, `Queue` as a lying cylinder; straight relations with their label and `[technology]`, numbered in a `C4Dynamic`; `UpdateElementStyle` / `UpdateRelStyle` applied. 6 of 6 official examples read exactly as Mermaid reads them (differential test) and convert with no warning. |
| `architecture-beta` | Shapes | — | Drawn as Mermaid draws it: services as blue icons with a white drawing (`cloud`, `database`, `disk`, `internet`, `server`) and the title underneath, a quoted text in a blank icon, a dashed outline when there is no icon; junctions invisible, the edges meeting at their centre; groups as dashed frames with icon and title, nested. Placed on the grid the ports describe, `align row` / `column` applied; edges port to port, straight or right-angled, with `<` / `>` arrowheads, `-[label]-` and `{group}` ends on the group's frame. An icon from a pack (`logos:…`) is a `?`, as in Mermaid without that pack (warning). |
| `block-beta` | Shapes | — | A grid with spans and free links. |
| `quadrantChart` | Shapes | — | Points placed by `[x, y]` coordinates; SmartArt matrices hold text, not positioned points. |
| `venn-beta` | Shapes | — | Overlap colours come from stacked translucent circles. A SmartArt Basic Venn is possible when no overlap is labelled: open product decision, see the backlog. |
| `gantt` | Shapes | — | Bars on a time scale (minutes to centuries), dates computed as Mermaid does; `vert` lines, shaded excluded days. A Word chart cannot show it faithfully (ADR 0011). Not applied: `displayMode: compact`, `todayMarker`, `click`. |
| `sankey-beta` | Shapes | — | Flow widths proportional to values; no Word chart or SmartArt equivalent. |
| `treemap-beta` | Shapes | — | Squarified rectangles. Word's own treemap chart is a different chart format (`cx:chartex`), not implemented (backlog). |
| `packet-beta` | Shapes | — | A bit grid. |
| `ishikawa-beta` | Shapes | — | A fishbone with diagonal ribs. |
| `wardley-beta` | Shapes | — | Components placed by coordinates. |
| `cynefin-beta` | Shapes | — | Five fixed domains with items. |
| `eventmodeling` | Shapes | — | Lanes and frames. |
| `railroad-beta`, `railroad-ebnf-beta`, `railroad-abnf-beta`, `railroad-peg-beta` | Shapes | — | Syntax diagrams: one track per rule, the main path straight, alternatives below, bypasses above, loops under (with ABNF bounds). No SmartArt or chart has branching tracks. |

### PlantUML

A ```` ```plantuml ```` or ```` ```puml ```` block (or any source starting with `@startuml`) is recognised too;
`@startuml` / `@enduml` may be left out inside such a fence.

| PlantUML type | Becomes | Notes |
|---|---|---|
| Sequence diagram | Shapes, drawn like a Mermaid `sequenceDiagram` | Participants, each kind as its UML symbol (stick figure for `actor`; `boundary`, `control`, `entity` circles; `database` cylinder; `collections` stacked boxes; `queue` lying cylinder), aliases, multi-line names, every common arrow, activations (`++` `--`, `activate`, `autoactivate on`), `create` / `destroy`, notes, `ref over`, `alt` / `else` / `opt` / `loop` / `par` / `break` / `critical` / `group` / `partition`, separators, `autonumber`, title, `box "title" #colour` … `end box` participant groups (a band behind their columns). Confirmed in Word (2026-11-18). All 89 examples of the official reference page (plantuml.com/sequence-diagram, read 2026-11-19) convert with no line lost; approximations come with a warning (slanted arrows drawn flat, teoz `&` messages one after the other, incoming/outgoing `[->` `->]` messages not drawn). `skinparam` and `!theme` are ignored with a warning; `!include` is never followed (it would read a file or a URL). |
| Class diagram | **SmartArt** hierarchy or shapes, drawn like a Mermaid `classDiagram` | Same rule as Mermaid: an inheritance-only tree becomes SmartArt, anything else shapes. Every element kind (class, abstract, interface, enum, annotation, struct, exception, record…, drawn as class boxes with a warning), quoted names and aliases, member blocks and `Class : member` lines (visibility kept, `{static}` / `{abstract}` and separators dropped), `extends` / `implements`, every relation end and shaft (dotted, `-up->`, `-[#red]->`), labels, `left to right direction`. Stereotypes (`<<Entity>>`) are drawn `«Entity»` above the name, the first one only. Cardinalities are drawn at their end. Not drawn, with a warning: roles (`"1"/role`), notes, `package` / `namespace` grouping (classes kept), ends `#` `x` `}` `{` `+` `()` (plain lines), association classes (dotted links). Classes with no relation are laid out in a grid. All 86 examples of plantuml.com/class-diagram (read 2026-11-19) convert with no line lost. |
| State diagram | **SmartArt** process or cycle, or shapes, drawn like a Mermaid `stateDiagram` | Same SmartArt rule as Mermaid, unless a state has description lines (`State : text`), which only the shapes show (under the state's name). `[*]` start and end, every arrow form (`->`, `-->`, `-up->`, `-[#red]->`, `x->o`, reversed `<--`), labels, aliases, `<<choice>>` / `<<fork>>` / `<<join>>` / `<<start>>` / `<<end>>`, history `[H]` / `[H*]` (small states named H / H*), self-transitions (a loop). Composite states are nested boxes, laid out in the diagram's direction as PlantUML does, their concurrent regions `--` / `\|\|` side by side; one `[*]` start and end per block; notes `note left|right|top|bottom of X` beside their state. Not drawn, with a warning: floating notes and `note on link`, other stereotypes (ordinary states), hidden transitions, colours. All 45 examples of plantuml.com/state-diagram (read 2026-11-19) convert with no line lost. |
| Activity diagram (current syntax) | **SmartArt** process, or a flowchart in shapes | Drawn as a flowchart, with the flowchart's own SmartArt rule (a straight sequence of actions becomes a SmartArt process). Actions (one or several lines, Creole bold and italic kept; SDL endings and stereotypes such as `<<input>>`, `<<procedure>>` pick a shape), `start` / `stop` (black discs), `end`, `kill` / `detach`, connectors `(A)`, `if` / `elseif` / `else` (labels from `then (yes)`, `is (x)`, `(no) elseif`), `switch` / `case`, `while` and `repeat` loops (with `backward` and `break`), `fork` / `split` (branches side by side, bars not drawn), arrow labels and hidden arrows, `label` / `goto`, swimlanes and `partition` / `group` blocks (subgraphs). Not drawn, with a warning: notes, colours, styles. A `[[link]]` keeps only its text and an `<img:...>` is dropped: no link or image is ever fetched or embedded. All 75 examples of plantuml.com/activity-diagram-beta (read 2026-11-19) convert with no line lost. |
| Use case, component, mindmap… | A visible note in the document and a warning | Not converted yet. |

## What was ruled out, and the evidence

These were each tried or examined against real Word files before being dropped. Reopen only with new
evidence.

| Idea | Verdict | Evidence |
|---|---|---|
| A flowchart with a merge as SmartArt (Converging Arrows, Funnel…) | Not possible | In the SmartArt data model, a presentation point has a single parent. In a Word-made sample, the "result" of Converging Arrows is an extra arrow with text, not a box. [`docs/adr/spikes/spike-smartart/spike.md`](adr/spikes/spike-smartart/spike.md) round 6, [`docs/smartart-layout-catalog.md`](smartart-layout-catalog.md). |
| A `subgraph` as a Labeled Hierarchy | Too narrow | Word labels each depth level, not each branch (confirmed in Word's UI). Same sources. |
| A `subgraph` as a Nested/Basic Target | Not usable | In a Word-made sample, rings are sibling points (5 at most), each ring's nodes are bullet text, and no edge is possible. [`docs/smartart-layout-catalog.md`](smartart-layout-catalog.md). |
| A `subgraph` as a title box wrapping an embedded SmartArt | Not possible | Three separate structures; real Word refused to open each one. [`docs/history/TODO_ARCHIVE.md`](history/TODO_ARCHIVE.md), Phase 6/7. |
| A timeline as a plain chain of boxes | Rejected by the maintainer | It looked like a flowchart: a diagram type has to keep its visual identity in SmartArt, not just its data. Replaced by the time line (round 18). |
| Redistributing Word's own `layoutN.xml` files | Not done, licensing | Every SmartArt layout here is written from scratch; Word-made samples are read for structure only and never committed. |

## Related documents

- [`docs/markdown-mermaid-compliance-table.md`](markdown-mermaid-compliance-table.md): flowchart syntax, line by line.
- [`docs/smartart-full-catalog-cross-mermaid.md`](smartart-full-catalog-cross-mermaid.md): every Microsoft SmartArt layout
  mapped to a Mermaid type.
- [`docs/adr/0011-native-charts-with-embedded-workbook.md`](adr/0011-native-charts-with-embedded-workbook.md): Word charts.
- [`docs/manual/manuel-utilisateur.md`](manual/manuel-utilisateur.md): the user manual (French), one page per type.
