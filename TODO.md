# TODO — `md2nativedocx`

> Plan de travail vivant, aligné sur `cahier_des_charges.md` (le **quoi/pourquoi**) et `AGENTS.md`
> (le **comment**). Ce fichier reflète l'état réel du repo à la date de dernière mise à jour.
> Cochez les cases au fur et à mesure. Toute tâche qui touche à l'API publique de
> `packages/core`, ajoute une dépendance, ou assouplit une règle de sécurité doit être
> **escaladée à un humain** avant d'être considérée faite (voir `AGENTS.md` → "Escalate to a human").

---

## ✅ Phase 0 — spikes résolus (2026-08-06)

Les deux spikes bloquants de la Phase 0 ont été résolus et documentés. Le bandeau "EN PAUSE"
est levé.

- [x] **Trancher Dagre vs Graphviz** — le package npm `dagre` est installé et utilisé comme moteur
      de layout par défaut (ADR 0001). `layout/layout.ts` a été **réécrit** comme wrapper Dagre
      (l'ancienne réimplémentation maison est jetée). Spike : `docs/adr/spikes/spike-layout.mjs`.
- [x] **Valider `RawBlock('openxml', ...)`** sur un fragment `wpg:wgp` complexe — validé
      bout-en-bout (Pandoc 3.1.3 → `.docx` → ZIP valide, XML bien formé, 0 relation externe).
      Spike : `docs/adr/spikes/spike-pandoc/`. ADR 0002.
- [x] Documenter les deux décisions dans `docs/adr/0001-layout-engine.md` et
      `docs/adr/0002-pandoc-integration.md`.
- [x] Écrire `.devcontainer/devcontainer.json` + `setup.sh` (Pandoc 3.1.3, Lua 5.4, LibreOffice).
      ⚠️ PR séparée, **non mergée** — revue humaine obligatoire (règle `.devcontainer/`).
- [x] `npm install`, `build`, `typecheck`, `lint` sur l'existant — base vérifiée (0 erreur).
- [x] `.github/workflows/ci.yml` + `codeql.yml` écrits.

---

## État actuel (2026-08-06)

- ✅ **Restructuration du répertoire de tests (2026-08-07)** : signalé par l'utilisateur comme
      confus et construit par accumulation plutôt que conception. `test-corpus/output/simple/`
      créait un sous-répertoire horodaté à **chaque** `npm test`, jamais nettoyé — 100+ fichiers
      accumulés, dont une partie committée par erreur par un processus externe. Plus deux
      fichiers orphelins (`ab (5).docx`, `word-group.docx` — ce dernier explicitement listé
      comme "à ne pas commiter" dans `tools/word-reference/README.md`) et un
      `known-issues/README.md` orphelin (suppression perdue dans l'incident `git stash`
      documenté plus bas).
  - Nouveau document racine `TESTING.md` : stratégie de test en 6 chapitres (unitaires,
    intégration pipeline, corpus réel, régression visuelle, comparaison Word natif, spikes
    historiques), écrit **avant** la réorganisation des répertoires plutôt qu'après — approche
    demandée explicitement par l'utilisateur ("point de vue global" plutôt que continuer à
    construire par addition).
  - `test-corpus/{source,output/corpus}` → `test-corpus/corpus/{source,generated}` (un seul
    chapitre "corpus réel" au lieu de deux emplacements séparés). `test-corpus/output/simple/`
    supprimé entièrement ; racine du problème corrigée, pas juste le symptôme : les deux tests
    "simple" de `corpus.test.mjs` (qui n'ont besoin d'aucune trace persistée — ce sont de
    simples assertions sur le XML généré) utilisent maintenant `mkdtempSync`/`rmSync`, le même
    pattern déjà en place dans `cli.test.mjs`, au lieu d'écrire dans un répertoire horodaté.
  - `scripts/spike-{layout.mjs,pandoc/}` → `docs/adr/spikes/` (à côté des ADR qu'ils étayent,
    étiquetés comme archive historique, pas comme tests à maintenir) — `scripts/` ne contient
    plus que l'outillage activement invoqué par `npm test`/`npm run test:visual`.
  - `tools/word-reference/` (comparaison manuelle Windows) volontairement **pas déplacé** —
    référencé depuis `TESTING.md` plutôt que consolidé, sur décision explicite de l'utilisateur.
  - Vérifié : 3 exécutions successives de `npm test` ne recréent aucun fichier accumulé
    (42 fichiers stables dans `test-corpus/`), `npm run test:visual` toujours 12/12,
    `node scripts/generate-corpus.mjs` fonctionne en standalone avec les nouveaux chemins.

