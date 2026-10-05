# SmartArt — arbres avec traits de connexion (v9)

## 1. Arbre vertical (racine en haut), 3 enfants

```mermaid
graph TD
  A[Projet] --> B[Analyse]
  A --> C[Conception]
  A --> D[Réalisation]
```

## 2. Arbre vertical, 4 enfants

```mermaid
graph TD
  R[Direction] --> A[Technique]
  R --> B[Commercial]
  R --> C[Finance]
  R --> D[RH]
```

## 3. Arbre horizontal (racine à gauche)

```mermaid
graph LR
  A[Produit] --> B[Web]
  A --> C[Mobile]
  A --> D[API]
```

## 4. Arbre racine en bas

```mermaid
graph BT
  A[Socle] --> B[Données]
  A --> C[Sécurité]
  A --> D[Réseau]
```

## 5. Arbre racine à droite

```mermaid
graph RL
  A[Objectif] --> B[Court terme]
  A --> C[Moyen terme]
  A --> D[Long terme]
```
