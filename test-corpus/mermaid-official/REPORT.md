# Conformité aux exemples officiels de Mermaid (étage 1)

Généré par `node scripts/mermaid-conformance.mjs --report` sur `mermaid@12.3.0` (commit `2086904`) :
chaque bloc d'exemple des pages de syntaxe de la doc Mermaid passé dans `renderDiagram()`.
Exemples © les auteurs de Mermaid, licence MIT (`LICENSE` dans ce dossier).

**Total : 541 exemples — 510 sans avertissement (94 %), 31 avec avertissement, 0 de types pas encore dessinés (note à la place), 0 mal typés, 0 en échec.**

| Page | Exemples | Sans avert. | Avec avert. | Type non dessiné | Mal typés | Échecs |
|---|---:|---:|---:|---:|---:|---:|
| agentflow | 12 | 8 | 4 | 0 | 0 | 0 |
| architecture | 6 | 1 | 5 | 0 | 0 | 0 |
| block | 30 | 29 | 1 | 0 | 0 | 0 |
| c4 | 6 | 6 | 0 | 0 | 0 | 0 |
| classDiagram | 38 | 37 | 1 | 0 | 0 | 0 |
| cynefin | 3 | 3 | 0 | 0 | 0 | 0 |
| entityRelationshipDiagram | 25 | 25 | 0 | 0 | 0 | 0 |
| eventmodeling | 13 | 13 | 0 | 0 | 0 | 0 |
| flowchart | 116 | 115 | 1 | 0 | 0 | 0 |
| gantt | 11 | 10 | 1 | 0 | 0 | 0 |
| gitgraph | 35 | 34 | 1 | 0 | 0 | 0 |
| ishikawa | 1 | 1 | 0 | 0 | 0 | 0 |
| kanban | 3 | 3 | 0 | 0 | 0 | 0 |
| mindmap | 15 | 12 | 3 | 0 | 0 | 0 |
| packet | 4 | 4 | 0 | 0 | 0 | 0 |
| pie | 2 | 2 | 0 | 0 | 0 | 0 |
| quadrantChart | 3 | 2 | 1 | 0 | 0 | 0 |
| radar | 3 | 3 | 0 | 0 | 0 | 0 |
| railroad | 14 | 14 | 0 | 0 | 0 | 0 |
| requirementDiagram | 9 | 9 | 0 | 0 | 0 | 0 |
| sankey | 8 | 8 | 0 | 0 | 0 | 0 |
| sequenceDiagram | 38 | 36 | 2 | 0 | 0 | 0 |
| stateDiagram | 22 | 22 | 0 | 0 | 0 | 0 |
| swimlanes | 13 | 12 | 1 | 0 | 0 | 0 |
| timeline | 14 | 13 | 1 | 0 | 0 | 0 |
| treemap | 8 | 8 | 0 | 0 | 0 | 0 |
| treeView | 13 | 10 | 3 | 0 | 0 | 0 |
| usecase | 24 | 19 | 5 | 0 | 0 | 0 |
| userJourney | 1 | 1 | 0 | 0 | 0 | 0 |
| venn | 8 | 7 | 1 | 0 | 0 | 0 |
| wardley | 19 | 19 | 0 | 0 | 0 | 0 |
| xyChart | 8 | 8 | 0 | 0 | 0 | 0 |
| zenuml | 16 | 16 | 0 | 0 | 0 | 0 |

## Détail des écarts

### agentflow

- #7 warned: Properties set with `id@{ ... }` on a line of their own (instruction, view, protocol...) are not drawn.
- #8 warned: Properties set with `id@{ ... }` on a line of their own (instruction, view, protocol...) are not drawn.
- #9 warned: Properties set with `id@{ ... }` on a line of their own (instruction, view, protocol...) are not drawn.
- #11 warned: Properties set with `id@{ ... }` on a line of their own (instruction, view, protocol...) are not drawn.

### architecture

