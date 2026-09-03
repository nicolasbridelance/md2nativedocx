# FUTURE — `mmd2smartart` (spec de première intention)

> Statut (mis à jour 2026-09-03) : spec de cadrage, **partiellement implémentée**. Le classifieur
> (`classify.ts`) et les 3 générateurs `chain`/`tree`/`cycle` (`chain.ts`/`tree.ts`/`cycle.ts`) sont
> livrés, testés, **et validés par rendu LibreOffice réel** (pas seulement par test XML — cette
> vérification a justement révélé un bug de rendu bloquant sur `chain.ts`, corrigé le même jour,
> voir §3.1 point 4). Direction (`TD`/`LR`), couleur par nœud (`classDef`) et libellés d'arête
> (convention §5.2) sont également implémentés dans les 3 générateurs (2026-09-03, en poussant vers
> le 100% de la colonne SmartArt de `docs/smartart-compliance-table.md`). Le dispatch classifieur →
> générateur dans le vrai pipeline (§7 étape 5) n'est, lui, toujours pas câblé — voir `TODO.md`
> "Phase 6/7" pour le détail à jour.
> Plusieurs décisions de cette section datent d'avant les spikes Round 3-5
> (`docs/adr/0004-smartart-feasibility-spike.md`, `docs/adr/spikes/spike-smartart/spike.md`) qui
> ont invalidé ou précisé des points ci-dessous — chaque écart est signalé inline par un encart
> "**Mise à jour (spike)**". À escalader avant tout code additionnel (nouvelle branche de
> sortie de `packages/core`, manipulation zip non déléguée à Pandoc — voir §7).
> Positionnement : **complément** au traducteur OOXML natif existant (`wpg:wgp`/`custGeom`), pas
> un remplacement. Le moat (layout Dagre + graphe arbitraire → formes natives) reste le chemin
> par défaut ; `mmd2smartart` ne s'active que sur un sous-ensemble de topologies "sages"
> volontairement restreint (§4), en excluant explicitement les layouts non pertinents pour un
> flowchart (pas de matrice, pyramide, tuiles hexagonales, image accent, etc.).
> Voir `docs/smartart-layout-catalog.md` pour le catalogue complet des ~150 layouts SmartArt
> existants et le jugement de pertinence par layout (pistes non explorées : `Labeled Hierarchy`
> pour `subgraph`, layouts convergents pour la fusion après branchement).

---

## 1. Pourquoi

SmartArt délègue le calcul de layout au moteur de Word lui-même (pas de Dagre côté client) et
expose une édition beaucoup plus proche de l'abstraction Mermaid pour l'utilisateur final :
changer de disposition, réordonner une étape, ajouter une branche — tout ça au clic, sans
manipuler des formes individuelles. C'est un vrai gain UX pour le sous-ensemble de diagrammes
où ça s'applique.

Contrepartie assumée dès le départ : perte de la fidélité "même moteur que l'aperçu Mermaid"
mise en avant dans le tableau de positionnement du README pour tout diagramme routé vers ce
chemin, et perte de la distinction visuelle rectangle/losange sur la plupart des layouts simples
(nuancé en §5.1 : récupérable par nœud via `dgm:pt/spPr`).

---

## 2. Recherche — Pandoc gère-t-il l'ajout de parties OOXML custom ?

**Non.** Vérifié : le mécanisme `pandoc.mediabag` gère l'incorporation automatique
d'images (fichier binaire → `word/media/` + relation ajoutée par l'écrivain docx), mais rien
d'équivalent n'existe pour des parties XML arbitraires avec un type de relation et un
`Content_Types` custom. Le filtre Lua peut injecter du XML *dans* `document.xml` via
`RawBlock('openxml', ...)` (c'est exactement ce que `md2nativedocx.lua` fait déjà pour les
formes), mais il n'a pas de prise sur la structure de paquet (nouvelles parties, `.rels`,
`[Content_Types].xml`) — ce n'est pas exposé par l'API Lua de Pandoc côté écriture docx.

