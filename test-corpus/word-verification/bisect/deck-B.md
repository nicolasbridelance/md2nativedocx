# Bisect B

## edge-types-extended

```mermaid
flowchart TD
    F[Fin] -.- G[Ligne pointillee]
    G === H[Ligne epaisse]
    H <--> I[Bidirectionnel]
    I --o J[Tete cercle]
    J --x K[Tete croix]
    K o--o L[Cercle des deux cotes]
    L x--x M[Croix des deux cotes]
    M ~~~ N[Invisible]
    style F fill:#FFCDD2,stroke:#C62828
    style G fill:#FFF9C4,stroke:#F9A825
    style H fill:#BBDEFB,stroke:#1565C0
    style I fill:#C8E6C9,stroke:#2E7D32
    style J fill:#FFE0B2,stroke:#E65100
    style K fill:#E1BEE7,stroke:#6A1B9A
    style L fill:#FFCDD2,stroke:#C62828
    style M fill:#FFF9C4,stroke:#F9A825
    style N fill:#BBDEFB,stroke:#1565C0
```


## edge-types

```mermaid
flowchart LR
    A[Depart] --> B[Fleche]
    B --- C[Ligne]
    C -.-> D[Pointille]
    D ==> E[Epais]
    E -->|avec label| F[Fin]
    style A fill:#FFF9C4,stroke:#F9A825
    style B fill:#BBDEFB,stroke:#1565C0
    style C fill:#C8E6C9,stroke:#2E7D32
    style D fill:#FFE0B2,stroke:#E65100
    style E fill:#E1BEE7,stroke:#6A1B9A
    style F fill:#FFCDD2,stroke:#C62828
```


## er-diagram

```mermaid
erDiagram
  CUSTOMER {
    int id PK
    string email UK
    string name
  }
  ORDER {
    int id PK
    int customer_id FK
    string status
  }
  LINE-ITEM {
    int id PK
    int order_id FK
    string product
  }
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE-ITEM : contains
  CUSTOMER }|..|{ LINE-ITEM : "reviews"
```


## escape-xml

```mermaid
flowchart TD
    A["Requete <GET> & valeur"] --> B{Valide?}
    B -->|"oui"| C["Resultat <OK>"]
    B -->|"non"| D["Erreur 500 & echec"]
    C --> E["Sauver 'donnees' & finir"]
```


## eventmodeling

```mermaid
eventmodeling
tf 01 ui CartScreen
tf 02 cmd AddItem [[AddItem01]]
tf 03 evt ItemAdded ->> 02 {"itemId": "42", "qty": 1}
tf 04 rmo CartItems ->> 03
tf 05 ui CartScreenUpdated ->> 04
tf 06 pcr PriceCalculator ->> 04
tf 07 cmd ApplyDiscount ->> 06
tf 08 evt Billing.DiscountApplied ->> 07
rf 09 ui Checkout ->> 04
tf 10 cmd Pay ->> 09
tf 11 evt Billing.Paid ->> 10
data AddItem01 {
  description: 'john'
  price: 20.4
}
note 03 {
  stock reserved elsewhere
}
gwt 03 given evt ItemAdded when cmd AddItem then evt ItemAdded
```


## fan-out

```mermaid
flowchart TD
    A[Repartiteur] --> B[Branche 1]
    A --> C[Branche 2]
    A --> D[Branche 3]
    B --> E[Fin]
    C --> E
    D --> E
    style A fill:#BBDEFB,stroke:#1565C0
    style B fill:#C8E6C9,stroke:#2E7D32
    style C fill:#FFE0B2,stroke:#E65100
    style D fill:#E1BEE7,stroke:#6A1B9A
    style E fill:#FFCDD2,stroke:#C62828
```


## gantt

```mermaid
gantt
    title Adoption d'un logiciel
    dateFormat YYYY-MM-DD
    excludes weekends
    section Cadrage
    Recueil besoins      :done,    des1, 2026-01-05, 5d
    Choix outil          :active,  des2, after des1, 3d
    section Deploiement
    Formation            :crit,    des3, after des2, 4d
    Go-live              :milestone, des4, after des3, 0d
    Suivi post go-live   :         des5, after des4, 10d
```


## git-graph

