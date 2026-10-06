# SmartArt — arbres à plusieurs niveaux (v11)

Cinq arbres descendants (`TD`) avec petits-enfants, exportés avec **SmartArt activé**.

## 1. Trois niveaux, branches inégales

```mermaid
flowchart TD
  R[Projet] --> A[Conception]
  R --> B[Réalisation]
  R --> C[Recette]
  A --> A1[Maquettes]
  A --> A2[Spécifications]
  B --> B1[Développement]
```

## 2. Quatre niveaux, une seule branche profonde

```mermaid
flowchart TD
  R[Direction] --> A[Technique]
  R --> B[Commerce]
  A --> A1[Infrastructure]
  A1 --> A1x[Réseau]
  A1 --> A1y[Serveurs]
  B --> B1[Ventes]
```

## 3. Libellés d'arêtes et couleur imposée

```mermaid
flowchart TD
  R[Décision] -->|oui| A[Lancer]
  R -->|non| B[Abandonner]
  A -->|phase 1| A1[Pilote]
  A -->|phase 2| A2[Déploiement]
  style B fill:#FFE0B2
```

## 4. Cinq niveaux (profondeur maximale)

```mermaid
flowchart TD
  N1[Niveau 1] --> N2[Niveau 2]
  N1 --> X[Feuille]
  N2 --> N3[Niveau 3]
  N3 --> N4[Niveau 4]
  N4 --> N5[Niveau 5]
```

## 5. Huit feuilles (largeur maximale)

```mermaid
flowchart TD
  R[Organisation] --> A[Pôle A]
  R --> B[Pôle B]
  R --> C[Pôle C]
  A --> A1[Équipe 1]
  A --> A2[Équipe 2]
  A --> A3[Équipe 3]
  B --> B1[Équipe 4]
  B --> B2[Équipe 5]
  C --> C1[Équipe 6]
  C --> C2[Équipe 7]
  C --> C3[Équipe 8]
```

## 6. Retombée sur les formes natives (gauche à droite, petits-enfants)

```mermaid
flowchart LR
  R[Racine] --> A[A]
  R --> B[B]
  A --> A1[A1]
```