**Conséquence** : comme anticipé, on fait à la main. Le point d'ancrage naturel est
`packages/cli/src/postprocess.mjs`, qui fait déjà de la chirurgie zip post-Pandoc (correction de
`mc:Ignorable`, renumérotation d'ids). On l'étend pour :
1. injecter les nouvelles parties (`word/diagrams/data{N}.xml`, `word/diagrams/layout{N}.xml`,
   éventuellement `colors{N}.xml`/`quickStyle{N}.xml` — voir §3) dans l'archive ZIP,
2. ajouter les relations correspondantes dans `word/_rels/document.xml.rels`,
3. ajouter les overrides dans `[Content_Types].xml`,
4. renuméroter les `r:id` de façon cohérente avec ce que fait déjà la renumérotation globale
   des ids de dessin.

Pas un blocage technique — le même type d'opération (édition ZIP ciblée) est déjà en place et
testé pour d'autres correctifs. C'est un ralentisseur : plus de surface de code, plus de tests
de non-régression sur la structure du paquet (cf. le bug `mc:Ignorable` du 2026-09-02, qui montre
que ce type d'erreur passe inaperçu tant qu'on ne teste pas dans un vrai Word).

---

## 3. Anatomie d'un SmartArt dans un `.docx`

Un diagramme SmartArt est référencé dans `document.xml` via :

```xml
<w:drawing>
  <wp:inline>
    <a:graphic>
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">
        <dgm:relIds r:dm="rIdData" r:lo="rIdLayout" r:qs="rIdStyle" r:cs="rIdColors"/>
      </a:graphicData>
    </a:graphic>
  </wp:inline>
</w:drawing>
```

Quatre parties associées, mais **seulement deux obligatoires** (confirmé, doc Microsoft) :

| Partie | Relationship type | Obligatoire | Rôle |
|---|---|---|---|
| `diagramData{N}.xml` | `.../diagramData` | ✅ | Le modèle nœuds/relations (`dgm:dataModel`, `dgm:pt`, `dgm:cxn`) — équivalent du graphe Mermaid parsé |
| `diagramLayout{N}.xml` | `.../diagramLayout` | ✅ | Référence à l'algorithme SmartArt (ex. `urn:microsoft.com/office/officeart/2005/8/layout/hierarchy1`) |
| `diagramColors{N}.xml` | `.../diagramColors` | ❌ | Si absent, hérite du thème Word actif |
| `diagramQuickStyle{N}.xml` | `.../diagramStyle` | ❌ | Si absent, hérite du style par défaut |

**Simplification MVP directement issue de cette recherche** : n'émettre que `data` + `layout`.
Ça réduit la chirurgie ZIP de 4 parties + 4 relations à 2 + 2, et le rendu final s'adapte
automatiquement au thème du document cible plutôt que d'imposer une palette — comportement
préférable de toute façon pour un outil qui s'insère dans un document existant.

> **Mise à jour (spike, Round 5)** : cette simplification MVP tient **uniquement pour un algorithme
> `layoutDef` réel de Word** (ex. `hierarchy1`), que Word sait résoudre dynamiquement sans `colors`/
> `quickStyle`. Elle ne tient **pas** pour un algorithme 100 % auto-écrit (décision de licence
> ci-dessous, §3.1) : sans `quickStyle`, le rendu régresse à du texte seul, sans aucune forme
> visible, dans Word **et** LibreOffice (`custom-chain1-nostyle.docx`). Le générateur `chain.ts`
> livré émet donc les **4 parties**, pas 2 — voir §3.1 et §7 étape 4 (signature mise à jour).
> `colors` reste la seule des deux parties optionnelles réellement omissible sans perte visuelle
> majeure si on accepte de perdre le contrôle fin de palette ; `quickStyle` est, lui, obligatoire
> en pratique dès qu'on n'utilise pas l'algorithme intégré de Word.

### 3.1 Mise à jour (spike Round 4/5) — décision de ne pas utiliser `hierarchy1`, recette réelle à 4 parties

Trois découvertes du spike (`docs/adr/0004-smartart-feasibility-spike.md`,
`docs/adr/spikes/spike-smartart/spike.md`) changent la suite de conception par rapport à la version
initiale de cette section, écrite avant tout test dans un vrai Word/LibreOffice :

1. **Décision de licence** : le générateur n'utilisera **jamais** le vrai `layout1.xml` de Word
   (l'algorithme intégré `hierarchy1`, contenu propriétaire Microsoft) — risque de redistribution
   dans ce dépôt CC0. À la place, chaque topologie supportée (chain/tree/cycle) a son propre
   `dgm:layoutDef` **entièrement auto-écrit**, dans le vocabulaire public ECMA-376/Open-XML-SDK
   (`composite`/`tx`/`lin`/`forEach`, etc. — pas de nouveau schéma, juste pas de contenu copié).
   Conséquence directe sur la table du §4 : la colonne "Layout SmartArt (URN)" ne référence plus
   les URNs `urn:microsoft.com/office/officeart/...` de Word, mais des URNs `urn:md2nativedocx/...`
   propres à ce projet (voir `CHAIN_LAYOUT_XML` dans `chain.ts` pour l'exemple `chain`).
2. **Recette de rendu confirmée à 4 parties, pas 2** (Round 5) : un algorithme auto-écrit a besoin,
   pour s'afficher correctement dans Word **et** LibreOffice, de (a) son `layoutDef`, (b) un
   `data1.xml` portant **à la fois** le graphe logique (`parOf`) **et** un miroir de présentation
   `presOf`/`presParOf` construit à la main (même technique récursive que celle isolée sur le vrai
   `hierarchy1` en Round 4, reciblée sur les noms de `layoutNode` de notre propre algorithme —
   Word seul sait résoudre ce miroir dynamiquement via `forEach`, LibreOffice non), (c) un
   `colorsDef`, (d) un `styleDef`/`quickStyle`. Les 4 parties peuvent être **entièrement
   auto-écrites** (aucune n'a besoin de contenu Microsoft) — confirmé indépendamment pour chacune.
3. **Le plafond de profondeur documenté au §4 (arbre) et implémenté dans `classify.ts`
   (`MAX_TREE_DEPTH`) n'est plus celui de l'algorithme `hierarchy1` de Word (4)** — ce plafond n'a
   jamais été une contrainte du format OOXML : un `layoutDef` auto-écrit (point 1 ci-dessus) n'a
   aucune limite de profondeur intrinsèque, la profondeur devient un choix de conception (combien
   de niveaux explicites écrire). **Tranché (2026-09-03)** : `MAX_TREE_DEPTH` vaut désormais **2**
   (racine + une rangée d'enfants directs) — pas une limite du format, mais de `tree.ts`'s
   générateur actuel, dont le `layoutDef` répartit une hauteur fixe (35 %/55 %) à un seul niveau
   d'imbrication ; répéter ce partage à un niveau supplémentaire léserait tout nœud sans
   petit-enfant, puisque le partage n'est pas calculé à partir de la forme réelle du sous-arbre
   (contrairement à `hierarchy1`, qui est dynamique). Généraliser à une profondeur adaptative reste
   un chantier séparé, non fait. Voir le commentaire de doc de `MAX_TREE_DEPTH` dans `classify.ts`
   et de `TREE_LAYOUT_XML` dans `tree.ts`.
4. **Bug critique trouvé et corrigé le même jour sur `chain.ts` (déjà "livré")** : le rendu réel
   (LibreOffice headless) de la sortie de `generateChain()` — jamais vérifié jusqu'ici, seule la
   structure XML était testée — était **entièrement blanc**. Cause : il manquait le connecteur
   `presOf` reliant le point `doc` lui-même à `p-root` (présent dans tous les fichiers de spike
   validés manuellement, oublié lors de la généralisation en générateur). Corrigé, et la même
   correction s'est révélée nécessaire pour `tree.ts`. **Leçon retenue** : les tests unitaires
   XML-only ne suffisent pas à détecter un rendu blanc — vérifier tout nouveau générateur SmartArt
   par un rendu LibreOffice réel avant de le considérer "livré" (voir `TODO.md`).

---

## 4. Classifieur de topologie

Fonction pure, testable indépendamment du reste (`packages/core/src/smartart/classify.ts`),
branchée juste après le parseur Mermaid existant, **avant** Dagre — zéro couplage avec le
moteur de layout actuel.

```
classifyTopology(flowchart: Flowchart): 'chain' | 'tree' | 'cycle' | 'unsupported'
```

| Topologie détectée | Condition | Layout SmartArt (`layoutDef` URN) | Avantage | Limitation |
|---|---|---|---|---|
| **Chaîne** | Tout nœud a in-degré ≤1 ET out-degré ≤1 (chemin simple) | auto-écrit, `urn:md2nativedocx/smartart-layout/chain1` — **livré** (`chain.ts`) | Réordonnancement au glisser-déposer, style en 1 clic | Casse dès qu'un nœud a 2 sorties |
| **Arbre** | Chaque nœud a au plus 1 parent, pas de fusion, pas de cycle, profondeur ≤ 2 (`MAX_TREE_DEPTH`) | auto-écrit, `urn:md2nativedocx/smartart-layout/tree1` — **livré** (`tree.ts`), rendu validé | Ajout/suppression de branches natif dans Word ; **forme par nœud préservable** (§5.1) | Une fusion casse tout ; pas de texte natif sur les connecteurs (§5.2) ; profondeur limitée à 2 (racine + enfants directs), voir §3.1 point 3 |
| **Cycle** | in-degré = out-degré = 1 pour chaque nœud, boucle fermée | auto-écrit, `urn:md2nativedocx/smartart-layout/cycle1` — **livré** (`cycle.ts`), rendu validé | Rendu circulaire propre — Dagre ne le fait pas nativement | Direction LR/TD de Mermaid perd son sens (pas d'orientation naturelle pour un cercle, une seule variante de layout) |
| *(tout le reste)* | fusion après branche, cross-links, cycles partiels, multi-parents | — | — | fallback pipeline `wpg:wgp`/`custGeom` existant, couverture 100 % comme aujourd'hui |

> **Mise à jour (spike)** : les URNs de la colonne ci-dessus ne référencent plus les algorithmes
> intégrés de Word (`process1`/`hierarchy1`/`cycleMatrix`, envisagés dans la version initiale de
> cette spec) — voir la décision de licence au §3.1 point 1. Ce sont des identifiants
> `urn:md2nativedocx/...` propres à des `layoutDef` que ce projet écrit et possède.

Le classifieur **disqualifie systématiquement** tout diagramme contenant un `subgraph` avant
même d'évaluer chain/tree/cycle — sauf le cas du bricolage décrit en §5, qui doit rester un
mode explicite et non le comportement par défaut.

---

## 5. Sous-graphes — bricolage "niveau hiérarchique supplémentaire"

### Ce que ça peut couvrir

L'idée proposée (un `subgraph` Mermaid = un niveau de hiérarchie SmartArt en plus) fonctionne
**uniquement si le sous-graphe candidat est lui-même déjà classifiable `tree` ou `chain`** en
interne, et qu'il ne possède **qu'un seul point d'entrée** depuis l'extérieur (une seule arête
entrante sur l'ensemble du sous-graphe, peu importe sur quel nœud membre elle arrive).

Mécanique : le nœud d'entrée du sous-graphe devient l'enfant direct du nœud parent externe dans
`dgm:dataModel` ; le reste du sous-graphe se déroule normalement en dessous, un niveau de
profondeur plus bas que s'il n'y avait pas eu de `subgraph`. `hierarchy1` supporte nativement
une profondeur arbitraire — techniquement rien n'empêche d'aller au-delà d'un niveau.

### Pourquoi je limiterais quand même à un seul niveau en première intention

1. **Décalage sémantique irréductible.** Un `subgraph` Mermaid est un conteneur visuel — un
   rectangle titré qui *entoure* des nœuds. Une hiérarchie SmartArt affiche un nœud parent
   *relié par un trait* à des nœuds enfants. Le titre du sous-graphe devient donc une boîte
   parente en plus dans l'arbre, pas un cadre autour du groupe. Ce n'est pas grave sur un
   niveau (le lecteur comprend "ce parent regroupe ces enfants"), ça devient trompeur sur
   plusieurs niveaux imbriqués (on ne distingue plus visuellement "vraie hiérarchie
   métier" de "conteneur Mermaid détourné").
2. **Chaque niveau supplémentaire multiplie les conditions de disqualification** (chaque
   sous-niveau doit à son tour être `tree`/`chain`, un seul point d'entrée, pas de fusion) — la
   probabilité qu'un vrai diagramme utilisateur les remplisse toutes chute vite.
3. C'est cohérent avec la philosophie "au plus simple" de la demande : un niveau couvre déjà le
   cas le plus fréquent d'usage réel des `subgraph` Mermaid (un groupe logique simple, ex.
   "Frontend" / "Backend" avec 2-3 étapes chacun), sans complexifier le classifieur.

### Alternative écartée : layouts "Grouped List" / "Vertical Box List"

Recherche faite : ces layouts (catégorie Liste, parfois classés sous Hiérarchie dans l'UI)
affichent nativement "titre de groupe + sous-éléments" — plus proche visuellement d'un
`subgraph` qu'une hiérarchie classique. Mais ils sont strictement limités à 2 niveaux
(groupe → puces) et les sous-éléments sont des **puces sans lien entre elles** — aucune arête.
Or un `subgraph` Mermaid contient quasi toujours un flux interne (des arêtes entre ses membres).
Cette alternative ne couvre donc que le cas "sous-graphe = simple liste de nœuds sans relation
interne", rare en pratique. Je la mentionne pour mémoire mais ne la retiendrais pas comme
chemin principal.

### Ce qui reste hors scope même avec le bricolage

- Sous-graphes imbriqués (>1 niveau de `subgraph`)
- Sous-graphe avec plusieurs points d'entrée/sortie
- Arête traversant deux sous-graphes différents (cross-subgraph)
- Sous-graphe contenant lui-même une fusion ou un cycle

→ dans tous ces cas, disqualification et fallback vers le pipeline actuel, comme pour le reste.

### 5.1 Distinguer décision/action par nœud — mise à jour

**Correction par rapport à la première version de cette spec** : ce n'est pas hors scope. Vérifié
sur le schéma (ISO/IEC 29500-1 §21.4.3.7) : `dgm:pt` (un nœud du data model) accepte un enfant
`dgm:spPr` qui peut porter un `a:prstGeom` — exactement l'override qu'écrit Word quand on fait
clic droit > *Changer de forme* dans l'UI, mais directement générable dans le XML qu'on produit,
sans passer par une interaction utilisateur.

Conséquence pour le générateur `tree.ts` (§7) : tout nœud Mermaid à out-degré ≥2 (une décision)
reçoit `<dgm:spPr><a:prstGeom prst="diamond"><a:avLst/></a:prstGeom></dgm:spPr>` sur son `dgm:pt`
correspondant ; les autres restent sur la forme par défaut du layout (généralement rectangle).
Coût d'implémentation marginal — c'est un attribut de plus par point, pas une nouvelle partie ni
une nouvelle relation.

### 5.2 Labels d'arête (« Oui / Non ») — convention adoptée

SmartArt n'a pas de zone de texte native sur une ligne de liaison. Deux solutions manuelles
existent côté UI :
1. **Zone de texte flottante** positionnée à la main sur la ligne (contour/fond = Aucun).
2. **Texte intégré** au nœud enfant (ex. `"Oui : Passer commande"`).

Seule la **solution 2 est praticable pour un générateur automatique**, et ce n'est pas un choix
de goût : le layout SmartArt est calculé par Word **à l'ouverture du fichier**, pas par nous à la
génération — on ne connaît jamais les coordonnées finales d'un connecteur au moment d'écrire le
XML (contrairement au pipeline `wpg:wgp` où on maîtrise Dagre et donc la géométrie exacte).
Positionner une zone de texte flottante reviendrait à parier sur un rendu qu'on ne contrôle pas.

**Convention retenue pour `tree.ts`** : le label d'une arête Mermaid (`-->|Oui|`) est préfixé au
texte du nœud enfant lors de la construction du `dgm:pt` (`"Oui : " + texteOriginalDuNoeud`).
Transformation purement textuelle, aucune dépendance à un calcul de position.

---

## 6. Ce qui reste hors scope (rappel, indépendant des sous-graphes)

- Toute fusion après branchement (le pattern décision → Oui/Non → merge, sans doute le plus
  fréquent dans les flowcharts réels — voir §10.1, ce qui motive le choix d'un CodeLens
  conditionnel plutôt que permanent)
- `classDef`/`style` par nœud individuel (SmartArt applique une palette globale, pas un
  remplissage par forme comme le fait déjà `wpg:wgp`) — la forme (§5.1) et le texte (§5.2) sont
  récupérables par nœud, la couleur individuelle non
- Labels d'arêtes : pas de zone de texte native sur le connecteur — résolu par convention texte
  intégré au nœud enfant, voir §5.2 (pas de zone de texte flottante, positionnement non maîtrisable)

---

## 7. Plan d'implémentation proposé

Calqué sur la méthode Phase 0 déjà utilisée pour Dagre/Pandoc (spikes documentés en ADR avant
tout code de production) :

1. **Spike 1 — faisabilité brute.** Construire à la main (comme `tools/word-reference/`) un
   `.docx` minimal avec un `hierarchy1` à 2 niveaux, data + layout uniquement (pas de colors/
   quickStyle), l'ouvrir dans un vrai Word. Objectif : confirmer qu'un SmartArt minimal
   s'ouvre sans "contenu illisible" avant d'investir dans le générateur.
2. **Spike 2 — chirurgie ZIP.** Étendre `postprocess.mjs` pour injecter des parties + rels +
   content-types, sur le fichier produit au Spike 1. Vérifier round-trip Pandoc → postprocess
   → Word.
3. **Classifieur** (`packages/core/src/smartart/classify.ts`) — fonction pure, tests unitaires
   d'abord (chain/tree/cycle/unsupported), sans dépendance au générateur XML. **Livré (2026-09-03)**,
   12 tests unitaires.
4. **Générateur** (`packages/core/src/smartart/`) — un module par layout supporté
   (`chain.ts`, `tree.ts`, `cycle.ts`), chacun produit `(dataXml, layoutXml)` à partir du
   graphe classifié.
   > **Mise à jour (spike Round 5, §3.1)** : signature réelle à **4 parties**, pas 2 —
   > `(dataXml, layoutXml, colorsXml, styleXml)` — `quickStyle` s'étant révélé load-bearing pour un
   > algorithme auto-écrit. `layoutXml`/`colorsXml`/`styleXml` sont des constantes par topologie
   > (indépendantes du diagramme) ; seul `dataXml` est généré par diagramme. `chain.ts`, `tree.ts`
   > **et `cycle.ts` livrés et validés par rendu LibreOffice réel** (2026-09-03) — les 3 topologies
   > du classifieur ont chacune leur générateur. `cycle.ts` a fonctionné dès le premier essai
   > empirique (`dgm:alg type="cycle"`, vocabulaire public ECMA-376), sans le bug de géométrie
   > rencontré sur `tree.ts`. Chaque générateur applique aussi désormais `edge.label` (convention
   > §5.2 : préfixe au texte du nœud destination) et `node.fill` (override `a:solidFill` sur le
   > `dgm:spPr` du point de **contenu**, pas un point de présentation — confirmé sans effet sur ces
   > derniers, contrairement au point de contenu, jamais testé jusqu'ici) ; `chain.ts`/`tree.ts`
   > respectent aussi `flowchart.direction` (deux variantes de `layoutDef` chacun). Détail complet
   > dans `docs/smartart-compliance-table.md` et `TODO.md`.
5. **Dispatch** dans le filtre Lua / CLI : `classifyTopology()` en premier ; `unsupported` →
   chemin `wpg:wgp` existant inchangé ; sinon → chemin SmartArt. **Pas commencé** — les 3
   générateurs existent mais ne sont câblés dans aucun flux de génération réel à ce jour.
6. **Tests visuels** : même méthodologie que `test:visual` (rendu LibreOffice headless +
   pixel-diff), corpus dédié de 3-4 fixtures par topologie supportée. **Pas commencé.**

---

## 8. Points d'escalade (AGENTS.md)

- **Manipulation ZIP au-delà des corrections de namespace déjà en place** — extension notable
  de `postprocess.mjs`, à valider avant code (esprit de la règle n°7, même si les relations
  ajoutées sont internes et non `TargetMode="External"`, donc pas une violation littérale de
  la règle n°3).
- **Nouvelle branche de sortie publique de `packages/core`** (`classifyTopology` exporté).
- Pas de nouvelle dépendance externe anticipée — génération XML par string building, comme
  l'existant.

---

## 10. UX : détection du fallback, choix d'export, information de l'utilisateur final

Le flux d'usage le plus probable identifié en cadrage : **clic droit sur le `.md`/`.mmd` dans
l'explorateur → "Exporter en Word"**, sans passage préalable par un aperçu VS Code. Conséquence
directe : toute information sur une limitation rencontrée doit être **auto-suffisante dans le
`.docx` généré**, sans supposer que le lecteur soit jamais passé par l'éditeur.

### 10.1 Détection et feedback côté VS Code (avant génération)

Pour qui travaille depuis l'éditeur, deux mécanismes à privilégier plutôt qu'un 3ᵉ CodeLens
permanent (qui alourdirait chaque bloc mermaid, dont la majorité restera hors scope — voir la
fréquence du pattern merge ci-dessous) :
- **Hover Provider** sur le bloc ```mermaid``` : tooltip passif "SmartArt : non — fusion détectée
  entre B et E", zéro élément visuel permanent.
- **CodeLens conditionnel** : le bouton SmartArt n'apparaît que si le diagramme est éligible.
  Le classifieur doit donc retourner une raison structurée
  (`{ eligible: false, reason: 'merge-after-branch', at: ['B','E'] }`), pas un simple booléen —
  cette raison est réutilisée telle quelle en §10.3.

### 10.2 Choix du mode d'export

- **Clic droit fichier** : une seule entrée ("Exporter en Word (.docx)"), miroir du comportement
  zéro-config actuel. Un fichier peut contenir plusieurs diagrammes d'éligibilité différente —
  exposer un choix SmartArt/formes à ce niveau sur-promettrait sans avoir d'abord parsé le
  fichier, ce qui va à l'encontre de la rapidité attendue d'un clic droit. Le routage par
  diagramme (§4) reste silencieux en dessous.
- **CodeLens (bloc ouvert)** : si éligible, un seul CodeLens "Exporter en Word" ouvrant un
  QuickPick ("Formes natives | SmartArt"), avec un réglage `preferSmartArt: ask/always/never`
  pour ne pas revoter à chaque export — cohérent avec le seul réglage existant aujourd'hui
  (`outputDirectory`).

### 10.3 Informer l'utilisateur *dans* le document Word généré

C'est le canal décisif compte tenu de 10.2 (clic droit = pas de passage VS Code). Trois options
envisagées, avec un critère qui tranche en pratique : **la survie à un export PDF**, très probable
en aval pour un outil orienté rapport.

| Option | Discoverabilité (lecteur Word/PDF seul) | Effort | Survit à un export PDF ? |
|---|---|---|---|
| Commentaire Word natif (`w:comment`) | Élevée dans Word (bulle en marge) | Modéré — réutilise la chirurgie ZIP déjà prévue pour SmartArt (§7 Spike 2), pas un coût isolé | **Non par défaut** — Word n'inclut les commentaires à l'export PDF que si "Inclure les annotations" est explicitement coché |
| Phrase sous le graphe | Maximale — dans le flux du texte | Minimal — un paragraphe de plus, zéro nouvelle partie ZIP | **Oui, toujours** — texte normal |
| Tooltip au survol (`a:hlinkClick`/`tooltip`, lien inerte sans cible) | Faible pour ce cas précis — suppose de déjà savoir qu'il faut survoler | Élevé et incertain — technique confirmée côté pptx (`r:id=""` + `action="ppaction://noaction"`), non vérifiée côté docx, à spiker ; curseur "main" + préfixe "Ctrl+clic" trompeur (ressemble à un lien mort) | Dépend du moteur de rendu PDF |

**Décision retenue** : phrase sous le graphe comme canal principal — style discret dédié
(`MD2NativeDocx-Note` ou équivalent : petit, gris, italique, facilement repérable/purgeable en
masse par l'auteur avant diffusion finale), **conditionnelle** (n'apparaît que sur un diagramme
effectivement tombé en fallback, jamais sur un SmartArt réussi ni sur le pipeline `wpg:wgp`).
Commentaire Word en canal secondaire optionnel pour qui reste dans Word, pas comme seul vecteur.

Contenu du message : spécifique et actionnable, pas un disclaimer générique du type "généré
automatiquement, peut contenir des erreurs" (n'aide personne à agir) :

> *Formes natives utilisées (fusion détectée entre "B" et "E" — non supporté par l'export
> SmartArt).*

### 10.4 Autres points de praticité identifiés

- **Perte au ré-export** : toute édition manuelle du SmartArt dans Word (renommer une branche,
  changer une couleur) est écrasée au prochain export depuis le `.md` — plus dommageable ici que
  pour le chemin actuel, puisque l'argument de vente de SmartArt est justement l'édition facile
  dans Word. À documenter dans le walkthrough.
- **Cohérence visuelle sur un document mixte** : un rapport avec plusieurs diagrammes dont
  certains en SmartArt et d'autres en formes natives aura deux styles de rendu côte à côte
  (police, bordures, style de connecteur). Pas bloquant, mais le toast de fin d'export devrait
  résumer le mélange ("3/5 en SmartArt, 2 en formes — fusion détectée") plutôt qu'un simple
  succès/échec binaire.
- **`test:visual`/LibreOffice — moins risqué qu'anticipé.** Vérifié : l'import/affichage SmartArt
  dans LibreOffice Writer est décrit comme quasi parfait par les mainteneurs LO (~25 bugs connus,
  mineurs — positionnement/police/couleur du texte, même catégorie que les bugs déjà rencontrés
  sur `wpg:wgp`). Le pipeline `test:visual` reste donc utilisable. Le support s'étant nettement
  amélioré sur les versions récentes de LO, ça renforce la priorité de l'item TODO déjà ouvert
  "pinning LibreOffice", spécifiquement pour ce chantier.
- **L'édition SmartArt dans LibreOffice, elle, est explicitement instable** ("experimental only,
  not stable, not usable for production" selon les mainteneurs LO). La promesse "éditable
  facilement" ne tient donc que pour un lecteur **Word** — à mentionner dans le positionnement si
  la cible n'est pas garantie Word, le chemin formes natives reste le choix par défaut.
- **Avantage retrouvé en cours de route : theme-matching automatique.** Puisque colors/
  quickStyle sont omis en MVP (§3), le SmartArt hérite du thème du document cible — contrairement
  à `wpg:wgp` qui applique des couleurs hex figées indépendamment du template de destination.
  Pertinent pour un usage avec template de marque en entreprise.
- **Aperçu (Phase 2.5, non commencé)** : moins prioritaire pour ce chemin spécifiquement — un
  aperçu statique ne montre pas ce qui fait la valeur de SmartArt (l'éditabilité une fois ouvert
  dans Word), donc peu convaincant pour ce mode.

---

## 11. Sources (recherche)

- Microsoft Learn — *Use Office Open XML in your Word add-in* : structure des 4 parties
  SmartArt, 2 obligatoires (`data`, `layout`), 2 optionnelles (`colors`, `quickStyle`).
- ECMA-376 / `dgm:relIds` (attributs `dm`/`lo`/`cs`/`qs`) — référencement explicite des 4
  parties depuis `document.xml`.
- ISO/IEC 29500-1 §21.4.3.7 (`dgm:spPr`) — override de forme par point de données individuel.
- Pandoc Lua filters doc + `pandoc.mediabag` — confirme l'absence de mécanisme générique pour
  ajouter des parties/relations custom au-delà des images.
- Microsoft Support — *Choose a SmartArt graphic* : catégories Process/Cycle/Hierarchy comme
  candidats naturels pour un flowchart, à l'exclusion de Matrix/Pyramid/Picture.
- FOSDEM 2023 — *SmartArt Support for LibreOffice* (Hossein Nourikhah) : état de l'import/
  affichage (quasi parfait) vs édition (expérimentale, non stable) dans LibreOffice Writer.
- WordTips / WordRibbon — *ScreenTips without Hyperlinks* : mécanisme de tooltip sans cible de
  navigation réelle, et son équivalent DrawingML confirmé côté pptx (`ppaction://noaction`).

