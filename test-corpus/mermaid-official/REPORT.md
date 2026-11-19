# Conformité aux exemples officiels de Mermaid (étage 1)

Généré par `node scripts/mermaid-conformance.mjs --report` sur `mermaid@12.3.0` (commit `2086904`) :
chaque bloc d'exemple des pages de syntaxe de la doc Mermaid passé dans `renderDiagram()`.
Exemples © les auteurs de Mermaid, licence MIT (`LICENSE` dans ce dossier).

**Total : 541 exemples — 304 sans avertissement (56 %), 187 avec avertissement, 50 mal typés, 0 en échec.**

| Page | Exemples | Sans avert. | Avec avert. | Mal typés | Échecs |
|---|---:|---:|---:|---:|---:|
| agentflow | 12 | 0 | 0 | 12 | 0 |
| architecture | 6 | 1 | 5 | 0 | 0 |
| block | 30 | 29 | 1 | 0 | 0 |
| c4 | 6 | 0 | 6 | 0 | 0 |
| classDiagram | 38 | 8 | 30 | 0 | 0 |
| cynefin | 3 | 3 | 0 | 0 | 0 |
| entityRelationshipDiagram | 25 | 5 | 20 | 0 | 0 |
| eventmodeling | 13 | 13 | 0 | 0 | 0 |
| flowchart | 116 | 98 | 18 | 0 | 0 |
| gantt | 11 | 3 | 8 | 0 | 0 |
| gitgraph | 35 | 12 | 23 | 0 | 0 |
| ishikawa | 1 | 1 | 0 | 0 | 0 |
| kanban | 3 | 2 | 1 | 0 | 0 |
| mindmap | 15 | 9 | 6 | 0 | 0 |
| packet | 4 | 2 | 2 | 0 | 0 |
| pie | 2 | 1 | 1 | 0 | 0 |
| quadrantChart | 3 | 1 | 2 | 0 | 0 |
| radar | 3 | 1 | 2 | 0 | 0 |
| railroad | 14 | 0 | 0 | 14 | 0 |
| requirementDiagram | 9 | 4 | 5 | 0 | 0 |
| sankey | 8 | 4 | 4 | 0 | 0 |
| sequenceDiagram | 38 | 26 | 12 | 0 | 0 |
| stateDiagram | 22 | 9 | 13 | 0 | 0 |
| swimlanes | 13 | 11 | 2 | 0 | 0 |
| timeline | 14 | 6 | 8 | 0 | 0 |
| treemap | 8 | 4 | 4 | 0 | 0 |
| treeView | 13 | 6 | 7 | 0 | 0 |
| usecase | 24 | 0 | 0 | 24 | 0 |
| userJourney | 1 | 1 | 0 | 0 | 0 |
| venn | 8 | 6 | 2 | 0 | 0 |
| wardley | 19 | 19 | 0 | 0 | 0 |
| xyChart | 8 | 4 | 4 | 0 | 0 |
| zenuml | 16 | 15 | 1 | 0 | 0 |

## Détail des écarts

### agentflow

- #0 wrong-type: detected unknown
- #1 wrong-type: detected unknown
- #2 wrong-type: detected unknown
- #3 wrong-type: detected unknown
- #4 wrong-type: detected unknown
- #5 wrong-type: detected unknown
- #6 wrong-type: detected unknown
- #7 wrong-type: detected unknown
- #8 wrong-type: detected unknown
- #9 wrong-type: detected unknown
- #10 wrong-type: detected unknown
- #11 wrong-type: detected unknown

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

