# Bisect A

## architecture-diagram

```mermaid
architecture-beta
  group public_api(cloud)[Public API]

  service database1(database)[My Database] in public_api
  service server(server)[Server] in public_api
  service disk1(disk)[Storage] in public_api
  service gateway(internet)[Gateway]
  junction j1

  gateway:B --> T:server
  server:R --> L:database1
  server:B -- T:j1
  j1:R -- L:disk1
```


## bidirectional

```mermaid
flowchart LR
    A[Client] --> B[Cache]
    B --> A
    B --> C[Base]
    C --> B
    C --> D[Log]
    D --> B
    A --> E[Direct]
    style A fill:#BBDEFB,stroke:#1565C0
    style B fill:#C8E6C9,stroke:#2E7D32
    style C fill:#FFE0B2,stroke:#E65100
    style D fill:#E1BEE7,stroke:#6A1B9A
    style E fill:#FFCDD2,stroke:#C62828
```


## block

```mermaid
block-beta
    columns 3
    doc["Document"] space:1 db[("Database")]
    block:pipeline:3
        columns 3
        parse["Parse"] layout("Layout") emit(["Emit"])
    end
    a["Input"] space b(("Out"))
    doc --> parse
    emit --> db
    a -- "text" --> b
    style a fill:#fde68a,stroke:#b45309
```


## bt-direction

```mermaid
flowchart BT
    A[Entree] --> B[Traitement]
    B --> C{Valide?}
    C -->|oui| D[Sortie]
    C -->|non| E[Erreur]
    style A fill:#C8E6C9,stroke:#2E7D32
    style B fill:#FFE0B2,stroke:#E65100
    style C fill:#E1BEE7,stroke:#6A1B9A
    style D fill:#FFCDD2,stroke:#C62828
    style E fill:#FFF9C4,stroke:#F9A825
```


## c4

```mermaid
C4Container
    title Container diagram for Internet Banking System

    System_Ext(email_system, "E-Mail System", "The internal Microsoft Exchange system")
    Person(customer, "Customer", "A customer of the bank, with personal bank accounts")

    Container_Boundary(c1, "Internet Banking") {
        Container(spa, "Single-Page App", "JavaScript, Angular", "Provides all the Internet banking functionality to customers via their web browser")
        Container_Ext(mobile_app, "Mobile App", "C#, Xamarin", "Provides a limited subset of the Internet banking functionality to customers via their mobile device")
        Container(web_app, "Web Application", "Java, Spring MVC", "Delivers the static content and the Internet banking SPA")
        ContainerDb(database, "Database", "SQL Database", "Stores user registration information, hashed auth credentials, access logs, etc.")
        ContainerDb_Ext(backend_api, "API Application", "Java, Docker Container", "Provides Internet banking functionality via API")
    }

    System_Ext(banking_system, "Mainframe Banking System", "Stores all of the core banking information about customers, accounts, transactions, etc.")

    Rel(customer, web_app, "Uses", "HTTPS")
    Rel(customer, spa, "Uses", "HTTPS")
    Rel(customer, mobile_app, "Uses")

    Rel(web_app, spa, "Delivers")
    Rel(spa, backend_api, "Uses", "async, JSON/HTTPS")
    Rel(mobile_app, backend_api, "Uses", "async, JSON/HTTPS")
    Rel_Back(database, backend_api, "Reads from and writes to", "sync, JDBC")

    Rel(email_system, customer, "Sends e-mails to")
    Rel(backend_api, email_system, "Sends e-mails using", "sync, SMTP")
    Rel(backend_api, banking_system, "Uses", "sync/async, XML/HTTPS")
```


## class-diagram

```mermaid
classDiagram
  direction LR
  class Animal {
    +String name
    +int age
    +makeSound() void
  }
  class Dog {
    +String breed
    +bark() void
  }
  class Cat {
    +bark() void
  }
  class Owner {
    +String name
    +feed(Animal a) void
  }
  Animal <|-- Dog
  Animal <|-- Cat
  Owner "1" --> "many" Animal : owns
  Owner *-- Address : has
  class Address {
    +String street
    +String city
  }
```


## colors

```mermaid
flowchart TD
    classDef clair fill:#D9E2F3
    classDef sombre fill:#1F3864
    A[Fond clair]:::clair --> B[Fond sombre]:::sombre
    classDef alerte stroke:#CC0000,fill:#FFD9D9
    B --> C[Alerte]:::alerte
    C --> D[Style direct]
    style D fill:#FFDD00,stroke:#333333
    D --> E[Lien vert]
    classDef partagee1,partagee2 stroke:#0000CC,fill:#CCE5FF
    E --> F[Classe partagee]:::partagee1
    F --> G[Autre classe partagee]:::partagee2
    linkStyle 3 stroke:#00AA00,stroke-width:3px
```


## crossing-stress-15node

