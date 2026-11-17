# Processus de validation

```mermaid
flowchart LR
  A[Demande] --> B[Analyse]
  B --> C{Validée ?}
  C -->|Oui| D[Déploiement]
  C -->|Non| E[Retour au demandeur]
```
