# SmartArt — mindmap et treeView (v14)

Avec SmartArt activé, un `mindmap` devient une hiérarchie SmartArt de gauche à droite, et un `treeView-beta`
à une seule racine une hiérarchie descendante. Sans SmartArt, rien ne change.

## 1. Mindmap à trois niveaux

```mermaid
mindmap
  root((Lancement produit))
    Marketing
      Campagne
      Salon
      Presse
    Technique
      Version 1.0
      Documentation
    Ventes
      Formation
      Tarifs
```

## 2. Mindmap à deux niveaux

```mermaid
mindmap
  root((Réunion))
    Ordre du jour
    Participants
    Compte rendu
```

## 3. Arborescence de fichiers (une racine)

```mermaid
treeView-beta
  "md2nativedocx/"
    "packages/"
      "core/" ## le moteur
        "src/"
        "test/"
        package.json:::highlight
      "cli/"
        "bin/"
        "src/"
      "pandoc-filter/"
    "docs/"
      "adr/"
      "specs/"
    README.md
```

## 4. Retombée sur les formes : arborescence à deux racines

```mermaid
treeView-beta
  "src/"
    index.ts
  "docs/"
    README.md
```
