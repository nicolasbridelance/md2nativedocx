```mermaid
sequenceDiagram
  actor Client
  participant Site
  participant Paiement
  participant Entrepôt
  Client->>Site: Valide le panier
  Site->>Paiement: Débite 49 €
  Paiement-->>Site: Accepté
  Site->>Entrepôt: Prépare le colis
  Entrepôt-->>Client: Expédié !
```
