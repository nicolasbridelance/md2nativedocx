# Stratégie de test — `md2nativedocx`

> Ce fichier existe parce que le répertoire de tests s'est construit par ajouts successifs
> plutôt que par conception, et que ça a fini par être confus — voir `TODO.md` (2026-08-07)
> pour l'historique de ce constat et du nettoyage qui a suivi. Ce document donne le point de
> vue global qui manquait : les six chapitres de test du projet, ce que chacun garantit, où il
> vit, et comment y ajouter un cas.

## Les six chapitres

| # | Chapitre | Où | Automatisé | Ce qu'il garantit |
|---|---|---|---|---|
| 1 | [Unitaires](#1-unitaires) | `packages/*/test/{unit,golden,fuzz}` | oui, à chaque push | logique pure (parseur, layout, traducteur), sans I/O |
| 2 | [Intégration pipeline](#2-intégration-pipeline) | `packages/cli/test`, `packages/pandoc-filter/test` | oui, à chaque push | la chaîne réelle Markdown → Pandoc → filtre Lua → core → `.docx` |
| 3 | [Corpus de diagrammes réels](#3-corpus-de-diagrammes-réels) | `test-corpus/corpus/` | oui (régénération + conformité) + revue manuelle Word | de vrais `.mmd` de mermaid-js/mermaid traversent tout le pipeline |
| 4 | [Régression visuelle](#4-régression-visuelle) | `test-corpus/visual/`, `scripts/test-visual.mjs` | oui, sur demande (LibreOffice requis) | le rendu réel ne régresse pas, pas seulement le XML |
| 5 | [Comparaison Word natif](#5-comparaison-word-natif) | `tools/word-reference/` | non, manuel, Windows | structure OOXML comparée à un document Word authentique |
| 6 | [Spikes historiques](#6-spikes-historiques) | `docs/adr/spikes/` | non, archive | preuves ayant motivé les ADR 0001/0002 |

Commandes : voir `AGENTS.md` → "Build, test, lint" pour la liste `npm run ...`.

## Pourquoi ce découpage

Chaque chapitre répond à une question qu'aucun des autres ne peut répondre seul :

- Les chapitres 1-2 vérifient que le **code** fait ce qu'il est censé faire — rapides,
  déterministes, zéro dépendance externe (Pandoc excepté pour le 2).
- Le chapitre 3 vérifie que le pipeline tient face à de la **syntaxe Mermaid réelle**, pas
  seulement les cas que nous aurions pensé à écrire nous-mêmes.
- Le chapitre 4 existe parce que les trois premiers valident le XML, pas le **rendu** — un
  `.docx` peut être un ZIP valide, un XML bien formé, tous les ids uniques, et pourtant
  s'afficher comme un rectangle gris vide ou ne se rendre pas du tout dans Word/LibreOffice.
  Plusieurs défauts de cette catégorie (namespaces non déclarés sur la racine, flèches
  invisibles, titre de sous-graphe superposé, arête traversant un nœud, rendu totalement absent
  au-delà d'un ratio largeur/hauteur donné) n'ont été trouvés QUE par ce chapitre — voir
  `TODO.md` pour l'historique détaillé de chacun.
- Le chapitre 5 est le seul qui compare à un **Word réel** plutôt qu'à notre propre
  compréhension du format OOXML — irremplaçable pour diagnostiquer un écart, mais manuel et
  Windows-only, donc pas dans la boucle CI.
- Le chapitre 6 n'est pas un test : c'est la preuve empirique qui a tranché deux décisions
  d'architecture (moteur de layout, mécanisme d'intégration Pandoc). Il est archivé, pas
  maintenu.

## 1. Unitaires

`packages/core/test/unit/*.test.ts` (parseur, layout, traducteur), `packages/core/test/golden/`
(fixtures XML attendues, comparaison structurelle pas texte brut), `packages/core/test/fuzz/`
(property-based sur la frontière d'entrée non fiable, `fast-check`).

**Ajouter un cas** : un `test()` de plus dans le fichier concerné. Un bug trouvé par un chapitre
supérieur (4, notamment) redescend presque toujours ici sous forme de test de régression — c'est
la convention suivie tout du long (voir les commits de la session 2026-08-07 pour des exemples).

## 2. Intégration pipeline

`packages/cli/test/{cli,postprocess}.test.mjs`, `packages/pandoc-filter/test/filter.test.mjs`.
Exercent le CLI réel (`execFileSync`) ou le filtre Lua réel, pas juste les fonctions de
`packages/core` en isolation.

**Ajouter un cas** : écrire un `.md` minimal dans un répertoire temporaire
(`mkdtempSync(join(tmpdir(), '...'))` + `rmSync` en cleanup — c'est le pattern déjà en place dans
`cli.test.mjs`, ne pas réinventer une sortie persistée horodatée, voir l'anti-pattern plus bas).

## 3. Corpus de diagrammes réels

`test-corpus/corpus/` — détails, provenance et limites de scope dans son propre
`test-corpus/corpus/README.md`. Régénéré par `packages/cli/test/corpus.test.mjs` (assertions de
conformité automatiques) et par `node scripts/generate-corpus.mjs` (régénération standalone).
`generated/*.docx` sert aussi de matériel pour le critère d'acceptation MVP (spec §9 : tests
manuels dans Word réel avant chaque release).

## 4. Régression visuelle

`test-corpus/visual/` — détails, piège hauteur/ratio LibreOffice, et procédure d'ajout dans son
propre `test-corpus/visual/README.md`. Mécanisme : `scripts/test-visual.mjs` +
`scripts/lib/png.mjs` (décodeur/diff PNG maison, zéro dépendance).

## 5. Comparaison Word natif

`tools/word-reference/` — génère un document Word réel (PowerShell, nécessite Word installé) et
compare sa structure `wpg:wgp` à notre sortie. Voir `tools/word-reference/README.md`. Manuel,
Windows-only : à utiliser quand un rendu Word réel diverge de ce que LibreOffice/nos tests
structurels valident, pour isoler si l'écart vient de nous ou du moteur de rendu.

## 6. Spikes historiques

`docs/adr/spikes/` — voir son propre `README.md`. Preuves archivées pour `docs/adr/0001-*` et
`docs/adr/0002-*`. Rien ici n'est exécuté par les tests automatisés.

## Anti-pattern évité : l'accumulation horodatée

`test-corpus/output/simple/` créait un sous-répertoire horodaté à **chaque** exécution de
`npm test`, jamais nettoyé — 100+ fichiers accumulés en une session, dont une partie committée
par erreur. L'intention ("rester auditable") était légitime mais mal placée : un test simple
(ex. "markdown sans mermaid ne contient pas de `wpg:wgp`") est une assertion sur du XML généré,
pas un artefact qu'un humain relit après coup — un répertoire temporaire éphémère
(`mkdtempSync`/`rmSync`, chapitre 2) suffit. Réservez une sortie **persistée** aux cas qui en ont
vraiment besoin (chapitre 3 : un humain ouvre le `.docx` dans Word ; chapitre 4 : une baseline
sert de référence à un diff) — et dans ce cas, écrasez-la à chaque run plutôt que de
l'horodater, comme le fait déjà `test-corpus/corpus/generated/`.