**Fait :**
- ✅ Scaffold monorepo npm (racine `package.json`, `tsconfig.base.json`, `.eslintrc.cjs`, `.gitignore`)
- ✅ Docs de gouvernance : `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `PULL_REQUEST_TEMPLATE.md`,
  templates d'issues (`bug_report.md`, `feature_request.md`)
- ✅ Environnement : Pandoc 3.1.3 + Lua 5.4 installés dans le Codespace (figés dans
  `.devcontainer/`, PR séparée non mergée — revue humaine obligatoire)
- ✅ Phase 0 spikes résolus : Dagre choisi (ADR 0001), `RawBlock('openxml')` validé (ADR 0002)
- ✅ `packages/core` : parser + layout Dagre + **traducteur OOXML** + barrel public `index.ts`
- ✅ Tests : unitaires + golden + fuzz (29 tests, 0 échec) — le fuzz a trouvé/corrigé un bug de
  prototype pollution (`__proto__`)
- ✅ `packages/pandoc-filter/` : filtre Lua + binaire bridge (4 tests)
- ✅ `packages/cli/` : `npx md2nativedocx` (7 tests — dont un test de corpus qui régénère chaque
      `.docx` du corpus dans `test-corpus/output/` via le CLI réel et vérifie sa conformité OOXML,
      + 2 tests simples : markdown sans mermaid et markdown avec `A --> B`, spec §5.3/§9)
- ✅ Traducteur conforme aux schémas officiels (ECMA-376 + MS-OE376) : `wpg:wgp` → `wpg:cNvPr` →
      `wpg:cNvGrpSpPr` → `wpg:grpSpPr` → `wps:wsp` (avec `wps:cNvPr`/`wps:cNvSpPr`/`wps:cNvCnPr`),
      sous-graphes en `wpg:grpSp`, canvas `wpc:wpc`, `wp:inline` avec `wp:extent`/`wp:docPr`,
      `wps:style` avec références de thème Word (`lnRef`/`fillRef`/`effectRef`/`fontRef`),
      `wps:bodyPr` complet. Structure comparée à un document Word réel (`tools/word-reference/`).
- ✅ **Conformité Word — série de corrections (2026-08-07)**, chacune couverte par un test de
      non-régression (les 34 tests précédents passaient tous pendant que le `.docx` était
      inutilisable dans Word) :
  - Les namespaces étendus (`wpc`/`wpg`/`wps`/`wp14`) sont désormais réellement déclarés sur la
    racine `w:document`. Le post-traitement était un **no-op silencieux** : il cherchait
    `xmlns:wpg=` dans tout le document et tombait sur les déclarations *inline* du traducteur.
  - Ids de dessin uniques à l'échelle du document. `wp:docPr` et `wpg:cNvPr` valaient tous deux
    `id="1"` (Word signale le fichier comme corrompu) ; le traducteur numérote maintenant chaque
    fragment depuis 1 et `postprocess.mjs` renumérote globalement, en réécrivant les
    `a:stCxn`/`a:endCxn` pour que chaque connecteur reste attaché à ses formes.
  - Traducteur redevenu une **fonction pure** : le compteur d'ids était global au module et
    fuitait entre les appels (deux appels identiques donnaient deux sorties différentes).
  - `wp:anchor` → `wp:inline` : conforme à la spec §5.3, le diagramme suit le fil du texte au
    lieu de flotter par-dessus.
  - Têtes de flèches, pointillés et épaisseurs de trait (§6.2) : aucun `<a:ln>` n'était émis,
    `LINE_STYLE_BY_EDGE` était calculé puis jeté (variables mortes signalées par le lint).
  - Labels d'arêtes (`-->|Texte|`, §6.2) : ils étaient purement et simplement perdus.
  - Couleur de texte explicite selon la luminance du fond : le thème Word résout le texte des
    formes en blanc (`fontRef` → `lt1`), invisible sur le fill clair par défaut.
  - Mise à l'échelle automatique des diagrammes trop grands (le corpus émettait des `wp:extent`
    de 80 × 18 pouces, rognés par Word).
  - Couleurs validées comme hexadécimal avant d'atteindre `a:srgbClr/@val` (`TranslateOptions`
    est public et n'était pas contrôlé).
  - `packages/cli/bin/docx-patch.mjs` supprimé : implémentation concurrente, morte (importée
    nulle part) et cassée (`require()` dans un module ESM, `zip -j` écrivant `document.xml` à
    la racine de l'archive).
  - `pretest` ajouté à `packages/core` : `dist-test/` n'était compilé par rien, donc `npm test`
    et la CI exécutaient un instantané figé au lieu des tests du dépôt.
- ✅ CI/CD : `.github/workflows/ci.yml` + `codeql.yml`
- ✅ `LICENSE` (CC0 verbatim), `README.md` complet
- ✅ Validation `npm install` / `build` / `typecheck` / `lint` / `test` — tout passe

**Manquant (le gros du travail restant) :**
- ❌ `CODE_OF_CONDUCT.md` — **fourni par le mainteneur humain, l'agent ne doit pas en rédiger un**
- ✅ Phase 3 (couleurs + sous-graphes) faite (voir plus bas).
- ⚠️ **Phase 2 (extension VS Code) — cœur fait (2026-08-07)**, packaging Marketplace et Phase 2.5
      (aperçu) restants. Détail complet dans la section "Phase 2" plus bas.
- ❌ Phase 4 (add-in Word), Phase 5+ (autres diagrammes) — pas commencées.
- ✅ **LibreOffice headless installé (2026-08-07)** dans le Codespace (`libreoffice-writer` +
      `libreoffice-impress`, comme documenté dans `.devcontainer/setup.sh` — installation directe,
      aucune modification du devcontainer lui-même). `soffice --headless --convert-to png` permet
      de vraiment ouvrir/rendre un `.docx` généré, ce que la validation XML structurelle ne peut
      pas faire. A immédiatement mis au jour 3 défauts de rendu invisibles aux 75 tests
      structurels existants (voir entrées ci-dessous) — confirme que le rendu réel est un axe de
      détection à part entière, distinct de la conformité XML.
- ⚠️ `test:visual` (rendu LibreOffice headless + pixel-diff, spec §9) **câblé mais partiel** :
      `scripts/test-visual.mjs` + décodeur/diff PNG maison en JS pur (`scripts/lib/png.mjs`, zéro
      nouvelle dépendance — règle n°6 — puisque `node:zlib` suffit pour l'inflate). Le mécanisme
      est complet et fonctionnel ; **12 fixtures** ont une baseline acceptée
      (`test-corpus/visual/{fixtures,baseline}/` : `shapes`, `edge-types`, `colors`, `decision`
      (diamant oui/non — le cas de routage d'arête), `lr-direction`, `nested-3-levels`,
      `fan-out`, `cycle`, `mixed` (formes + couleurs + sous-graphe combinés), `order-flow`
      (~11 nœuds, dans la fourchette du critère MVP), `long-labels` (débordement de texte, garde
      visuelle du compromis déjà accepté), `subgraph`) — la spec §9 demande un **corpus de 20 à
      30 diagrammes représentatifs** (3 à 50 nœuds, avec sous-graphes), donc encore un écart
      (12 sur 20-30) mais substantiellement réduit. Le corpus existant à 8 diagrammes
      (`test-corpus/source/`, 24 à 318 nœuds) n'y est toujours pas inclus : au-delà de la question
      de lisibilité (voir plus bas), chaque fixture demande une revue visuelle manuelle avant
      d'accepter sa baseline, ce qui rend risqué d'y intégrer des diagrammes énormes sans
      passe dédiée. Seuil 1 % de pixels différents (tolérance 24/255 par canal pour absorber
      l'anti-aliasing). Une baseline n'est **jamais** générée automatiquement au premier run
      (aurait canonisé silencieusement un bug — deux fixtures de ce lot, `nested-3-levels.mmd` et
      `order-flow.mmd`, ont justement révélé en aveugle le défaut LibreOffice hauteur/ratio
      documenté plus bas, découvert *grâce à* cette revue systématique) — `--update-baseline`
      explicite après revue visuelle. `npm run test:visual` (skip proprement si LibreOffice absent
      du PATH) ; `npm run test:visual:update-baseline` pour régénérer après revue.
- ❌ **Tests manuels dans Word réel** (critère d'acceptation MVP, spec §9) — les corrections de
      conformité ci-dessus sont validées structurellement (XML bien formé, ZIP valide, ids
      uniques, hiérarchie comparée à un document Word réel) et maintenant aussi visuellement
      (LibreOffice), **pas** par une ouverture dans Word lui-même — le rendu OOXML de LibreOffice
      diverge de Word sur des détails (ex. les têtes de flèche `a:tailEnd` : présentes et
      correctement positionnées dans le XML, mais leur rendu par Word reste à vérifier).
- ✅ **Corrections de géométrie des connecteurs, trouvées via LibreOffice headless (2026-08-07)**,
      invisibles aux tests structurels — repérées en convertissant un `.docx` généré en PNG
      (`soffice --headless --convert-to png`) et en inspectant le rendu :
  - `a:xfrm off/ext` des connecteurs calculé sur les **centres** des boîtes au lieu du point de
    connexion réel sur leur périmètre → les lignes traversaient l'intérieur des formes et les
    têtes de flèche (`a:tailEnd`), terminant au centre de la forme cible, étaient cachées sous
    son remplissage (invisibles, pas un défaut du triangle lui-même). Corrigé : `connectorGeometry`
    calcule maintenant le point réel sur le bord (`sitePoint`).
  - Indices de site de connexion **décalés d'un cran** : le code utilisait 1=haut, 2=droite,
    3=bas, 4=gauche ; Word utilise en réalité 0=haut, 1=droite, 2=bas, 3=gauche (vérifié sur
    `tools/word-reference/` : un connecteur vertical réel utilise `idx="2"` en source et
    `idx="0"` en cible). Sans effet visuel sur un rendu statique (l'`a:xfrm` explicite prime),
    mais déterminant pour le rattachement magnétique quand l'utilisateur déplace une boîte
    dans Word (spec §6.2) — c'est justement le comportement que ces indices pilotent.
  - Label d'arête repositionné sur le milieu du **segment réel** du connecteur (bord à bord)
    plutôt que le milieu centre-à-centre des deux nœuds.
- ✅ **Routage des arêtes qui sautent un rang — corrigé (2026-08-07)** : une arête comme
      `B -->|non| D` (alors que `B -->|oui| C` et `C --> D` existent aussi) traçait une ligne
      droite entre B et D sans tenir compte des nœuds intermédiaires, traversant littéralement
      `Action`. Touchait directement le critère d'acceptation MVP (spec §9 : « 0 croisement de
      flèches »).
  - `LayoutResult` porte désormais un champ `edges` (un point de route par arête, indexé comme
    `Flowchart.edges`) — extrait de `g.edge({v,w}).points` après `dagre.layout()`, Dagre routant
    déjà les arêtes multi-rangs autour des nœuds virtuels intermédiaires. **Extension de la
    surface exportée de `packages/core`** (`layout()` est exporté par le barrel ; `LayoutResult`
    ne l'est pas nommément mais sa forme fait partie de ce qu'un consommateur observe) — signalée
    et approuvée explicitement avant implémentation (`AGENTS.md` → escalade humaine), changement
    strictement additif.
  - `ooxml-translator.ts` émet un `a:custGeom` (chemin `moveTo`/`lnTo*` explicite) plutôt qu'une
    des géométries `bentConnectorN`/`curvedConnectorN` prédéfinies de Word/PowerPoint : celles-ci
    sont paramétrées par des valeurs `adj` sans formule publique documentée pour "voici N points,
    calcule les adj correspondants" — un `custGeom` trace exactement le chemin que Dagre a déjà
    calculé, sans deviner. `wps:cNvCnPr`/`stCxn`/`endCxn` restent posés dessus (comportement
    magnétique, spec §6.2) : la "connector-ness" vient de `cNvCnPr`, pas de la géométrie.
  - **Décision de conception retravaillée en cours de route** : la première version déclenchait
    le chemin coudé sur un simple seuil ("plus de 3 points renvoyés par Dagre"). Ça s'est avéré
    faux dès qu'un sous-graphe est impliqué — Dagre ajoute des points de routage pour toute arête
    qui traverse une frontière de cluster, même sans obstacle réel (vérifié sur la fixture
    `subgraph.mmd` : `B --> C`, une arête simple entre rangs adjacents, recevait 5 points juste
    parce qu'elle passe de `Externe` à `Interne`). Remplacé par un **vrai test géométrique** : la
    ligne droite entre les deux sites de connexion croise-t-elle la boîte d'un *autre* nœud ? Si
    non (le cas courant), ligne droite inchangée, indépendamment de ce que Dagre renvoie.
  - **Deux bugs plus profonds trouvés en vérifiant sur la fixture `subgraph.mmd`**, tous deux
    dans `layout.ts`, aucun des deux limité au routage d'arêtes :
    1. Un chemin coudé dont les points intermédiaires ne sont pas décalés par la réservation
       d'espace de titre (§ ci-dessus) produisait un chemin en zigzag non monotone (un point
       revenant en arrière) — LibreOffice ne rendait **plus rien du tout** (même mode d'échec
       total et silencieux que la tentative multi-page). Résolu par le remplacement de
       l'heuristique par le test géométrique ci-dessus : les arêtes de cette fixture n'ont plus
       besoin d'être coudées, donc plus de désalignement.
    2. La boîte d'un cluster Dagre déborde légitimement au-delà de ses nœuds enfants (marge de
       cluster interne à Dagre) — calculer l'offset de normalisation à partir des nœuds seuls
       (comme le faisait le code d'origine) laissait certains sous-graphes à des coordonnées
       **négatives**, ce qui casse le rendu entièrement (même mode d'échec silencieux et total,
       vérifié empiriquement). Corrigé : l'offset partagé (`boundsOrigin`) est maintenant calculé
       sur nœuds *et* sous-graphes combinés. A aussi corrigé au passage un bug latent préexistant
       distinct : `normalizeSubgraphs` recalculait son minX/minY à partir des nœuds *déjà
       normalisés* (donc toujours 0), ce qui revenait à ne jamais décaler les sous-graphes —
       resté invisible tant que les coordonnées brutes de Dagre démarraient déjà près de (0,0).
  - Tests : `layout.test.ts` (points de route exposés, arête simple vs. arête qui saute un rang,
    coordonnées jamais négatives) + `translator.test.ts` (pas de régression sur le cas simple,
    chemin routé autour du nœud intermédiaire, label positionné sur le vrai chemin, `stCxn`/
    `endCxn` toujours présents sur un connecteur coudé).
- ✅ **Titre de sous-graphe superposé au premier nœud — corrigé (2026-08-07)** : Dagre calculait
      la boîte d'un cluster au plus juste autour de ses nœuds enfants, sans réserver d'espace
      pour la barre de titre que `renderSubgraph` (`ooxml-translator.ts`) dessine en haut de
      cette même boîte. `layout.ts` réserve maintenant `SUBGRAPH_TITLE_HEIGHT` (24px, constante
      partagée avec le traducteur pour que les deux valeurs ne puissent pas diverger) en
      post-traitement : chaque sous-graphe fait grandir sa propre boîte de cette hauteur et
      décale tous ses descendants (nœuds + sous-graphes imbriqués, transitivement) d'autant —
      un nœud imbriqué à 2 niveaux hérite de 2 décalages cumulés, un par barre de titre
      au-dessus de lui. La passe s'exécute **après** la normalisation finale (`normalize()`), pas
      avant : sinon elle re-ancre tout le diagramme à y=0 et annule le décalage du sous-graphe le
      plus externe (piège trouvé en testant le cas imbriqué).
  - **Bug parseur trouvé au passage, plus profond que prévu** : `subgraphIds` (la relation
    d'imbriction entre sous-graphes) n'était **jamais peuplé** — aucun sous-graphe ne savait
    qu'un autre était niché dedans, ce qui cassait aussi le clustering Dagre lui-même (pas
    seulement l'espacement du titre), pas seulement son rendu. Et `attachToCurrentSubgraph`
    rattachait un nœud au sous-graphe courant à **chaque ligne qui le mentionne**, pas seulement
    à sa première déclaration — un nœud défini dans un sous-graphe imbriqué se retrouvait aussi
    listé dans le parent dès qu'une arête le référençait après la fermeture du bloc interne
    (`B --> C` après le `end` du sous-graphe de `C`). Corrigé dans `parser.ts` : `end` rattache
    maintenant le sous-graphe fermé à `subgraphIds` du parent, et un `Set` de nœuds déjà
    rattachés empêche le rattachement multiple (sémantique Mermaid : la première mention décide).
  - Fixture sortie de `test-corpus/visual/known-issues/` vers `test-corpus/visual/fixtures/`,
    baseline acceptée après revue visuelle.
- ✅ **Défaut de rendu LibreOffice caractérisé et corrigé (2026-08-07)** : un groupe
      `wpc:wpc`/`wpg:wgp` **ne se rend pas du tout** (absence totale et silencieuse, pas de
      dégradation progressive, pas d'erreur) dès que sa hauteur native dépasse ~7,5-9,4 pouces
      **ET** que son ratio largeur/hauteur natif descend sous ~0,85-0,91. En dehors de cette
      zone — court, OU large par rapport à sa hauteur — ça fonctionne toujours, y compris à des
      tailles bien plus grandes (vérifié jusqu'à 80 pouces de large sans problème, ex.
      `mermaid-official-code-flow.docx` du corpus).
  - **Historique de l'investigation** : partie d'une hypothèse "flux multi-page" (un `wp:inline`
    plus haut qu'une page se paginerait naturellement dans Word, comme une image ou un tableau
    surdimensionné) — invalidée empiriquement via `soffice --headless --convert-to pdf/png`.
    Deux fixtures `test:visual` nouvellement créées (`nested-3-levels.mmd`, `order-flow.mmd` — ce
    dernier à seulement 11 nœuds, dans la fourchette du critère MVP ≤ 15 nœuds) sont tombées dans
    ce défaut par accident pendant l'étoffement du corpus visuel, révélant que ce n'était pas
    (seulement) une question de très gros diagrammes.
  - **Preuve décisive** (~25 rendus contrôlés, contenu identique, seule la largeur variait à
    hauteur native fixe 13,75 pouces) : largeur 10,62" (ratio 0,77) → vide ; largeur 12,5"
    (ratio 0,91) → rendu correct. Confirmé aussi à `scale=1.0` pur (aucune mise à l'échelle) :
    une forme étroite bascule dans le vide entre 7,9" et 9,4" de haut, indépendamment de tout
    facteur d'échelle — donc l'ancien plafond `MAX_DRAWING_CY` (9,0" pile) était déjà quasiment
    sur la falaise. Mécanisme interne exact côté LibreOffice non déterminé (pas d'accès à son
    code source) ; comportement dans Word réel non vérifié.
  - **Correction** (`ooxml-translator.ts`) : nouvelle fonction `nativeExtent()`, appelée par
    `scaledExtent()` (calcul du `wp:extent`/`a:ext` affiché) et `openGroup()` (calcul du
    `a:chExt` natif) — les deux doivent dériver de la même valeur, potentiellement élargie. Si la
    hauteur native dépasse `TALL_RATIO_RISK_HEIGHT` (7,5", marge de sécurité sous le seuil observé
    de 7,9") et que le ratio natif tombe sous `MIN_SAFE_ASPECT_RATIO` (1.0, marge au-dessus du
    seuil observé de 0,91), la largeur native est élargie à `hauteur × 1.0` — une marge de canevas
    invisible ajoutée à droite du contenu, qui ne déplace ni ne redimensionne aucune forme.
    Compromis assumé : le canevas affiche un espace vide à droite pour les diagrammes très hauts
    et étroits plutôt que de risquer un rendu totalement absent ; pas de centrage du contenu dans
    l'espace élargi (aurait demandé de décaler toutes les coordonnées de rendu, portée plus large
    pour un gain cosmétique).
  - Tests : `translator.test.ts` (un diagramme haut-étroit voit son `chExt` élargi à un ratio ≥
    1, le contenu ne bouge pas ; un diagramme sous le seuil de risque n'est jamais élargi même
    s'il est étroit).
  - **Lisibilité des gros diagrammes — reste ouvert, distinct de ce qui précède** : le corpus va
    de 24 à 318 nœuds, alors que le critère d'acceptation MVP porte sur ≤ 15 nœuds. Le correctif
    ci-dessus empêche le rendu de disparaître totalement, mais un diagramme de 318 nœuds ramené à
    la largeur d'une page (le ratio de sécurité peut aussi forcer une mise à l'échelle plus
    agressive que l'ancien plafond hauteur-seule) reste dense et difficile à lire. Pistes non
    tranchées : page de taille custom intercalée via saut de section Word (`w:sectPr`/`w:pgSz` —
    techniquement possible, mais sort du périmètre de `packages/core` et touche potentiellement
    le territoire de Pandoc, règle n°1 ; plafonnée à ~22×22 pouces max Word, un diagramme à 318
    nœuds pourrait quand même la dépasser), refus explicite au-delà d'un seuil de nœuds,
    découpage/pagination du graphe lui-même (le plus gros chantier des trois). À trancher avec le
    mainteneur avant de considérer le corpus à 318 nœuds comme un cas d'usage supporté.

---

## Phase 0 — Spike technique

- [x] **Trancher Dagre vs Graphviz** — package npm `dagre` installé et utilisé comme moteur par
      défaut (pas de réimplémentation maison). Décision documentée dans `docs/adr/0001-layout-engine.md`.
- [x] **Valider la robustesse du `RawBlock('openxml', ...)`** de Pandoc sur un fragment DrawingML
      groupé complexe (`wpg:wgp`) — test bout-en-bout validé (ZIP valide, XML bien formé, 0
      relation externe). Décision documentée dans `docs/adr/0002-pandoc-integration.md`.
- [x] **Installer les dépendances** : `npm install` à la racine (workspaces).

## Phase 1 — MVP CLI + filtre Pandoc

### `packages/core` — le moat

#### Traducteur OOXML/DrawingML (`src/translator/`)
- [x] `ooxml-translator.ts` : pixels → EMU (`x × 9525`), génération des formes `<a:prstGeom>`
      selon la matrice §6.1 (rect, roundRect, stadium, diamond, cylinder, ellipse).
- [x] Connecteurs magnétiques `<a:cxnSp>` ancrés via `<a:stCxn>`/`<a:endCxn>` (comportement
      dynamique Word si l'utilisateur déplace une boîte).
- [x] Encapsulation `<wpg:wgp>` (groupe de dessin) dans `<w:drawing><wp:inline>...` — le
      traducteur émet désormais un paragraphe complet `w:p -> w:r -> w:drawing -> wp:inline ->
      a:graphic -> a:graphicData -> wpg:wgp` (corrige l'erreur Word "a rencontré une erreur lors
      de l'ouverture du fichier" sur les `.docx` générés).
- [x] **Échappement XML strict** (`& < > " '`) de TOUT texte utilisateur (labels nœuds/arêtes,
      titres subgraph) avant insertion dans `<a:t>` — règle non négociable n°2. Les couleurs
      (`classDef fill`, `TranslateOptions`) sont en plus **validées** comme hexadécimal 6 chiffres,
      l'échappement seul laissant passer une valeur arbitraire dans `a:srgbClr/@val`.
