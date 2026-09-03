# Compliance & confiance

`md2nativedocx` est pensé pour être installé au cœur d'un outillage IT d'entreprise — pas
seulement utilisé une fois sur un poste isolé. Cette page existe pour que chaque interlocuteur
d'un dossier d'homologation trouve directement l'information qui le concerne, sourcée et à jour,
sans avoir à relire tout le dépôt.

## Le constat qui motive l'outil

Un diagramme Mermaid est illisible pour la plupart des relecteurs non techniques — c'est du texte
structuré, pas un document. Un compte-rendu Word rédigé intégralement par une IA, phrase par
phrase, est verbeux, lent à produire et coûteux à faire relire — ce n'est pas le format dans
lequel une IA raisonne le mieux. Entre les deux, il n'y avait pas de passerelle sans perte :
soit on gardait le Markdown/Mermaid technique, soit on le figeait en image PNG dans un Word,
dans les deux cas au prix d'un aller simple.

`md2nativedocx` est cette passerelle : une IA (ou un développeur) écrit en Markdown + Mermaid —
le format dense, versionnable, dans lequel un LLM est le plus fiable — et l'outil produit un vrai
`.docx` avec des formes OOXML natives, éditables, que n'importe quel relecteur métier ouvre et
modifie dans Word sans rien installer ni rien apprendre. Dans un monde où la communication
homme/IA devient un flux de travail permanent plutôt qu'un cas d'usage ponctuel, ce genre de
passerelle sans perte cesse d'être un confort et devient une nécessité d'infrastructure.

## Qui êtes-vous ?

| Vous êtes... | Ce qui vous intéresse | Document |
|---|---|---|
| **Juridique / achats** | Licence du code, audit des dépendances tierces, gestion de Pandoc (GPL), absence de télémétrie, flux de données | [`legal.md`](legal.md) |
| **IT / sécurité / RSSI** | Analyse de risque, pipeline CI (tests, SAST, secrets, audit de dépendances), empreinte d'infrastructure et coût réel | [`it-security.md`](it-security.md) |
| **Métier / non-technicien** | Comment ça marche pour moi, sans lire une ligne de code | [`guide-metier.md`](guide-metier.md) |

## En un coup d'œil

Les badges en tête du [`README`](../../README.md) donnent l'état **live** (dernier run CI sur
`main`) : pas besoin de croire un chiffre figé dans une page de doc.

| | |
|---|---|
| Licence du code | **CC0 1.0 Universal** (domaine public) |
| Dépendances runtime | 6 packages, **100 % MIT** (voir [`legal.md`](legal.md)) |
| Outil externe invoqué | Pandoc (GPL-2.0-or-later), en sous-processus, jamais lié au code |
| Tests automatisés | 214 (dont 3 property-based, ré-exécutés indépendamment en CI pour couvrir d'autres cas aléatoires) — voir le badge CI |
| Couverture (`packages/core`) | voir le rapport daté du dernier run (ci-dessous) |
| Vulnérabilités connues (`npm audit`) | voir le badge CI + l'artefact `npm-audit-<sha>` du dernier run |
| Analyse statique (SAST) | CodeQL, à chaque push/PR + hebdomadaire |
| Scan de secrets | gitleaks, à chaque push/PR |
| Mises à jour de dépendances | Dependabot, hebdomadaire |
| Télémétrie / appel réseau non documenté | **Aucun** — voir [`legal.md`](legal.md) |

Ces chiffres ne sont pas une capture recopiée à la main : chaque run CI sur `main` génère un
résumé daté (Job Summary, visible dans l'onglet **Actions**) et des rapports téléchargeables
(`junit.xml`, `lcov.info`, `npm-audit.json`, conservés 90 jours, rattachés au commit exact) —
détail complet, et où vivent les fichiers source de chaque test, dans
[`it-security.md`](it-security.md) → *Rapports automatiques et datés*. Voir aussi
[`TESTING.md`](../../TESTING.md) pour les six chapitres de test et
[`AGENTS.md`](../../AGENTS.md) → *Security requirements* pour la table de risques complète.
