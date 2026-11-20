# Spike — convertisseur 100 % navigateur (GitHub Pages) (2026-11-20)

Question (TODO §4, « Pistes de distribution », remontée en tête de l'ordre de travail par le mainteneur
le 2026-11-20) : peut-on convertir Markdown + diagrammes en `.docx` natif **dans une page web**, sans
serveur, sans installation et sans que le texte quitte le navigateur ?

**Réponse : oui.** Démontré dans Chrome 157 sur le document `sample.md` (titre YAML, liste, tableau,
flowchart, séquence, camembert, mindmap, classes PlantUML, équation) : le `.docx` produit dans la page
passe `scripts/oxml-validator` avec **0 erreur** et s'ouvre dans Word (rendu exporté en PDF par Word,
relu page par page). Rien de ce spike n'est encore dans un paquet.

## Ce qui a été essayé

**Pandoc.** Pandoc publie depuis la 3.9 un `pandoc.wasm` officiel (asset `pandoc-<v>-wasm.zip` de chaque
release ; 3.14 : zip de 17,1 Mo, empreintes plus bas). Le module est un
« réacteur » : `hs_init_with_rtsopts()` puis `convert(optionsJson)`, les options au format des fichiers
*defaults* de Pandoc, l'entrée, la sortie et tous les fichiers (gabarit, filtre) dans un système de
fichiers virtuel. Les filtres Lua marchent, **sans commande système** : pas de `io.popen`, pas de
`pandoc.system`, `os.getenv` rend `nil` (vérifié). Or notre filtre lance Node par diagramme.

**Contournement retenu : deux passes, sans toucher au filtre.**

1. `pandoc.wasm` : Markdown → AST JSON (`to: json`).
2. JS dans la page : chaque `CodeBlock` `mermaid` / `plantuml` / `puml` de l'AST est remplacé par un
   `RawBlock openxml` rendu par `renderDiagram()` de `core`, en mémoire (même sélection et même règle
   d'en-tête `@startuml` que `md2nativedocx.lua`).
3. `pandoc.wasm` : AST JSON → `.docx`, avec le `reference.docx` du projet.
4. Post-traitement : les fonctions pures de `packages/cli/src/postprocess.mjs` (`injectNamespaces`,
   `renumberDrawingIds`, `forceEmojiColorFont`) sur `word/document.xml`, puis réécriture de l'archive.

Aucun sous-processus nulle part : la règle 4 d'AGENTS.md devient sans objet dans ce chemin, et la
règle 7 reste tenue (Pandoc écrit le paquet, on ne touche que `document.xml` et les parties autorisées).

**Deux bancs d'essai**, dans ce dossier :

| Fichier | Rôle |
|---|---|
| `pandoc-wasi.mjs` | Colle WASI écrite pour le spike (le WASI intégré à Node, aucune dépendance) |
| `node-pipeline.mjs` | Chemin complet sous Node, **SmartArt et graphiques compris** via `injectSmartArtParts` / `injectChartParts` existants |
| `browser-app.mjs` | Logique de la page (formes seulement, voir limites) |
| `zip.mjs` | Lecture / réécriture ZIP sur `CompressionStream('deflate-raw')` du navigateur, sans dépendance |
| `sample.md` | Document de test |

La page chargeait le `pandoc.js` amont (MIT, Tweag / J. MacFarlane) **non modifié et non commis** ; le
`.wasm` non plus n'est pas dans le dépôt. Reproduire : télécharger `pandoc-3.14-wasm.zip` (release
`3.14` de `jgm/pandoc`), `pandoc.js` au tag `3.14` (`wasm/pandoc.js`), bundler `core` et
`postprocess.mjs` avec esbuild (`--platform=browser`, `node:fs` / `node:path` / `adm-zip` remplacés par
des bouchons : seules les fonctions pures sont appelées), servir le tout en local.

## Mesures

