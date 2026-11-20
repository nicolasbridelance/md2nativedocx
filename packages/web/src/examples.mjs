/** The example documents the page can load, one per language. */

const FENCE = '```';

export const EXAMPLES = {
  en: `---
title: Release review
---

# Where we are

The release went out on time. This report covers **how it flows**, who talks to whom, and what is next.

## How a change ships

${FENCE}mermaid
flowchart TD
  A[Pull request] --> B{Review}
  B -- approved --> C[Merge]
  B -- changes --> A
  C --> D[(Release)]
${FENCE}

## Who calls whom

${FENCE}mermaid
sequenceDiagram
  participant U as User
  participant A as App
  participant S as Server
  U->>A: Export
  A->>S: Convert
  S-->>A: Document
  A-->>U: Download
${FENCE}

## Where the time went

${FENCE}mermaid
pie title Time spent
  "Build" : 45
  "Tests" : 30
  "Review" : 25
${FENCE}

## Next steps

${FENCE}mermaid
mindmap
  root((Next release))
    Quality
      More tests
      Faster CI
    Users
      Feedback
      Documentation
${FENCE}

## Data model

${FENCE}plantuml
class Document
class Diagram
class Shape
Document <|-- Report
Diagram <|-- Flowchart
Diagram <|-- Sequence
${FENCE}

| Item | Owner | Status |
|------|-------|--------|
| Tests | Ana | Done |
| Docs | Lee | In progress |
`,
  fr: `---
title: Revue de version
---

# Où en est-on

La version est sortie à l’heure. Ce rapport montre **comment elle circule**, qui parle à qui, et la suite.

## Comment un changement est livré

${FENCE}mermaid
flowchart TD
  A[Demande de fusion] --> B{Relecture}
  B -- acceptée --> C[Fusion]
  B -- corrections --> A
  C --> D[(Version)]
${FENCE}

## Qui appelle qui

${FENCE}mermaid
sequenceDiagram
  participant U as Utilisateur
  participant A as Application
  participant S as Serveur
  U->>A: Exporter
  A->>S: Convertir
  S-->>A: Document
  A-->>U: Téléchargement
${FENCE}

## Où est passé le temps

${FENCE}mermaid
pie title Temps passé
  "Construction" : 45
  "Tests" : 30
  "Relecture" : 25
${FENCE}

## La suite

${FENCE}mermaid
mindmap
  root((Prochaine version))
    Qualité
      Plus de tests
      CI plus rapide
    Utilisateurs
      Retours
      Documentation
${FENCE}

## Modèle de données

${FENCE}plantuml
class Document
class Diagramme
class Forme
Document <|-- Rapport
Diagramme <|-- Organigramme
Diagramme <|-- Sequence
${FENCE}

| Sujet | Responsable | État |
|-------|-------------|------|
| Tests | Ana | Fait |
| Documentation | Léo | En cours |
`,
};
