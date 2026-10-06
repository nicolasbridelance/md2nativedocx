# SmartArt — arbres larges en disposition compacte (v13)

Quand un arbre descendant serait trop large, les feuilles d'un même parent s'empilent en colonne sous lui
(comme l'organigramme de Word). Les petits arbres gardent la disposition en rangée.

## 1. Seize feuilles (même arbre qu'en v12)

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

## 2. Irrégulier : colonnes de tailles différentes, une branche plus profonde, une feuille isolée

```mermaid
flowchart TD
  R[Direction générale] --> F[Finance]
  R --> T[Technique]
  R --> C[Commercial]
  R --> J[Juridique]
  F --> F1[Comptabilité] & F2[Contrôle de gestion] & F3[Trésorerie]
  T --> T1[Infrastructure]
  T --> T2[Développement]
  T1 --> T1a[Réseau] & T1b[Serveurs] & T1c[Postes de travail]
  T2 --> T2a[Web] & T2b[Mobile]
  C --> C1[Ventes France] & C2[Export] & C3[Marketing] & C4[Support client] & C5[Partenariats]
```

## 3. Témoin : petit arbre, disposition en rangée inchangée

```mermaid
flowchart TD
  R[Projet] --> A[Conception]
  R --> B[Réalisation]
  A --> A1[Maquettes]
  A --> A2[Spécifications]
  B --> B1[Développement]
```
