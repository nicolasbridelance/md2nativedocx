# Tableau de compliance — Markdown + Mermaid flowchart → Word natif

> **Scope explicite** : ce document ne couvre que le type de diagramme **flowchart**
> (`graph`/`flowchart`) — pas les 28 autres types que Mermaid supporte (sequenceDiagram,
> classDiagram, pie, gantt, mindmap, etc.). Ce n'est pas un oubli : le titre du document l'a
> toujours dit, et `cahier_des_charges.md` §11 classe explicitement le reste en roadmap V2+.
> Pour la feuille de route de ces 28 types (taxonomie par famille de rendu, prérequis
> architectural, priorisation proposée), voir `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md`.
>
> Document en deux parties, pas une spec normative. **§4** couvre la fidélité Markdown/GFM autour
> du diagramme (titres, gras/italique, tableaux, listes, etc.) — traitement volontairement court
> car cette fidélité est la même quelle que soit la stratégie choisie pour le diagramme lui-même,
> déjà couverte par sa propre suite de tests. **§5, le cœur du document**, évalue la syntaxe
> Mermaid flowchart elle-même sur les **3 stratégies de sortie** possibles pour un diagramme donné
> (SmartArt natif, hybride SmartArt+OOXML, OOXML pur) — c'est cette partie, pas SmartArt en tant
> que tel, qui donne son sujet au document : SmartArt n'est qu'une des trois colonnes évaluées à
> chaque ligne.
>
> Statut (mis à jour 2026-09-03, après la version initiale de ce document) : `chain.ts`, `tree.ts`
> **et `cycle.ts`** sont désormais tous les trois livrés et validés par rendu LibreOffice réel — la
> direction (`TD`/`LR`), les couleurs par nœud (`classDef`) et les libellés d'arête sont également
> pris en compte depuis cette mise à jour (voir §2.3/§2.4, corrigés). Objectif explicite (demandé
> par le mainteneur, cf. `TODO.md` "Phase 6/7") : permettre à quiconque reprend ce chantier de
> décider, en connaissance de cause, s'il faut changer de stratégie de représentation, pousser vers
> 100 % de couverture SmartArt avec de nouvelles techniques, ou garder l'approche hybride actuelle.
> Toute case du tableau ci-dessous doit se lire avec son "comment" et ses limites, jamais comme
> un simple ✅/❌ — voir les avertissements de portée en §2 avant de tirer une conclusion d'une ligne
> isolée.
>
> **[Mise à jour 2026-09-04]** Quatre des limites 🔧 listées ci-dessous ont été levées cette
> session, sans qu'aucune ne se soit révélée être un obstacle technique de fond (voir §2 point 1) :
> directions `BT`/`RL` (parser, `layout.ts`/Dagre — au passage, un bug latent adjacent corrigé :
> `rankdir` recevait la chaîne littérale `'TD'`, une valeur que Dagre ne reconnaît pas, et retombait
> silencieusement sur son propre défaut `'TB'` — **et** `chain.ts`/`tree.ts`, deux nouveaux gabarits
> `linDir` chacun, vérifiés par rendu LibreOffice réel exactement comme les corrections `TD`/`LR` du
> 2026-09-03), forme asymétrique `id>Texte]` (nouveau preset `homePlate`), modificateurs de longueur
> `---->`/`====>`/`-...->` (le scanner d'opérateurs reconnaît maintenant une longueur variable), et
> `class`/`:::` référencé avant son `classDef` (résolution en deux passes, même mécanisme que
> `pendingStyles`). Détail dans les lignes concernées (§5.1, §5.2, §5.3, §5.4) et dans le message de
> commit. Séparément, une inexactitude préexistante corrigée en passant : §5.7 ("Cycle fermé")
> décrivait `smartArt.enabled` comme actif par défaut — c'est désormais **`false` par défaut** (CLI
> et extension), précisément à cause du bug documenté sur cette même ligne ; SmartArt reste
> disponible en opt-in (`MD2NATIVEDOCX_ENABLE_SMARTART=1` / réglage de l'extension) pour qui veut
> expérimenter ou reprendre ce chantier.
>
> **[Mise à jour 2026-09-04, plus tard le même jour]** Les deux limites 🔧 "Retours à la ligne" et
> "Markdown Strings" (§5.3) sont levées **côté OOXML seul** (rich-text runs) : `parser.ts`'s
> `parseLabel()` produit désormais, en plus du texte aplati déjà utilisé par `chain.ts`/`tree.ts`,
> une structure `labelRuns` (`types.ts`'s `LabelToken[]`) que `ooxml-translator.ts` rend en runs
> `w:r`/`w:br` réels — un vrai retour à la ligne (`<br/>`) et de vrais runs `w:b`/`w:i` (Markdown
> string) au lieu d'un aplatissement en texte plein. `layout.ts`'s `nodeDimensions()` réserve
> désormais la hauteur pour chaque ligne forcée. Cette structure n'existait pas avant : ce n'était
> donc pas une limite de parseur commune aux 3 colonnes (🔧), mais une limite du traducteur OOXML
> spécifiquement — `chain.ts`/`tree.ts` (colonnes SmartArt/Hybride) restent inchangés, toujours sur
> le texte aplati. Rendu réel LibreOffice vérifié.
>
> **[Mise à jour 2026-09-04, encore plus tard le même jour]** La ligne "Direction de sous-graphe"
> (§5.1) n'est plus une limite de **parseur** (🔧, silencieusement ignorée) mais une limite
> documentée du **traducteur OOXML/Dagre** : `parser.ts` reconnaît maintenant
> `direction <TD|TB|LR|BT|RL>` à l'intérieur d'un `subgraph` (`Subgraph.direction`, `types.ts`) et
> avertit explicitement plutôt que de tomber dans le générique `"Unsupported line ignored"` — mais
> Dagre met en page tout un graphe sous un seul `rankdir` global, sans notion de direction par
> cluster, donc la direction demandée n'est toujours pas appliquée à la géométrie (le sous-graphe
> s'affiche dans la direction du flowchart parent). Un vrai support demanderait une passe de layout
> récursive indépendante par sous-graphe — chantier d'architecture distinct, pas fait ici. Voir
> `types.ts`'s `Subgraph.direction` pour le détail technique complet.

## 1. Sources consultées

| Norme | Version / date | URL | Usage dans ce document |
|---|---|---|---|
| CommonMark Spec | 0.31.2 | https://spec.commonmark.org/0.31.2/spec.txt | Base du Markdown (prose, tableaux non inclus — voir GFM) |
| GitHub Flavored Markdown (GFM) | 0.29 | https://github.github.com/gfm/ | Extensions CommonMark utilisées par Pandoc/GitHub (tableaux, listes de tâches, autolinks, strikethrough) |
| Mermaid — Flowchart syntax | branche `develop`, inclut les fonctionnalités jusqu'à v11.17.0 (`view: collapsed`) et v11.3.0 (30 formes étendues) | https://raw.githubusercontent.com/mermaid-js/mermaid/develop/packages/mermaid/src/docs/syntax/flowchart.md | Périmètre complet des fonctionnalités flowchart évaluées en §4 |

**LaTeX / formules mathématiques** : volontairement **hors périmètre** de ce document. `$...$`/`$$...$$`
sont traduits par Pandoc (bibliothèque `texmath`) en `m:oMath` natif, **indépendamment de tout bloc
Mermaid** — voir `docs/specs/cahier_des_charges.md` ligne 37. Aucune des 3 stratégies de représentation de
diagramme ci-dessous n'a la moindre prise sur ce mécanisme : une formule LaTeX dans un document qui
contient par ailleurs un diagramme SmartArt, hybride, ou OOXML-only rend strictement à l'identique.
Il n'y avait donc pas de "norme LaTeX" pertinente à télécharger pour cette comparaison.

## 2. Avertissements de portée — à lire avant le tableau

Ces quatre points s'appliquent à *plusieurs* lignes du tableau simultanément ; les répéter à chaque
ligne aurait noyé le signal. Une ligne qui semble "❌ dans les 3 colonnes" n'est presque jamais une
limite de SmartArt ou d'OOXML — c'est très généralement l'un des points ci-dessous.

1. **Un seul parseur Mermaid alimente les 3 stratégies** (`packages/core/src/parser/parser.ts`,
   volontairement scope V1 — spec `docs/specs/cahier_des_charges.md` §5.1/§6). Une construction que ce parseur
   ne reconnaît pas n'atteint **aucune** des 3 stratégies : ce n'est jamais une limite de SmartArt ou
   d'OOXML spécifiquement. Le tableau le signale explicitly par 🔧 *(limite du parseur, pas de la
   stratégie)*.
2. **[Corrigé le 2026-09-03, après la première version de ce tableau] Le dispatch classifieur →
   générateur est désormais câblé dans le vrai pipeline.** La colonne "Hybride" décrit le
   comportement **réel** de `md2nativedocx` (CLI et extension VS Code, qui invoque le même
   binaire) : `classifyTopology()` puis `generateChain()`/`generateTree()`/`generateCycle()` si
   éligible (parties écrites dans un dossier temporaire, relIds provisoires remplacés par de vrais
   `rId` après coup par `postprocess.mjs`), sinon le traducteur `wpg:wgp` existant inchangé. Testé
   de bout en bout (export CLI réel, rendu LibreOffice), pas seulement en isolation. Détail complet
   dans `TODO.md` (item "Dispatch classifieur → générateur câblé").
3. **[Corrigé le 2026-09-03, étendu le 2026-09-04] SmartArt respecte désormais `flowchart.direction`
   sur ses 4 valeurs.** `chain.ts` choisit entre `CHAIN_LAYOUT_XML` (`LR`, implicite `fromL`),
   `CHAIN_LAYOUT_XML_TD` (`TD`, `linDir="fromT"`), `CHAIN_LAYOUT_XML_BT` (`BT`, `linDir="fromB"`,
   ajouté 2026-09-04) et `CHAIN_LAYOUT_XML_RL` (`RL`, `linDir="fromR"`, ajouté 2026-09-04) ; `tree.ts`
   choisit entre `TREE_LAYOUT_XML` (racine en haut, `TD`), `TREE_LAYOUT_XML_LR` (racine à gauche,
   enfants empilés verticalement, `LR`), `TREE_LAYOUT_XML_BT` (racine en bas, `BT`, ajouté 2026-09-04
   — même répartition top/bottom que `TD` mais inversée) et `TREE_LAYOUT_XML_RL` (racine à droite,
   `RL`, ajouté 2026-09-04 — dérivé de la variante `LR`, hérite de son empilement vertical des
   enfants). Les 4 paramètres `linDir` et les inversions de contraintes `w`/`h`/`t`/`l` sont tous
   vérifiés par rendu LibreOffice réel, pas seulement par la structure XML. `BT`/`RL` sont
   maintenant reconnues par le parseur (point 1 ci-dessus) et laid out par les 3 stratégies au même
   titre que `TD`/`LR`.
4. **[Corrigé le 2026-09-03] SmartArt applique désormais les couleurs par nœud (`classDef`/`style`,
   `node.fill`) et les libellés d'arête (`edge.label`).** `edge.label` est préfixé au texte du nœud
   destination (`"Oui : texte"`, convention spec §5.2, désormais implémentée dans `chain.ts` et
   `tree.ts`, pas seulement documentée). `node.fill` est écrit en `a:solidFill` sur le `dgm:spPr` du
   point de **contenu** du nœud — testé et confirmé cette session : un override identique sur un point
   de **présentation** (ce qu'avait testé ADR 0004 "Round 5") n'a aucun effet sous LibreOffice, mais
   sur le point de contenu, si. Un override de **forme** (`a:prstGeom`) au même endroit reste, lui,
   sans effet (confirmé par le même test) — la forme du nœud (§5.2 de la table ci-dessous) demeure
   donc hors de portée.

5. **[Ajouté 2026-09-03, incident cycle ci-dessous] "✅ Full" pour une ligne SmartArt/Hybride ne
   veut dire, sauf mention contraire explicite, que "rendu correctement sous LibreOffice headless"
   — jamais "confirmé ouvrable/conforme en Word réel".** C'est vrai pour `chain`, `tree` **et**
   `cycle` : `chain.ts` a un signal positif réel mais limité (un échantillon isolé, fait main, hors
   du générateur de production — ADR 0004 "Round 5"), `tree.ts` n'a aucun signal Word réel connu,
   et `cycle.ts` avait le même statut jusqu'à ce que le premier test réel (2026-09-03, un cycle à 3
   nœuds généré par le pipeline de production lui-même) échoue directement à l'ouverture — voir la
   ligne "Cycle fermé" ci-dessous. Ne pas lire une case "✅ Full" de ce tableau comme une garantie
   de conformité OOXML/Word tant qu'elle ne cite pas explicitement un test en Word réel.

## 3. Légende

| Symbole | Signification |
|---|---|
| ✅ Full | Fonctionnalité représentée fidèlement, sans perte d'information significative |
| 🟡 Partial | Représentée avec une dégradation identifiée (perte de style, de forme exacte, de texte, etc.) |
| ❌ None | Non représentée du tout dans cette stratégie |
| 🔧 | Limite du **parseur** (`parser.ts`), pas de la stratégie de sortie — s'applique aux 3 colonnes identiquement |
| ⏳ | Comportement **prévu** par la spec/le dispatch mais pas encore câblé/implémenté au moment de la rédaction |

---

## 4. Section A — Markdown / GFM (prose autour du diagramme)

Traitement volontairement court, pas une ligne par construction CommonMark/GFM : le filtre Lua
(`packages/pandoc-filter/md2nativedocx.lua`) n'intercepte que les blocs de code portant la classe
`mermaid` (`function CodeBlock(el) if el.classes[1] == 'mermaid' then ...`, ligne 47-48). **Tout le
reste du document — titres, paragraphes, gras/italique, tableaux GFM, listes, citations, liens,
images, code non-Mermaid, formules LaTeX — passe par le convertisseur Markdown→docx natif de Pandoc,
totalement indépendamment de la stratégie de représentation choisie pour un diagramme donné.**
Un document contenant un tableau GFM et un diagramme rendra donc ce tableau à l'identique, que le
diagramme soit sorti en SmartArt, en hybride, ou en formes OOXML pures — les 3 colonnes seraient
✅/✅/✅ pour les ~40 constructions CommonMark et les ~8 extensions GFM (tableaux, tâches à cocher,
autolinks, strikethrough, etc.), sans qu'un tableau de 48 lignes identiques apporte d'information.
Cette fidélité Markdown générale est déjà couverte par la suite de tests dédiée du projet (git log :
"test: cover full Markdown fidelity (rich text, code highlighting, raw HTML) alongside Mermaid").

La seule interaction réelle entre Markdown et le choix de stratégie concerne le **texte à
l'intérieur d'un label de nœud/arête Mermaid** ("Markdown Strings", `**gras**`/`*italique*` dans un
label `"` \` texte \` "`) — traitée ligne par ligne en §5.3 ci-dessous, car c'est une fonctionnalité
Mermaid, pas une fonctionnalité Markdown générale.

---

## 5. Section B — Compliance Mermaid Flowchart (le cœur du tableau)

### 5.1 Déclaration du diagramme et direction

| Fonctionnalité | Syntaxe Mermaid | SmartArt seul | Hybride | OOXML seul |
|---|---|---|---|---|
| Mot-clé `graph`/`flowchart` | `graph TD` / `flowchart TD` | ✅ Full — les deux mots-clés sont acceptés en amont du classifieur | ✅ Full — idem | ✅ Full — idem, seul mot-clé requis par le parseur |
| Direction `TD` | `graph TD` | ✅ Full (corrigé 2026-09-03) — `chain.ts` émet `CHAIN_LAYOUT_XML_TD` (vertical), `tree.ts` émet `TREE_LAYOUT_XML` (racine en haut, déjà son comportement par défaut) ; rendu réel vérifié | ✅ Full | ✅ Full — Dagre respecte la direction demandée |
| Direction `TB` (alias documenté de `TD`) | `graph TB` | ✅ Full (corrigé 2026-09-04) — `TB` est désormais reconnu par la regex d'en-tête et mappé directement sur `TD` (c'est un alias, pas une direction distincte, donc aucune perte) | ✅ idem | ✅ idem |
| Direction `LR` | `graph LR` | ✅ Full (corrigé 2026-09-03) — `chain.ts` émet `CHAIN_LAYOUT_XML` (horizontal, déjà son comportement par défaut), `tree.ts` émet `TREE_LAYOUT_XML_LR` (racine à gauche, enfants empilés verticalement) ; rendu réel vérifié | ✅ Full | ✅ Full |
| Direction `BT` | `graph BT` | ✅ Full (corrigé 2026-09-04) — `BT` est désormais une direction à part entière, laid out par Dagre (`rankdir: 'BT'`) et par SmartArt (`chain.ts`/`tree.ts` émettent `linDir="fromB"`) ; rendu réel vérifié (chain et tree) | ✅ Full | ✅ Full — Dagre gère `BT` nativement |
| Direction `RL` | `graph RL` | ✅ Full (corrigé 2026-09-04) — même traitement que `BT` (`rankdir: 'RL'`, SmartArt `linDir="fromR"`), rendu réel vérifié | ✅ Full | ✅ Full |
| Direction de sous-graphe (`direction TB` imbriqué) | `subgraph X\n direction RL\n...end` | ❌ None — tout `subgraph` disqualifie SmartArt avant même d'évaluer ce point (§5.6) | 🟡 Partial (amélioré 2026-09-04, punch list OOXML item 4) — la ligne `direction RL` n'est plus silencieusement ignorée : `parser.ts` la reconnaît désormais (`Subgraph.direction`, `types.ts`) et émet un avertissement explicite et actionnable au lieu du générique `"Unsupported line ignored"`. Toujours **pas appliquée au layout** : Dagre (`layout.ts`) met en page tout un graphe — chaque cluster compound compris — sous un seul `rankdir` global, sans notion de direction propre par cluster ; un vrai support demanderait une passe de layout récursive et indépendante par sous-graphe à direction propre, un chantier d'architecture à part entière, pas une option Dagre à activer (voir `types.ts`'s `Subgraph.direction` pour le détail). Le sous-graphe s'affiche donc dans la direction du flowchart parent, comme avant, mais l'information est désormais dans l'AST et le renoncement est explicite plutôt que silencieux | 🟡 même statut — voir cellule Hybride |

