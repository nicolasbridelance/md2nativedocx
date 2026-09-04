# FUTURE — couverture 100 % des types de diagrammes Mermaid (spec de cadrage)

> Statut (créé 2026-09-04) : **document de planification, zéro implémentation à ce stade** —
> demande explicite du mainteneur ("pour l'instant on ne fait rien en implémentation"). V1
> (flowchart uniquement, `docs/markdown-mermaid-compliance-table.md`) est considéré largement
> terminé ; ce document cadre ce qui reste pour couvrir les 28 autres types de diagrammes que
> Mermaid supporte aujourd'hui, dans quel ordre, et ce que ça implique pour l'architecture de
> `packages/core`.
>
> Positionnement vis-à-vis des autres specs `FUTURE_*.md` : `FUTURE_mmd2smartart_SPEC.md` couvre
> une **stratégie de sortie alternative** (SmartArt) pour un sous-ensemble de flowcharts déjà
> supportés ; ce document couvre des **types de diagrammes Mermaid entièrement différents**, dont
> la plupart n'ont même pas de notion de nœud/arête. Les deux sont orthogonaux : rien ici ne
> dépend de l'état de SmartArt, et réciproquement.
>
> Source de vérité pour la liste des types et leurs mots-clés : `mermaid.js.org` (interrogé
> 2026-09-04, voir §2 pour le tableau complet). Plusieurs types ci-dessous sont marqués "New 🔥"
> par Mermaid lui-même (ajoutés après la connaissance de base de l'assistant qui écrit ce
> document) — leur syntaxe exacte n'a été vérifiée qu'au niveau "structure générale + un exemple",
> pas en profondeur ; chaque phase devra revalider la syntaxe précise avant d'écrire le parseur
> correspondant, pas seulement se fier à ce document.

---

## 1. Pourquoi ce document

En travaillant sur la table de compliance flowchart (§ session 2026-09-04), le mainteneur a
demandé si notre "matrice de couverture" vérifiait qu'on gère les 28 autres types de diagrammes
Mermaid (liste collée depuis la sidebar `mermaid.live`). Réponse courte : non, et ce n'est pas un
oubli de suivi — `docs/markdown-mermaid-compliance-table.md` a toujours été scopé au flowchart
seul (titre du document, §11 de `cahier_des_charges.md` classe explicitement le reste en V2+).

