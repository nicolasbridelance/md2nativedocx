# state-styles

`classDef` given through `class` or `:::`, and `style`: fill, border, text colour, bold, italic. Mermaid 12.3.0 official examples #19 to #21, then a styled composite. Colours may be hex or CSS names (`white`, `yellow` in #19).

## stateDiagram#19

```mermaid
stateDiagram
   direction TB

   accTitle: This is the accessible title
   accDescr: This is an accessible description

   classDef notMoving fill:white
   classDef movement font-style:italic
   classDef badBadEvent fill:#f00,color:white,font-weight:bold,stroke-width:2px,stroke:yellow

   [*]--> Still
   Still --> [*]
   Still --> Moving
   Moving --> Still
   Moving --> Crash
   Crash --> [*]

   class Still notMoving
   class Moving, Crash movement
   class Crash badBadEvent
   class end badBadEvent
```

## stateDiagram#20

```mermaid
stateDiagram
   direction TB

   accTitle: This is the accessible title
   accDescr: This is an accessible description

   classDef notMoving fill:white
   classDef movement font-style:italic;
   classDef badBadEvent fill:#f00,color:white,font-weight:bold,stroke-width:2px,stroke:yellow

   [*] --> Still:::notMoving
   Still --> [*]
   Still --> Moving:::movement
   Moving --> Still
   Moving --> Crash:::movement
   Crash:::badBadEvent --> [*]
```

## stateDiagram#21

```mermaid
stateDiagram
    classDef yourState font-style:italic,font-weight:bold,fill:white

    yswsii: Your state with spaces in it
    [*] --> yswsii:::yourState
    [*] --> SomeOtherState
    SomeOtherState --> YetAnotherState
    yswsii --> YetAnotherState
    YetAnotherState --> [*]
```

## A styled composite

```mermaid
stateDiagram-v2
  classDef warm fill:#fde9d9,stroke:#c0504d,color:#7f1f1d
  classDef done fill:#2f5496,color:#ffffff,font-weight:bold
  [*] --> Work
  state Work {
    [*] --> Doing
    Doing --> Checking : finish
  }
  Work --> Done
  class Work warm
  Done:::done --> [*]
  style Checking font-style:italic
```
