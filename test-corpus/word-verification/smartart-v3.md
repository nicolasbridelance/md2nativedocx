# SmartArt — vérification v3

Trois diagrammes éligibles, exportés avec **SmartArt activé** (`MD2NATIVEDOCX_ENABLE_SMARTART=1`).

## 1. Chaîne (chain)

```mermaid
flowchart LR
  A[Idée] --> B[Prototype] --> C[Test] --> D[Livraison]
```

## 2. Arbre (tree)

```mermaid
flowchart TD
  R[Projet] --> A[Conception]
  R --> B[Réalisation]
  R --> C[Recette]
```

## 3. Cycle simple (3 étapes) — le cas qui rendait des formes vides

```mermaid
flowchart TD
  A[A] --> B[B]
  B --> C[C]
  C --> A
```

## 4. Cycle à 4 étapes, avec libellés et une couleur

```mermaid
flowchart TD
  A[Planifier] --> B[Faire]
  B --> C[Vérifier]
  C --> D[Agir]
  D --> A
  style A fill:#FFE0B2
```
