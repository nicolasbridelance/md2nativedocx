# Bisect C

## medium-realistic

```mermaid
flowchart TD
    classDef process fill:#BDD7EE
    classDef gate fill:#FFE699
    classDef terminal fill:#C6E0B4
    Start([Demarrer]):::terminal --> Lire[Lire config]:::process
    Lire --> Valider{Config
 valide?}:::gate
    Valider -->|non| Erreur[Log erreur]:::terminal
    Erreur --> Stop([Arreter]):::terminal
    Valider -->|oui| Connect[Connecter API]:::process
    Connect --> Fetch[Recuperer donnees]:::process
    Fetch --> Clean[Nettoyer]:::process
    Clean --> Check{Donnees ok?}:::gate
    Check -->|non| Retry[Retenter]:::process
    Retry --> Check
    Check -->|oui| Save[Sauvegarder]:::process
    Save --> Notify[Notifier user]:::process
    Notify --> Stop
```


## mindmap

```mermaid
mindmap
  root((Project Plan))
    Research
      Market analysis
      Competitor review
      User interviews
    Design
      [Wireframes]
      )Moodboard(
        Colors
        Typography
    {{Engineering}}
      (Backend)
        API
        Database
      Frontend
    Launch
      ))Marketing((
      Support
```


## minimal

```mermaid
graph LR
    A --> B
    B --> C
    C --> A
    style A fill:#FFF9C4,stroke:#F9A825
    style B fill:#BBDEFB,stroke:#1565C0
    style C fill:#C8E6C9,stroke:#2E7D32
```


## mixed

```mermaid
flowchart TD
    classDef warn fill:#F4B183
    classDef ok fill:#A9D18E
    subgraph Validation[Validation]
        A[Requete] --> B{OK?}
        B -->|oui| C[Traiter]:::ok
        B -->|non| D[Rejeter]:::warn
    end
    C --> E([Reponse])
    D --> E
```


## multiple-subgraphs

```mermaid
flowchart LR
    subgraph Collecte[Collecte des donnees]
        A[API] --> B[Base]
        A --> C[Logs]
    end
    subgraph Traitement[Traitement]
        D[Propre] --> E[Aggrege]
        E --> F[Stocke]
    end
    subgraph Livraison[Livraison]
        G[Rapport] --> H[Email]
    end
    B --> D
    C --> D
    F --> G
    style A fill:#BBDEFB,stroke:#1565C0
    style B fill:#C8E6C9,stroke:#2E7D32
    style C fill:#FFE0B2,stroke:#E65100
    style D fill:#E1BEE7,stroke:#6A1B9A
    style E fill:#FFCDD2,stroke:#C62828
    style F fill:#FFF9C4,stroke:#F9A825
    style G fill:#BBDEFB,stroke:#1565C0
    style H fill:#C8E6C9,stroke:#2E7D32
```


## nested-3-levels

```mermaid
flowchart TD
    subgraph L1[Niveau 1]
        A[Un] --> B[Deux]
        subgraph L2[Niveau 2]
            C[Trois] --> D[Quatre]
            subgraph L3[Niveau 3]
                E[Cinq] --> F[Six]
            end
            D --> E
        end
        B --> C
    end
    F --> G[Sept]
    style A fill:#C8E6C9,stroke:#2E7D32
    style B fill:#FFE0B2,stroke:#E65100
    style C fill:#E1BEE7,stroke:#6A1B9A
    style D fill:#FFCDD2,stroke:#C62828
    style E fill:#FFF9C4,stroke:#F9A825
    style F fill:#BBDEFB,stroke:#1565C0
    style G fill:#C8E6C9,stroke:#2E7D32
```


## order-flow

```mermaid
flowchart TD
    A[Commande recue] --> B{Stock disponible?}
    B -->|oui| C[Reserver stock]
    B -->|non| D[Notifier rupture]
    C --> E[Preparer colis]
    E --> F{Adresse valide?}
    F -->|oui| G[Expedier]
    F -->|non| H[Corriger adresse]
    H --> F
    G --> I[Notifier client]
    D --> J[Fin]
    I --> J
    style A fill:#FFE0B2,stroke:#E65100
    style B fill:#E1BEE7,stroke:#6A1B9A
    style C fill:#FFCDD2,stroke:#C62828
    style D fill:#FFF9C4,stroke:#F9A825
    style E fill:#BBDEFB,stroke:#1565C0
    style F fill:#C8E6C9,stroke:#2E7D32
    style G fill:#FFE0B2,stroke:#E65100
    style H fill:#E1BEE7,stroke:#6A1B9A
    style I fill:#FFCDD2,stroke:#C62828
    style J fill:#FFF9C4,stroke:#F9A825
```


