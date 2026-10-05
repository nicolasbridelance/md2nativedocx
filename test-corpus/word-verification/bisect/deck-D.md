# Bisect D

## sequence

```mermaid
sequenceDiagram
    title Checkout
    autonumber
    actor U as User
    participant W as Web App
    participant API
    participant DB as Database
    U->>+W: Place order
    W->>API: POST /orders
    activate API
    API->>DB: INSERT order
    DB-->>API: ok
    API-xW: Payment declined
    Note over API,DB: Retried 3 times
    loop Every minute
        W-)API: poll status
    end
    alt paid
        API-->>-W: 200 OK
    else failed
        API--)W: 402
        API->>API: log failure
    end
    Note right of W: done
    create participant M as Mailer
    W->>M: send receipt
    destroy M
    M-->>W: sent
    W-->>-U: Confirmation
```


## shapes-generic

```mermaid
flowchart TD
    A1@{ shape: doc, label: "Document" } --> A2@{ shape: card, label: "Carte" }
    A2 --> A3@{ shape: delay, label: "Delai" }
    A3 --> A4@{ shape: triangle, label: "Extraction" }
    A4 --> A5@{ shape: flipped-triangle, label: "Fichier manuel" }
    A5 --> A6@{ shape: win-pane, label: "Stockage interne" }
    A6 --> A7@{ shape: hourglass, label: "Collationnement" }
    A7 --> A8@{ shape: curv-trap, label: "Affichage" }
    A8 --> A9@{ shape: com-link, label: "Liaison" }
    A9 --> A10@{ shape: brace, label: "Commentaire" }
    A10 --> A11@{ shape: braces, label: "Double accolade" }
    A11 --> A12@{ shape: crossed-circle, label: "Resume" }
    A12 --> A13@{ shape: junction, label: "Jonction" }
    A13 --> A14@{ shape: paper-tape, label: "Bande papier" }
    A14 --> A15@{ shape: das, label: "Acces direct" }
    A15 --> A16@{ shape: disk, label: "Disque" }
    A16 --> A17@{ shape: manual-input, label: "Saisie manuelle" }
    A17 --> A18@{ shape: rounded, label: "Evenement" }
    style A1 fill:#BBDEFB,stroke:#1565C0
    style A2 fill:#C8E6C9,stroke:#2E7D32
    style A3 fill:#FFE0B2,stroke:#E65100
    style A4 fill:#E1BEE7,stroke:#6A1B9A
    style A5 fill:#FFCDD2,stroke:#C62828
    style A6 fill:#FFF9C4,stroke:#F9A825
    style A7 fill:#BBDEFB,stroke:#1565C0
    style A8 fill:#C8E6C9,stroke:#2E7D32
    style A9 fill:#FFE0B2,stroke:#E65100
    style A10 fill:#E1BEE7,stroke:#6A1B9A
    style A11 fill:#FFCDD2,stroke:#C62828
    style A12 fill:#FFF9C4,stroke:#F9A825
    style A13 fill:#BBDEFB,stroke:#1565C0
    style A14 fill:#C8E6C9,stroke:#2E7D32
    style A15 fill:#FFE0B2,stroke:#E65100
    style A16 fill:#E1BEE7,stroke:#6A1B9A
    style A17 fill:#FFCDD2,stroke:#C62828
    style A18 fill:#FFF9C4,stroke:#F9A825
```


## shapes

```mermaid
flowchart TD
    R[Rectangle]
    RR(Arrondi)
    ST([Stade])
    DI{Losange}
    CY[(Cylindre)]
    EL((Ellipse))
    R --> RR --> ST --> DI --> CY --> EL
    HX{{Hexagone}}
    PA[/Parallelogramme/]
    PB[\Parallelogramme miroir\]
    TA[/Trapeze\]
    TB[\Trapeze miroir/]
    SR[[Sous-routine]]
    DC(((Double cercle)))
    AS>Asymetrique]
    EL --> HX --> PA --> PB --> TA --> TB --> SR --> DC --> AS
    style R fill:#C8E6C9,stroke:#2E7D32
    style RR fill:#FFE0B2,stroke:#E65100
    style ST fill:#E1BEE7,stroke:#6A1B9A
    style DI fill:#FFCDD2,stroke:#C62828
    style CY fill:#FFF9C4,stroke:#F9A825
    style EL fill:#BBDEFB,stroke:#1565C0
    style HX fill:#C8E6C9,stroke:#2E7D32
    style PA fill:#FFE0B2,stroke:#E65100
    style PB fill:#E1BEE7,stroke:#6A1B9A
    style TA fill:#FFCDD2,stroke:#C62828
    style TB fill:#FFF9C4,stroke:#F9A825
    style SR fill:#BBDEFB,stroke:#1565C0
    style DC fill:#C8E6C9,stroke:#2E7D32
    style AS fill:#FFE0B2,stroke:#E65100
```


## state-diagram

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Loading : fetch
  Loading --> choice1
  state choice1 <<choice>>
  choice1 --> Success : ok
  choice1 --> Error : fail
  Success --> Idle : reset
  Error --> Idle : retry
  Idle --> [*]
```


## subgraph

```mermaid
flowchart TD
    subgraph Externe[Groupe externe]
        A[Un] --> B[Deux]
        subgraph Interne[Groupe interne]
            C[Trois] --> D[Quatre]
        end
        B --> C
    end
    D --> E[Cinq]
    style A fill:#FFE0B2,stroke:#E65100
    style B fill:#E1BEE7,stroke:#6A1B9A
    style C fill:#FFCDD2,stroke:#C62828
    style D fill:#FFF9C4,stroke:#F9A825
    style E fill:#BBDEFB,stroke:#1565C0