- #0 warned: Unsupported line ignored: --- \| Unsupported line ignored: --- \| Notes are not yet supported for class diagrams, ignored: note "From Duck till Zebra" \| Notes are not yet supported for class diagrams, ignored: note for Duck "can fly<br>can swim<br>can dive<br>can help in debugging"
- #1 warned: Class annotations (e.g. <<Interface>>) are not yet rendered, ignored. \| Relationship cardinalities are not yet supported, ignored: Customer "1" --> "*" Order : places \| Relationship cardinalities are not yet supported, ignored: Order "1" *-- "*" LineItem : contains
- #2 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: --- \| Class annotations (e.g. <<Interface>>) are not yet rendered, ignored. \| Relationship cardinalities are not yet supported, ignored: Customer "1" --> "*" Order : places \| Relationship cardinalities are not yet supported, ignored: Order "1" *-- "*" LineItem : contains
- #3 warned: Unsupported line ignored: --- \| Unsupported line ignored: ---
- #6 warned: Unsupported line ignored: `Animal Class!` --> `Car Class`
- #11 warned: Unsupported line ignored: classM <\|.. classN
- #14 warned: Unsupported line ignored: Animal <\|--\|> Zebra
- #15 warned: Unsupported line ignored: bar ()-- foo
- #16 warned: Unsupported line ignored: Class01 --() bar \| Unsupported line ignored: Class02 --() bar \| Unsupported line ignored: foo ()-- Class01
- #17 warned: namespace grouping is not yet supported; contained classes are still parsed, the grouping itself is dropped.
- #18 warned: namespace grouping is not yet supported; contained classes are still parsed, the grouping itself is dropped.
- #19 warned: namespace grouping is not yet supported; contained classes are still parsed, the grouping itself is dropped.
- #20 warned: namespace grouping is not yet supported; contained classes are still parsed, the grouping itself is dropped.
- #21 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: class: \| Unsupported line ignored: --- \| namespace grouping is not yet supported; contained classes are still parsed, the grouping itself is dropped.
- #22 warned: Relationship cardinalities are not yet supported, ignored: Customer "1" --> "*" Ticket \| Relationship cardinalities are not yet supported, ignored: Student "1" --> "1..*" Course \| Relationship cardinalities are not yet supported, ignored: Galaxy --> "many" Star : Contains
- #23 warned: Unsupported line ignored: class Shape <<interface>>
- #24 warned: Unsupported line ignored: <<interface>> Shape
- #25 warned: Class annotations (e.g. <<Interface>>) are not yet rendered, ignored.
- #26 warned: Class annotations (e.g. <<Interface>>) are not yet rendered, ignored.
- #27 warned: Relationship cardinalities are not yet supported, ignored: Student "1" --o "1" IdCard : carries \| Relationship cardinalities are not yet supported, ignored: Student "1" --o "1" Bike : rides
- #28 warned: Notes are not yet supported for class diagrams, ignored: note "This is a general note" \| Notes are not yet supported for class diagrams, ignored: note for MyClass "This is a note for a class"
- #29 warned: Unsupported line ignored: link Shape "https://www.github.com" "This is a tooltip for a link" \| Unsupported line ignored: click Shape2 href "https://www.github.com" "This is a tooltip for a link"
- #30 warned: Unsupported line ignored: callback Shape "callbackFunction" "This is a tooltip for a callback" \| Unsupported line ignored: click Shape2 call callbackFunction() "This is a tooltip for a callback"
- #31 warned: Unsupported line ignored: callback Class01 "callbackFunction" "Callback tooltip" \| Unsupported line ignored: link Class02 "https://www.github.com" "This is a link" \| Unsupported line ignored: click Class03 call callbackFunction() "Callback tooltip" \| Unsupported line ignored: click Class04 href "https://www.github.com" "This is a link"
- #32 warned: Styling directives are not yet supported for class diagrams, ignored: style Animal fill:#f9f,stroke:#333,stroke-width:4px \| Styling directives are not yet supported for class diagrams, ignored: style Mineral fill:#bbf,stroke:#f66,stroke-width:2px,color:#fff,stroke-dasharray: 5 5
- #33 warned: Unsupported line ignored: class Animal:::someclass \| Styling directives are not yet supported for class diagrams, ignored: classDef someclass fill:#f96
- #34 warned: Unsupported line ignored: class Animal:::someclass { \| Unsupported line ignored: -int sizeInFeet \| Unsupported line ignored: -canEat() \| Unexpected "}" without a matching block opener: } \| Styling directives are not yet supported for class diagrams, ignored: classDef someclass fill:#f96
- #35 warned: Unsupported line ignored: class Animal:::pink \| Styling directives are not yet supported for class diagrams, ignored: classDef default fill:#f96,color:red \| Styling directives are not yet supported for class diagrams, ignored: classDef pink color:#f9f
- #36 warned: Unsupported line ignored: class Animal:::styleClass
- #37 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: class: \| Unsupported line ignored: ---

