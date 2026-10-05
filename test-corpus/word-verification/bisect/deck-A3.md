# Bisect A3

## crossing-stress-bipartite

```mermaid
flowchart LR
    A1[A1] --> B1[B1]
    A1 --> B2[B2]
    A1 --> B3[B3]
    A2[A2] --> B1
    A2 --> B2
    A2 --> B4[B4]
    A3[A3] --> B2
    A3 --> B3
    A3 --> B4
    A4[A4] --> B1
    A4 --> B3
    A4 --> B4
    style A1 fill:#E1BEE7,stroke:#6A1B9A
    style B1 fill:#FFCDD2,stroke:#C62828
    style B2 fill:#FFF9C4,stroke:#F9A825
    style B3 fill:#BBDEFB,stroke:#1565C0
    style A2 fill:#C8E6C9,stroke:#2E7D32
    style B4 fill:#FFE0B2,stroke:#E65100
    style A3 fill:#E1BEE7,stroke:#6A1B9A
    style A4 fill:#FFCDD2,stroke:#C62828
```



## cycle

```mermaid
flowchart TD
    A[Etat A] --> B[Etat B]
    B --> C[Etat C]
    C --> A
    C --> D[Sortie]
    style A fill:#FFCDD2,stroke:#C62828
    style B fill:#FFF9C4,stroke:#F9A825
    style C fill:#BBDEFB,stroke:#1565C0
    style D fill:#C8E6C9,stroke:#2E7D32
```



## cynefin

```mermaid
cynefin-beta
  title Strategy Categorization

  complex
    "Market research"

  complicated
    "Competitive analysis"

  clear
    "Standard pricing"

  chaotic
    "Crisis management"

  complex --> complicated : "Pattern identified"
  complicated --> clear : "Best practice codified"
  clear --> chaotic : "Complacency"
  chaotic --> complex : "Stabilized"
```



## decision

```mermaid
flowchart TD
    A[Debut] --> B{Choix}
    B -->|oui| C[Action]
    B -->|non| D[Fin]
    C --> D
    style A fill:#FFF9C4,stroke:#F9A825
    style B fill:#BBDEFB,stroke:#1565C0
    style C fill:#C8E6C9,stroke:#2E7D32
    style D fill:#FFE0B2,stroke:#E65100
```