```mermaid
flowchart TD
    Start([Start]) --> Gate1{Gate 1}
    Gate1 -->|a| N1[N1]
    Gate1 -->|b| N2[N2]
    Gate1 -->|c| N3[N3]
    N1 --> Merge1[Merge 1]
    N2 --> Merge1
    N2 --> N4[N4]
    N3 --> N4
    N3 --> Skip[Skip target]
    Merge1 --> Gate2{Gate 2}
    N4 --> Gate2
    Gate2 -->|x| N5[N5]
    Gate2 -->|y| N6[N6]
    N5 --> Merge2[Merge 2]
    N6 --> Merge2
    Skip --> Merge2
    Merge2 --> End([End])
    style Start fill:#FFE0B2,stroke:#E65100
    style Gate1 fill:#E1BEE7,stroke:#6A1B9A
    style N1 fill:#FFCDD2,stroke:#C62828
    style N2 fill:#FFF9C4,stroke:#F9A825
    style N3 fill:#BBDEFB,stroke:#1565C0
    style Merge1 fill:#C8E6C9,stroke:#2E7D32
    style N4 fill:#FFE0B2,stroke:#E65100
    style Skip fill:#E1BEE7,stroke:#6A1B9A
    style Gate2 fill:#FFCDD2,stroke:#C62828
    style N5 fill:#FFF9C4,stroke:#F9A825
    style N6 fill:#BBDEFB,stroke:#1565C0
    style Merge2 fill:#C8E6C9,stroke:#2E7D32
    style End fill:#FFE0B2,stroke:#E65100
```


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


## dense

```mermaid
flowchart LR
    A[Init] --> B[Parse]
    B --> C[Analyse]
    B --> D[Optim]
    B --> E[Emet]
    C --> F[AST]
    C --> G[IL]
    D --> G
    D --> H[Reg]
    E --> I[Codegen]
    F --> I
    G --> I
    H --> I
    I --> J[Sortie]
    style A fill:#BBDEFB,stroke:#1565C0
    style B fill:#C8E6C9,stroke:#2E7D32
    style C fill:#FFE0B2,stroke:#E65100
    style D fill:#E1BEE7,stroke:#6A1B9A
    style E fill:#FFCDD2,stroke:#C62828
    style F fill:#FFF9C4,stroke:#F9A825
    style G fill:#BBDEFB,stroke:#1565C0
    style H fill:#C8E6C9,stroke:#2E7D32
    style I fill:#FFE0B2,stroke:#E65100
    style J fill:#E1BEE7,stroke:#6A1B9A
```


## direction-and-asymmetric-shape

```mermaid
flowchart RL
    Start[Debut] --> Flag>Etape asymetrique]
    Flag --> Check{Decision}
    Check -->|oui| End[Fin]
    Check -->|non| Flag
    style Start fill:#C8E6C9,stroke:#2E7D32
    style Flag fill:#FFE0B2,stroke:#E65100
    style Check fill:#E1BEE7,stroke:#6A1B9A
    style End fill:#FFCDD2,stroke:#C62828
```


## edge-chaining

```mermaid
flowchart TD
    A[Depart] --> B[Etape 2] --> C[Etape 3] --> D[Fin]
    E[Source] --> F[Cible 1] & G[Cible 2]
    H[Origine 1] & I[Origine 2] --> J[Fusion]
    style A fill:#FFE0B2,stroke:#E65100
    style B fill:#E1BEE7,stroke:#6A1B9A
    style C fill:#FFCDD2,stroke:#C62828
    style D fill:#FFF9C4,stroke:#F9A825
    style E fill:#BBDEFB,stroke:#1565C0
    style F fill:#C8E6C9,stroke:#2E7D32
    style G fill:#FFE0B2,stroke:#E65100
    style H fill:#E1BEE7,stroke:#6A1B9A
    style J fill:#FFCDD2,stroke:#C62828
    style I fill:#FFF9C4,stroke:#F9A825
```


## edge-labels

```mermaid
flowchart TD
    A[Debut] -->|etape 1| B[Action]
    B ---|sans fleche| C[Suite]
    C -.->|optionnel| D{Test}
    D ==>|si vrai| E[Rapide]
    D -->|si faux| F[Lent]
    F --> G[Repeter] --> A
    H[Autre depart]-- syntaxe mediane -->I[Suite mediane]
    I-. mediane pointillee .->J[Fin mediane]
    style A fill:#E1BEE7,stroke:#6A1B9A
    style B fill:#FFCDD2,stroke:#C62828
    style C fill:#FFF9C4,stroke:#F9A825
    style D fill:#BBDEFB,stroke:#1565C0
    style E fill:#C8E6C9,stroke:#2E7D32
    style F fill:#FFE0B2,stroke:#E65100
    style G fill:#E1BEE7,stroke:#6A1B9A
    style H fill:#FFCDD2,stroke:#C62828
    style I fill:#FFF9C4,stroke:#F9A825
    style J fill:#BBDEFB,stroke:#1565C0
```

