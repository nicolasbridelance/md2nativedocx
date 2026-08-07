# Spikes Phase 0 — preuves archivées

Ce dossier n'est **pas** un chapitre de test à maintenir (voir `TESTING.md` à la racine pour la
liste des chapitres réels). C'est l'archive des preuves empiriques qui ont motivé deux décisions
d'architecture prises en Phase 0 :

- **`spike-layout.mjs`** — comparaison Dagre vs Graphviz sur un flowchart avec croisements
  volontaires. Preuve à l'appui de `docs/adr/0001-layout-engine.md` (Dagre retenu par défaut).
- **`spike-pandoc/`** — filtre Lua + document Markdown + `.docx` de sortie, validant que
  `pandoc.RawBlock('openxml', ...)` transmet un fragment `wpg:wgp` complexe sans le casser.
  Preuve à l'appui de `docs/adr/0002-pandoc-integration.md`.

Rien ici n'est exécuté par `npm test`, `npm run test:visual`, ou la CI. Ne pas y ajouter de
nouveau spike sans une décision d'architecture (ADR) à motiver — sinon c'est un script de
diagnostic ponctuel, pas quelque chose à archiver durablement.