Mais l'investigation a révélé un problème plus sérieux que "pas encore couvert" : le pipeline
actuel n'a **aucune notion de type de diagramme**. `packages/pandoc-filter/md2nativedocx.lua`
intercepte tout bloc `` ```mermaid `` et le pipe tel quel à `parseMermaid()`, qui ne reconnaît que
les en-têtes `graph`/`flowchart`. Testé empiriquement sur plusieurs des types listés ci-dessous :

| Entrée | Résultat observé |
|---|---|
| `pie`, `sequenceDiagram`, `journey`, `erDiagram`, `stateDiagram-v2` | Chaque ligne rejetée proprement (`"Unsupported line ignored: ..."`), canevas vide — échec honnête |
| `gitGraph` avec `commit`/`commit` | **Zéro avertissement.** Les mots nus `gitGraph`/`commit` sont acceptés comme déclarations de nœud flowchart valides (un identifiant seul sans ponctuation matche cette règle) → deux rectangles vides sans texte dans le document, silencieusement |
| `mindmap` avec `root((mindmap))` | `((...))` est une syntaxe de nœud flowchart valide par coïncidence → un nœud réel (faux) est créé |
| `classDiagram` avec `Animal <|-- Dog` | Rejeté avec avertissement, mais produit quand même une forme |

Donc : pas juste "27 types manquants" (attendu, documenté), mais "le parseur peut produire un
diagramme faux et silencieux face à une syntaxe qu'il n'a jamais été conçu pour lire". Ce constat
motive le **§4 Phase 0** ci-dessous — un garde-fou qui doit exister **avant** toute nouvelle
syntaxe, pas seulement avant chaque type individuellement.

---

## 2. Les 28 types restants — mots-clés et statut Mermaid

Vérifié via `mermaid.js.org` (2026-09-04). "New 🔥" = ajouté récemment par Mermaid lui-même
(post-connaissance de base de l'assistant, syntaxe vérifiée superficiellement seulement).

| Type | Mot-clé d'en-tête | Statut Mermaid |
|---|---|---|
| Swimlanes | `swimlane-beta` | Beta |
| Sequence | `sequenceDiagram` | Standard |
| Class | `classDiagram` | Standard |
| State | `stateDiagram` / `stateDiagram-v2` | Standard |
| Entity Relationship | `erDiagram` | Experimental (statut Mermaid, pas le nôtre) |
| User Journey | `journey` | Standard |
| Gantt | `gantt` | Standard |
| Pie Chart | `pie` | Standard |
| Quadrant Chart | `quadrantChart` | Standard |
| Requirement | `requirementDiagram` | Standard |
| GitGraph | `gitGraph` | Standard |
| C4 | `C4Context` (+ `C4Container`, etc.) | Standard |
| Mindmap | `mindmap` | Standard |
| Timeline | `timeline` | Standard |
| ZenUML | `zenuml` | Standard |
| Sankey | `sankey-beta` | New 🔥 |
| XY Chart | `xychart-beta` | New 🔥 |
| Block | `block-beta` | New 🔥 |
| Packet | `packet` | New 🔥 |
| Kanban | `kanban` | New 🔥 |
| Architecture | `architecture-beta` | New 🔥 |
| Radar | `radar-beta` | New 🔥 |
| Event Modeling | `eventmodeling` | New 🔥 |
| Treemap | `treemap-beta` | New 🔥 |
| Venn | `venn-beta` | New 🔥 |
| Ishikawa | `ishikawa-beta` | New 🔥 |
| Wardley | `wardley-beta` | New 🔥 |
| Cynefin | `cynefin-beta` | New 🔥 |
| TreeView | `treeView-beta` | New 🔥 |

(Suffixes `-beta`/version exacts à reconfirmer contre la doc au moment d'implémenter — plusieurs
projets Mermaid font évoluer le mot-clé entre bêta et stable sans préavis long.)

---

## 3. Taxonomie par famille de rendu

Le point clé de ce document : ces 28 types **ne sont pas 28 variations du même problème**. Notre
pipeline actuel (Dagre pour le layout, `wpc:wpc`/`wps:wsp` en sortie) ne convient qu'à une partie
d'entre eux. Les regrouper par stratégie de rendu partagée, pas par ordre alphabétique, est ce qui
rend une priorisation honnête possible.

### Famille A — Extension directe du flowchart (quasi gratuite)

| Type | Pourquoi c'est (presque) gratuit |
|---|---|
| **Swimlanes** (`swimlane-beta`) | Confirmé via la doc : "Nodes use flowchart-style shape syntax", "Edges also use flowchart-style syntax" — les lanes sont des `subgraph` avec une sémantique différente. Notre parseur/layout/traducteur flowchart couvrent déjà l'essentiel ; il "manque" surtout la reconnaissance de l'en-tête `swimlane-beta` (alias de `flowchart`, comme `TB`→`TD` déjà géré) et de vérifier que le rendu en boîte de sous-graphe convient visuellement à une lane (probablement oui, `renderSubgraph()` dessine déjà une boîte pleine). Candidat naturel pour suivre immédiatement la Phase 0, dans la même session si le mainteneur le souhaite. |

### Famille B — Graphe nœuds/arêtes (réutilise Dagre + `wpc:wpc`, nouveau parseur + rendu de nœud enrichi)

| Type | Ce qui diffère du flowchart |
|---|---|
| `classDiagram` | Boîte multi-compartiments (nom / attributs / méthodes) ; types de relation UML (héritage `<\|--`, composition, agrégation) au lieu de nos `EdgeType` |
| `stateDiagram`/`-v2` | États composites (imbrication), pseudo-états début/fin (`[*]`), forks/joins |
| `erDiagram` | Entités avec liste d'attributs typés ; notation crow's-foot sur les relations |
| `requirementDiagram` | Boîtes "requirement"/"element" avec métadonnées (id, type, risque...) et types de relation dédiés |
| `architecture-beta` | Confirmé via la doc : services/groupes/arêtes avec icônes et ports directionnels (`serviceA:R --> L:serviceB`) — structurellement un graphe de nœuds avec icônes, proche famille B malgré son nom |
| `gitGraph` | Cas limite : un DAG de commits avec des "lanes" de branche colorées — le layout ressemble plus à la famille F (lanes fixes) qu'à un ranking Dagre libre ; à trancher au moment venu |
| C4 (`C4Context`, etc.) | Boîtes typées (Person/System/Container) avec relations `Rel(a, b, "...")` — proche flowchart mais notation fonctionnelle, pas `a --> b` |

Effort par type : modéré — chaque type a besoin de son **propre parseur** (grammaire différente)
et d'un **rendu de nœud étendu** (compartiments, métadonnées), mais réutilise Dagre pour le layout
et `wpc:wpc`/`wps:wsp` pour la sortie, donc pas de nouveau moteur de rendu.

### Famille C — Hiérarchique (layout arbre, pas un ranking Dagre)

| Type | Layout requis |
|---|---|
| `mindmap` | Arbre radial ou indenté — Dagre fait du ranking en couches, pas de la disposition radiale |
| `treemap-beta` | Rectangles imbriqués proportionnels à l'aire — un algorithme de subdivision d'aire (ex. squarified treemap), rien à voir avec un layout de graphe |
| `treeView-beta` | Probablement un arbre indenté simple (à confirmer — syntaxe non vérifiée en détail) |
| `ishikawa-beta` | Diagramme en arêtes de poisson — arbre à branches diagonales, layout géométrique dédié |

Point commun avec l'existant : `packages/core/src/smartart/tree.ts` a déjà résolu "layout d'arbre
à profondeur 2" pour SmartArt — pas réutilisable tel quel (cible SmartArt, pas `wpc:wpc`, profondeur
plafonnée à 2), mais une référence de conception utile pour le calcul géométrique d'un arbre.

### Famille D — Graphique natif (nouveau backend OOXML entier : `c:chart`/DrawingML, pas de formes)

| Type | Nature du graphique |
|---|---|
| `pie` | Camembert |
| `xychart-beta` | Ligne/barres sur axes X/Y |
| `radar-beta` | Graphique radar/araignée |
| `quadrantChart` | Positionnement 2D en 4 quadrants (nuage de points) |
| `cynefin-beta` | Structurellement un quadrant 2×2 — probablement réutilisable avec `quadrantChart` |
| `wardley-beta` | Carte de valeur 2D (axe évolution × chaîne de valeur) — graphique positionnel |
| `venn-beta` | Cercles qui se chevauchent — géométrie de type "chart" mais pas un graphique au sens Office (pas de `c:chart` standard pour un Venn ; probablement des formes ellipse OOXML positionnées à la main, donc en fait plus proche de "formes géométriques calculées" que d'un vrai graphique) |
| `sankey-beta` | Diagramme de flux à largeur proportionnelle — pas de type `c:chart` Office natif pour ça non plus ; rendu par formes/polygones calculés, gros travail géométrique |
| `gantt` | Diagramme de Gantt — **deux options architecturales** : (a) un vrai `c:chart` de type barres empilées, ou (b) des formes OOXML positionnées sur un calendrier (plus proche de notre approche actuelle, pas de nouveau backend). À trancher à l'implémentation — (b) coûte probablement moins cher vu l'infrastructure déjà en place. |

**C'est la famille la plus chère et la plus différente de tout ce qui existe.** `c:chart` est un
tout autre schéma XML (partie `word/charts/chart{N}.xml` + cache de données numériques +
relations dédiées), jamais touché par ce projet. Les sous-cas sans `c:chart` natif (Venn, Sankey)
demandent en plus un travail de géométrie calculée sur-mesure. Cette famille mérite sa propre spec
`FUTURE_*` dédiée le jour où elle est engagée — trop différente pour être cadrée en une sous-section
ici.

### Famille E — Lifeline / chronologie (layout à axe fixe, pas Dagre)

| Type | Layout requis |
|---|---|
| `sequenceDiagram` | Acteurs en lignes de vie verticales fixes, messages horizontaux ordonnés dans le temps — **demande la plus fréquente après flowchart** (`cahier_des_charges.md` §11, déjà noté avant ce document) |
| `journey` | Chronologie de tâches notées, rendu proche d'un tableau |
| `timeline` | Liste chronologique d'événements, horizontale ou verticale |
| `zenuml` | Notation alternative pour diagrammes de séquence UML — même famille de layout que `sequenceDiagram` |
| `eventmodeling` | Confirmé via la doc : timeline horizontale + lanes fixes (UI/Commande/Événement) avec des blocs positionnés chronologiquement |

### Famille F — Lanes/grille fixe

| Type | Layout requis |
|---|---|
| `kanban` | Colonnes de cartes |
| `block-beta` | Grille de blocs à placement arbitraire |
| `packet` | Cas très spécialisé — confirmé via la doc : table de champs bit-à-bit (position/largeur en bits), essentiellement un rendu de tableau, pas un diagramme au sens géométrique |

---

## 4. Prérequis architectural — Phase 0 (bloquant, avant tout type additionnel)

Constat honnête (relu `types.ts`, `parser.ts`, `layout.ts`, `ooxml-translator.ts`, `index.ts`,
`md2nativedocx.lua`, `md2nativedocx-core.mjs`) : **le pipeline actuel n'est pas modulaire par type
de diagramme, il est flowchart de bout en bout.**

- `types.ts` : `Flowchart`/`FlowNode`/`FlowEdge`/`NodeShape` sont les seuls types AST, aucune
  abstraction "Diagram" générique au-dessus.
- `parser.ts` : `parseMermaid()` est une seule fonction qui suppose flowchart dès la première
  ligne ; aucun aiguillage par mot-clé d'en-tête.
- `layout.ts` : câblé sur Dagre — correct pour les familles A/B, inutilisable tel quel pour C/D/E/F.
- `ooxml-translator.ts` : câblé sur le canevas de formes `wpc:wpc`/`wps:wsp` — réutilisable pour
  A/B (avec extension), pas du tout pour D (graphique natif) ni C/E/F (layouts géométriques
  différents).
- **Bonne nouvelle** : `md2nativedocx.lua` et `md2nativedocx-core.mjs` sont déjà agnostiques
  ("tout bloc `` ```mermaid `` → texte brut → XML") — l'aiguillage n'a pas besoin de remonter
  jusqu'au filtre Pandoc, il peut rester entièrement interne à `packages/core`.