### entityRelationshipDiagram

- #0 warned: Unsupported line ignored: --- \| Unsupported line ignored: title: Order example \| Unsupported line ignored: ---
- #3 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: theme: default \| Unsupported line ignored: look: classic \| Unsupported line ignored: layout: dagre \| Unsupported line ignored: ---
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
- #24 warned: Unsupported line ignored: --- \| Unsupported line ignored: title: Order example \| Unsupported line ignored: config: \| Unsupported line ignored: layout: dagre \| Unsupported line ignored: ---

### flowchart

- #0 warned: Unsupported line ignored: title: Node
- #1 warned: Unsupported line ignored: title: Node with text
- #3 warned: Unsupported line ignored: config: \| Unsupported line ignored: htmlLabels: false \| Unsupported line ignored: newLines["`Line1 Line 2 Line 3`"] markdown --> newLines
- #7 warned: Unsupported line ignored: config: \| Unsupported line ignored: theme: default \| Unsupported line ignored: look: classic \| Unsupported line ignored: layout: dagre
- #85 warned: Unsupported line ignored: A e1@--> B
- #86 warned: Unsupported line ignored: A e1@==> B
- #87 warned: Unsupported line ignored: A e1@--> B
- #88 warned: Unsupported line ignored: A e1@--> B
- #89 warned: Unsupported line ignored: Client e1@--> API \| Unsupported line ignored: API e2@--> Cache \| Unsupported line ignored: Cache e3@-->\|miss\| DB \| Unsupported line ignored: DB e4@--> API \| Unsupported line ignored: API e5@--> Client
- #90 warned: Unsupported line ignored: config: \| Unsupported line ignored: flowchart: \| Unsupported line ignored: stepDuration: 0.5 \| Unsupported line ignored: Client e1@--> API \| Unsupported line ignored: API e2@--> Client
- #100 warned: Subgraph "one" was also used as a node; node ignored. \| Subgraph "two" was also used as a node; node ignored. \| Subgraph "three" was also used as a node; node ignored. \| Edge one -> two references a subgraph; ignored (V1). \| Edge three -> two references a subgraph; ignored (V1). \| Edge two -> c2 references a subgraph; ignored (V1).
- #101 warned: Subgraph "TOP" was also used as a node; node ignored. \| Subgraph "B1" was also used as a node; node ignored. \| Subgraph "B2" was also used as a node; node ignored. \| Edge A -> TOP references a subgraph; ignored (V1). \| Edge TOP -> B references a subgraph; ignored (V1). \| Edge B1 -> B2 references a subgraph; ignored (V1).
- #102 warned: Subgraph "subgraph1" was also used as a node; node ignored. \| Edge outside -> subgraph1 references a subgraph; ignored (V1). \| Subgraph "subgraph2" direction (TD) is ignored: a node inside is linked to a node outside, so it follows the flowchart's direction (same as Mermaid).
- #103 warned: Subgraph "one" was also used as a node; node ignored. \| Edge Start -> one references a subgraph; ignored (V1). \| Edge one -> End references a subgraph; ignored (V1).
- #104 warned: Unsupported line ignored: config: \| Unsupported line ignored: htmlLabels: false \| Unsupported line ignored: a("`The **cat** in the hat`") -- "edge label" --> b{{"`The **dog** in the hog`"}} end subgraph "`**Two**`" c("`The **cat** in the hat`") -- "`Bold **edge label**`" --> d("The dog in the hog") end \| Unclosed `subgraph` block.
- #105 warned: Unsupported line ignored: click A callback "Tooltip for a callback" \| Unsupported line ignored: click B "https://www.github.com" "This is a tooltip for a link" \| Unsupported line ignored: click C call callback() "Tooltip for a callback" \| Unsupported line ignored: click D href "https://www.github.com" "This is a tooltip for a link"
- #106 warned: Unsupported line ignored: click A "https://www.github.com" _blank \| Unsupported line ignored: click B "https://www.github.com" "Open this in a new tab" _blank \| Unsupported line ignored: click C href "https://www.github.com" _blank \| Unsupported line ignored: click D href "https://www.github.com" "Open this in a new tab" _blank
- #108 warned: Unsupported line ignored: A e1@==> B \| Unsupported line ignored: A e2@--> C

