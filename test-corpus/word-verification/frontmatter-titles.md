# frontmatter-titles

A frontmatter `title:` on a type with no `title` statement, drawn above the diagram as Mermaid does.
Mermaid 12.3.0 official examples.

## flowchart#1

```mermaid
---
title: Node with text
---
flowchart LR
    id1[This is the text in the box]
```

## classDiagram#3

```mermaid
---
title: Bank example
---
classDiagram
    class BankAccount
    BankAccount : +String owner
    BankAccount : +Bigdecimal balance
    BankAccount : +deposit(amount)
    BankAccount : +withdrawal(amount)
```

## entityRelationshipDiagram#0

```mermaid
---
title: Order example
---
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses
```

## stateDiagram#0

```mermaid
---
title: Simple sample
---
stateDiagram-v2
    [*] --> Still
    Still --> [*]

    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]
```