**Ce que Phase 0 doit livrer, avant qu'un seul octet de syntaxe non-flowchart soit implémenté :**

1. **Détection du type de diagramme** — une fonction qui lit la première ligne significative et
   retourne un type de diagramme reconnu (`flowchart` | `sequence` | `class` | ... | `unknown`),
   au lieu de supposer flowchart par défaut. C'est le garde-fou qui aurait empêché le bug `gitGraph`/
   `mindmap` du §1 — et il a de la valeur **dès aujourd'hui**, avant même le premier type
   additionnel : un type reconnu-mais-non-implémenté doit produire un avertissement clair et une
   note visible dans le document (même mécanisme que `buildSmartArtFallbackNoteXml`, pas un
   canevas vide silencieux) plutôt que de laisser le parseur flowchart tenter sa chance.
2. **Restructuration en modules par type** — convention proposée :
   `packages/core/src/diagrams/<type>/{parser,layout,translator}.ts`, chacun avec son propre
   AST. `packages/core/src/diagrams/flowchart/` accueille le code existant (déplacé, pas réécrit).
   `index.ts` exporte un point d'entrée par type plus une fonction de dispatch de haut niveau.
3. **Découplage layout/traducteur par famille**, pas par type individuel — un seul module de
   layout "graphe Dagre" partagé par toute la famille B, un module "arbre" partagé par C, etc.,
   plutôt qu'un moteur de layout par type.