### gantt

- #1 warned: Task ignored (unresolvable "until" reference): Add to mermaid                      :until isadded
- #3 warned: Unsupported directive ignored (cosmetic/interactive, no bearing on task position): weekend friday
- #4 warned: Unsupported directive ignored (cosmetic/interactive, no bearing on task position): axisFormat %H:%M \| Task ignored (invalid end/duration "2m"): Initial milestone : milestone, m1, 17:49, 2m \| Task ignored (no start date and no previous task to chain from): Task A : 10m \| Task ignored (no start date and no previous task to chain from): Task B : 5m \| Task ignored (invalid end/duration 
- #5 warned: Unsupported directive ignored (cosmetic/interactive, no bearing on task position): axisFormat %H:%M \| Task ignored (invalid start date "v1" for dateFormat "HH:mm"): Initial vert : vert, v1, 17:30, 2m \| Task ignored (no start date and no previous task to chain from): Task A : 3m \| Task ignored (no start date and no previous task to chain from): Task B : 8m \| Task ignored (invalid sta
- #6 warned: Unsupported directive ignored (cosmetic/interactive, no bearing on task position): tickInterval 1week \| Unsupported directive ignored (cosmetic/interactive, no bearing on task position): weekday monday
- #7 warned: Unsupported line ignored: --- \| Task ignored (no start date and no previous task to chain from): displayMode: compact \| Unsupported line ignored: ---
- #9 warned: Unsupported directive ignored (cosmetic/interactive, no bearing on task position): axisFormat %s \| Task ignored (invalid start date "0" for dateFormat "X"): 71   : 0, 71 \| Task ignored (invalid start date "0" for dateFormat "X"): 36   : 0, 36 \| Task ignored (invalid start date "0" for dateFormat "X"): 34   : 0, 34 \| Task ignored (invalid start date "0" for dateFormat "X"): 9    : 0,
- #10 warned: Unsupported line ignored: --- \| Unsupported line ignored: # Frontmatter config, YAML comments \| Task ignored (no start date and no previous task to chain from): title: Ignored if specified in chart \| Task ignored (no start date and no previous task to chain from): displayMode: compact     #gantt specific setting but works at this level too \| Task ignored (no date/duration data): co

### gitgraph