### 5.2 Formes de nœud

| Fonctionnalité | Syntaxe | SmartArt seul | Hybride | OOXML seul |
|---|---|---|---|---|
| Rectangle | `id[Texte]` | 🟡 Partial — le nœud est représenté, mais SmartArt affiche systématiquement `roundRect`, jamais un rectangle droit (aucune des 11 formes parsées — voir les lignes ci-dessous — n'est propagée dans `chain.ts`/`tree.ts` aujourd'hui — le champ `NodeShape` du nœud n'est simplement pas lu par ces générateurs) | 🟡 Partial si classifié SmartArt (même perte) ; ✅ Full si fallback OOXML | ✅ Full — `PRST_BY_SHAPE` mappe `rect` → `<a:prstGeom prst="rect">` exactement |
| Coins arrondis | `id(Texte)` | ✅ Full *par accident* — SmartArt affiche `roundRect` pour tout nœud, donc un nœud `roundRect` d'origine "tombe juste", mais ce n'est pas une transmission fidèle de l'info : n'importe quelle forme d'origine donnerait le même rendu (voir ligne Rectangle) | ✅ Full *par accident*, même remarque | ✅ Full |
| Stade (pilule) | `id([Texte])` | 🟡 Partial — même dégradation que Rectangle (toujours `roundRect`) | 🟡 Partial / ✅ Full selon fallback | ✅ Full |
| Cylindre (BDD) | `id[(Texte)]` | 🟡 Partial — idem | 🟡 Partial / ✅ Full | ✅ Full |
| Cercle/ellipse | `id((Texte))` | 🟡 Partial — idem | 🟡 Partial / ✅ Full | ✅ Full |
| Losange (décision) | `id{Texte}` | 🟡 Partial — même dégradation visuelle ; la spec §5.1 décrivait un mécanisme envisagé (`dgm:spPr`/`a:prstGeom prst="diamond"` par nœud à out-degré ≥ 2) mais **testé et confirmé sans effet sous LibreOffice cette session** (voir §2.4) — impasse actée, pas juste "pas encore fait" | 🟡 Partial (même impasse) / ✅ Full si fallback | ✅ Full |
| Sous-routine `id[[Texte]]` | `[[ ]]` | 🟡 Partial (corrigé 2026-09-04) — `[[ ]]` est maintenant reconnu dédié (`subroutine`), label propre sans crochets résiduels ; SmartArt (chain/tree) ne propage toujours pas la forme (§5.2, même perte que Rectangle) | 🟡 idem / ✅ Full si fallback | ✅ Full — `<a:prstGeom prst="flowChartPredefinedProcess">` (rectangle + barres verticales), rendu réel vérifié |
| Asymétrique `id>Texte]` | `>` / `]` | 🟡 Partial (corrigé 2026-09-04) — `>`/`]` ajouté à `SHAPE_BY_SYNTAX` (nouvelle forme `asymmetric`), label propre ; SmartArt (chain/tree) ne propage toujours pas la forme (§5.2, même perte que Rectangle) | 🟡 idem / ✅ Full si fallback | ✅ Full — `<a:prstGeom prst="homePlate">`, le preset le plus proche visuellement du drapeau que dessine Mermaid (pas de preset OOXML à correspondance exacte) |
| Hexagone `id{{Texte}}` | `{{ }}` | 🟡 Partial (corrigé 2026-09-04) — `{{ }}` a maintenant priorité sur le bracket `{`/`}` du losange générique (ordre du matcher, plus long en premier), label propre | 🟡 idem / ✅ Full si fallback | ✅ Full — `<a:prstGeom prst="hexagon">`, rendu réel vérifié |
| Parallélogramme `[/Texte/]`, `[\Texte\]` | `[/ /]`, `[\ \]` | 🟡 Partial (corrigé 2026-09-04) — les deux variantes sont reconnues dédiées (`parallelogram`/`parallelogramAlt`), label propre sans barres obliques résiduelles | 🟡 idem / ✅ Full si fallback | ✅ Full — `<a:prstGeom prst="parallelogram">`, `parallelogramAlt` obtenu par `flipH="1"` sur le même preset (pas de second preset OOXML dédié), rendu réel vérifié |
| Trapèze `[/Texte\]`, `[\Texte/]` | mixte | 🟡 Partial (corrigé 2026-09-04) — les deux variantes sont reconnues dédiées (`trapezoid`/`trapezoidAlt`), label propre | 🟡 idem / ✅ Full si fallback | ✅ Full — `<a:prstGeom prst="trapezoid">`, `trapezoidAlt` obtenu par `flipV="1"` sur le même preset, rendu réel vérifié |
| Double cercle `id(((Texte)))` | `((( )))` | 🟡 Partial (corrigé 2026-09-04) — `((( )))` reconnu dédié (`doubleCircle`, plus de parenthèse résiduelle dans le label) | 🟡 idem / ✅ Full si fallback | 🟡 Partial — reconnu et label propre, mais rendu comme un simple `ellipse` : aucun preset OOXML natif n'a un double anneau, un vrai double cercle demanderait deux formes superposées (non implémenté, coût jugé disproportionné pour une forme rare) |
| Syntaxe générique `@{ shape: ..., label: ... }` (v11.3+) — 18 formes nouvelles + ~30 alias vers une forme déjà supportée | `A@{ shape: manual-file, label: "..." }` | 🟡 Partial (corrigé 2026-09-04) — la syntaxe `@{ }` est désormais reconnue (`parseAtShapeSyntax()`, `parser.ts`) sur une déclaration isolée et à une extrémité d'arête ; SmartArt affiche `roundRect` pour toute forme comme pour les 11 formes bracket (même dégradation que "Rectangle" ci-dessus, `chain.ts`/`tree.ts` ne lisent `NodeShape` d'aucune forme) | 🟡 idem / ✅ Full si fallback | ✅ Full pour les 18 formes avec preset dédié (`document`, `card`, `delay`, `triangle`/`triangleInverted`, `windowPane`, `hourglass`, `curvedTrapezoid`, `bolt`, `braceLeft`/`braceRight`/`bracePair`, `crossedCircle`, `filledCircle`, `paperTape`, `horizontalCylinder`, `linedCylinder`, `manualInput` — mapping complet dans `docs/specs/cahier_des_charges.md` §6.1), rendu réel vérifié par LibreOffice sur les 18 (dont `lightningBolt`, `flowChartOr`, `flowChartSummingJunction` — inspection XML brute + capture visuelle, 2026-09-04). Un nom de forme non reconnu (16 formes du catalogue Mermaid sans preset OOXML fidèle — bang/browser/bucket/cloud/etc., liste complète dans `cahier_des_charges.md` §6.1 — ou une faute de frappe) dégrade silencieusement vers `rect` plutôt que de perdre le nœud, testé |
| Formes icône/image (`icon:`/`img:`, v11.3+) | `A@{ icon: "fa:user", ... }` | 🔧 ❌ None — même syntaxe `@{ }` non supportée | 🔧 idem | 🔧 idem |
| Icônes Font Awesome inline (`fa:fa-x`) | `id["fa:fa-twitter texte"]` | 🟡 Partial — la chaîne `fa:fa-twitter` est traitée comme texte littéral (pas d'icône réelle), dans les 3 colonnes ; c'est un texte de nœud comme un autre, donc non spécifique à SmartArt | 🟡 Partial | 🟡 Partial — même absence de rendu d'icône réelle, mais texte fidèle |

### 5.3 Texte de nœud

| Fonctionnalité | Syntaxe | SmartArt seul | Hybride | OOXML seul |
|---|---|---|---|---|
| Texte Unicode | `id["This ❤ Unicode"]` | ✅ Full (corrigé 2026-09-03) — le bug logué ici (guillemets englobants gardés littéralement dans `label`) est corrigé : `stripQuotedLabel()` dans `parser.ts` retire une paire de guillemets englobants sur un texte de nœud **et** sur un libellé d'arête (`id["Hello World"]` → label `Hello World` ; `-->|"Oui"|` → libellé `Oui`), vérifié par tests unitaires et par rendu LibreOffice réel. Un guillemet interne non englobant (`id[He said "hi"]`) est laissé intact, comme attendu | ✅ idem | ✅ idem |
| Retours à la ligne (`<br/>`) | `id["Ligne1<br/>Ligne2"]` | 🟡 Partial (inchangé) — `chain.ts`/`tree.ts` lisent toujours `node.label`, la version aplatie (`<br/>` → espace, `parser.ts`'s `parseLabel()`) ; pas de runs multi-lignes côté `dgm:t` | 🟡 idem / ✅ Full si fallback OOXML | ✅ Full (corrigé 2026-09-04, rich-text runs) — `parseLabel()` produit désormais aussi `labelRuns` (`types.ts`'s `LabelToken[]`), un vrai `<w:br/>` au lieu d'un espace aplati ; `layout.ts`'s `nodeDimensions()` réserve la hauteur pour chaque ligne forcée. Rendu réel LibreOffice vérifié (deux lignes visibles, boîte agrandie en conséquence) |
| Markdown Strings (`` "`**gras**`" ``) | `` id["`**gras**`"] `` | 🟡 Partial (inchangé) — même limite : `chain.ts`/`tree.ts` lisent `node.label` (marqueurs d'emphase retirés, texte aplati), pas de run gras/italique dans `dgm:t` | 🟡 idem / ✅ Full si fallback OOXML | ✅ Full (corrigé 2026-09-04, rich-text runs) — `**gras**`/`__gras__`/`*italique*`/`_italique_` à l'intérieur d'une "Markdown string" deviennent de vrais runs `<w:b/>`/`<w:i/>` (non imbriqué, non chevauchant — V1). Les mêmes marqueurs restent littéraux dans un label classique non-backtick, comme avant. Même mécanisme sur les libellés d'arête. Rendu réel LibreOffice vérifié |
| Codes d'entité (`#quot;`, `#9829;`) | `id["#quot;"]` | ✅ Full (corrigé 2026-09-04) — `normalizeLabelText()` décode la forme numérique (`#9829;` → point de code Unicode) et les entités nommées documentées par Mermaid (`#quot;`, `#amp;`, `#lt;`, `#gt;`, `#nbsp;`, `#apos;`) en leur caractère réel | ✅ idem | ✅ idem |
| `classDef`/`class`/`:::` — couleur de remplissage | `classDef foo fill:#f9f` puis `class A foo` ou `A:::foo` | ✅ Full (corrigé 2026-09-03) — `node.fill` écrit en `a:solidFill` sur le `dgm:spPr` du point de **contenu** (pas un point de présentation, où ADR 0004 "Round 5" l'avait trouvé sans effet) ; rendu réel vérifié dans `chain.ts` et `tree.ts`. La **forme** du nœud reste, elle, toujours `roundRect` (§5.2 ci-dessus) — un override `a:prstGeom` au même endroit a été testé et confirmé sans effet | ✅ Full | ✅ Full — `nodeFill = hexColor(node.fill, fill)` appliqué par nœud |
| — sous-cas : `classDef` avec plusieurs propriétés (`fill:...,stroke:...`) | `classDef foo stroke:#333,fill:#f9f` | 🟡 Partial (corrigé 2026-09-04) — `parseCssStyleProps()` remplace la regex figée par un parseur clé:valeur générique, ordre indifférent ; `node.fill` toujours propagé (Full, ligne "couleur de remplissage" ci-dessus), `node.stroke` en revanche **jamais lu** par `chain.ts`/`tree.ts` (seul `node.fill` l'est, cf. `spPrFor()`) | 🟡 idem / ✅ Full si fallback | ✅ Full — `node.stroke` → `<a:ln><a:solidFill>` du nœud, rendu réel vérifié |
| — sous-cas : `classDef` multi-classes (`classDef a,b ...`) | `classDef a,b fill:#f9f` | 🟡 Partial (corrigé 2026-09-04) — la regex accepte maintenant une liste `a,b` de noms de classe partageant un même style (même mécanisme que `class A,B,C nom` déjà supporté), même limite `node.stroke` que ci-dessus côté SmartArt | 🟡 idem | ✅ Full |
| — sous-cas : `:::` sur un nœud **déclaré seul** (pas via une arête) | `A[Texte]:::foo` (ligne isolée) | ✅ Full (corrigé 2026-09-04) — `parseNodeStatement` (déclarations isolées) reconnaît désormais le suffixe `:::` comme `parseNodeRef` (extrémités d'arête) le fait déjà. Bug connexe corrigé au passage dans les deux fonctions : la regex exigeait un préfixe non vide avant `:::`, donc même à une extrémité d'arête un id nu sans forme (`A:::foo`, sans `[Texte]`) échouait malgré le commentaire de code prétendant le supporter | ✅ idem | ✅ idem |
| — sous-cas : ordre `class`/`:::` avant le `classDef` correspondant | `class A foo` puis `classDef foo ...` | ✅ Full (corrigé 2026-09-04) — résolution en deux passes : un `class`/`:::` dont le `classDef` n'est pas encore connu est mis en attente (`pendingClassAssignments`, même mécanisme que `pendingStyles`) et résolu une fois tout le document lu ; un nom de classe toujours introuvable à ce stade avertit toujours (`"referenced but not defined"`), juste plus tard | ✅ idem | ✅ idem |
| `style id ...` (statement direct, hors `classDef`) | `style A fill:#f00,stroke:#333` | 🟡 Partial (ajouté 2026-09-04) — reconnu par le parseur (`applyNodeStyle()`), applicable avant ou après la déclaration du nœud (différé comme `class`) ; même limite `node.stroke` non lu par `chain.ts`/`tree.ts` que ci-dessus | 🟡 idem / ✅ Full si fallback | ✅ Full — rendu réel vérifié (fill + stroke sur le même nœud) |
| `linkStyle` (style de lien) | `linkStyle 0 stroke:#f00,stroke-width:4px` — aussi `linkStyle default ...` et une liste d'indices `linkStyle 0,2 ...` | 🔧 ❌ None — la sémantique même de `linkStyle` (styliser un connecteur individuel) n'a pas d'équivalent dans `chain.ts`/`tree.ts`, qui ne dessinent aucun connecteur du tout (même impasse que pour les types d'arête, §5.4) | 🔧 idem | ✅ Full — `edge.stroke`/`edge.strokeWidth` (converti px → EMU) sur le connecteur, indice hors limites ignoré silencieusement, rendu réel vérifié (couleur + épaisseur, `linkStyle default` et liste d'indices) |

### 5.4 Arêtes (liens)

| Fonctionnalité | Syntaxe | SmartArt seul | Hybride | OOXML seul |
|---|---|---|---|---|
| Flèche simple | `A-->B` | ✅ Full pour la topologie (l'arête existe dans le modèle) — mais voir libellés/style ci-dessous pour les pertes associées | ✅ Full | ✅ Full — flèche + type de trait rendus (`EDGE_STYLE`) |
| Lien ouvert (sans flèche) | `A---B` | ✅ Full pour la topologie ; SmartArt ne distingue de toute façon jamais visuellement "avec/sans flèche" entre nœuds d'une chaîne/arbre (pas de rendu de connecteur du tout, l'ordre/l'imbrication porte l'information) | ✅ Full (même remarque) | ✅ Full — `line` (`---`) est le seul type sans tête de flèche, rendu correctement |
| Lien pointillé | `A-.->B` | 🟡 Partial — la topologie passe, mais SmartArt (chain/tree) ne dessine **aucun connecteur visible** entre les boîtes (positionnement seul porte la relation) ; le style pointillé de l'arête d'origine est donc silencieusement perdu, y compris en cas de classification réussie | 🟡 Partial (idem) / ✅ Full si fallback | ✅ Full — `dotted: { dash: 'dash', ... }` |
| Lien épais | `A==>B` | 🟡 Partial — même perte de style que pointillé (aucun connecteur dessiné) | 🟡 Partial / ✅ Full | ✅ Full — `thick: { dash: 'solid', width: 25400, ... }` |
| Lien invisible | `A~~~B` | ✅ Full *par accident* (corrigé 2026-09-04) — `~~~` est désormais reconnu (`invisible`), le nœud et l'arête ne sont plus perdus, et l'arête influence bien le rang Dagre-side côté fallback ; côté SmartArt pur, `chain.ts`/`tree.ts` ne dessinent de toute façon **aucun connecteur visible** pour aucun type d'arête (voir ligne "Lien pointillé" ci-dessous), donc un lien "invisible" obtient trivialement le rendu voulu — pas une vraie prise en charge de la sémantique, comme pour "Coins arrondis" en §5.2 | ✅ Full par accident (idem) / ✅ Full réel si fallback OOXML | ✅ Full — `<a:noFill/>` sur le connecteur (pas de trait dessiné) ; l'arête reste dans l'AST pour que Dagre continue à s'en servir pour le rang, comme le fait Mermaid lui-même ; rendu réel vérifié |
| Libellé d'arête, syntaxe `\|texte\|` | `A-->\|texte\|B` | 🟡 Partial (corrigé 2026-09-03) — la convention spec §5.2 est désormais **implémentée** : `edge.label` est préfixé au texte du nœud destination (`"Oui : texte"`), rendu réel vérifié dans `chain.ts` et `tree.ts`. Reste "Partial" et pas "Full" : ce n'est pas un vrai libellé sur le connecteur, juste une approximation textuelle fusionnée au nœud — fidèle à l'intention mais pas à la forme d'origine | 🟡 Partial si classifié / ✅ Full si fallback | ✅ Full — rendu au milieu du connecteur (`edge labels are rendered at the connector midpoint`, testé) |
| Libellé d'arête, syntaxe médiane `A-- texte -->B` | `-- texte -->` (et `-.  .->`, `== ==>`, `-- ---`, `-- --o`, `-- --x`) | 🟡 Partial (corrigé 2026-09-04) — reconnue par le parseur (`matchMidLabelEdge()`), alimente le même champ `edge.label` que `\|texte\|` ci-dessus, donc exactement le même statut : préfixé au texte du nœud destination dans `chain.ts`/`tree.ts` (approximation textuelle, pas un vrai libellé sur le connecteur) | 🟡 Partial si classifié / ✅ Full si fallback | ✅ Full — même `<wps:txbx>` au milieu du connecteur que `\|texte\|`, rendu réel vérifié |
| Arêtes multidirectionnelles (`o--o`, `x--x`, `<-->`, `--o`, `--x`) | — | 🟡 Partial (corrigé 2026-09-04) — les 5 motifs sont désormais reconnus dédiés (`bidirectional`/`circleBoth`/`crossBoth`/`circle`/`cross`) ; la topologie n'est plus perdue, mais `chain.ts`/`tree.ts` ne dessinent toujours aucun connecteur, donc la distinction visuelle elle-même (têtes de flèche multiples/cercle/croix, tout l'intérêt de cette ligne) reste invisible côté SmartArt pur — même perte que "Lien pointillé"/"Lien épais" ci-dessus | 🟡 idem / ✅ Full si fallback | ✅ Full — `<a:headEnd>`/`<a:tailEnd>` avec marqueur `triangle`/`oval` par extrémité ; `cross` (`--x`/`x--x`) approximé par `diamond` (DrawingML n'a pas de marqueur "croix" natif — aucune valeur d'énumération `ST_LineEndType` ne dessine un X), rendu réel vérifié |
| Modificateurs de longueur (`---->`, `====>`, `-...->`) | dashes/points/égals supplémentaires | 🟡 Partial (corrigé 2026-09-04) — `EDGE_OPERATORS` matche désormais une longueur variable par regex (vérifié contre la doc Mermaid, table "Minimum length of a link" : `arrow`/`thick` acceptent 2+ caractères avant la tête, `line`/`thickLine`/`dotted`/`dottedLine` un motif à répétition équivalent) ; la ligne n'est plus rejetée et l'arête est créée avec le type de base (`arrow`/`line`/`thick`/`thickLine`/`dotted`/`dottedLine`), mais la longueur supplémentaire elle-même reste sans effet sur le rang (voir cellule OOXML) — pas de régression sur le marqueur médian `--`/`==` à 2 caractères (`line`/`thickLine` exigent un minimum de 3 répétitions précisément pour ça) | 🟡 idem / ✅ Full si fallback | 🟡 Partial — la syntaxe n'est plus perdue mais, comme documenté ci-dessous, Dagre a son propre algorithme de rang indépendant du nombre de tirets Mermaid : la longueur n'a aucune traduction en OOXML |
| Chaînage sur une ligne (`A-->B-->C`) | — | ✅ Full pour la topologie (corrigé 2026-09-04) — chaque maillon produit maintenant sa propre arête dans l'AST (`A-->B`, `B-->C`, ...) au lieu de faire échouer toute la ligne ; `classifyTopology()`/`chain.ts` consomment `ast.edges`, pas le texte source, donc la structure en chaîne est désormais détectée correctement — la limite documentée la session précédente ("tests de `chain.ts` réécrits une arête par ligne") était bien un bug du parseur, pas une limite architecturale de `chain.ts` lui-même | ✅ Full | ✅ Full — chaque maillon rendu comme un connecteur indépendant, rendu réel vérifié |
| Liens multiples (`a --> b & c`, `a & b --> c`) | opérateur `&` | ✅ Full pour la topologie (corrigé 2026-09-04) — fan-out et fan-in produisent maintenant une arête par combinaison source×destination dans l'AST, au lieu de faire échouer toute la ligne ; même raisonnement que le chaînage ci-dessus (limite de parseur, pas de `chain.ts`) | ✅ Full | ✅ Full — rendu réel vérifié (4 combinaisons testées : fan-out, fan-in, chaînage, chaînage+libellé mi-parcours) |
| ID d'arête + animation (`e1@-->`, v11.10+) | `A e1@--> B` puis `e1@{ animate: true }` | 🔧 ❌ None — syntaxe `@` sur arête non reconnue ; **et** de toute façon sans objet pour une sortie statique Word (l'animation est un concept SVG/navigateur, pas transposable en `.docx`) | 🔧 idem — sans objet | 🔧 idem — sans objet |
| Style de courbe (`curve: linear`, etc.) | config diagramme/arête | N/A — concept propre au rendu SVG de Mermaid (courbure des splines) ; SmartArt et OOXML ont chacun leurs propres mécanismes de routage de connecteur, aucun des deux ne cherche à reproduire un style de courbe Mermaid spécifique | N/A | N/A — Dagre route les arêtes selon son propre algorithme, indépendant de la config Mermaid |
| Longueur minimale de lien (dashes en plus, `---->`) | rang forcé | ❌ None (corrigé 2026-09-04 : la syntaxe elle-même n'est plus rejetée, voir "Modificateurs de longueur" ci-dessus) — mais l'*effet sémantique* (forcer un rang plus large) reste absent des 3 stratégies : cette fonctionnalité influence l'algorithme de rang de Mermaid, pas Dagre (moteur de layout différent), donc même reconnue elle n'a rien à traduire | ❌ idem | ❌ idem — portabilité sémantique hors de portée quelle que soit la stratégie, pas une limite de générateur |

### 5.5 Commentaires

| Fonctionnalité | Syntaxe | SmartArt seul | Hybride | OOXML seul |
|---|---|---|---|---|
| Commentaire `%%` | `%% commentaire` | ✅ Full — ligne ignorée proprement par le parseur (`line.startsWith('%%')`), sans warning, comme attendu | ✅ Full | ✅ Full |

### 5.6 Sous-graphes

| Fonctionnalité | Syntaxe | SmartArt seul | Hybride | OOXML seul |
|---|---|---|---|---|
| `subgraph`/`end` basique | `subgraph X\n...\nend` | ❌ None — `classifyTopology()` disqualifie **systématiquement** tout flowchart contenant un `subgraph`, avant même d'évaluer chain/tree/cycle (`classify.ts` ligne 117-121) | ✅ Full — disqualification → fallback automatique vers le pipeline OOXML, qui supporte pleinement les sous-graphes | ✅ Full — titres de sous-graphe rendus en boîte plate (spec §6.1), imbrication suivie correctement (fix git "track nested subgraph relationships correctly") |
| ID explicite (`subgraph id [Titre]`) | — | ❌ None (même disqualification) | ✅ Full (fallback) | ✅ Full |
| Arêtes vers/depuis un sous-graphe | `one --> two` (sous-graphes) | ❌ None (même disqualification) | ✅ Full (fallback) — **note** : le parseur V1 actuel supprime explicitement toute arête référençant un id de sous-graphe comme extrémité (`edgesWithoutSubgraphs`, `parser.ts` ligne 214-220) ; c'est donc une limite de parseur qui s'ajoute, indépendante de la stratégie | 🔧 même limite de parseur — l'arête inter-sous-graphes est de toute façon supprimée avant translation, peu importe la stratégie |
| Imbrication de sous-graphes | `subgraph A\n subgraph B...end\nend` | ❌ None (disqualification) | ✅ Full (fallback, testé) | ✅ Full |
| `subgraph` = "hiérarchie SmartArt libellée" (piste, §5 de la spec) | — | ⏳ **Non implémenté** — idée documentée (`docs/specs/FUTURE_mmd2smartart_SPEC.md` §5, et le layout `Labeled Hierarchy` identifié dans `docs/smartart-layout-catalog.md`) : le titre du sous-graphe deviendrait un nœud parent supplémentaire dans `dgm:dataModel`, à un seul niveau, uniquement si le sous-graphe est lui-même `tree`/`chain` avec un point d'entrée unique. Aucun code écrit à ce jour. | ⏳ même statut — si implémenté un jour, changerait cette ligne et la précédente pour les sous-graphes remplissant ces conditions | ✅ Full (comportement actuel, inchangé par cette piste) |
| Direction de sous-graphe + limitation d'héritage | `direction TB` dans un `subgraph` lié à l'extérieur | ❌ None (disqualification) | 🟡 Partial si fallback (sous réserve de la limite signalée en §5.1 : direction par sous-graphe parsée mais pas appliquée au layout — limite de Dagre, pas du parseur, depuis 2026-09-04) | 🟡 limite du traducteur OOXML/Dagre, voir §5.1 |
| Sous-graphe repliable (`view: collapsed`, v11.17+) | `id@{ view: collapsed }` | 🔧 ❌ None — `parseAtShapeSyntax()` (§5.2, corrigé 2026-09-04) ne s'applique qu'à une déclaration de **nœud** (`shape:`/`label:`), pas à un `subgraph` ; sa propriété `view:` n'a de toute façon aucune contrepartie côté parseur de sous-graphe ; **et** sans objet pour une sortie statique — "replié/déplié" est un état d'interaction, pas un état représentable dans un `.docx` figé | 🔧 idem — sans objet dans un document statique | 🔧 idem — sans objet |

### 5.7 Topologies globales (chaîne / arbre / cycle / irrégulier)

Cette section ne vient pas de la doc Mermaid (qui ne catégorise pas les flowcharts par forme
globale) mais de `classify.ts`, le module qui décide quelle stratégie s'applique — elle complète
utilement les sections précédentes qui listent des *constructions syntaxiques* plutôt que des
*formes de graphe*.

| Topologie | Condition (`classify.ts`) | SmartArt seul | Hybride | OOXML seul |
|---|---|---|---|---|
| Chaîne simple (chemin, in/out-degré ≤ 1) | — | ✅ Full — `chain.ts` livré, testé, **rendu réel vérifié** (LibreOffice, session 2026-09-03) ; sous réserve des pertes détaillées en §5.1-§5.4 (forme, couleur, libellé d'arête) | ✅ Full (même générateur) | ✅ Full (chemin par défaut, fidélité totale sur forme/couleur/libellé, moins l'éditabilité "au clic" propre à SmartArt) |
| Arbre, profondeur ≤ 2 (racine + une rangée d'enfants directs) | `MAX_TREE_DEPTH = 2` | ✅ Full — `tree.ts` livré, testé, **rendu réel vérifié** (racine + rangée d'enfants stylée, cette session) ; mêmes pertes de forme/couleur/libellé qu'en chaîne | ✅ Full | ✅ Full |
| Arbre, profondeur > 2 (petits-enfants) | `tree-too-deep` | ❌ None — disqualifié explicitement ; `tree.ts` ne sait pas répartir une hauteur adaptative sur plus d'un niveau d'imbrication (§3.1 de la spec, "point tranché" 2026-09-03) — pas une limite du format OOXML/SmartArt en soi, mais du générateur actuel | ✅ Full (fallback automatique) | ✅ Full |
| Cycle fermé (in-degré = out-degré = 1 partout) | — | ❌ **CASSÉ en Word réel, confirmé 2026-09-03** — un simple cycle à 3 nœuds (`A-->B-->C-->A`) produit un `.docx` que Word refuse d'ouvrir ("erreur lors de l'ouverture du fichier", proposition du convertisseur de récupération de texte — le même échec dur que l'incident `wpc:graphicFrame` documenté dans `docs/adr/spikes/spike-smartart/spike.md`). La mention "✅ Full" précédente de cette ligne reposait **uniquement** sur un rendu LibreOffice réussi au premier essai — jamais testé en Word réel avant cette date, malgré l'avertissement explicite ailleurs dans ce même repo (`TODO.md`, l'incident `mc:Ignorable`) que "propre sous LibreOffice" n'implique pas "propre sous Word". Cause racine non encore identifiée (`packages/core/src/smartart/cycle.ts`, `CYCLE_LAYOUT_XML` — XML bien formé, structure calquée sur `chain.ts` qui lui a un échantillon Word réel positif au moins pour un cas isolé). Prochaine étape : générer un vrai SmartArt "Basic Cycle" depuis le menu Insertion de Word (pas notre outil) et diffé contre notre sortie, méthode qui a déjà résolu l'incident `mc:Ignorable` et celui du `wpc:graphicFrame` imbriqué. | ❌ **Cassé — même générateur, même échec**, mais **[corrigé le 2026-09-04] `smartArt.enabled` vaut désormais `false` par défaut** (CLI et extension), précisément à cause de cet incident : SmartArt n'est plus produit à moins d'un opt-in explicite (`MD2NATIVEDOCX_ENABLE_SMARTART=1` / réglage de l'extension), donc un flowchart en boucle fermée ne produit plus de fichier corrompu par défaut — le bug de `cycle.ts` lui-même reste néanmoins non résolu pour qui active l'opt-in. | ✅ Full — Dagre gère un cycle comme n'importe quel graphe dirigé, aucune disqualification |
| Fusion après branchement (décision → Oui/Non → merge) | `merge-after-branch` | ❌ None — disqualifié explicitement ; c'est, selon la spec elle-même, **le pattern le plus fréquent dans un flowchart réel** (§6, §10.1) — la limitation la plus citée de tout ce chantier | ✅ Full (fallback automatique — c'est précisément la raison d'être du dispatch hybride) | ✅ Full |
| Topologie irrégulière (multi-racines, etc.) | `irregular-topology` | ❌ None | ✅ Full (fallback) | ✅ Full |
| Diagramme déconnecté (composantes multiples) | `disconnected` | ❌ None | ✅ Full (fallback) | ✅ Full |
| Auto-boucle (`A --> A`) | `self-loop` | ❌ None — disqualifié par `classify.ts` | ✅ Full (fallback) | 🟡 Partial probable — vérifié empiriquement que le **parseur** accepte `A --> A` sans broncher (nœud + arête créés normalement, zéro warning) ; seul `classify.ts` le rejette pour la voie SmartArt. Le rendu visuel exact d'une auto-boucle par le traducteur OOXML/Dagre n'a pas été audité dans cette session — signalé pour vérification séparée, pas un verdict définitif |

### 5.8 Interaction / configuration du rendu Mermaid

| Fonctionnalité | Syntaxe | SmartArt seul | Hybride | OOXML seul |
|---|---|---|---|---|
| `click nodeId ...` (callback JS, lien, tooltip) | `click A "url"` | N/A — concept propre à un rendu SVG interactif dans un navigateur ; un `.docx` statique n'a pas d'équivalent direct (Word sait faire des hyperliens sur une forme, mais rien dans le pipeline actuel — SmartArt ou OOXML — ne consomme cette syntaxe aujourd'hui, dans aucune des 3 colonnes) | N/A | N/A |
| Config renderer (`layout: dagre\|elk`), largeur, thème/`look` Mermaid | config front-matter | N/A — ces réglages pilotent le moteur de rendu *de Mermaid lui-même* (jamais exécuté dans ce pipeline : notre propre parseur+Dagre+traducteur XML remplace entièrement le rendu SVG natif de Mermaid, spec §1 "perte de fidélité 'même moteur que l'aperçu' assumée dès le départ") | N/A | N/A |

---

## 6. Synthèse — lecture d'ensemble

Pas de recommandation tranchée ici (ce n'est pas l'objet de ce document) mais quelques constats
factuels utiles pour la décision à venir :

- **Le parseur V1 reste la plus grande source de non-couverture restante, mais son périmètre a
  nettement rétréci le 2026-09-04** — 4 lignes 🔧 supplémentaires levées ce jour-là (`BT`/`RL`,
  forme asymétrique, modificateurs de longueur, ordre `class`/`classDef`), aucune ne s'étant révélée
  être un obstacle technique de fond une fois examinée : ce sont les précédents correctifs du
  2026-09-03/04 (`{{ }}`, `[[ ]]`, `@{shape}`, libellés médians, `linkStyle`...) qui avaient déjà
  entamé cette même liste. Élargir le parseur profite toujours aux **3** stratégies simultanément —
  ce qui reste, désormais surtout : icônes/images `@{icon:...}` (nécessiterait une vraie nouvelle
  capacité d'embarquement de glyphe, pas juste un correctif de parsing).
- **Les 3 topologies du classifieur (chain, tree profondeur ≤ 2, cycle) ont désormais leur
  générateur, tous vérifiés par rendu LibreOffice réel** (pas seulement par test XML). Là où
  SmartArt s'applique, il ne perd plus, après les correctifs du 2026-09-03, qu'une seule chose que
  l'OOXML seul conserve : la forme exacte du nœud (toujours `roundRect` — confirmé non
  contournable, un override `a:prstGeom` par nœud n'a aucun effet sous LibreOffice, cf. §2.4). La
  direction, la couleur par nœud, et le texte des libellés d'arête (sous forme de préfixe fusionné
  au nœud, pas un vrai connecteur étiqueté) sont désormais fidèles. Reste aussi non dessiné : tout
  **style de trait** (pointillé/épais) — SmartArt ne dessine simplement aucun connecteur visible
  entre les boîtes, quel que soit le style Mermaid d'origine ; seule la position relative porte
  l'information de liaison. En échange de ces pertes résiduelles, SmartArt offre l'éditabilité
  native dans Word (réordonner, changer de disposition au clic) qui est tout l'argument de vente.
- **Ce qui reste hors de portée de SmartArt n'est plus une question de générateur manquant, mais de
  topologie structurellement incompatible** : profondeur d'arbre > 2 (nécessiterait un partage de
  hauteur adaptatif, pas juste plus de niveaux copiés-collés), `subgraph` (disqualifié
  systématiquement — la piste `Labeled Hierarchy` du catalogue reste à spiker avec un vrai
  échantillon Word), et surtout la fusion après branchement ci-dessous.
- **La fusion après branchement — le pattern le plus fréquent en pratique — désactive SmartArt
  presque toujours.** Un flowchart réel avec une décision (`if/else`) suivie d'une convergence
  retombe systématiquement sur le fallback OOXML avec l'approche hybride actuelle. C'est
  précisément pourquoi l'approche **hybride** (plutôt que SmartArt-only) a été choisie dès le
  départ (spec §1 : "complément… pas un remplacement").
- **L'hybride, tel que conçu, n'ajoute jamais de risque de régression** : chaque ligne "❌ None" en
  colonne SmartArt-only redevient "✅ Full" en colonne Hybride via le fallback automatique — câblé
  et testé de bout en bout depuis le 2026-09-03 (§2.2), plus une simple description de
  comportement prévu.
