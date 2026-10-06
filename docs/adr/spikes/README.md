# Spikes — comptes rendus archivés

Ce dossier n'est **pas** un chapitre de test (voir `TESTING.md` pour les chapitres réels). Il garde
le compte rendu de chaque spike qui a motivé une décision d'architecture : un `spike.md` ou un
`README.md` par spike ou par round, lu avec l'ADR correspondant dans `docs/adr/`.

Les scripts de construction, fichiers XML intermédiaires et `.docx`/`.png` produits ont été retirés le
2026-10-06 pour alléger le dépôt avant la v1. Ils restent dans l'historique git :

```bash
git checkout 6a48177 -- docs/adr/spikes/
```

Seule exception conservée : `spike-gantt-parser/reference/mermaid-gantt-source/`, la source Mermaid
vendorisée (MIT, avec sa licence) que le parseur Gantt cite comme référence de comportement.

Rien ici n'est exécuté par `npm test`, `npm run test:visual` ou la CI. Ne pas y ajouter de spike sans
une décision d'architecture (ADR) à motiver.
