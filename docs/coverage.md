# What each Mermaid diagram becomes in Word

Status as of 2026-10-06. Every one of the 29 Mermaid diagram types that md2nativedocx recognises exports as
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
| SmartArt | `md2nativedocx.smartArt.enabled`, **on** by default | `MD2NATIVEDOCX_ENABLE_SMARTART=1` (off by default) |
| Word charts | `md2nativedocx.nativeCharts.enabled`, **on** by default | `MD2NATIVEDOCX_NATIVE_CHARTS=1` or a list such as `pie,xychart` (off by default) |

With a switch off, the diagram is drawn as shapes. The PowerPoint export (`.pptx`) always uses shapes:
SmartArt and charts are `.docx`-only.

## Per type

"Confirmed" means the maintainer opened the file in desktop Word. The round numbers refer to
[`test-corpus/word-verification/CHECKLIST.md`](../test-corpus/word-verification/CHECKLIST.md).

| Mermaid type | Becomes | When SmartArt or chart applies | Otherwise, and why |
|---|---|---|---|
| `flowchart` / `graph` | **SmartArt** process, cycle or hierarchy | A simple chain, a single closed loop, or a tree of 2 to 10 levels; no `subgraph`, no merge, no self-loop, one connected piece. Each node keeps its Mermaid shape (diamond, circle, cylinder…). Confirmed, rounds 6-16 and 20. | Shapes. A merge (`A --> C`, `B --> C`) cannot be SmartArt (see below). A `subgraph` cannot either. |
| `swimlane-beta` | Shapes | — | Lanes are subgraphs, which SmartArt cannot express. |
| `mindmap` | **SmartArt** hierarchy (left to right) | 2 to 10 levels. Confirmed, round 17. | Shapes (radial layout with branch lines) for a single node or more than 10 levels. |
| `treeView-beta` | **SmartArt** hierarchy (top down) | A single root, 2 to 10 levels. Confirmed, round 17. | Shapes (file-tree rows) for several roots. |
| `classDiagram` | **SmartArt** hierarchy | Inheritance only; members are listed in the boxes. Confirmed, round 19. | Shapes for any other relation (composition, association…): SmartArt has no arrowheads that tell UML relations apart. |
| `stateDiagram` | **SmartArt** process or cycle | The ordinary states form a chain or one loop, with no choice/fork/join. The `[*]` start/end markers are set aside. Confirmed, round 19. | Shapes, with UML pseudo-states. |
| `gitGraph` | **SmartArt** process | Main branch only, no merge, no cherry-pick. Confirmed, round 19. | Shapes (branch lanes, merge and cherry-pick lines). |
| `timeline` | **SmartArt** time line | Labels fit whole words at 10 pt. Without sections: an arrow axis with boxes alternating above and below. With sections: one arrow bar per section. Confirmed, rounds 18-19. | Shapes when the text is too dense. |
| `journey` | **SmartArt** time line (grouped) | Labels fit whole words at 10 pt; one card per task (task, score as stars, actors). Confirmed, round 19. | Shapes (score row and one row per actor). |
| `kanban` | **SmartArt** grouped list | Every column title and card fits whole words at 10 pt. Confirmed, round 19. | Shapes, with a priority stripe per card. |
| `pie` | **Word chart** | Confirmed, Edit Data works (round 4). | Shapes (pie slices) with charts off. |
| `xychart-beta` | **Word chart** (bar and/or line) | Confirmed (round 5). A numeric x axis becomes evenly spaced categories. | Shapes for a horizontal chart with a line series (Word draws lines vertically only). |
| `radar-beta` | **Word chart** (radar) | Three axes or more. Confirmed (round 5). The grid is always a polygon. | Shapes for fewer than three axes. |
| `sequenceDiagram` | Shapes | — | Lifelines and messages in time order have no SmartArt layout. |
| `zenuml` | Shapes (as a sequence diagram) | — | Same as `sequenceDiagram`. |
| `erDiagram` | Shapes | — | Crow's-foot cardinalities and labelled relations; SmartArt connectors carry neither. |
| `requirementDiagram` | Shapes | — | Typed relations between boxes (see the backlog for the tree-only case). |
| `C4Context` … `C4Deployment` | Shapes | — | A general graph with labelled relations. |
| `architecture-beta` | Shapes | — | A general graph with ports. |
| `block-beta` | Shapes | — | A grid with spans and free links. |
| `quadrantChart` | Shapes | — | Points placed by `[x, y]` coordinates; SmartArt matrices hold text, not positioned points. |
| `venn-beta` | Shapes | — | Overlap colours come from stacked translucent circles. A SmartArt Basic Venn is possible when no overlap is labelled: open product decision, see the backlog. |
| `gantt` | Shapes | — | Bars on a calendar scale. A Word chart cannot show it faithfully (ADR 0011). |
| `sankey-beta` | Shapes | — | Flow widths proportional to values; no Word chart or SmartArt equivalent. |
| `treemap-beta` | Shapes | — | Squarified rectangles. Word's own treemap chart is a different chart format (`cx:chartex`), not implemented (backlog). |
| `packet-beta` | Shapes | — | A bit grid. |
| `ishikawa-beta` | Shapes | — | A fishbone with diagonal ribs. |
| `wardley-beta` | Shapes | — | Components placed by coordinates. |
| `cynefin-beta` | Shapes | — | Five fixed domains with items. |
| `eventmodeling` | Shapes | — | Lanes and frames. |

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
