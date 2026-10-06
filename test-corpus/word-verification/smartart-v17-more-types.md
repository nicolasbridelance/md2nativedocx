# SmartArt v17 — journey, timeline with sections, kanban, gitGraph, state machine, class inheritance

## 1. Journey (grouped time line: a bar per section, cards alternating above/below)
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

## 2. Timeline with sections (grouped time line; sections as wide as their periods)
```mermaid
timeline
    section Conception
        Janvier : Cadrage
        Février : Maquettes
    section Réalisation
        Mars : Développement
        Avril : Recette
        Mai : Pilote
```

## 3. Kanban (grouped list: column headers, cards stacked)
```mermaid
kanban
  todo[À faire]
    a[Rédiger la doc]@{ assigned: 'Léa' }
    b[Préparer la démo]
    c[Relire le contrat]@{ ticket: MC-12, priority: 'High' }
  doing[En cours]
    d[Maquettes]@{ assigned: 'Tom', priority: 'Low' }
  done[Terminé]
    e[Cadrage]
    f[Budget validé]
```

## 4. gitGraph, main branch only (process)
```mermaid
gitGraph
    commit id: "Init"
    commit id: "Ajout API"
    commit id: "Correctif" tag: "v1.0"
    commit id: "Doc"
```

## 5. State machine, loop (cycle)
```mermaid
stateDiagram-v2
    [*] --> Brouillon
    Brouillon --> Relecture : soumettre
    Relecture --> Publié : valider
    Publié --> Archivé : expirer
    Archivé --> Brouillon : rouvrir
```

## 6. Class inheritance (hierarchy, members in the boxes)
```mermaid
classDiagram
    Animal <|-- Chien
    Animal <|-- Chat
    Animal : +String nom
    Animal : +manger()
    Chien : +aboyer()
    Chat : +miauler()
```

## 7. gitGraph with a branch (must stay plain Word shapes)
```mermaid
gitGraph
    commit
    branch dev
    commit
    checkout main
    merge dev
```

## 8. Class diagram with an association (must stay plain Word shapes)
```mermaid
classDiagram
    Client --> Commande : passe
    Commande --> Produit
```