- #0 warned: Unsupported line ignored: --- \| Unsupported line ignored: title: Example Git diagram \| Unsupported line ignored: ---
- #10 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'base' \| Unsupported line ignored: showBranches: false \| Unsupported line ignored: ---
- #11 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'base' \| Unsupported line ignored: rotateCommitLabel: true \| Unsupported line ignored: ---
- #12 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'base' \| Unsupported line ignored: rotateCommitLabel: false \| Unsupported line ignored: ---
- #13 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'base' \| Unsupported line ignored: showBranches: false \| Unsupported line ignored: showCommitLabel: false \| Unsupported line ignored: ---
- #14 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'base' \| Unsupported line ignored: showBranches: true \| Unsupported line ignored: showCommitLabel: true \| Unsupported line ignored: mainBranchName: 'MetroLine1' \| Unsupported line ignored: --- \| Unknown branch "MetroLine1" — checkout
- #15 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'base' \| Unsupported line ignored: showBranches: true \| Unsupported line ignored: showCommitLabel: true \| Unsupported line ignored: ---
- #16 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'base' \| Unsupported line ignored: showBranches: true \| Unsupported line ignored: showCommitLabel: true \| Unsupported line ignored: mainBranchOrder: 2 \| Unsupported line ignored: ---
- #20 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: parallelCommits: false \| Unsupported line ignored: ---
- #21 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: parallelCommits: true \| Unsupported line ignored: ---
- #22 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'base' \| Unsupported line ignored: ---
- #23 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'forest' \| Unsupported line ignored: ---
- #24 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'default' \| Unsupported line ignored: ---
- #25 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'dark' \| Unsupported line ignored: ---
- #26 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'neutral' \| Unsupported line ignored: ---
- #27 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'default' \| Unsupported line ignored: ---
- #28 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'default' \| Unsupported line ignored: themeVariables: \| Unsupported line ignored: 'git0': '#ff0000' \| Unsupported line ignored: 'git1': '#00ff00' \| Unsupported line ignored: 'git2': '#0000ff' \| Unsupported line ignored: 'git3': '#ff0
- #29 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'default' \| Unsupported line ignored: themeVariables: \| Unsupported line ignored: 'gitBranchLabel0': '#ffffff' \| Unsupported line ignored: 'gitBranchLabel1': '#ffffff' \| Unsupported line ignored: 'gitBranchLabel2': '#ffffff' \| Unsupp
- #30 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'default' \| Unsupported line ignored: themeVariables: \| Unsupported line ignored: commitLabelColor: '#ff0000' \| Unsupported line ignored: commitLabelBackground: '#00ff00' \| Unsupported line ignored: ---
- #31 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'default' \| Unsupported line ignored: themeVariables: \| Unsupported line ignored: commitLabelColor: '#ff0000' \| Unsupported line ignored: commitLabelBackground: '#00ff00' \| Unsupported line ignored: commitLabelFontSize: '16px' \| Unsu
- #32 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'default' \| Unsupported line ignored: themeVariables: \| Unsupported line ignored: commitLabelColor: '#ff0000' \| Unsupported line ignored: commitLabelBackground: '#00ff00' \| Unsupported line ignored: tagLabelFontSize: '16px' \| Unsuppo
- #33 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'default' \| Unsupported line ignored: themeVariables: \| Unsupported line ignored: tagLabelColor: '#ff0000' \| Unsupported line ignored: tagLabelBackground: '#00ff00' \| Unsupported line ignored: tagLabelBorder: '#0000ff' \| Unsupported 
- #34 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: logLevel: 'debug' \| Unsupported line ignored: theme: 'default' \| Unsupported line ignored: themeVariables: \| Unsupported line ignored: 'gitInv0': '#ff0000' \| Unsupported line ignored: ---

### kanban

- #2 warned: Kanban frontmatter/config (including ticketBaseUrl) is not supported and was ignored.

### mindmap

- #0 warned: ::icon(...) is not yet supported for mindmaps, ignored: ::icon(fa fa-book)
- #9 warned: Mermaid mindmaps support exactly one root; extra top-level node ignored: config: \| Mermaid mindmaps support exactly one root; extra top-level node ignored: ---
- #10 warned: Mermaid mindmaps support exactly one root; extra top-level node ignored: config: \| Mermaid mindmaps support exactly one root; extra top-level node ignored: ---
- #11 warned: ::icon(...) is not yet supported for mindmaps, ignored: ::icon(fa fa-book) \| ::icon(...) is not yet supported for mindmaps, ignored: ::icon(mdi mdi-skull-outline)
- #12 warned: :::className is not yet supported for mindmaps, ignored: :::urgent large
- #14 warned: Mermaid mindmaps support exactly one root; extra top-level node ignored: a second line \| Mermaid mindmaps support exactly one root; extra top-level node ignored: Unicode works too: 🤓`"]