- [x] **Aucune relation OOXML externe** (`TargetMode="External"` interdit) — règle n°3.
- [x] Sortie : une chaîne XML unique, autonome, injectable telle quelle.
- [x] `src/index.ts` : barrel d'export public avec TSDoc sur chaque fonction/type exporté.
- [x] 🔮 **Futur-proofing** (voir `FUTURE_docx2mermaid_SPEC.md` §4) — implémenté avec un écart
      assumé par rapport à la spec, tranché avec le mainteneur : `name` reste le label humain sur
      les nœuds (meilleure UX dans le volet Sélection de Word, ce que la spec n'avait pas
      anticipé puisqu'on utilisait déjà `name` ainsi), et l'ID Mermaid d'origine va dans `descr`
      (`cNvPr descr="{id_mermaid}"`), un champ d'accessibilité OOXML déjà standard, invisible
      dans Word. Pour les connecteurs, aucun compromis nécessaire : `name="{id_source}--{id_cible}"`
      comme demandé (le générique `"Connector"` précédent n'avait pas de valeur UX à préserver).

#### Tests (`packages/core/test/`)
- [x] `unit/` : tests unitaires parser + layout + traducteur.
- [x] `golden/` : fixtures XML attendues pour des flowcharts connus, comparaison **structurelle**
      (pas texte brut) pour tolérer les réordonnancements d'attributs.
- [x] `fuzz/` : tests property-based (`fast-check`) sur la frontière d'entrée non fiable —
      **le parseur est la frontière la plus exposée** (entrée possiblement générée par IA).
- [x] Tests d'injection XML sur chaque fonction de `packages/core` qui touche du texte utilisateur
      (labels avec `& < > " '`), pas seulement le chemin nominal.
- [x] Tout parseur XML utilisé (y compris en test) : **DTD et entités externes désactivés** (règle n°5).
- [x] Test golden dédié (adapté à la décision `descr` plutôt que `name`, voir ci-dessus) :
      vérifie que `cNvPr/descr` (nœuds) et `cNvPr/name` (connecteurs) portent l'ID Mermaid
      attendu, plus l'échappement XML de cet ID (`translator.test.ts`).

### `packages/pandoc-filter/`
- [x] Filtre Lua `md2nativedocx.lua` : `CodeBlock` → `pandoc.RawBlock('openxml', ...)`.
- [x] Appel au module core (binaire/subprocess) — **via `execFile`/`spawn` avec tableau d'arguments,
      jamais de concaténation shell** (règle n°4).

### `packages/cli/`
- [x] `npx md2nativedocx rapport.md -o rapport.docx` : empaquette l'invocation Pandoc + filtre.
- [x] Gestion des chemins : résolution/validation contre la racine attendue (anti path traversal).
- [x] Erreurs typées (`ParseError`, `TranslationError`) → codes de sortie et messages utiles.

### Docs & licence
- [x] `LICENSE` : texte légal CC0 1.0 **verbatim** (creativecommons.org/publicdomain/zero/1.0/legalcode).
- [ ] `CODE_OF_CONDUCT.md` : Contributor Covenant (contributor-covenant.org) — **fourni par le
      mainteneur humain, l'agent ne doit pas en rédiger un lui-même.**
- [x] `README.md` complet : tableau de positionnement §12.1 en haut, GIF démo (après Phase 2),
      usage CLI, licence CC0.
- [x] `CONTRIBUTING.md` : mapping §6 comme point d'entrée des contributions externes.

## Phase 2 — Extension VS Code voir aussi UX_SPEC.md

- [x] **`packages/vscode-extension/` scaffoldé et fonctionnel (2026-08-07)**, Partie 1 d'UX_SPEC.md
      au complet : détection automatique des blocs ```` ```mermaid ```` (`src/mermaidBlocks.ts`,
      pur — pas d'API vscode, testable en `node:test` sans Extension Development Host), CodeLens
      "⚙️ Exporter en Word" + "Exporter le bloc seul" au-dessus de chaque bloc
      (`src/codeLensProvider.ts`), pastille de barre de statut redondante avec le CodeLens
      (`src/statusBar.ts`), Palette de Commandes en filet de sécurité, walkthrough d'accueil
      (`contributes.walkthroughs`, 3 étapes), icône `icon.svg` (losange + poignées, rationale dans
      UX_SPEC.md). Les 4 états de l'export (repos/en cours/succès/erreur) implémentés dans
      `src/extension.ts` : `vscode.window.withProgress` (jamais de gel silencieux), toast succès
      avec "Ouvrir dans Word"/"Révéler dans l'explorateur", toast erreur avec action de réparation
      contextuelle — jamais de stack trace brute (va dans l'Output Channel).
  - **Aucune logique dupliquée** : l'extension ne fait qu'invoquer `@md2nativedocx/cli` (résolu via
    `require.resolve('@md2nativedocx/cli/package.json')`, dépendance de workspace interne, pas une
    nouvelle dépendance externe) — le bloc-seul enveloppe le diagramme dans le même format minimal
    que `scripts/generate-corpus.mjs` (`wrapBlockAsDocument`), donc aucun chemin de conversion que
    les tests du corpus ne couvrent déjà.
  - Erreur "Pandoc introuvable" détectée en grattant `ENOENT` dans le stderr du CLI (le message que
    `packages/cli/bin/md2nativedocx.mjs` écrit déjà) plutôt que de dupliquer la détection dans le
    binaire CLI — testé manuellement en retirant `/usr/bin` du `PATH` du process avant d'appeler
    `exportDocument()` directement sur le module compilé.
  - Réglage exposé volontairement réduit à un seul (`md2nativedocx.outputDirectory`, vide par
    défaut = même dossier que la source, "zéro config avant le premier usage") : les deux autres
    réglages mentionnés dans `cahier_des_charges.md`/`UX_SPEC.md` (choix Dagre/Graphviz,
    `reference.docx` personnalisé) n'existent pas encore côté CLI — les exposer aurait été un
    réglage sans effet, pas une vraie option.
  - **Nouvelles dépendances (escaladées et approuvées par l'utilisateur avant ajout, voir
    AGENTS.md → "Escalate to a human")** : `@types/vscode` (types seuls), `@vscode/test-cli` +
    `@vscode/test-electron` (tests réels en Extension Development Host), `@vscode/vsce`
    (packaging `.vsix`, script `npm run package`). `@md2nativedocx/cli` est une dépendance de
    workspace interne, pas externe.
  - `npm audit --audit-level=high` (gate CI) cassé par une vulnérabilité transitive haute
    (`serialize-javascript` via `mocha` via `@vscode/test-cli`) introduite par ces nouvelles
    dépendances — corrigé par un `overrides` racine (`serialize-javascript` forcé à `^7.0.7`,
    au-delà du `^6.0.2` que `mocha` demande) plutôt qu'un downgrade de `@vscode/test-cli`. Repasse
    à 0 high/critical (3 low restants, sous le seuil du gate).
  - Tests : 14 tests unitaires purs (`test/unit/`, parseur de blocs + résolution de sortie/curseur)
    + 2 tests en véritable Extension Development Host (`test/suite/extension.test.ts`, activation +
    enregistrement des commandes + CodeLens réel via `vscode.executeCodeLensProvider`) — ces
    derniers nécessitent un display, absent par défaut dans ce Codespace : **Xvfb installé ad hoc
    dans la session (2026-08-07)**, comme LibreOffice l'a été précédemment (voir plus bas dans ce
    fichier), pas dans `.devcontainer/` (revue humaine requise). `scripts/run-extension-host-tests.mjs`
    saute proprement (exit 0) si aucun display et `xvfb-run` absent, même convention que
    `scripts/test-visual.mjs` pour LibreOffice.
- [ ] **Suivi — pinning Xvfb** : même question que LibreOffice ci-dessous (§ CI/CD), pas encore
      tranchée : ajouter Xvfb à `.devcontainer/setup.sh` (revue humaine requise) et au job CI qui
      exécuterait `test:extension-host`, ou laisser ce chapitre de test manuel/opt-in comme
      `test:visual` l'est pour LibreOffice.
- [ ] **Packaging Marketplace réel + README avec démo animée** — `npm run package` (`vsce package`)
      est câblé mais jamais exécuté ; la Marketplace exige un `icon` PNG 128×128 dans `package.json`,
      alors que `icon.svg` (design source, rationale dans UX_SPEC.md) n'a pas encore été rastérisé
      faute d'outil de rendu SVG disponible dans ce Codespace (`rsvg-convert`/`imagemagick`/`sharp`
      absents) — pas bloquant pour le développement/test local (Extension Development Host), mais
      bloquant pour une publication réelle. Éditeur Marketplace (`publisher: "md2nativedocx"` dans
      `package.json`) à créer/vérifier avant tout `vsce publish`.
- [ ] **Aperçu (Phase 2.5, UX_SPEC.md)** — pas commencé, prérequis explicitement posé comme
      postérieur au cœur ci-dessus. Rappel de la limite qui ne doit pas être assouplie sans
      décision humaine explicite : lecture seule stricte, aucune interaction d'édition.
- [ ] **Tests manuels dans un vrai VS Code** (pas seulement l'Extension Development Host
      automatisé) — non faits. En particulier : le rendu réel du CodeLens/pastille/walkthrough à
      l'œil, et `vscode.env.openExternal`/`revealFileInOS` depuis un Codespace (censé transiter par
      la machine locale de l'utilisateur via le forwarding VS Code — jamais vérifié en pratique).

## Phase 3 — Couleurs + sous-graphes

- [x] Mapping `classDef fill:#XXXXXX` → `<a:solidFill><a:srgbClr val="XXXXXX"/></a:solidFill>` (§6.3) —
      déjà livré en Phase 1, case cochée tardivement ici (bookkeeping, aucun code changé).
- [x] `subgraph` → groupes imbriqués `<wpg:grpSp>` avec libellé en `<wps:txbx>` (§6.1), y compris
      l'imbrication à plusieurs niveaux (`subgraphIds` correctement peuplé, réservation d'espace
      de titre récursive — voir entrées 2026-08-07 ci-dessus) — case cochée tardivement ici.

## Phase 4 — Add-in Word (Office.js)

- [ ] Taskpane avec zone de collage Mermaid.
- [ ] Appel au même module core (bundlé navigateur) — raison du choix TypeScript.
- [ ] Insertion via `context.document.body.insertOoxml(xmlString, Word.InsertLocation.replace)`.

## Phase 5+ — Autres types de diagrammes

- [ ] Diagrammes de séquence (priorité, demande la plus fréquente après flowchart).

---

## CI/CD & environnement

- [x] `.github/workflows/ci.yml` : typecheck + lint + test (unit/golden) + `npm audit`
      (fail high/critical) + secret scan + CodeQL. `test:visual` sur schedule/release branches
      (flag explicite du trade-off).
- [x] `.github/workflows/codeql.yml` : SAST GitHub natif.
- [x] `.devcontainer/devcontainer.json` : provisioning Pandoc/Lua/LibreOffice, synchronisés
      avec `ci.yml`. Pandoc 3.1.3 et Lua 5.4 sont **version-pinnés** ; LibreOffice est installé
      depuis le repo apt (limitation documentée dans `setup.sh` — voir tâche de suivi ci-dessous).
      ⚠️ Toute modif de `.devcontainer/`/`.vscode/` = revue humaine obligatoire (voir
      AGENTS.md → Codespaces). PR séparée, **non mergée**.
- [ ] **Tâche de suivi — pinning LibreOffice** : décider si on épingle la version de LibreOffice
      dans `setup.sh` (via un repo/pinning apt dédié) ou si on garde la version du repo apt.
      Actuellement non pinné (limitation documentée dans `setup.sh`). À trancher avant de
      fiabiliser `test:visual` en CI. **Recommandation (2026-08-07, pas d'exécution — modifier
      `.devcontainer/setup.sh` est en zone d'escalade obligatoire, voir `AGENTS.md`)** : garder
      la version du repo apt pour l'instant plutôt qu'un pinning dédié, MAIS avec une réserve
      importante à vérifier avant de trancher définitivement — l'environnement où `test:visual` a
      été développé cette session tourne en réalité sous **Ubuntu 24.04** (LibreOffice 24.2.7.2
      installé), alors que `.devcontainer/devcontainer.json` déclare une image **Debian bookworm**
      (`typescript-node:1-22-bookworm`) et que le job CI `visual` tourne sur `ubuntu-latest`. Si
      le Codespace réellement construit depuis `devcontainer.json` résout une version LibreOffice
      différente de celle d'Ubuntu (dépôts apt Debian vs Ubuntu, pas garantis alignés), les
      baselines `test-corpus/visual/baseline/*.png` générées dans un environnement pourraient ne
      pas correspondre pixel-pour-pixel à un rendu dans l'autre — le seuil de tolérance actuel
      (1 %, `scripts/test-visual.mjs`) absorbe le bruit d'anti-aliasing mais pas forcément un
      changement de version de moteur de rendu. À vérifier empiriquement (comparer la version
      LibreOffice résolue dans un vrai Codespace lancé depuis `devcontainer.json` face à celle de
      `ubuntu-latest` en CI) avant de considérer `test:visual` fiable d'un environnement à l'autre.
- [ ] `test:visual` : rendu LibreOffice headless → export image → pixel-diff avec seuil, corpus
      20–30 diagrammes (du 3-nœuds au 50-nœuds avec sous-graphes).

---

## Critère d'acceptation MVP (spec §9)

- [ ] Flowchart ≤ 15 nœuds : 0 croisement de flèches nécessitant un réarrangement manuel dans
      >90 % des cas testés.
- [ ] Tests manuels dans Word réel avant chaque release : chaque forme individuellement
      sélectionnable, texte sans débordement, connecteurs attachés après déplacement d'une boîte.

---

## Règles non négociables (rappel — voir AGENTS.md)

1. Rester dans le scope : tout ce qui n'est pas diagramme → OOXML est délégué à Pandoc.
2. Échapper `& < > " '` dans tout texte utilisateur avant insertion XML.
3. Jamais de relation OOXML externe (`TargetMode="External"`).
4. Jamais de commande subprocess construite par concaténation de chaîne.
5. DTD + entités externes désactivés sur tout parseur XML (tests inclus).
6. Pas de dépendance sans justification d'une ligne dans la PR.
7. Ne pas toucher aux internals ZIP du `.docx` (c'est le job de Pandoc).

## Escalader à un humain

- Changement de l'API publique de `packages/core` (contrat de sortie du traducteur).
- Nouvelle dépendance.
- Exception à la règle "pas de relation OOXML externe".
- Assouplissement d'une règle de lint sécurité ou d'une ligne du tableau de sécurité.
- Modification de `.devcontainer/` ou `.vscode/`.
- Questions de licence.