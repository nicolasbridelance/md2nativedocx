# Catalogue SmartArt complet, retourné : archétype → Mermaid → implémentation OOXML

> Document de planification, zéro implémentation. Complète `docs/smartart-layout-catalog.md`
> (qui jugeait chaque layout **uniquement** pour un flowchart Mermaid, et qui à ce titre a écarté
> en bloc Matrix/Pyramid/Picture/la majorité de Relationship) en le rejugeant contre **les 28
> autres types de diagrammes Mermaid** listés dans `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md`,
> avec la méthode inversée décidée en session (2026-09-04) : partir de la forme SmartArt, pas du
> type Mermaid source.
>
> Source de l'énumération complète (~150 layouts, 9 catégories dont Office.com) : Microsoft
> Support, [*All SmartArt graphics, described*](https://support.microsoft.com/en-us/office/all-smartart-graphics-described-cf1a453b-de4a-4217-8da0-1aff97bb32cd),
> refetché le 2026-09-04. Les ~150 noms sont **tous** présents ci-dessous, dans un des tableaux —
> rien n'a été silencieusement laissé de côté.
>
> Méthode : la plupart des ~150 noms Microsoft sont des **habillages cosmétiques** (flèche vs
> chevron vs bloc, couleur, orientation) d'un même petit nombre de mécaniques de `dgm:layoutDef`
> sous-jacentes — confirmé empiriquement par le spike existant (`docs/adr/0004-smartart-feasibility-spike.md`) :
> une fois l'algorithme d'un archétype validé (`chain.ts`/`tree.ts`/`cycle.ts`), ses variantes
> visuelles ne sont qu'un changement de preset de forme/couleur, pas un nouvel algorithme. Le
> tableau ci-dessous regroupe donc par **archétype mécanique** (~14, contre ~150 noms), chaque
> ligne énumérant tous les noms Microsoft qui s'y rattachent — c'est ce regroupement qui rend
> "toutes les variantes couvertes" traitable sans 150 lignes redondantes.

## Tableau complet, par archétype

| # | Archétype (mécanique) | Layouts Microsoft couverts (toutes variantes) | Statut moteur | Mermaid source candidat(s) | Implémentation OOXML |
|---|---|---|---|---|---|
| 1 | **Chaîne linéaire** (séquence dirigée, N formes + N-1 flèches) | Basic/Vertical/Chevron/Bending/Circular Bending/Repeating Bending/Continuous Arrow/Continuous Block Process, Process Arrows, Process List, Segmented Process, Step Up/Down Process, Staggered Process, Upward Arrow, Descending Process, Increasing Arrows Process, Interconnected Block Process, Sub-Step Process, Phased Process, Accent Process, Alternating Flow, Detailed Process, Chevron List, Vertical Chevron/Arrow List, Increasing Circle Process, Pie Process, Equation/Vertical Equation, Gear (variante process), Basic/Vertical Block List, Vertical Box/Bullet List, Horizontal Bullet List, Tab List, Table List, Trapezoid List, Square Accent List, Lined List, Descending Block List, Stacked List, Alternating Hexagon List, Arrow Ribbon, Reverse List | ✅ construit (`chain.ts`) | flowchart chaîne (fait), `gitGraph` sans branche, petit `journey`/`timeline` linéaire, `kanban` en mode étapes | Déjà résolu — chaque nom ci-dessus est un reskin de preset de forme (`a:prstGeom`) sur le même `layoutDef` `chain.ts` ; aucun nouveau moteur à écrire, juste des variantes de style si demandées |
| 2 | **Chronologie datée** (chaîne + étiquette secondaire par étape) | Basic Timeline, Circle Accent Timeline, Timeline Pipe | ⚠️ variante mineure de #1 | `timeline`, `journey` (tâche + score), petit `gantt` | Extension de `chain.ts` : ajouter un second champ texte (`pres`) par point pour la date/le score — pas un nouvel algorithme |
| 3 | **Entonnoir / convergence / divergence** | Funnel, Converging Arrows, Converging Text, Random to Result Process, Diverging Arrows | ❌ **écarté avec preuve** (voir `smartart-layout-catalog.md` "layouts convergents") | flowchart merge-after-branch — **aucun mapping fiable** | Bloqué : `presParOf` n'autorise qu'un seul parent par point de présentation (testé empiriquement) ; `Funnel` seul reste non vérifié individuellement, à ne rouvrir que sur contre-exemple |
| 4 | **Cycle fermé** (boucle, dernier → premier) | Basic/Block/Continuous Cycle, Text Cycle, Segmented Cycle, Nondirectional/Multidirectional Cycle, Basic Pie, Gear (variante cycle) | ✅ construit (`cycle.ts`) | flowchart cycle (fait), petit `stateDiagram` cyclique, boucle `gitGraph` | Déjà résolu, reskin uniquement |
| 5 | **Radial / étoile** (un hub + satellites reliés au centre, pas entre eux) | Basic/Diverging Radial, Radial Cycle, Radial Cluster, Circle Relationship, Converging Radial, Radial List, Cycle Matrix, Hexagon Radial (Office.com) | ✅ **construit et livré (2026-09-04)** — `packages/core/src/diagrams/mindmap/`, pour `mindmap` uniquement | **`mindmap`** shippé — corrige le bug motivant `FUTURE_full_mermaid_coverage_SPEC.md` §1 (`root((mindmap))` mal-parsé silencieusement en flowchart). `architecture-beta` pas encore fait (nouveau type à part, pas engagé cette session). Topologie flowchart "étoile" délibérément pas ajoutée à `classify.ts` — voir note ci-dessous | Livré en formes OOXML pures (arbre radial/ballon : angle = secteur proportionnel à la taille du sous-arbre, rayon = palier fixe par profondeur), pas en `dgm:layoutDef` : les générateurs SmartArt existants (`chain`/`tree`/`cycle`) ne savent PAS dessiner de trait de connexion entre les formes (limitation documentée) — or les branches d'un mindmap sont précisément le point. Connecteurs en `wps:wsp`+`wps:cNvCnPr` (jamais `wps:cxnSp`, testé et invisible sous LibreOffice dans ce canevas). Bug réel trouvé et corrigé par le rendu LibreOffice : la taille de police n'était scalée nulle part dans `quadrant`/`venn`/`mindmap` une fois `scale &lt; 1` déclenché (jamais atteint avant, canevas mindmap le premier assez grand) — `canvas.ts` gagne `scaledFontSizeHalfPt`/`scaledLineWidthEmu`, appliqués aux 3 modules |
| 6 | **Hiérarchie / arbre** | Hierarchy, Horizontal Hierarchy, Horizontal Multi-Level Hierarchy, Organization/Horizontal Organization/Half Circle Organization/Name and Title Organization Chart, Architecture Layout, Table Hierarchy, Hierarchy List | ✅ construit, profondeur ≤ 2 (`tree.ts`) | flowchart arbre (fait), `classDiagram` héritage, `requirementDiagram` derive/satisfy, `treeView-beta`, containment C4 | Généralisation profondeur > 2 déjà identifiée comme chantier séparé dans `TODO.md` — même mécanique, imbrication récursive de `composite` en plus |
| 7 | **Hiérarchie libellée par niveau** | Labeled Hierarchy, Horizontal Labeled Hierarchy | ❌ **écarté avec preuve** (échantillon Word réel : étiquette par profondeur, pas par branche) | aucun bon candidat au-delà du cas `subgraph` déjà restreint et écarté | N/A |
| 8 | **Containment (anneaux imbriqués)** | Nested Target, Basic Target, Circle Picture Hierarchy (variante image, écartée) | 🔍 piste active, non spické | `subgraph` (conteneur, pas un nœud), regroupement `erDiagram`, frontières de conteneur C4 | Pas encore spické — prochaine étape déjà notée : demander un échantillon Word réel (`smartart-samples-wishlist.md`) avant d'écrire un `layoutDef` |
| 9 | **Matrice (grille N×N, quadrants indépendants)** | Basic Matrix, Titled Matrix, Grid Matrix | ✅ **construit et livré (2026-09-04)** — `packages/core/src/diagrams/quadrant/` | **`quadrantChart`** shippé (correspondance quasi littérale confirmée). `cynefin-beta` (même structure, pas encore fait), `wardley-beta` (plus faible, axes continus) | Livré en formes OOXML pures (`wps:wsp` rectangles + points), pas en `dgm:layoutDef` — confirmé à l'implémentation que le moteur SmartArt n'apportait rien de plus qu'un découpage de canevas ; voir `TODO.md` Phase 5+ pour le détail. Vérifié par rendu LibreOffice réel. |
| 10 | **Pyramide / empilement proportionnel** | Basic/Inverted Pyramid, Pyramid List, Segmented Pyramid | ❌ écarté | aucun type Mermaid n'exprime un empilement proportionnel | N/A |
| 11 | **Venn / ensembles chevauchants** | Basic Venn, Stacked Venn, Linear Venn, Radial Venn | ✅ **construit et livré (2026-09-04)** — `packages/core/src/diagrams/venn/` | **`venn-beta`** shippé (2 et 3 ensembles, géométrie de recouvrement réel ; 4+ dégrade proprement en rangée avec une note visible — voir `TODO.md` Phase 5+) | Livré en ellipses `wps:wsp` semi-transparentes (alpha 60%) — le mélange de couleur des zones de recouvrement vient gratuitement de l'empilement des cercles, aucune géométrie de lentille booléenne calculée à la main. Vérifié par rendu LibreOffice réel (2, 3 et 4+ ensembles). |
| 12 | **Liste / blocs groupés sans arête** | Grouped List, Vertical Box List, Table List, Trapezoid List, Square Accent List, Vertical Bracket/Accent List, Stacked List | ❌ **déjà écarté pour `subgraph`** (enfants Mermaid ont presque toujours des arêtes internes) | reste valable pour du contenu Mermaid réellement sans arête : colonnes `kanban` (les cartes n'ont pas d'arêtes entre elles), petite `pie` en repli texte (2-3 parts), liste `requirementDiagram` sans relations | Réutilise `chain.ts` en mode liste (déjà partiellement validé via le spike `custom-chain1`, voir `smartart-layout-catalog.md`), simplement sans dessiner les connecteurs |
| 13 | **Comparaison à 2 idées** (dégénérescence N=2 de #1) | Plus and Minus, Balance, Opposing/Counterbalance Arrows, Opposing Ideas, Arrow Ribbon | ⚠️ cas limite de #1, pas de moteur dédié | flowchart à 2 nœuds — anecdotique, pas prioritaire | Cas particulier de `chain.ts`, N=2, pas d'engineering séparé |
| 14 | **Image par élément** | Les ~28 layouts de la catégorie Picture (Accented Picture, Alternating Picture Blocks/Circles, Bending Picture *, Bubble/Captioned/Circular/Framed/Hexagon/Picture Accent/Grid/Lineup/Strips/Snapshot/Spiral/Titled Picture *, etc.) + variantes image d'autres catégories (Bending/Continuous/Horizontal/Vertical Picture *, Picture Accent Process, Picture Organization Chart, Circle Picture Hierarchy) + Office.com Picture Frame/Radial Picture List/Theme Picture * | ❌ écarté | aucun nœud Mermaid ne porte d'image — nécessiterait une fonctionnalité entièrement nouvelle (upload d'image par nœud), jamais demandée | N/A |

Total couvert : 14 archétypes pour ~150 noms Microsoft ; aucun nom de la liste source n'est absent
d'une des lignes ci-dessus (les Picture/Office.com résiduels sont regroupés en #14/dans les lignes
correspondantes plutôt que listés un par un, mécanique identique).

## Note — topologie "étoile" délibérément pas ajoutée à `classify.ts` (2026-09-04)

Ligne #5 ci-dessus dépend d'un point déjà signalé dans `smartart-layout-catalog.md` (§ catégories
écartées) : un flowchart Mermaid réellement en étoile (un nœud central relié vers/depuis tous les
autres, sans hiérarchie ni boucle) n'a **aujourd'hui aucune catégorie** dans `classify.ts` — il
tombe en `merge-after-branch` (si le hub a plusieurs arêtes entrantes) ou `irregular-topology`
sinon.

**Décision prise en construisant l'archétype radial** : ne pas ajouter cette 4ᵉ topologie. Un hub
fan-in flowchart (`A --> Hub; B --> Hub; C --> Hub`) rend déjà correctement via le pipeline OOXML
existant (`merge-after-branch` retombe sur `ooxml-translator.ts`), **avec de vrais traits de
connexion** — ce que `chain`/`tree`/`cycle` ne savent justement pas dessiner (limitation
documentée dans `cycle.ts`). Ajouter un archétype SmartArt `star` pour ce cas n'aurait donc
apporté aucun gain réel, seulement de la complexité. La vraie valeur de l'archétype radial était
ailleurs : `mindmap`, un type Mermaid **jusque-là non supporté du tout** (et source d'un vrai bug
de mauvais-aiguillage silencieux, voir la ligne #5 ci-dessus) — c'est là qu'il a été livré.

## Deux exceptions à la règle "toujours du SmartArt self-authored"

Le reste de ce projet (chain/tree/cycle) suit la règle "self-authored `dgm:layoutDef`" pour éviter
de redistribuer le contenu Microsoft (voir [[feedback-licensing-caution-smartart]]). Ce tableau fait
apparaître deux cas où **sortir carrément du moteur `dgm:`** est la meilleure implémentation, pas un
contournement :

- **Venn (#11)** — le mécanisme `dgm:` natif est trop complexe à réauthentifier pour peu de gain ;
  des ellipses `wps:wsp` positionnées à la main (déjà la primitive de base du traducteur flowchart)
  suffisent et sont plus robustes.
- **Matrice/quadrant (#9)** — également jouable en pur `wps:wsp` (4 rectangles + texte), le `dgm:`
  n'apporte rien de plus qu'un simple découpage de canevas.

Dans les deux cas, ça veut dire : pas besoin d'attendre une deuxième génération de moteur SmartArt
pour livrer ces deux archétypes — ils peuvent passer par le traducteur OOXML "formes" existant,
étendu, plutôt que par `packages/core/src/smartart/`. Reste à confirmer si on les range comme
"SmartArt visuel" (répond à la demande initiale : petit N → rendu type-galerie) ou "OOXML" dans la
terminologie du projet — question de classification interne, pas de faisabilité.

## Ce que ce document ne fait pas

Identique à `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` §6 : aucune syntaxe Mermaid détaillée,
aucun code modifié, aucun engagement de date. Les deux archétypes les plus prometteurs à date
(Matrice #9 pour `quadrantChart`/`cynefin-beta`, Radial #5 pour `mindmap`/`architecture-beta`) sont
des candidats de priorisation à trancher avec le mainteneur, pas une décision prise ici.