```


## swimlane

```mermaid
swimlane-beta LR
  subgraph Customer[Customer]
    Order[Place order]
    Pay(Pay invoice)
  end
  subgraph Store[Store]
    Pack[Pack items]
    Decision{In stock?}
  end
  subgraph Carrier[Carrier]
    Ship([Ship package])
  end

  Order --> Decision
  Decision -->|Yes| Pack
  Decision -->|No| Order
  Pack --> Ship
  Ship --> Pay
    style Order fill:#E1BEE7,stroke:#6A1B9A
    style Pay fill:#FFCDD2,stroke:#C62828
    style Pack fill:#FFF9C4,stroke:#F9A825
    style Decision fill:#BBDEFB,stroke:#1565C0
    style Ship fill:#C8E6C9,stroke:#2E7D32
```


## timeline

```mermaid
timeline
        title England's History Timeline
        section Stone Age
          7600 BC : Britain's oldest known house was built in Orkney, Scotland
          6000 BC : Sea levels rise and Britain becomes an island.<br> The people who live here are hunter-gatherers.
        section Bronze Age
          2300 BC : People arrive from Europe and settle in Britain. <br>They bring farming and metalworking.
                  : New styles of pottery and ways of burying the dead appear.
          2200 BC : The last major building works are completed at Stonehenge.<br> People now bury their dead in stone circles.
                  : The first metal objects are made in Britain.Some other nice things happen. it is a good time to be alive.
```


## tree-view

```mermaid
treeView-beta
    "packages/"
        "core/" ## the moat
            "src/"
                parser/
                translator/
                index.ts:::highlight
            package.json
        cli/
        "README file.md" ## quick start
    docs/
        specs/
```


## tree

```mermaid
flowchart TD
    Racine[Racine] --> N1[Noeud L1] --> N1a[Feuille]
    N1 --> N1b[Feuille]
    Racine --> N2[Noeud L1 bis]
    N2 --> N2a[Feuille]
    N2 --> N2b[Feuille]
    N2 --> N2c[Feuille]
    style Racine fill:#FFCDD2,stroke:#C62828
    style N1 fill:#FFF9C4,stroke:#F9A825
    style N1a fill:#BBDEFB,stroke:#1565C0
    style N1b fill:#C8E6C9,stroke:#2E7D32
    style N2 fill:#FFE0B2,stroke:#E65100
    style N2a fill:#E1BEE7,stroke:#6A1B9A
    style N2b fill:#FFCDD2,stroke:#C62828
    style N2c fill:#FFF9C4,stroke:#F9A825
```


## treemap

```mermaid
treemap-beta
"Products"
    "Electronics"
        "Phones": 50
        "Computers": 30
        "Accessories": 20
    "Clothing"
        "Men's": 40
        "Women's":::important
            "Dresses": 25
            "Tops": 15
"Services"
    "Support": 35
    "Consulting": 12
    "Training": 8

classDef important fill:#f96,stroke:#333,color:#000;
```


## venn

```mermaid
venn-beta
  title Skills coverage
  set A ["Design"]
  set B ["Code"]
  set C ["Writing"]
  union A,B
    text ["Design+Code"]
  union B,C
    text ["Code+Writing"]
  union A,C
    text ["Design+Writing"]
  union A,B,C
    text ["All three"]
  style A fill:#BBDEFB
  style B fill:#C8E6C9
  style C fill:#FFE0B2
```


## wardley

```mermaid
wardley-beta
title Tea Shop
size [1000, 640]
anchor Business [0.95, 0.63]
anchor Public [0.95, 0.78]
component Cup of Tea [0.79, 0.61] label [-85, 10]
component Cup [0.73, 0.78]
component Tea [0.63, 0.81]
component Hot Water [0.52, 0.80]
component Water [0.38, 0.82] (buy)
component Kettle [0.43, 0.35] (inertia)
component Boiler [0.30, 0.20] (build)
component Power [0.1, 0.7] (outsource)
pipeline Kettle {
  component "Electric Kettle" [0.64]
  component "Gas Kettle" [0.46]
}
Business->Cup of Tea
Public->Cup of Tea
Cup of Tea->Cup
Cup of Tea->Tea
Cup of Tea->Hot Water
Hot Water->Water
Hot Water->Kettle; boils
Kettle -.-> Power
Boiler -> Power
Tea +<> Water
evolve Kettle 0.62
note "Standardising power allows Kettles to evolve faster" [0.07, 0.45]
annotations [0.12, 0.02]
annotation 1,[0.20,0.30] "Standardising power"
accelerator "Open Source" [0.62, 0.30]
```


## xychart-horizontal

```mermaid
xychart horizontal
    title "Team velocity"
    x-axis "Sprint" ["S1", "S2", "S3", "S4"]
    y-axis "Points" 0 --> 40
    bar "Planned" [30, 32, 28, 35]
    line "Done" [25 "late", 31, 27, 36]
```


## xychart

```mermaid
xychart-beta
    title "Sales Revenue"
    x-axis [jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec]
    y-axis "Revenue (in $)" 4000 --> 11000
    bar [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]
    line [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]
```


## zenuml

```mermaid
zenuml
    title Booking
    @Actor Client
    @Database DB
    Booking as Booking Service
    Client->Booking.book(id) {
      DB.find(id) {
        return row
      }
      if(available) {
        order = DB.save(id)
        new Mailer(id)
      } else {
        return sold_out
      }
      while(retry) {
        Booking->DB: poll
      }
      return ok
    }
    try {
      Client->Booking: confirm
    } catch {
      Client->Booking: cancel
    }
    opt {
      Booking.audit()
    }
```