### packet

- #2 warned: Packet config (showBits, bitOrder, bitsPerRow, ...) is not supported and was ignored.
- #3 warned: Packet config (showBits, bitOrder, bitsPerRow, ...) is not supported and was ignored.

### pie

- #1 warned: Pie chart frontmatter/config is not supported and was ignored.

### quadrantChart

- #1 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: chartWidth: 400 \| Unsupported line ignored: chartHeight: 400 \| Unsupported line ignored: themeVariables: \| Unsupported line ignored: quadrant1TextFill: "ff0000" \| Unsupported line ignored: ---
- #2 warned: classDef styling is not yet supported for quadrant charts, ignored: classDef class1 color: #109060 \| classDef styling is not yet supported for quadrant charts, ignored: classDef class2 color: #908342, radius : 10, stroke-color: #310085, stroke-width: 10px \| classDef styling is not yet supported for quadrant charts, ignored: classDef class3 color: #f00fff, radius : 10

### radar

- #0 warned: Radar frontmatter/config is not supported and was ignored.
- #2 warned: Radar frontmatter/config is not supported and was ignored.

### railroad

- #0 wrong-type: detected unknown
- #1 wrong-type: detected unknown
- #2 wrong-type: detected unknown
- #3 wrong-type: detected unknown
- #4 wrong-type: detected unknown
- #5 wrong-type: detected unknown
- #6 wrong-type: detected unknown
- #7 wrong-type: detected unknown
- #8 wrong-type: detected unknown
- #9 wrong-type: detected unknown
- #10 wrong-type: detected unknown
- #11 wrong-type: detected unknown
- #12 wrong-type: detected unknown
- #13 wrong-type: detected unknown

### requirementDiagram

- #2 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: theme: default \| Unsupported line ignored: look: classic \| Unsupported line ignored: layout: dagre \| Unsupported line ignored: ---
- #5 warned: Unsupported line ignored: direction LR
- #6 warned: Styling directives are not yet supported for requirement diagrams, ignored: style test_req fill:#ffa,stroke:#000, color: green \| Styling directives are not yet supported for requirement diagrams, ignored: style test_entity fill:#f9f,stroke:#333, color: blue
- #7 warned: Styling directives are not yet supported for requirement diagrams, ignored: classDef important fill:#f96,stroke:#333,stroke-width:4px \| Styling directives are not yet supported for requirement diagrams, ignored: classDef test fill:#ffa,stroke:#000
- #8 warned: Styling directives are not yet supported for requirement diagrams, ignored: classDef important font-weight:bold \| Styling directives are not yet supported for requirement diagrams, ignored: class test_entity important \| Styling directives are not yet supported for requirement diagrams, ignored: style test_entity fill:#f9f,stroke:#333

### sankey

- #0 warned: Sankey frontmatter/config is not supported and was ignored.
- #5 warned: Sankey frontmatter/config is not supported and was ignored.
- #6 warned: Sankey frontmatter/config is not supported and was ignored.
- #7 warned: Sankey frontmatter/config is not supported and was ignored.

### sequenceDiagram

- #2 warned: Sequence diagram frontmatter/config is not supported and was ignored.
- #5 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #6 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #7 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #8 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #9 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #10 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #13 warned: Participant types (boundary, control, entity, database, ...) are drawn as plain participant boxes.
- #16 warned: Participant `box` groups are not drawn; their participants are kept.
- #17 warned: Central connections `()` are not supported; the message is drawn lifeline to lifeline.
- #36 warned: Actor menus (`link`, `links`, `properties`) are not supported and were ignored.
- #37 warned: Actor menus (`link`, `links`, `properties`) are not supported and were ignored.

### stateDiagram