| | Navigateur (Chrome 157, serveur local gzip) | Node 24 (`--experimental-wasm-exnref`) |
|---|---|---|
| Téléchargement `pandoc.wasm` | 62,5 Mo, **17,3 Mo transférés en gzip** | — |
| Prêt (téléchargement + compilation + init) | 5,8 s (en local : le réseau réel s'y ajoute) | 0,4 à 0,8 s d'init |
| Markdown → JSON | 120 ms (18 ms ensuite) | 94 à 290 ms |
| 5 diagrammes par `core` | 37 ms (10 ms ensuite) | 99 à 150 ms |
| JSON → `.docx` | 371 ms (102 ms ensuite) | 2,5 à 7,6 s la 1re fois, 0,4 à 0,8 s ensuite |
| Post-traitement | 7 ms | 0,2 s (adm-zip, fichier sur disque) |
| **Conversion totale** | **535 ms, puis 133 ms** | — |

| Sortie | Validateur Open XML | Word |
|---|---|---|
| Navigateur (formes) | 0 erreur | 3 pages, rendu correct |
| Node (SmartArt + graphique) | 0 erreur | 3 pages, rendu correct ; mêmes 29 parties que le CLI natif (10 SmartArt, 2 graphique, 1 classeur) |
| CLI natif, même source (Pandoc 3.1.3) | Bruit connu de Pandoc 3.1.3 (`settings.xml`…) | — |

Pandoc 3.14 n'écrit plus le bruit de schéma de la 3.1.3 : la sortie navigateur est plus propre que
celle du CLI aujourd'hui.

Empreintes (release `3.14`) : `pandoc-3.14-wasm.zip` SHA-256
`84e1023db1892cfdeb9ee518b8d95e6f6c667bbde7c99f24ec889a2099367ee5`, `pandoc.wasm`
`ecd6fe2ec6a0f6a7ed6240f4df1d8aa4c6b42872cba0bf8d8b0c02f121dcd9ec`.

## Ce qui manque pour un produit

1. **Post-traitement sur des octets, pas des chemins.** `postProcessDocx`, `injectSmartArtParts`,
   `injectChartParts`, `buildWorkbookXlsx` et `referenceDocBuilder` lisent et écrivent des fichiers par
   adm-zip, qui ne tourne pas dans un navigateur (`fs`, `zlib`, `crypto`, `path`). Les transformations
   elles-mêmes sont des fonctions sur des chaînes. Extraction propre : une petite interface « paquet »
   (lire une entrée, écrire une entrée) avec deux implémentations réelles, adm-zip sous Node et ZIP
   natif du navigateur (ADR 0012 : on abstrait quand deux implémentations existent ; c'est le cas).
   Les parties SmartArt / graphique passent alors en mémoire au lieu de dossiers temporaires.
2. **Bibliothèque ZIP.** Soit `zip.mjs` (code du projet, CC0, ~100 lignes, API du navigateur, à
   durcir et à tester), soit `fflate` (MIT, sans dépendance) : nouvelle dépendance, **escalade**.
3. **Colle WASI du navigateur.** Le `pandoc.js` amont importe `@bjorn3/browser_wasi_shim` depuis
   jsDelivr à l'exécution : une page « rien ne sort du navigateur » ne doit charger aucun script tiers
   d'un CDN. Soit vendoriser ce shim (MIT/Apache-2.0, nouvelle dépendance : **escalade**), soit écrire
   notre propre WASI minimal en mémoire (comme `pandoc-wasi.mjs` pour Node, plus le système de fichiers).
4. **Filtre Lua sans environnement.** Les tableaux en paysage lisent `os.getenv` : inactifs dans le
   navigateur. Les passer par métadonnées Pandoc (`-M`) servirait aussi le CLI. La sélection des blocs
   et la règle `@startuml` existent en Lua et en JS : n'en garder qu'une (la passe JSON peut devenir le
   chemin unique, y compris pour le CLI ; à décider, ce n'est pas nécessaire au premier jet).
5. **Version de Pandoc.** Le `.wasm` n'existe qu'à partir de la 3.9 ; la CI épingle 3.1.3. Une page
   navigateur en 3.14 et un CLI en 3.1.3 divergeraient. Rejoint l'item « Pandoc comme contrat » (§2bis) :
   tester la 3.14 en CI pour le CLI aussi.
6. **Images du Markdown** : aucune (pas de système de fichiers). Plus tard : déposer les images avec le
   `.md`, passées à `pandoc.wasm` comme fichiers.
7. **`.odt`** : même schéma (Pandoc seul, gabarit dérivé), sans post-traitement : plus simple que le `.docx`.
8. **Navigateurs.** Le binaire utilise la gestion d'exceptions WebAssembly récente (`try_table`,
   exnref) : un navigateur trop ancien échoue à la compilation (Node 20 aussi ; Node 24 avec un flag).
   La page doit le détecter et le dire.

## Hébergement et licence : décisions du mainteneur

- **Pandoc est GPL-2.0-or-later.** Servir `pandoc.wasm` depuis GitHub Pages, c'est le **distribuer**
  nous-mêmes (l'extension, elle, télécharge le binaire officiel chez Pandoc). Il faut au minimum
  `COPYING` / `COPYRIGHT` à côté et l'accès à la source correspondante (archive des sources de la
  version servie). Le télécharger depuis la release GitHub de Pandoc au lieu de l'héberger ne marche
  pas directement (pas d'en-têtes CORS sur les assets de release). **Question de licence : escalade.**
- **Poids.** 62,5 Mo bruts (limite GitHub Pages : 100 Mo par fichier). La compression servie par
  GitHub Pages pour `application/wasm` reste à vérifier sur un vrai déploiement ; sans elle, 62,5 Mo au
  premier chargement. Un Service Worker le garde en cache ensuite.
- **Pistes à trancher** : construire le produit (points 1 à 4, l'ordre de grandeur est quelques jours,
  le point 1 sert aussi le CLI), ou s'arrêter au constat.

Recommandation : poursuivre. Le point dur (Pandoc sans sous-processus, rendu fidèle, validé dans Word)
est levé ; le reste est de l'extraction (point 1) et deux choix de dépendance (points 2 et 3) que la
règle 6 réserve au mainteneur.