## packet

```mermaid
---
title: "TCP Packet"
---
packet
0-15: "Source Port"
16-31: "Destination Port"
32-63: "Sequence Number"
64-95: "Acknowledgment Number"
96-99: "Data Offset"
100-105: "Reserved"
106: "URG"
107: "ACK"
108: "PSH"
109: "RST"
110: "SYN"
111: "FIN"
112-127: "Window"
128-143: "Checksum"
144-159: "Urgent Pointer"
160-191: "(Options and Padding)"
192-255: "Data (variable length)"
```


## pie

```mermaid
pie showData
    title Key elements in Product X
    "Calcium" : 42.96
    "Potassium" : 50.05
    "Magnesium" : 10.01
    "Iron" :  5
```


## quadrant

```mermaid
quadrantChart
    title Reach and engagement of campaigns
    x-axis Low Reach --> High Reach
    y-axis Low Engagement --> High Engagement
    quadrant-1 We should expand
    quadrant-2 Need to promote
    quadrant-3 Re-evaluate
    quadrant-4 May be improved
    Campaign A: [0.3, 0.6] color: #1565C0
    Campaign B: [0.45, 0.23] color: #1565C0
    Campaign C: [0.57, 0.69] color: #ff3300
    Campaign D: [0.78, 0.34] color: #1565C0
```


## radar

```mermaid
radar-beta
  title Grades
  axis m["Math"], s["Science"], e["English"]
  axis h["History"], g["Geography"], a["Art"]
  curve a["Alice"]{85, 90, 80, 70, 75, 90}
  curve b["Bob"]{70, 75, 85, 80, 90, 85}
  max 100
  graticule polygon
  ticks 4
```


## requirement-diagram

```mermaid
requirementDiagram
  requirement test_req {
    id: 1
    text: the test text.
    risk: high
    verifymethod: test
  }
  functionalRequirement test_req2 {
    id: 1.1
    text: the second test text.
    risk: low
    verifymethod: inspection
  }
  element test_entity {
    type: simulation
  }
  test_entity - satisfies -> test_req
  test_req - traces -> test_req2
  test_req <- derives - test_req2
```


## rich-text

```mermaid
flowchart TD
    A["Ligne1<br/>Ligne2"] -->|"`**Oui**`"| B["`**gras** et _italique_ et normal`"]
    B --> C[Pas de **markup** ici, texte classique]
    style A fill:#E1BEE7,stroke:#6A1B9A
    style B fill:#FFCDD2,stroke:#C62828
    style C fill:#FFF9C4,stroke:#F9A825
```


## rl-direction

```mermaid
flowchart RL
    A[Entree] --> B[Traitement]
    B --> C{Valide?}
    C -->|oui| D[Sortie]
    C -->|non| E[Erreur]
    style A fill:#FFCDD2,stroke:#C62828
    style B fill:#FFF9C4,stroke:#F9A825
    style C fill:#BBDEFB,stroke:#1565C0
    style D fill:#C8E6C9,stroke:#2E7D32
    style E fill:#FFE0B2,stroke:#E65100
```


## sankey

```mermaid
sankey-beta

Agricultural 'waste',Bio-conversion,124.729
Bio-conversion,Liquid,0.597
Bio-conversion,Solid,26.862
Bio-conversion,Gas,280.322
Bio-conversion,Losses,10
Coal imports,Coal,11.606
Coal,Solid,75.571
Gas,Heating,79.5
Solid,Heating,40.2
Liquid,Heating,2
```


## self-loop

```mermaid
flowchart TD
    A[Depart] --> B[En cours]
    B -->|retry| B
    B --> C[Fin]
    style A fill:#FFF9C4,stroke:#F9A825
    style B fill:#BBDEFB,stroke:#1565C0
    style C fill:#C8E6C9,stroke:#2E7D32
```

