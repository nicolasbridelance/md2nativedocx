# SmartArt v16 — timeline as a SmartArt time line, line breaks and bold/italic in SmartArt boxes

## 1. Timeline with a title (SmartArt time line; title as a bold paragraph above)

```mermaid
timeline
    title History of Social Media Platform
    2002 : LinkedIn
    2004 : Facebook
         : Google
    2005 : YouTube
    2006 : Twitter
```

## 2. Timeline, six periods, up to three events each (boxes alternate above/below the axis)

```mermaid
timeline
    Janvier : Cadrage
    Février : Maquettes : Tests utilisateurs
    Mars : Développement : Revue de code : Recette
    Avril : Pilote
    Mai : Déploiement : Formation
    Juin : Bilan
```

## 3. Flowchart chain with line breaks (`<br/>`)

```mermaid
flowchart LR
  A[Demande<br/>client] --> B[Analyse<br/>du besoin] --> C[Devis] --> D[Signature<br/>du contrat]
```

## 4. Flowchart tree with bold and italic (Markdown strings)

```mermaid
flowchart TD
  R["`**Direction**`"] --> A["`Équipe *produit*`"]
  R --> B["`Équipe **technique**`"]
```

## 5. Cycle with three-line boxes

```mermaid
flowchart LR
  P[Plan<br/>objectifs<br/>budget] --> D[Do<br/>réaliser] --> C[Check<br/>mesurer] --> A[Act<br/>ajuster] --> P
```

## 6. Timeline, twelve periods with long words (must stay plain Word shapes: too crowded for SmartArt)

```mermaid
timeline
    Janvier : Anticonstitutionnellement
    Février : Anticonstitutionnellement
    Mars : Anticonstitutionnellement
    Avril : Anticonstitutionnellement
    Mai : Anticonstitutionnellement
    Juin : Anticonstitutionnellement
    Juillet : Anticonstitutionnellement
    Août : Anticonstitutionnellement
    Septembre : Anticonstitutionnellement
    Octobre : Anticonstitutionnellement
    Novembre : Anticonstitutionnellement
    Décembre : Anticonstitutionnellement
```

## 7. Timeline with sections (must stay plain Word shapes)

```mermaid
timeline
    section Avant
      2002 : LinkedIn
    section Après
      2006 : Twitter
```
