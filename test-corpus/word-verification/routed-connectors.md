# Connecteurs routés autour d'un nœud

Chaque flèche qui contourne un nœud est un connecteur coudé de Word, attaché à ses deux formes.

## Raccourci entre deux sous-graphes, de gauche à droite (cas F02 du banc)

```mermaid
flowchart LR
subgraph G0["Welcome"]
N0["Log return"]
N1["Review receipt"]
end
subgraph G1["Back office"]
N2["Confirm store"]
N3["Close request"]
end
N0 --> N1
N2 --> N3
N1 --> N2
N0 --> N3
```

## Le même, de haut en bas

```mermaid
flowchart TB
subgraph G0["Welcome"]
N0["Log return"]
N1["Review receipt"]
end
subgraph G1["Back office"]
N2["Confirm store"]
N3["Close request"]
end
N0 --> N1
N2 --> N3
N1 --> N2
N0 --> N3
```

## Plusieurs détours, dont un retour en arrière (cas S03 du banc)

```mermaid
flowchart LR
A[Intake] --> B{Classify}
A --> C[Audit trail]
B --> D[Security]
B --> E[Operations]
B --> F[Support]
D --> G[Leader]
E --> G
F --> G
G --> H{Approve}
H -->|Retry| B
H -->|Review| I[Review queue]
I --> D
I --> F
C --> I
C --> J[Archive dossier]
H -->|Close| J
classDef decision fill:#FEF3C7,stroke:#B45309
classDef trail fill:#E0E7FF,stroke:#4338CA
class B,H decision
class C,J trail
```
