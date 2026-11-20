# Conformité aux exemples officiels de Mermaid (étage 1)

Généré par `node scripts/mermaid-conformance.mjs --report` sur `mermaid@12.3.0` (commit `2086904`) :
chaque bloc d'exemple des pages de syntaxe de la doc Mermaid passé dans `renderDiagram()`.
Exemples © les auteurs de Mermaid, licence MIT (`LICENSE` dans ce dossier).

**Total : 541 exemples — 418 sans avertissement (77 %), 123 avec avertissement, 0 de types pas encore dessinés (note à la place), 0 mal typés, 0 en échec.**

| Page | Exemples | Sans avert. | Avec avert. | Type non dessiné | Mal typés | Échecs |
|---|---:|---:|---:|---:|---:|---:|
| agentflow | 12 | 8 | 4 | 0 | 0 | 0 |
| architecture | 6 | 1 | 5 | 0 | 0 | 0 |
| block | 30 | 29 | 1 | 0 | 0 | 0 |
| c4 | 6 | 0 | 6 | 0 | 0 | 0 |
| classDiagram | 38 | 12 | 26 | 0 | 0 | 0 |
| cynefin | 3 | 3 | 0 | 0 | 0 | 0 |
| entityRelationshipDiagram | 25 | 6 | 19 | 0 | 0 | 0 |
| eventmodeling | 13 | 13 | 0 | 0 | 0 | 0 |
| flowchart | 116 | 110 | 6 | 0 | 0 | 0 |
| gantt | 11 | 4 | 7 | 0 | 0 | 0 |
| gitgraph | 35 | 34 | 1 | 0 | 0 | 0 |
| ishikawa | 1 | 1 | 0 | 0 | 0 | 0 |
| kanban | 3 | 3 | 0 | 0 | 0 | 0 |
| mindmap | 15 | 11 | 4 | 0 | 0 | 0 |
| packet | 4 | 4 | 0 | 0 | 0 | 0 |
| pie | 2 | 2 | 0 | 0 | 0 | 0 |
| quadrantChart | 3 | 2 | 1 | 0 | 0 | 0 |
| radar | 3 | 3 | 0 | 0 | 0 | 0 |
| railroad | 14 | 14 | 0 | 0 | 0 | 0 |
| requirementDiagram | 9 | 5 | 4 | 0 | 0 | 0 |
| sankey | 8 | 8 | 0 | 0 | 0 | 0 |
| sequenceDiagram | 38 | 25 | 13 | 0 | 0 | 0 |
| stateDiagram | 22 | 9 | 13 | 0 | 0 | 0 |
| swimlanes | 13 | 12 | 1 | 0 | 0 | 0 |
| timeline | 14 | 13 | 1 | 0 | 0 | 0 |
| treemap | 8 | 8 | 0 | 0 | 0 | 0 |
| treeView | 13 | 9 | 4 | 0 | 0 | 0 |
| usecase | 24 | 19 | 5 | 0 | 0 | 0 |
| userJourney | 1 | 1 | 0 | 0 | 0 | 0 |
| venn | 8 | 7 | 1 | 0 | 0 | 0 |
| wardley | 19 | 19 | 0 | 0 | 0 | 0 |
| xyChart | 8 | 8 | 0 | 0 | 0 | 0 |
| zenuml | 16 | 15 | 1 | 0 | 0 | 0 |

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

### c4

- #0 warned: Boundary/Deployment_Node nesting is not yet rendered as nested boxes; contained elements still render as standalone boxes at the top level. \| UpdateElementStyle/UpdateRelStyle/UpdateLayoutConfig/AddElementTag/AddRelTag are styling/layout-density directives, not yet applied to the rendered diagram.
- #1 warned: Boundary/Deployment_Node nesting is not yet rendered as nested boxes; contained elements still render as standalone boxes at the top level. \| UpdateElementStyle/UpdateRelStyle/UpdateLayoutConfig/AddElementTag/AddRelTag are styling/layout-density directives, not yet applied to the rendered diagram.
- #2 warned: Boundary/Deployment_Node nesting is not yet rendered as nested boxes; contained elements still render as standalone boxes at the top level. \| UpdateElementStyle/UpdateRelStyle/UpdateLayoutConfig/AddElementTag/AddRelTag are styling/layout-density directives, not yet applied to the rendered diagram.
- #3 warned: Boundary/Deployment_Node nesting is not yet rendered as nested boxes; contained elements still render as standalone boxes at the top level. \| UpdateElementStyle/UpdateRelStyle/UpdateLayoutConfig/AddElementTag/AddRelTag are styling/layout-density directives, not yet applied to the rendered diagram.
- #4 warned: Boundary/Deployment_Node nesting is not yet rendered as nested boxes; contained elements still render as standalone boxes at the top level. \| UpdateElementStyle/UpdateRelStyle/UpdateLayoutConfig/AddElementTag/AddRelTag are styling/layout-density directives, not yet applied to the rendered diagram.
- #5 warned: Boundary/Deployment_Node nesting is not yet rendered as nested boxes; contained elements still render as standalone boxes at the top level. \| UpdateElementStyle/UpdateRelStyle/UpdateLayoutConfig/AddElementTag/AddRelTag are styling/layout-density directives, not yet applied to the rendered diagram.

