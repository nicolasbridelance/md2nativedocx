# Catalogue des layouts SmartArt — pertinence pour un flowchart Mermaid

> Document de référence, pas une spec d'implémentation. Objectif : donner à un successeur une vue
> d'ensemble de **tout** ce que la galerie SmartArt de Word propose, et un jugement explicite sur
> ce qui est exploitable pour représenter un flowchart Mermaid — avec les hypothèses/limites déjà
> découvertes empiriquement dans `docs/adr/0004-smartart-feasibility-spike.md` et
> `docs/adr/spikes/spike-smartart/spike.md`. Source de l'énumération complète : Microsoft Support,
> [*All SmartArt graphics, described*](https://support.microsoft.com/en-us/office/all-smartart-graphics-described-cf1a453b-de4a-4217-8da0-1aff97bb32cd)
> (~150 layouts, 8 catégories + Office.com). Beaucoup de layouts apparaissent dans plusieurs
> catégories à la fois (ex. `Gear` dans Process et Cycle) — Microsoft les classe par usage, pas par
> mécanique sous-jacente.

## Comment marche un SmartArt, en bref (ce qu'on a vérifié empiriquement cette session)

Un diagramme SmartArt = un `dgm:dataModel` (les nœuds/relations, `word/diagrams/dataN.xml`) +
un `dgm:layoutDef` (l'algorithme de rendu, `word/diagrams/layoutN.xml`). Le second calcule la
géométrie à partir du premier — c'est le moteur de layout, pas nous, qui place les formes. Deux
familles de mécaniques observées :

- **Algorithmes "dynamiques"** (`forEach axis="ch"` parcourant les enfants du nœud courant en
  direct) : le nombre de formes s'adapte automatiquement au nombre de nœuds de données, aucune
  donnée de présentation à pré-calculer. **Confirmé fonctionnel dans un vrai Word** pour un
  algorithme personnalisé de liste plate (`docs/adr/spikes/spike-smartart/custom-algo/`,
  `custom-chain1.docx`, capture d'écran validée). **Confirmé non fonctionnel sous LibreOffice**,
  quel que soit l'algorithme (même le plus simple, même 100 % conforme à un exemple documenté par
  Microsoft) — LibreOffice ne semble jamais exécuter `forEach`/`presOf` lui-même.
- **Algorithmes "à cache de présentation"** (le vrai `hierarchy1` intégré de Word observé) : le
  `dataModel` porte lui-même un miroir déjà résolu de nœuds `type="pres"` (voir Round 3/4 de
  `spike.md` — motif exact reconstruit : un bundle fixe de 5 nœuds par profondeur, table de noms
  fixe). **Fonctionne dans Word ET LibreOffice** quand ce miroir est présent (v2/v4 du spike) ;
  **échoue dans les deux** s'il est absent (v3/v5), y compris avec l'algorithme authentique.
- **Hypothèse non encore testée, la plus prometteuse pour la suite** : générer nous-mêmes ce
  miroir `pres` pour NOTRE PROPRE algorithme (pas besoin de copier celui de Microsoft, juste de
  produire la même structure de cache pour nos propres noms de `layoutNode`) — pourrait débloquer
  la compatibilité LibreOffice sans le risque de licence. Prochaine expérience à mener, pas encore
  faite au moment d'écrire ce document.
- **Limite dure déjà rencontrée** : le `hierarchy1` intégré de Word est plafonné à 4 niveaux de
  profondeur (aucun `layoutNode` défini au-delà de `hierChild5`) — une limite de *son*
  implémentation, pas du format. Un algorithme personnalisé n'a pas cette contrainte par
  construction (on choisit combien de niveaux explicites écrire), mais l'imbrication réelle
  (formes enfants positionnées sous une forme parent, pas juste une liste plate) reste en cours de
  validation au moment d'écrire ce document — voir TODO.md.
- **Contrainte transversale à tous les layouts hiérarchiques/liste** (spec §6, §10.1) : aucun
  layout SmartArt ne représente nativement une **fusion après branchement** (deux flèches
  convergeant vers un même nœud) — sauf peut-être certains layouts "convergents" listés plus bas,
  jamais testés.

## Verdict par catégorie

| Catégorie | Pertinence pour un flowchart Mermaid | Pourquoi |
|---|---|---|
| **List** | Élevée pour `chain` et pour la représentation de `subgraph` (listes groupées) | Structure la plus proche d'une séquence ou d'un regroupement simple ; plusieurs layouts gèrent explicitement des sous-groupes |
| **Process** | Élevée pour `chain` | C'est la catégorie visée par le `process1`/`verticalProcess1` déjà cité en §4 de la spec ; contient aussi des layouts "convergents" à creuser pour la fusion |
| **Cycle** | Élevée pour `cycle` | Correspond directement à la topologie cycle déjà dans le classifieur (`cycleMatrix`/`basicCycle`) |
| **Hierarchy** | Élevée pour `tree`, et piste "subgraph = hiérarchie libellée" | Contient `Labeled Hierarchy`, qui correspond exactement à l'idée notée par le mainteneur (voir section dédiée) |
| **Relationship** | Faible à moyenne, ponctuelle | Essentiellement des relations non-dirigées (Venn, cible, balance) — hors sujet pour un graphe dirigé, sauf 2-3 exceptions listées |
| **Matrix** | Nulle | Grille 2 axes à contenu libre par quadrant — aucune notion de nœud/arête |
| **Pyramid** | Nulle | Empilement proportionnel — pas une structure de graphe |
| **Picture** | Nulle | Toutes les variantes exigent une image par élément ; aucune n'a de sens pour du texte de nœud Mermaid |
| **Office.com** | Nulle à faible | Extension de la galerie en ligne, mêmes mécaniques que List/Process/Cycle déjà couvertes, rien de structurellement nouveau |

## Layouts List/Process/Cycle/Hierarchy détaillés — pertinents pour `chain`/`tree`/`cycle`

| Layout | Mécanique (description Microsoft + ce qu'on en déduit) | Pertinent ? | Pourquoi / tweaks / limites |
|---|---|---|---|
| **Basic Process** | Séquence horizontale de formes, une flèche entre chaque paire. | ✅ Oui — c'est `chain` | Correspond à `process1` déjà cité §4. Mapping direct : chaque nœud Mermaid d'une chaîne = un élément de la liste, dans l'ordre. |
| **Vertical Process** | Identique à Basic Process, orientation verticale. | ✅ Oui | Choix selon `direction: TD` vs `LR` du flowchart Mermaid — mapping déjà anticipé en §4 (`process1` LR / `verticalProcess1` TB). |
| **Basic Block List** | Liste de blocs, pas nécessairement séquentielle (pas de flèches entre eux). | ⚠️ Partiel | Fonctionne pour une chaîne *sans* labels d'arête visibles (pas de connecteur dessiné) — moins fidèle qu'un vrai Process si les arêtes Mermaid ont un sens directionnel fort. C'est le layout utilisé par notre propre spike `custom-chain1` (transcription de l'exemple documenté Microsoft), donc déjà partiellement validé techniquement. |
| **Continuous Arrow Process** / **Continuous Block Process** | Process en boucle visuelle continue (les flèches s'enchaînent visuellement) mais reste une séquence linéaire de données, pas un vrai graphe cyclique. | ❌ Non pour `cycle` | Ne pas confondre avec un cycle réel (`type="doc"` topologie fermée) — c'est cosmétique, la donnée sous-jacente reste linéaire. Utile seulement si on veut styliser une chaîne comme "continue" sans que ce soit un vrai cycle Mermaid. |
| **Grouped List** | Groupes + sous-éléments, sous-éléments **sans lien entre eux** (puces). | ⚠️ Déjà écarté en §5 de la spec | Rappel : la spec a déjà exploré et écarté cette option pour `subgraph` — les sous-éléments Mermaid ont presque toujours des arêtes internes, incompatibles avec un simple "groupe + puces". Gardé ici pour mémoire, pas une piste nouvelle. |
| **Vertical Box List** | Liste verticale de boîtes, chaque boîte pouvant avoir un sous-texte secondaire (2 niveaux : titre + description). | ⚠️ Partiel, idée à creuser | Le "sous-texte" pourrait porter un **label d'arête sortante** au lieu d'une description libre — alternative à la convention "Oui : texte du nœud enfant" déjà retenue en §5.2 de la spec pour l'arbre. Pas testé. |
| **Basic Cycle** / **Continuous Cycle** / **Block Cycle** | Nœuds disposés en cercle, connectés dans l'ordre, dernier → premier. | ✅ Oui — c'est `cycle` | Correspond à `basicCycle` déjà cité §4. Perd le sens de la direction LR/TD du Mermaid original (déjà noté comme limite connue en §4). |
| **Segmented Cycle** | Comme Basic Cycle mais chaque segment a un poids visuel égal (camembert). | ⚠️ Partiel | Peut convenir si le nombre de nœuds du cycle est petit (3-6) ; devient illisible au-delà, plus vite qu'un Basic Cycle classique. |
| **Radial Cycle** / **Diverging Radial** | Nœuds autour d'un centre, chacun relié au centre (étoile), pas nécessairement entre eux. | ❌ Non pour `cycle` classique | Topologie "étoile" (un hub + rayons), pas une boucle fermée — correspondrait plutôt à un Mermaid où un seul nœud a des arêtes vers/depuis tous les autres. Cas non couvert par le classifieur actuel (serait une 4ᵉ topologie, ni chain/tree/cycle). |
| **Hierarchy** | L'algorithme `hierarchy1` déjà entièrement spické cette session. | ✅ Oui — `tree` | Voir ADR 0004 pour tout le détail (plafond profondeur 4, motif `pres`, licence). |
| **Horizontal Hierarchy** | Identique à Hierarchy, orienté gauche→droite. | ✅ Oui | Correspond à `hierarchyLeftToRight` déjà cité §4. Vérifié dans l'échantillon réel fourni par le mainteneur (`SmartArt-Hierarchie+Hierarchiehorizontale.docx`, diagramme 2 = `hierarchy2`) — **mais `hierarchy2` n'a pas encore été spické en détail** (on a seulement confirmé son `uniqueId` et sa présence, pas son motif `pres` ni son plafond de profondeur — pourrait différer de `hierarchy1`). |
| **Organization Chart** | Hiérarchie avec un algorithme dédié (`orgChart1`), assistants/pointillés latéraux distincts des relations parent-enfant classiques. | ⚠️ Distinct de `hierarchy1`, non spické | La spec §4 mentionne déjà cette distinction (hierarchy1 ≠ orgChart1). Pourrait avoir un motif `pres`/plafond de profondeur différent — à spiker séparément si utile un jour (ex. pour un flowchart qui ressemble à un organigramme). |
| **Labeled Hierarchy** / **Horizontal Labeled Hierarchy** | Comme Hierarchy, mais chaque **niveau** (pas chaque nœud) porte une étiquette latérale distincte du contenu des boîtes. | 🔍 **Piste notée par le mainteneur, à creuser en priorité** | Voir section dédiée ci-dessous — correspondance directe avec l'idée "subgraph = hiérarchie libellée". |
| **Hierarchy List** | Hiérarchie affichée horizontalement avec des groupes de type liste (mélange Hierarchy/List). | 🔍 À creuser | Pourrait convenir à un `subgraph` avec plusieurs enfants au même niveau sans lien interne fort — alternative à Grouped List, jamais testée. |
| **Table Hierarchy** | Hiérarchie construite de bas en haut façon organigramme inversé, dans un tableau. | ❌ Peu probable | Direction "bottom-up" peu naturelle pour un flowchart Mermaid typiquement TD/LR. |
| **Circle Picture Hierarchy** / **Picture Organization Chart** | Variantes Hierarchy/OrgChart nécessitant une image par nœud. | ❌ Non | Un nœud Mermaid n'a pas d'image associée par défaut — hors scope sans fonctionnalité supplémentaire (upload d'image par nœud, jamais demandé). |

## Piste à creuser : `Labeled Hierarchy` pour représenter un `subgraph`

Le mainteneur a noté cette idée avant de connaître le nom exact du layout Microsoft concerné —
`Labeled Hierarchy` / `Horizontal Labeled Hierarchy` correspondent très probablement à l'intuition
("hiérarchie libellée") : dans ce layout, chaque **niveau hiérarchique complet** porte une
étiquette dédiée à côté (pas une boîte de plus dans l'arbre, contrairement au bricolage "niveau
supplémentaire" déjà retenu §5 de `FUTURE_mmd2smartart_SPEC.md`).

Pourquoi c'est potentiellement mieux que le bricolage actuel : la limitation n°1 identifiée en §5.1
de la spec ("le titre du sous-graphe devient une boîte parente en plus, pas un cadre autour du
groupe") pourrait disparaître si le titre du `subgraph` devient l'étiquette de niveau plutôt qu'un
nœud fictif dans l'arbre — fidélité sémantique bien supérieure au Mermaid d'origine (un `subgraph`
Mermaid *est* un cadre autour d'un groupe, pas un nœud).

**Non vérifié à ce stade** :
- Structure exacte du `dataModel`/`layoutDef` de `labelHierarchy1` (aucun échantillon réel extrait
  pour ce layout précis — seulement `hierarchy1`/`hierarchy2` l'ont été jusqu'ici).
- Est-ce que l'étiquette de niveau peut varier librement par sous-arbre (un `subgraph` différent
  par branche) ou si elle s'applique uniformément à tout un niveau de profondeur — si c'est ce
  second cas, ça ne correspondrait qu'à un Mermaid où **tous** les nœuds d'une même profondeur
  appartiennent au même `subgraph`, un cas bien plus restrictif que le Mermaid réel (où deux
  branches à la même profondeur peuvent appartenir à des `subgraph` différents ou à aucun).
- Prochaine étape concrète si cette piste est retenue : demander un nouvel échantillon Word réel
  (créer un SmartArt "Hiérarchie libellée" à la main) et l'analyser avec la même méthode que
  `hierarchy1`/`hierarchy2` (Round 1-4 de `spike.md`).

## Piste à creuser : layouts "convergents" pour la fusion après branchement

Plusieurs layouts décrivent explicitement une **convergence** de plusieurs éléments vers un point
unique — exactement le pattern "fusion après branchement" que `hierarchy1`/`chain`/`cycle`
excluent tous systématiquement aujourd'hui (spec §6, le pattern probablement le plus fréquent dans
un vrai flowchart utilisateur, cf. §10.1) :

| Layout | Description Microsoft | Catégorie |
|---|---|---|
| **Converging Arrows** | "Montrer des idées ou concepts qui convergent vers un point." | Process, Relationship |
| **Converging Text** | "Montrer plusieurs étapes ou parties qui fusionnent en un tout." | Process, Office.com |
| **Funnel** | "Montrer le filtrage d'information ou comment des parties fusionnent." | Process, Relationship |
| **Random to Result Process** | "Montrer comment plusieurs idées chaotiques aboutissent à un objectif unifié." | Process |

**Aucun de ces layouts n'a été spické** — inconnu si leur `dataModel` accepte une topologie
"plusieurs sources, une destination" à arité variable (2 branches ? N branches ?) ou s'ils sont
figés à un nombre fixe d'éléments convergents (comme beaucoup de layouts SmartArt le sont pour les
formes décoratives). Si l'un de ces layouts s'avère généralisable, ça lèverait la limitation la
plus citée dans tout ce chantier (fusion après branchement, cf. `FUTURE_mmd2smartart_SPEC.md` §6,
§10.1) — mais ce serait un **4ᵉ chemin de classification**, distinct de chain/tree/cycle, avec son
propre spike complet à mener (même méthodologie : Phase 0 → extraction Word réelle → Round 1-4).

## Catégories écartées — détail sommaire (pas de tableau ligne par ligne, ~90 layouts au total)

- **Matrix** (Basic Matrix, Cycle Matrix, Grid Matrix, Titled Matrix) : grille à 2 axes, chaque
  quadrant porte un contenu libre indépendant — aucune notion de nœud/arête à faire correspondre à
  un flowchart. `Cycle Matrix` apparaît aussi en Cycle/Relationship mais reste fondamentalement une
  grille avec un thème central, pas un graphe dirigé.
- **Pyramid** (Basic Pyramid, Inverted Pyramid, Pyramid List, Segmented Pyramid) : empilement
  proportionnel outrepassant à peine 3-5 niveaux fixes, sémantique "plus on monte, plus on est
  spécifique/rare" — aucune notion d'arête dirigée entre éléments.
- **Picture** (~31 layouts) : toutes les variantes exigent une image par élément de la galerie
  (`Bending Picture Blocks`, `Circular Picture Callout`, etc.) — un nœud Mermaid n'a pas d'image
  associée, et en ajouter une supposerait une fonctionnalité entièrement nouvelle (upload d'image
  par nœud) jamais demandée dans ce projet.
- **Relationship, le reste** (Basic Venn, Balance, Basic Target, Nested Target, Stacked Venn,
  Linear Venn, Opposing Ideas, Counterbalance Arrows...) : relations non-dirigées de type
  "chevauchement d'ensembles" ou "containment" — un flowchart Mermaid encode des relations
  dirigées explicites (`-->`), pas des ensembles qui se chevauchent. Les quelques exceptions
  potentiellement pertinentes (`Circle Relationship`, `Radial Cluster`, `Radial List` — topologie
  "étoile", un hub relié à N satellites) ne correspondent à aucune des topologies déjà couvertes
  par le classifieur (chain/tree/cycle) — un flowchart Mermaid en étoile réelle (un nœud central
  avec arêtes vers/depuis tous les autres, sans hiérarchie ni boucle) n'a d'ailleurs pas de
  catégorie dédiée aujourd'hui dans `classify.ts`, il tomberait actuellement en `unsupported`
  (`merge-after-branch` si le hub reçoit plusieurs arêtes entrantes, ou `irregular-topology` sinon).
- **Office.com** : mêmes mécaniques que List/Process/Cycle déjà couvertes ci-dessus sous d'autres
  noms (`Circle Process` ≈ Basic Cycle, `Hexagon Radial` ≈ Radial Cycle, etc.) — pas de nouvelle
  structure de données à évaluer séparément.

## Résumé pour décision

- **Aujourd'hui couvert par le classifieur** (`packages/core/src/smartart/classify.ts`) :
  `chain` (Process/Basic Block List), `tree` (Hierarchy, profondeur ≤ 4), `cycle` (Cycle).
- **Pistes concrètes identifiées par ce catalogue, non encore spické** : `Labeled Hierarchy` pour
  `subgraph` (probablement la piste la plus prometteuse et la plus alignée avec l'intuition
  "subgraph = cadre visuel, pas un nœud" du Mermaid d'origine), et les layouts convergents
  (`Converging Arrows`/`Converging Text`/`Funnel`) pour lever la limitation "fusion après
  branchement" — la plus citée dans toute cette spec.
- **Écarté avec justification** : Matrix, Pyramid, Picture (toutes catégories), la majorité de
  Relationship — aucun n'a de structure nœud/arête compatible avec un flowchart dirigé.