Coût estimé : petit à moyen (surtout de la réorganisation de fichiers existants + une fonction de
détection + le mécanisme de note de fallback, qui existe déjà comme précédent pour SmartArt) —
mais **bloquant** : sans ça, chaque type ajouté ensuite risque de recréer le même bug de
mauvais-aiguillage silencieux, et la dette de réorganisation ne fait que grandir plus on attend.

---

## 5. Priorisation proposée — à trancher avec le mainteneur

Pas une décision unilatérale de ce document : deux angles morts explicites ci-dessous à trancher
avant de lancer la Phase 1.

**Proposition de base** (effort croissant, réutilisation d'infrastructure décroissante) :

- **Phase 0** — garde-fou + réorganisation modulaire (§4). Toujours en premier, indépendamment de
  la suite.
- **Phase 1** — Swimlanes (famille A). Quasi gratuit vu l'infrastructure flowchart existante ;
  bon test de la nouvelle architecture Phase 0 sur un cas réel avant de l'exercer sur quelque
  chose de plus gros.
- **Phase 2** — Famille B la plus proche de l'existant : `classDiagram`, `stateDiagram`,
  `erDiagram`, `requirementDiagram` — nouveau parseur chacun mais même Dagre + même traducteur
  `wpc:wpc` étendu. `architecture-beta` et C4 peuvent suivre dans la même veine.
- **Phase 3** — Famille C (hiérarchique) : `mindmap` en premier (le plus demandé de cette
  famille, probablement), puis `treeView`/`ishikawa`/`treemap` selon la demande réelle.
- **Phase 4** — Famille D (graphique natif) : sa propre spec dédiée le moment venu (§3), trop
  différente pour être cadrée ici. `pie` en premier candidat naturel (le plus simple, le plus
  demandé de cette famille).
- **Phase 5** — Famille E (lifeline) et F (lanes) et le reste, au fil de la demande communauté
  post-launch (philosophie déjà actée dans `cahier_des_charges.md` §11 pour cette zone).

**Angle mort n°1 — `sequenceDiagram`** : c'est la demande la plus citée après flowchart
(`cahier_des_charges.md` §11), mais il est en famille E (lifeline), pas en famille B — donc pas
le moins cher techniquement. Deux options : (a) le sortir de l'ordre "par coût croissant"
ci-dessus et le traiter en Phase 2 malgré son coût, en raison de la demande ; (b) le laisser en
Phase 5 par famille et accepter un délai avant de répondre à la demande la plus citée. Ce
document ne tranche pas — c'est un arbitrage produit, pas technique.

**Angle mort n°2 — `gitGraph`** : classé famille B ci-dessus par défaut mais sémantiquement plus
proche d'un layout à lanes (famille F) une fois qu'on regarde son rendu réel (branches en
colonnes colorées). À re-classer au moment d'y toucher, pas figé ici.

---

## 6. Ce que ce document ne fait pas

- Ne spécifie aucune syntaxe en détail (grammaire exacte, table de mapping de formes, etc.) — ça
  reste le travail de chaque phase au moment où elle démarre, pas de ce cadrage.
- Ne modifie aucun code (`packages/core/src/**`) — zéro implémentation, conformément à la demande.
- Ne s'engage pas sur des dates — dépend de la bande passante et des retours communauté
  post-launch, comme le reste de la roadmap V2+ existante.