### classDiagram

- #0 warned: The frontmatter title "Animal example" is not drawn for this diagram type. \| Notes are not yet supported for class diagrams, ignored: note "From Duck till Zebra" \| Notes are not yet supported for class diagrams, ignored: note for Duck "can fly<br>can swim<br>can dive<br>can help in debugging"
- #1 warned: Class annotations (e.g. <<Interface>>) are not yet rendered, ignored. \| Relationship cardinalities are not yet supported, ignored: Customer "1" --> "*" Order : places \| Relationship cardinalities are not yet supported, ignored: Order "1" *-- "*" LineItem : contains
- #2 warned: Class annotations (e.g. <<Interface>>) are not yet rendered, ignored. \| Relationship cardinalities are not yet supported, ignored: Customer "1" --> "*" Order : places \| Relationship cardinalities are not yet supported, ignored: Order "1" *-- "*" LineItem : contains
- #3 warned: The frontmatter title "Bank example" is not drawn for this diagram type.
- #6 warned: Unsupported line ignored: `Animal Class!` --> `Car Class`
- #11 warned: Unsupported line ignored: classM <\|.. classN
- #14 warned: Unsupported line ignored: Animal <\|--\|> Zebra
- #15 warned: Unsupported line ignored: bar ()-- foo
- #16 warned: Unsupported line ignored: Class01 --() bar \| Unsupported line ignored: Class02 --() bar \| Unsupported line ignored: foo ()-- Class01
- #17 warned: namespace grouping is not yet supported; contained classes are still parsed, the grouping itself is dropped.
- #18 warned: namespace grouping is not yet supported; contained classes are still parsed, the grouping itself is dropped.
- #19 warned: namespace grouping is not yet supported; contained classes are still parsed, the grouping itself is dropped.
- #20 warned: namespace grouping is not yet supported; contained classes are still parsed, the grouping itself is dropped.
- #21 warned: namespace grouping is not yet supported; contained classes are still parsed, the grouping itself is dropped.
- #22 warned: Relationship cardinalities are not yet supported, ignored: Customer "1" --> "*" Ticket \| Relationship cardinalities are not yet supported, ignored: Student "1" --> "1..*" Course \| Relationship cardinalities are not yet supported, ignored: Galaxy --> "many" Star : Contains
- #23 warned: Unsupported line ignored: class Shape <<interface>>
- #24 warned: Unsupported line ignored: <<interface>> Shape
- #25 warned: Class annotations (e.g. <<Interface>>) are not yet rendered, ignored.
- #26 warned: Class annotations (e.g. <<Interface>>) are not yet rendered, ignored.
- #27 warned: Relationship cardinalities are not yet supported, ignored: Student "1" --o "1" IdCard : carries \| Relationship cardinalities are not yet supported, ignored: Student "1" --o "1" Bike : rides
- #28 warned: Notes are not yet supported for class diagrams, ignored: note "This is a general note" \| Notes are not yet supported for class diagrams, ignored: note for MyClass "This is a note for a class"
- #32 warned: Styling directives are not yet supported for class diagrams, ignored: style Animal fill:#f9f,stroke:#333,stroke-width:4px \| Styling directives are not yet supported for class diagrams, ignored: style Mineral fill:#bbf,stroke:#f66,stroke-width:2px,color:#fff,stroke-dasharray: 5 5
- #33 warned: Unsupported line ignored: class Animal:::someclass \| Styling directives are not yet supported for class diagrams, ignored: classDef someclass fill:#f96
- #34 warned: Unsupported line ignored: class Animal:::someclass { \| Unsupported line ignored: -int sizeInFeet \| Unsupported line ignored: -canEat() \| Unexpected "}" without a matching block opener: } \| Styling directives are not yet supported for class diagrams, ignored: classDef someclass fill:#f96
- #35 warned: Unsupported line ignored: class Animal:::pink \| Styling directives are not yet supported for class diagrams, ignored: classDef default fill:#f96,color:red \| Styling directives are not yet supported for class diagrams, ignored: classDef pink color:#f9f
- #36 warned: Unsupported line ignored: class Animal:::styleClass