- #0 warned: Group/parent containment ("in <id>") is not yet rendered as nested boxes; grouped nodes still render as standalone boxes at the top level.
- #1 warned: Unsupported line ignored: align column db1 db2 db3 \| Group/parent containment ("in <id>") is not yet rendered as nested boxes; grouped nodes still render as standalone boxes at the top level.
- #2 warned: Unsupported line ignored: align row src1 src2 src3
- #3 warned: Unsupported line ignored: align row src_a src_b src_c \| Unsupported line ignored: align row db_one db_two db_three \| Unsupported line ignored: align row brief analyst delivery \| Unsupported line ignored: align column src_a db_one \| Unsupported line ignored: align column src_b db_two brief \| Unsupported line ignored: align column src_c db_three \| Group/parent containment ("in <id>"
- #5 warned: Group/parent containment ("in <id>") is not yet rendered as nested boxes; grouped nodes still render as standalone boxes at the top level.

### block

- #17 warned: Unsupported text ignored: (x, down)

### classDiagram

- #36 warned: classDef "styleClass" referenced but not defined.

### flowchart

- #102 warned: Subgraph "subgraph2" direction (TD) is ignored: something inside is linked to something outside, so it follows the flowchart's direction (same as Mermaid).

### gantt

- #10 warned: tickInterval "1decade" ignored (Mermaid accepts a number followed by millisecond, second, minute, hour, day, week or month), automatic ticks used: tickInterval 1decade

### gitgraph

- #14 warned: Unknown branch "MetroLine1" — checkout/switch ignored: checkout MetroLine1 \| Merge ignored (cannot merge a branch with itself): merge MetroLine3 \| Duplicate commit id "Boston" — auto-renamed to disambiguate.

### mindmap

- #0 warned: Mindmap icons are not drawn (they need the icon font of the page Mermaid runs in), ignored on "Long history": ::icon(fa fa-book)
- #11 warned: Mindmap icons are not drawn (they need the icon font of the page Mermaid runs in), ignored on "A": ::icon(fa fa-book) \| Mindmap icons are not drawn (they need the icon font of the page Mermaid runs in), ignored on "B": ::icon(mdi mdi-skull-outline)
- #12 warned: Mindmap classes are not applied (they refer to the stylesheet of the page Mermaid runs in), ignored on "A": :::urgent large

### quadrantChart

- #2 warned: classDef styling is not yet supported for quadrant charts, ignored: classDef class1 color: #109060 \| classDef styling is not yet supported for quadrant charts, ignored: classDef class2 color: #908342, radius : 10, stroke-color: #310085, stroke-width: 10px \| classDef styling is not yet supported for quadrant charts, ignored: classDef class3 color: #f00fff, radius : 10

### sequenceDiagram

- #36 warned: Actor menus (`link`, `links`, `properties`) are not supported and were ignored.
- #37 warned: Actor menus (`link`, `links`, `properties`) are not supported and were ignored.

### swimlanes

- #7 warned: Unsupported line ignored: accTitle: Support escalation \| Unsupported line ignored: accDescr: A request starts with the customer, is triaged by support, and may be escalated to engineering.

### timeline

- #5 warned: Timeline TD direction is not yet supported; rendered left to right.

### treeView

- #1 warned: TreeView icons are not drawn (they come from icon packs the page running Mermaid registers), ignored on "App.tsx": icon(logos:react)
- #7 warned: TreeView icons are not drawn (they come from icon packs the page running Mermaid registers), ignored on "App.tsx": icon(logos:react)
- #9 warned: TreeView icons are not drawn (they come from icon packs the page running Mermaid registers), ignored on "App.tsx": icon(logos:react)

### usecase

- #10 warned: Properties set with `id@{ ... }` on a line of their own (type, animation...) are not drawn.
- #14 warned: Properties set with `id@{ ... }` on a line of their own (type, animation...) are not drawn.
- #16 warned: The content of `json` payload nodes is not drawn; only their name.
- #17 warned: The content of `json` payload nodes is not drawn; only their name. \| classDef "data" referenced but not defined. \| classDef "data" referenced but not defined.
- #22 warned: The content of `json` payload nodes is not drawn; only their name. \| Properties set with `id@{ ... }` on a line of their own (type, animation...) are not drawn.

### venn

- #7 warned: Union-specific fill styling is not yet supported for Venn diagrams, ignored (overlap color derives from each set's own fill): style A,B color:#333 \| Unsupported line ignored (style targets unknown set): style A1 color:red