- #0 warned: State diagram frontmatter/config is not supported and was ignored.
- #2 warned: Composite states are not yet rendered as nested boxes; their contents are still parsed, flattened to the top level.
- #3 warned: State diagram frontmatter/config is not supported and was ignored. \| Composite states are not yet rendered as nested boxes; their contents are still parsed, flattened to the top level.
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

- #1 warned: Unsupported line ignored: config: \| Unsupported line ignored: theme: default \| Unsupported line ignored: look: classic
- #7 warned: Unsupported line ignored: accTitle: Support escalation \| Unsupported line ignored: accDescr: A request starts with the customer, is triaged by support, and may be escalated to engineering.

### timeline

- #5 warned: Timeline TD direction is not yet supported; rendered left to right.
- #7 warned: Timeline frontmatter/config is not supported and was ignored.
- #8 warned: Timeline frontmatter/config is not supported and was ignored.
- #9 warned: Timeline frontmatter/config is not supported and was ignored.
- #10 warned: Timeline frontmatter/config is not supported and was ignored.
- #11 warned: Timeline frontmatter/config is not supported and was ignored.
- #12 warned: Timeline frontmatter/config is not supported and was ignored.
- #13 warned: Timeline frontmatter/config is not supported and was ignored.

### treemap

- #4 warned: Treemap frontmatter/config is not supported and was ignored.
- #5 warned: Treemap frontmatter/config is not supported and was ignored.
- #6 warned: Treemap frontmatter/config is not supported and was ignored.
- #7 warned: Treemap frontmatter/config is not supported and was ignored.

### treeView

- #1 warned: TreeView icons are not supported and were ignored.
- #5 warned: TreeView frontmatter/config is not supported and was ignored.
- #6 warned: TreeView frontmatter/config is not supported and was ignored.
- #7 warned: TreeView icons are not supported and were ignored.
- #8 warned: TreeView frontmatter/config is not supported and was ignored. \| TreeView icons are not supported and were ignored.
- #9 warned: TreeView icons are not supported and were ignored.
- #12 warned: TreeView frontmatter/config is not supported and was ignored.

### usecase

- #0 wrong-type: detected unknown
- #1 wrong-type: detected unknown
- #2 wrong-type: detected unknown
- #3 wrong-type: detected unknown
- #4 wrong-type: detected unknown
- #5 wrong-type: detected unknown
- #6 wrong-type: detected unknown
- #7 wrong-type: detected unknown
- #8 wrong-type: detected unknown
- #9 wrong-type: detected unknown
- #10 wrong-type: detected unknown
- #11 wrong-type: detected unknown
- #12 wrong-type: detected unknown
- #13 wrong-type: detected unknown
- #14 wrong-type: detected unknown
- #15 wrong-type: detected unknown
- #16 wrong-type: detected unknown
- #17 wrong-type: detected unknown
- #18 wrong-type: detected unknown
- #19 wrong-type: detected unknown
- #20 wrong-type: detected unknown
- #21 wrong-type: detected unknown
- #22 wrong-type: detected unknown
- #23 wrong-type: detected unknown

### venn

- #1 warned: Unsupported line ignored: --- \| Unsupported line ignored: config: \| Unsupported line ignored: theme: default \| Unsupported line ignored: look: classic \| Unsupported line ignored: ---
- #7 warned: Union-specific fill styling is not yet supported for Venn diagrams, ignored (overlap color derives from each set's own fill): style A,B color:#333 \| Unsupported line ignored (style targets unknown set): style A1 color:red

### xyChart

- #2 warned: XYChart frontmatter/config is not supported and was ignored.
- #3 warned: XYChart frontmatter/config is not supported and was ignored.
- #4 warned: XYChart frontmatter/config is not supported and was ignored.
- #7 warned: XYChart frontmatter/config is not supported and was ignored.

### zenuml

- #2 warned: ZenUML participant annotators other than @Actor are drawn as plain participant boxes.