### entityRelationshipDiagram

- #0 warned: The frontmatter title "Order example" is not drawn for this diagram type.
- #4 warned: Unsupported line ignored: "This ❤ Unicode"
- #5 warned: Unsupported line ignored: "This **is** _Markdown_"
- #7 warned: Unsupported line ignored: CAR 1 to zero or more NAMED-DRIVER : allows \| Unsupported line ignored: PERSON many(0) optionally to 0+ NAMED-DRIVER : is
- #10 warned: Unsupported line ignored: a["Customer Account"] { \| Unsupported line ignored: string email \| Unsupported line ignored: }
- #11 warned: Unsupported line ignored: MANUFACTURER only one to zero or more CAR : makes
- #12 warned: Unsupported line ignored: direction TB
- #13 warned: Unsupported line ignored: direction LR
- #14 warned: Unsupported line ignored: subgraph title1 \| Unsupported line ignored: CUSTOMER \| Unsupported line ignored: end \| Unsupported line ignored: subgraph title2 \| Unsupported line ignored: subgraph title3 \| Unsupported line ignored: PERSON \| Unsupported line ignored: end \| Unsupported line ignored: end
- #15 warned: Unsupported line ignored: subgraph title1 \| Unsupported line ignored: CUSTOMER \| Unsupported line ignored: end
- #16 warned: Unsupported line ignored: subgraph "Customer Domain" \| Unsupported line ignored: CUSTOMER \| Unsupported line ignored: end
- #17 warned: Unsupported line ignored: subgraph id1 [title 1] \| Unsupported line ignored: CUSTOMER \| Unsupported line ignored: end
- #18 warned: Unsupported line ignored: subgraph title1 \| Unsupported line ignored: end \| Unsupported line ignored: subgraph title2 \| Unsupported line ignored: end \| Unsupported line ignored: subgraph title3 \| Unsupported line ignored: end
- #19 warned: Unsupported line ignored: direction LR \| Unsupported line ignored: subgraph TOP \| Unsupported line ignored: direction TB \| Unsupported line ignored: subgraph B1 \| Unsupported line ignored: direction RL \| Unsupported line ignored: end \| Unsupported line ignored: subgraph B2 \| Unsupported line ignored: direction BT \| Unsupported line ignored: end \| Unsupported line ignored: end
- #20 warned: Unsupported line ignored: id1\|\|--\|\|id2 : label \| Styling directives are not yet supported for ER diagrams, ignored: style id1 fill:#f9f,stroke:#333,stroke-width:4px \| Styling directives are not yet supported for ER diagrams, ignored: style id2 fill:#bbf,stroke:#f66,stroke-width:2px,color:#fff,stroke-dasharray: 5 5
- #21 warned: Unsupported line ignored: direction TB \| Unsupported line ignored: HOUSE:::someclass \| Styling directives are not yet supported for ER diagrams, ignored: classDef someclass fill:#f96
- #22 warned: Unsupported line ignored: PERSON o{--\|\| HOUSE:::bar : has \| Styling directives are not yet supported for ER diagrams, ignored: classDef foo stroke:#f00 \| Styling directives are not yet supported for ER diagrams, ignored: classDef bar stroke:#0f0 \| Styling directives are not yet supported for ER diagrams, ignored: classDef foobar stroke:#00f
- #23 warned: Unsupported line ignored: PERSON o{--\|\| HOUSE:::bar : has \| Styling directives are not yet supported for ER diagrams, ignored: classDef default fill:#f9f,stroke-width:4px \| Styling directives are not yet supported for ER diagrams, ignored: classDef foo stroke:#f00 \| Styling directives are not yet supported for ER diagrams, ignored: classDef bar stroke:#0f0 \| Styling directives ar
- #24 warned: The frontmatter title "Order example" is not drawn for this diagram type.

### flowchart

