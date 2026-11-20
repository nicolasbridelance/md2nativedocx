# class-styles

`style`, `classDef` with `:::` or `cssClass`, and `classDef default` on class diagrams: fill, stroke and text colour, layered as Mermaid layers them. Mermaid 12.3.0 official examples, then a styled inheritance tree (SmartArt when on).

## classDiagram#32

```mermaid
classDiagram
  class Animal
  class Mineral
  style Animal fill:#f9f,stroke:#333,stroke-width:4px
  style Mineral fill:#bbf,stroke:#f66,stroke-width:2px,color:#fff,stroke-dasharray: 5 5
```

## classDiagram#33

```mermaid
classDiagram
    class Animal:::someclass
    classDef someclass fill:#f96
```

## classDiagram#34

```mermaid
classDiagram
    class Animal:::someclass {
        -int sizeInFeet
        -canEat()
    }
    classDef someclass fill:#f96
```

## classDiagram#35

```mermaid
classDiagram
  class Animal:::pink
  class Mineral

  classDef default fill:#f96,color:red
  classDef pink color:#f9f
```

## classDiagram#36

```mermaid
classDiagram
    class Animal:::styleClass
```

## Styled inheritance tree

```mermaid
classDiagram
  class Shape:::base
  class Circle
  class Square
  Shape <|-- Circle
  Shape <|-- Square
  classDef base fill:#2F5496,color:#fff
  style Square fill:#f96
```