```mermaid
gitGraph
    commit id: "ZERO"
    branch develop
    branch release
    commit id:"A"
    checkout main
    commit id:"ONE"
    checkout develop
    commit id:"B"
    checkout main
    merge develop id:"MERGE"
    commit id:"TWO"
    checkout release
    cherry-pick id:"MERGE" parent:"B"
    commit id:"THREE"
    checkout develop
    commit id:"C"
```


## ishikawa

```mermaid
ishikawa-beta
    Blurry Photo
    Process
        Out of focus
        Shutter speed too slow
        Protective film not removed
        Beautification filter applied
    User
        Shaky hands
    Equipment
        LENS
            Inappropriate lens
            Damaged lens
            Dirty lens
        SENSOR
            Damaged sensor
            Dirty sensor
    Environment
        Subject moved too quickly
        Too dark
```


## isolated

```mermaid
flowchart TD
    A[Entree]
    B[Noeud isole 2]
    C --> D
    A --> E[Rejoint le graphe]
    F[Noeud isole] --> G[Lien seul]
    style A fill:#C8E6C9,stroke:#2E7D32
    style B fill:#FFE0B2,stroke:#E65100
    style C fill:#E1BEE7,stroke:#6A1B9A
    style D fill:#FFCDD2,stroke:#C62828
    style E fill:#FFF9C4,stroke:#F9A825
    style F fill:#BBDEFB,stroke:#1565C0
    style G fill:#C8E6C9,stroke:#2E7D32
```


## journey

```mermaid
journey
    title My working day
    section Go to work
      Make tea: 5: Me
      Go upstairs: 3: Me
      Do work: 1: Me, Cat
    section Go home
      Go downstairs: 5: Me
      Sit down: 5: Me
```


## kanban

```mermaid
kanban
  Todo
    [Create Documentation]
    docs[Create Blog about the new diagram]
  [In progress]
    id6[Create renderer so that it works in all cases. We also add some extra text here for testing purposes. And some more just for the extra flare.]
  id9[Ready for deploy]
    id8[Design grammar]@{ assigned: 'knsv' }
  id10[Ready for test]
    id4[Create parsing tests]@{ ticket: MC-2038, assigned: 'K.Sveidqvist', priority: 'High' }
    id66[last item]@{ priority: 'Very Low', assigned: 'knsv' }
  id11[Done]
    id5[define getData]
    id2[Title of diagram is more than 100 chars when user duplicates diagram with 100 char]@{ ticket: MC-2036, priority: 'Very High'}
    id3[Update DB function]@{ ticket: MC-2037, assigned: knsv, priority: 'High' }

  id12[Can't reproduce]
    id3[Weird flickering in Firefox]
```


## long-labels

```mermaid
flowchart TD
    A[Ceci est un label assez long pour deborder] --> B[Court]
    B --> C[Un autre label qui depasse la largeur du noeud]
    style A fill:#FFE0B2,stroke:#E65100
    style B fill:#E1BEE7,stroke:#6A1B9A
    style C fill:#FFCDD2,stroke:#C62828
```


## lr-direction

```mermaid
flowchart LR
    A[Entree] --> B[Traitement]
    B --> C{Valide?}
    C -->|oui| D[Sortie]
    C -->|non| E[Erreur]
    style A fill:#E1BEE7,stroke:#6A1B9A
    style B fill:#FFCDD2,stroke:#C62828
    style C fill:#FFF9C4,stroke:#F9A825
    style D fill:#BBDEFB,stroke:#1565C0
    style E fill:#C8E6C9,stroke:#2E7D32
```


## lr-subgraphs

```mermaid
flowchart LR
    subgraph Nord[Nord]
        A[Paris] --> B[Rouen]
        B --> C[Le Havre]
    end
    subgraph Sud[Sud]
        D[Marseille] --> E[Toulon]
        D --> F[Nice]
    end
    subgraph Ouest[Ouest]
        G[Nantes] --> H[Brest]
    end
    C --> G
    E --> G
    style A fill:#FFCDD2,stroke:#C62828
    style B fill:#FFF9C4,stroke:#F9A825
    style C fill:#BBDEFB,stroke:#1565C0
    style D fill:#C8E6C9,stroke:#2E7D32
    style E fill:#FFE0B2,stroke:#E65100
    style F fill:#E1BEE7,stroke:#6A1B9A
    style G fill:#FFCDD2,stroke:#C62828
    style H fill:#FFF9C4,stroke:#F9A825
```