- #0 warned: The frontmatter title "Node" is not drawn for this diagram type.
- #1 warned: The frontmatter title "Node with text" is not drawn for this diagram type.
- #100 warned: Subgraph "one" was also used as a node; node ignored. \| Subgraph "two" was also used as a node; node ignored. \| Subgraph "three" was also used as a node; node ignored. \| Edge one -> two references a subgraph; ignored (V1). \| Edge three -> two references a subgraph; ignored (V1). \| Edge two -> c2 references a subgraph; ignored (V1).
- #101 warned: Subgraph "TOP" was also used as a node; node ignored. \| Subgraph "B1" was also used as a node; node ignored. \| Subgraph "B2" was also used as a node; node ignored. \| Edge A -> TOP references a subgraph; ignored (V1). \| Edge TOP -> B references a subgraph; ignored (V1). \| Edge B1 -> B2 references a subgraph; ignored (V1).
- #102 warned: Subgraph "subgraph1" was also used as a node; node ignored. \| Edge outside -> subgraph1 references a subgraph; ignored (V1). \| Subgraph "subgraph2" direction (TD) is ignored: a node inside is linked to a node outside, so it follows the flowchart's direction (same as Mermaid).
- #103 warned: Subgraph "one" was also used as a node; node ignored. \| Edge Start -> one references a subgraph; ignored (V1). \| Edge one -> End references a subgraph; ignored (V1).

### gantt

- #1 warned: Task ignored (unresolvable "until" reference): Add to mermaid                      :until isadded
- #3 warned: Unsupported directive ignored (cosmetic/interactive, no bearing on task position): weekend friday
- #4 warned: Unsupported directive ignored (cosmetic/interactive, no bearing on task position): axisFormat %H:%M \| Task ignored (invalid end/duration "2m"): Initial milestone : milestone, m1, 17:49, 2m \| Task ignored (no start date and no previous task to chain from): Task A : 10m \| Task ignored (no start date and no previous task to chain from): Task B : 5m \| Task ignored (invalid end/duration 
- #5 warned: Unsupported directive ignored (cosmetic/interactive, no bearing on task position): axisFormat %H:%M \| Task ignored (invalid start date "v1" for dateFormat "HH:mm"): Initial vert : vert, v1, 17:30, 2m \| Task ignored (no start date and no previous task to chain from): Task A : 3m \| Task ignored (no start date and no previous task to chain from): Task B : 8m \| Task ignored (invalid sta
- #6 warned: Unsupported directive ignored (cosmetic/interactive, no bearing on task position): tickInterval 1week \| Unsupported directive ignored (cosmetic/interactive, no bearing on task position): weekday monday
- #9 warned: Unsupported directive ignored (cosmetic/interactive, no bearing on task position): axisFormat %s \| Task ignored (invalid start date "0" for dateFormat "X"): 71   : 0, 71 \| Task ignored (invalid start date "0" for dateFormat "X"): 36   : 0, 36 \| Task ignored (invalid start date "0" for dateFormat "X"): 34   : 0, 34 \| Task ignored (invalid start date "0" for dateFormat "X"): 9    : 0,
- #10 warned: Unsupported directive ignored (cosmetic/interactive, no bearing on task position): axisFormat %y \| Unsupported directive ignored (cosmetic/interactive, no bearing on task position): tickInterval 1decade \| Task ignored (invalid end/duration "1s"): 0    : milestone, item0,  1918, 1s \| Task ignored (invalid end/duration "1s   %% not yet official"): 9    : vert,              1906, 1s   

### gitgraph

- #14 warned: Unknown branch "MetroLine1" — checkout/switch ignored: checkout MetroLine1 \| Merge ignored (cannot merge a branch with itself): merge MetroLine3 \| Duplicate commit id "Boston" — auto-renamed to disambiguate.

### mindmap

- #0 warned: ::icon(...) is not yet supported for mindmaps, ignored: ::icon(fa fa-book)
- #11 warned: ::icon(...) is not yet supported for mindmaps, ignored: ::icon(fa fa-book) \| ::icon(...) is not yet supported for mindmaps, ignored: ::icon(mdi mdi-skull-outline)
- #12 warned: :::className is not yet supported for mindmaps, ignored: :::urgent large
- #14 warned: Mermaid mindmaps support exactly one root; extra top-level node ignored: a second line \| Mermaid mindmaps support exactly one root; extra top-level node ignored: Unicode works too: 🤓`"]

### quadrantChart

- #2 warned: classDef styling is not yet supported for quadrant charts, ignored: classDef class1 color: #109060 \| classDef styling is not yet supported for quadrant charts, ignored: classDef class2 color: #908342, radius : 10, stroke-color: #310085, stroke-width: 10px \| classDef styling is not yet supported for quadrant charts, ignored: classDef class3 color: #f00fff, radius : 10

### requirementDiagram

