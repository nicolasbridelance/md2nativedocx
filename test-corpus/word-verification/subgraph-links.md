# subgraph-links

Links to a subgraph (`A --> S`), drawn to the subgraph's border as Mermaid does. Mermaid 12.3.0 official
examples (docs/syntax/flowchart.md, flowchart#100 to #103), then a few cases of this project's own.

## flowchart#100: links between subgraphs

```mermaid
flowchart TB
    c1-->a2
    subgraph one
    a1-->a2
    end
    subgraph two
    b1-->b2
    end
    subgraph three
    c1-->c2
    end
    one --> two
    three --> two
    two --> c2
```

## flowchart#101: nested subgraphs, each with its own direction

```mermaid
flowchart LR
  subgraph TOP
    direction TB
    subgraph B1
        direction RL
        i1 -->f1
    end
    subgraph B2
        direction BT
        i2 -->f2
    end
  end
  A --> TOP --> B
  B1 --> B2
```

## flowchart#102: a link to a subgraph keeps its direction, a link inside does not

```mermaid
flowchart LR
    subgraph subgraph1
        direction TB
        top1[top] --> bottom1[bottom]
    end
    subgraph subgraph2
        direction TB
        top2[top] --> bottom2[bottom]
    end
    %% ^ These subgraphs are identical, except for the links to them:

    %% Link *to* subgraph1: subgraph1 direction is maintained
    outside --> subgraph1
    %% Link *within* subgraph2:
    %% subgraph2 inherits the direction of the top-level graph (LR)
    outside ---> top2
```

## flowchart#103: in and out of a titled subgraph (collapsed view drawn open)

```mermaid
flowchart TD
    Start --> one
    subgraph one [My Group]
        A --> B
        B --> C
    end
    one --> End
    one@{ view: collapsed }
```

## Labelled and dotted links, left to right

```mermaid
flowchart LR
    User[User request] -- "submits" --> API
    subgraph API [API gateway]
        Auth --> Route
    end
    API -.->|logs| Audit[(Audit store)]
    API ==> Workers
    subgraph Workers
        W1[Worker 1]
        W2[Worker 2]
    end
```

## A link that crosses the border: ranked against the first node

```mermaid
flowchart TD
    X[Outside] --> S
    subgraph S [Service]
        A[Entry] --> B[Exit]
    end
    B --> Y[Next step]
```
