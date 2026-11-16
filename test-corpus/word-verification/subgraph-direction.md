# R2.4 — direction dans un subgraph

## Cas 1 : sous-graphe isolé, LR dans un flowchart TD

```mermaid
graph TD
  X --> Y
  subgraph S[Sous-graphe LR]
    direction LR
    A --> B --> C
  end
```

## Cas 2 : sous-graphes imbriqués, directions alternées

```mermaid
graph LR
  subgraph P[P : TB]
    direction TB
    a --> b
    subgraph Q[Q : LR]
      direction LR
      c --> d
    end
  end
  subgraph R[R : TB]
    direction TB
    e --> f
  end
  g --> h
```

## Cas 3 : lien traversant la frontière (direction ignorée, avertissement attendu)

```mermaid
graph TD
  X --> A
  subgraph S[Direction ignorée]
    direction LR
    A --> B
  end
```