- #5 warned: Unsupported line ignored: direction LR
- #6 warned: Styling directives are not yet supported for requirement diagrams, ignored: style test_req fill:#ffa,stroke:#000, color: green \| Styling directives are not yet supported for requirement diagrams, ignored: style test_entity fill:#f9f,stroke:#333, color: blue
- #7 warned: Styling directives are not yet supported for requirement diagrams, ignored: classDef important fill:#f96,stroke:#333,stroke-width:4px \| Styling directives are not yet supported for requirement diagrams, ignored: classDef test fill:#ffa,stroke:#000
- #8 warned: Styling directives are not yet supported for requirement diagrams, ignored: classDef important font-weight:bold \| Styling directives are not yet supported for requirement diagrams, ignored: class test_entity important \| Styling directives are not yet supported for requirement diagrams, ignored: style test_entity fill:#f9f,stroke:#333

### sequenceDiagram

- #5 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #6 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #7 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #8 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #9 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #10 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #12 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #13 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #14 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #16 warned: Participant `box` groups are not drawn; their participants are kept.
- #17 warned: Central connections `()` are not supported; the message is drawn lifeline to lifeline.
- #36 warned: Actor menus (`link`, `links`, `properties`) are not supported and were ignored.
- #37 warned: Actor menus (`link`, `links`, `properties`) are not supported and were ignored.

### stateDiagram

- #0 warned: The frontmatter title "Simple sample" is not drawn for this diagram type.
- #2 warned: Composite states are not yet rendered as nested boxes; their contents are still parsed, flattened to the top level.
- #3 warned: Composite states are not yet rendered as nested boxes; their contents are still parsed, flattened to the top level.
- #4 warned: Unsupported line ignored: stateId
- #10 warned: Composite states are not yet rendered as nested boxes; their contents are still parsed, flattened to the top level.
- #11 warned: Composite states are not yet rendered as nested boxes; their contents are still parsed, flattened to the top level.
- #12 warned: Composite states are not yet rendered as nested boxes; their contents are still parsed, flattened to the top level.
- #15 warned: Notes are not yet supported for state diagrams, ignored: note right of State1 \| Notes are not yet supported for state diagrams, ignored: note left of State2 : This is the note to the left.
- #16 warned: Composite states are not yet rendered as nested boxes; their contents are still parsed, flattened to the top level. \| Unsupported line ignored: -- \| Unsupported line ignored: --
- #17 warned: Composite states are not yet rendered as nested boxes; their contents are still parsed, flattened to the top level.
- #19 warned: Styling directives are not yet supported for state diagrams, ignored: classDef notMoving fill:white \| Styling directives are not yet supported for state diagrams, ignored: classDef movement font-style:italic \| Styling directives are not yet supported for state diagrams, ignored: classDef badBadEvent fill:#f00,color:white,font-weight:bold,stroke-width:2px,stroke:yellow \| Styling dire
- #20 warned: Styling directives are not yet supported for state diagrams, ignored: classDef notMoving fill:white \| Styling directives are not yet supported for state diagrams, ignored: classDef movement font-style:italic \| Styling directives are not yet supported for state diagrams, ignored: classDef badBadEvent fill:#f00,color:white,font-weight:bold,stroke-width:2px,stroke:yellow \| State diagra
- #21 warned: Styling directives are not yet supported for state diagrams, ignored: classDef yourState font-style:italic,font-weight:bold,fill:white \| State diagram :::className styling is not supported and was ignored.

### swimlanes

- #7 warned: Unsupported line ignored: accTitle: Support escalation \| Unsupported line ignored: accDescr: A request starts with the customer, is triaged by support, and may be escalated to engineering.

### timeline

- #5 warned: Timeline TD direction is not yet supported; rendered left to right.

### treeView

- #1 warned: TreeView icons are not supported and were ignored.
- #7 warned: TreeView icons are not supported and were ignored.
- #8 warned: TreeView icons are not supported and were ignored.
- #9 warned: TreeView icons are not supported and were ignored.

### usecase

- #10 warned: Properties set with `id@{ ... }` on a line of their own (type, animation...) are not drawn.
- #14 warned: Properties set with `id@{ ... }` on a line of their own (type, animation...) are not drawn.
- #16 warned: The content of `json` payload nodes is not drawn; only their name.
- #17 warned: The content of `json` payload nodes is not drawn; only their name. \| classDef "data" referenced but not defined. \| classDef "data" referenced but not defined.
- #22 warned: The content of `json` payload nodes is not drawn; only their name. \| Properties set with `id@{ ... }` on a line of their own (type, animation...) are not drawn.

### venn

- #7 warned: Union-specific fill styling is not yet supported for Venn diagrams, ignored (overlap color derives from each set's own fill): style A,B color:#333 \| Unsupported line ignored (style targets unknown set): style A1 color:red

### zenuml

- #2 warned: ZenUML participant annotators other than @Actor are drawn as plain participant boxes.

