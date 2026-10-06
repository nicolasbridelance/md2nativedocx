# SmartArt — arbres à plusieurs niveaux, quatre directions (v12)

Même arbre dans les quatre directions, puis un arbre large et un arbre profond. Tous en **SmartArt**.

## 1. De gauche à droite (`LR`)

```mermaid
flowchart LR
  R[Projet] --> A[Conception]
  R --> B[Réalisation]
  R --> C[Recette]
  A --> A1[Maquettes]
  A --> A2[Spécifications]
  B --> B1[Développement]
  B1 --> B1x[Revue de code]
```

## 2. De bas en haut (`BT`)

```mermaid
flowchart BT
  R[Projet] --> A[Conception]
  R --> B[Réalisation]
  R --> C[Recette]
  A --> A1[Maquettes]
  A --> A2[Spécifications]
  B --> B1[Développement]
  B1 --> B1x[Revue de code]
```

## 3. De droite à gauche (`RL`)

```mermaid
flowchart RL
  R[Projet] --> A[Conception]
  R --> B[Réalisation]
  R --> C[Recette]
  A --> A1[Maquettes]
  A --> A2[Spécifications]
  B --> B1[Développement]
  B1 --> B1x[Revue de code]
```

## 4. Référence : de haut en bas (`TD`)

```mermaid
flowchart TD
  R[Projet] --> A[Conception]
  R --> B[Réalisation]
  R --> C[Recette]
  A --> A1[Maquettes]
  A --> A2[Spécifications]
  B --> B1[Développement]
  B1 --> B1x[Revue de code]
```

## 5. Arbre large : 16 feuilles (plus de plafond de largeur)

```mermaid
flowchart TD
  R[Groupe] --> A[Filiale A]
  R --> B[Filiale B]
  R --> C[Filiale C]
  R --> D[Filiale D]
  A --> A1[Ventes] & A2[Achats] & A3[RH] & A4[IT]
  B --> B1[Ventes] & B2[Achats] & B3[RH] & B4[IT]
  C --> C1[Ventes] & C2[Achats] & C3[RH] & C4[IT]
  D --> D1[Ventes] & D2[Achats] & D3[RH] & D4[IT]
```

## 6. Arbre profond : 8 niveaux

```mermaid
flowchart TD
  N1[Niveau 1] --> N2[Niveau 2]
  N1 --> X[Feuille]
  N2 --> N3[Niveau 3]
  N3 --> N4[Niveau 4]
  N4 --> N5[Niveau 5]
  N5 --> N6[Niveau 6]
  N6 --> N7[Niveau 7]
  N7 --> N8[Niveau 8]
```
