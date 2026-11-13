# Archive — historique détaillé de `TODO.md`

> Ce fichier contient le détail complet (root-cause, preuves empiriques, décisions de conception,
> captures d'écran référencées) des chantiers **fermés** de `TODO.md`, déplacé ici le 2026-09-04
> pour garder `TODO.md` utilisable comme plan de travail plutôt que comme journal. Rien n'a été
> perdu : chaque item fermé listé en une ligne dans `TODO.md` a son détail complet ici, dans la
> même section, au même endroit chronologique. Les items encore ouverts au moment du déplacement
> sont restés dans `TODO.md`, pas ici.
>
> À lire comme un journal, pas comme une spec — pour l'état du produit et les décisions
> d'architecture qui font autorité, voir `docs/specs/cahier_des_charges.md`, `AGENTS.md` et les
> ADR (`docs/adr/`).

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
- ✅ **Auto-boucle (`A --> A`) — audit terminé, vrai bug de rendu trouvé et corrigé, deux bugs en
      réalité (2026-09-04, punch list OOXML item 5 — dernier item de la liste)** : signalé plus tôt
      cette session comme "jamais audité, pas de verdict" (`docs/markdown-mermaid-compliance-table.md`
      §5.7). Vérification par rendu LibreOffice réel : une auto-boucle se dessinait comme une **ligne
      droite traversant l'intérieur du nœud**, flèche comprise dans le remplissage — pas une boucle
      du tout.
      - **Bug 1 — `chooseSides()` dégénère pour deux boîtes identiques** : cette fonction choisit un
        côté de connexion à partir de la position relative de deux boîtes ; pour une auto-boucle,
        `from`/`to` sont la même boîte, donc `dx=dy=0`, ce qui résout toujours en "haut → bas" — une
        ligne verticale plein milieu du nœud. Dagre calcule pourtant déjà une vraie boucle qui
        déborde du nœud (vérifié empiriquement en TD/LR/BT/RL — la boucle change de côté selon la
        direction, mais déborde toujours dans le même sens, jamais dans le sens négatif observé).
        Corrigé : `connectorGeometry()` (`ooxml-translator.ts`) détecte l'auto-boucle (`from === to`,
        une comparaison de référence fiable ici — les deux viennent du même `layout.nodes[id]`,
        jamais clonées) et utilise le tracé de Dagre tel quel, avec un nouveau `nearestSite()` pour
        déterminer `stCxn`/`endCxn` par distance perpendiculaire aux 4 côtés plutôt que par la
        logique pensée pour deux boîtes différentes.
      - **Bug 2, trouvé en corrigeant le premier — LibreOffice réécrit le tracé d'un connecteur
        auto-référent** : une fois la géométrie corrigée (vraie boucle multi-points), toujours
        invisible. Cause : une forme `wps:cNvCnPr` (connecteur) dont `stCxn`/`endCxn` visent la
        **même** forme voit son `a:custGeom`/`a:xfrm` purement et simplement ignoré et remplacé par
        un tracé recalculé par le moteur de rendu — un point unique (invisible, longueur nulle) si
        les deux index sont identiques, une forme sans rapport avec la géométrie fournie si les
        index diffèrent (testé les deux cas). Un `wps:cNvSpPr` (forme simple, pas connecteur) avec le
        même `a:custGeom` s'affiche correctement — vérifié en TD, LR, et avec un libellé d'arête.
        Renoncement délibéré et documenté : l'auto-boucle ne bénéficie plus de l'attachement
        magnétique (`stCxn`/`endCxn`) et ne suivra donc pas son nœud si celui-ci est déplacé dans
        Word — largement préférable à une boucle invisible ou visuellement fausse.
      - **Effet de bord trouvé au passage** : `computeBoundingBox()` (`ooxml-translator.ts`) et
        `boundsOrigin()` (`layout.ts`) ne considéraient jamais les tracés d'arête, seulement les
        boîtes de nœud/sous-graphe — inoffensif pour une arête normale (toujours contenue dans
        l'union des boîtes de ses deux extrémités) mais une auto-boucle déborde **par construction**
        de la boîte de son unique nœud, donc `wp:extent`/le canevas déclaré était trop petit et la
        boucle tronquée même une fois sa géométrie corrigée. Les deux fonctions incluent désormais
        aussi les points de chaque route d'arête — même précédent que le correctif "sous-graphe à
        origine négative" déjà documenté plus bas dans ce fichier pour `boundsOrigin()`, appliqué ici
        à une deuxième source de débordement.
      8 nouveaux tests unitaires (6 `translator.test.ts` + 2 `layout.test.ts`) + 1 nouvelle fixture
      visuelle (`self-loop.mmd`, 0,000% de diff). Suite complète verte (227 core / 31 cli / 11
      pandoc-filter / 25 vscode-extension) ; `node scripts/test-visual.mjs` toujours les mêmes 11
      échecs pré-existants, aucun nouveau. Confirmé corriger un **vrai bug déjà présent** dans le
      corpus officiel Mermaid (`large2.mmd` contient une auto-boucle) — diff `document.xml` avant/
      après : la forme 44 passe de `wps:cNvCnPr`/ligne droite `cx="0"` à `wps:cNvSpPr`/`custGeom`
      multi-points, tout le reste du document strictement identique.
- ✅ **Direction de sous-graphe — plus une limite de parseur silencieuse, mais toujours une
      limite de Dagre, désormais explicite (2026-09-04, punch list OOXML item 4)** : `direction
      RL` à l'intérieur d'un `subgraph...end` tombait jusqu'ici dans le message générique
      `"Unsupported line ignored: direction RL"`, sans jamais atteindre l'AST. Ajouté
      `types.ts`'s `Subgraph.direction?` ; `parser.ts` reconnaît maintenant la ligne (même
      normalisation `TB`→`TD` que l'en-tête du flowchart), la mémorise sur le sous-graphe courant
      (`subgraphStack`), et émet un avertissement spécifique et actionnable au lieu du générique.
      **Recherché mais délibérément pas implémenté** : appliquer réellement cette direction au
      layout. Root-cause architecturale, pas un oubli — Dagre (bibliothèque non maintenue en
      amont que ce projet enveloppe, `layout.ts`) met en page tout un graphe, clusters compound
      compris, sous un **seul** `rankdir` global ; aucune API Dagre ne permet à un cluster de
      ranker ses propres membres dans une direction différente de celle du graphe parent. Un vrai
      support demanderait une passe de layout récursive indépendante par sous-graphe à direction
      propre (le mettre en page seul, puis placer le résultat comme un bloc de taille fixe dans la
      passe du parent, avec le routage des arêtes traversant la frontière comme problème ouvert
      supplémentaire) — un chantier d'architecture à part entière, pas une option à activer, jugé
      disproportionné pour cette session au vu du risque (le pipeline de clusters Dagre a déjà un
      contournement de bug documenté plus bas) par rapport au bénéfice (mêmes garde-fous déjà en
      place pour `BT`/`RL` avant leur implémentation complète — précédent direct dans ce même
      fichier). `docs/markdown-mermaid-compliance-table.md` §5.1/§5.7 mis à jour : la case passe de
      🔧 (limite de parseur, silencieuse) à 🟡 Partial (limite de traducteur/Dagre, documentée et
      avertie). 5 nouveaux tests unitaires (`parser.test.ts`) — parsing simple, alias `TB`→`TD`,
      absence de `direction` (reste `undefined`), sous-graphes imbriqués avec directions
      indépendantes chacune, et non-régression du cas `direction` hors `subgraph` (toujours le
      générique). Suite complète verte (221 core / 31 cli / 11 pandoc-filter / 25
      vscode-extension) ; `node scripts/test-visual.mjs` toujours 11/31 échecs (les mêmes
      pré-existants) — aucun changement de géométrie, seul le parseur et l'AST sont concernés,
      confirmé par diff `document.xml` byte-à-byte sur les 2 fixtures du corpus officiel qui
      utilisent `direction` (`large2.mmd`, `medium3.mmd`).
- ✅ **Rich-text runs — `<br/>`/gras/italique côté OOXML seul (2026-09-04, punch list OOXML item
      3)** : `<br/>` et les "Markdown strings" (`` id["`**gras**`"] ``) s'aplatissaient jusqu'ici en
      texte plein (`normalizeLabelText()`) — pas de vrai retour à la ligne, pas de run gras/italique
      réel, uniquement une approximation propre en texte brut (`docs/markdown-mermaid-compliance-table.md`
      §5.3, marquées 🔧 — limite de parseur commune aux 3 colonnes). Root-cause : aucune structure
      ne portait l'info de mise en forme au-delà du texte aplati. Ajouté `types.ts`'s `LabelToken`
      (séquence de runs stylés + retours forcés) ; `parser.ts`'s `parseLabel()` (remplace
      `normalizeLabelText()`) produit désormais **les deux** — le texte aplati `label` (inchangé,
      toujours utilisé par `chain.ts`/`tree.ts`/le nom accessible de forme/`layout.ts`) **et**
      `labelRuns` (nouveau, structuré). `ooxml-translator.ts` rend `labelRuns` en vrais `w:r`/`w:br`
      (`renderLabelRuns()`, partagé nœud+libellé d'arête) ; `layout.ts`'s `nodeDimensions()` (via le
      nouveau `label-runs.ts`'s `labelLines()`) réserve la hauteur pour chaque ligne forcée au lieu
      de sous-dimensionner la boîte. Scope délibéré : seul le traducteur OOXML (`wpg:wgp`) en
      bénéficie ; `chain.ts`/`tree.ts` (SmartArt) restent sur le texte aplati, inchangés (voir
      compliance table, colonnes SmartArt/Hybride toujours 🟡 Partial). L'émphase n'est interprétée
      qu'à l'intérieur d'une Markdown string entière (convention Mermaid) — un `**` littéral dans un
      label classique reste littéral, vérifié par test et par rendu. Conception zéro-régression :
      `FlowNode.label`/`FlowEdge.label` gardent exactement leur valeur/type d'avant (nouveau champ
      `labelRuns` en plus, jamais un remplacement) — aucun test existant modifié. Nouveaux tests
      (parser/layout/translator, ~10) + 1 nouvelle fixture visuelle (`rich-text.mmd`, 0,000% de
      diff) ; `node scripts/test-visual.mjs` toujours 11/31 échecs (les mêmes pré-existants, aucun
      nouveau). Effet de bord réel et positif : plusieurs fixtures du corpus officiel Mermaid
      (`large1`/`large2`/`medium2`/`medium3`/`medium5`/`mermaid-official-code-flow`/
      `large-report`/`medium-report`) utilisent déjà `<br>` dans leurs labels — leurs `.docx`
      regénérés ont maintenant une vraie deuxième ligne et une boîte correctement agrandie au lieu
      du texte aplati sous-dimensionné d'avant ; diff vérifié ligne par ligne (uniquement des
      changements de géométrie de boîte, rien d'autre). Vérifié par rendu LibreOffice réel (pas
      seulement les tests unitaires) : deux lignes visibles, gras/italique visibles, `**markup**`
      littéral hors Markdown string confirmé inchangé.
- ✅ **Bug de chevauchement de têtes de flèche à l'échelle — corrigé (2026-09-04, punch list OOXML
      item 2)** : root-cause du bug découvert plus bas ("Corpus visuel", même date) — un marqueur
      de tête de flèche a une taille physique proportionnelle à `a:ln w` (`scaledLineWidth`), mais
      cette largeur de trait est plafonnée à `MIN_LINE_WIDTH_EMU` alors que **toute** autre
      coordonnée (dont l'écart entre deux nœuds adjacents) continue de rétrécir avec le facteur
      d'échelle non plafonné (`renderContent`). Une fois le plafond de largeur atteint, le marqueur
      arrête de rétrécir alors que l'écart continue — sur une chaîne assez longue, les deux têtes
      d'une arête bidirectionnelle finissent par se recouvrir entièrement en un seul losange, sans
      trait visible entre les deux. Reproduit à l'identique (chaîne 14 nœuds `flowchart LR`, rendu
      LibreOffice réel à 600 DPI) puis corrigé par `arrowMarkerSize()` (`ooxml-translator.ts`) :
      bascule `w`/`len` de `"med"` à `"sm"` uniquement quand la largeur de trait de cette arête
      précise a effectivement été plafonnée (`baseWidthEmu * scale < MIN_LINE_WIDTH_EMU`) —
      chaque diagramme non mis à l'échelle (l'immense majorité) garde `"med"` à l'identique, aucune
      régression possible là où le plafond n'est jamais atteint. 2 nouveaux tests unitaires
      (`translator.test.ts`) ; `node scripts/test-visual.mjs` toujours 11/30 échecs (les mêmes
      pré-existants, aucun nouveau, aucune des 30 fixtures n'atteint ce régime de compression).
      Vérifié visuellement avant/après (capture LibreOffice 600 DPI) sur la reproduction exacte du
      bug signalé plus bas.
- ✅ **Corpus visuel (`test-corpus/visual/fixtures/`) mis à jour pour couvrir les 3 chantiers du jour
      — et un bug de rendu jusque-là invisible découvert et contourné au passage (2026-09-04)** :
      les fixtures de démo/régression visuelle n'avaient pas suivi les 3 chantiers du jour (label
      mi-chaîne, `@{shape: ...}`, `style`/`linkStyle`) ni les extensions de formes/arêtes des
      sessions précédentes (hexagone, parallélogramme, trapèze, sous-routine, double cercle,
      arêtes multidirectionnelles/invisible) — aucune n'était exercée par le corpus visuel avant ce
      passage, seulement couvertes par les tests unitaires.
      - `shapes.mmd` étendu (12 formes au lieu de 6 : + hexagone, parallélogramme ×2, trapèze ×2,
        sous-routine, double cercle) ; `edge-labels.mmd` étendu (+ label mi-chaîne, syntaxe simple
        et pointillée) ; `colors.mmd` étendu (+ `stroke` sur `classDef`, `classDef` multi-propriété
        et multi-classe, `style` direct, `linkStyle` par indice avec couleur+épaisseur).
      - 3 nouvelles fixtures : `edge-chaining.mmd` (chaînage sur une ligne + fan-out/fan-in `&`),
        `shapes-generic.mmd` (les 18 formes `@{shape: ...}` à preset OOXML dédié), `edge-types-extended.mmd`
        (les 8 types d'arête étendus : `-.-`/`===`/`<-->`/`--o`/`--x`/`o--o`/`x--x`/`~~~`).
      - **Bug découvert en construisant `edge-types-extended.mmd` — corrigé le même jour, voir
        l'entrée "Bug de chevauchement de têtes de flèche à l'échelle" plus haut** : en essayant d'abord de mettre
        les 8 types étendus à la suite des 6 déjà dans `edge-types.mmd` (14 nœuds, `flowchart LR`,
        une seule longue chaîne), l'arête `<-->` (bidirectionnelle) s'est rendue comme un **unique
        losange plein** au lieu de deux têtes de flèche triangulaires distinctes — reproduit de façon
        stable (capture LibreOffice réelle à 400/600 DPI), mais **pas reproductible** sur un
        sous-ensemble de 4 nœuds de la même chaîne, ni sur un test isolé à 2 nœuds (rendu correct
        dans les deux cas). Hypothèse retenue (cohérente avec ce qui reproduit/pas) : le facteur
        d'échelle globale (`scaledExtent()`, `ooxml-translator.ts` — mise à l'échelle automatique
        d'un diagramme trop large pour la page) réduit l'écart entre nœuds proportionnellement,
        mais l'épaisseur de trait a un plancher (`MIN_LINE_WIDTH_EMU`) qui, lui, ne réduit plus en
        dessous d'un certain point — sur une chaîne de 14 nœuds en largeur, les deux têtes de flèche
        d'une arête bidirectionnelle finissent par se chevaucher visuellement une fois l'écart
        suffisamment comprimé. **Non corrigé** (hors scope de cette mise à jour du corpus, nécessite
        d'investiguer `scaledExtent()`/`scaledLineWidth()` proprement) — juste contourné en gardant
        `edge-types-extended.mmd` compact (`flowchart TD`, chaîne séparée de `edge-types.mmd`), ce
        qui évite le déclenchement de la mise à l'échelle. À investiguer : le même chevauchement
        pourrait affecter `circleBoth`/`crossBoth` (têtes doubles) sur n'importe quel diagramme
        assez large pour être mis à l'échelle, pas seulement mes fixtures de test.
      - **Constat séparé, empirique, confirmant un risque déjà tracké plus bas** ("Tâche de suivi —
        pinning LibreOffice") : avant toute modification, `node scripts/test-visual.mjs` sur les 24
        fixtures existantes de cette session donnait déjà **13 échecs** (`decision`, `cycle`,
        `mixed`, etc., 2 à 9 % de pixels différents) contre leurs baselines *déjà commitées* — pas
        une régression de ce chantier. Inspection visuelle de `decision` : même géométrie/mise en
        page, mais une **police visiblement différente** entre le rendu actuel et la baseline (plus
        épaisse/serif dans la baseline) — signe d'un rendu LibreOffice fait dans un environnement/
        une version différente de celui-ci, exactement le risque que la tâche de suivi ci-dessous
        anticipait sans preuve empirique jusqu'ici. Non résolu, hors scope ; les baselines des 6
        fixtures touchées par ce chantier ont été régénérées et vérifiées visuellement une par une
        (jamais acceptées à l'aveugle) ; les 18 autres baselines n'ont pas été touchées.
      - **`test-corpus/corpus/source/` délibérément non touché** — ce corpus-là est sourcé du dépôt
        Mermaid officiel (voir son propre commentaire d'en-tête), pas destiné à être complété avec
        des exemples maison ; la couverture des nouvelles syntaxes est le rôle de
        `test-corpus/visual/fixtures/`, pas de ce corpus-ci.
      - Vérifié : chaque fixture nouvelle/modifiée rendue et inspectée visuellement (export CLI réel
        + LibreOffice, certaines à 400-600 DPI pour vérifier les marqueurs de tête de flèche) avant
        d'accepter sa baseline ; `node scripts/test-visual.mjs` confirme les 6 fixtures touchées à
        0,000 % de différence (déterministe, aucun bruit de rendu) et aucune régression sur les 18
        fixtures non touchées (mêmes 11 échecs préexistants avant/après, à 2 près — `shapes`/`colors`
        étaient déjà comptés dans les 13 échecs initiaux car leur ancien contenu ne correspondait
        déjà plus à d'anciennes baselines pour une raison antérieure à cette session).
- ✅ **`style`/`linkStyle`, ajoutés — et 3 lacunes `classDef` corrigées au passage (2026-09-04)** :
      dernier item de la liste "reste" avant le `dsp:drawing` SmartArt. `style`/`linkStyle` n'étaient
      pas reconnus du tout (`docs/markdown-mermaid-compliance-table.md` §5.3 les listait "None" depuis le
      début de ce chantier de durcissement) ; `classDef` avait 2 lacunes documentées dans la même
      section (propriété `fill:` devant être la première, une seule classe par définition).
      - `parser.ts` : `parseCssStyleProps()` (parseur générique `prop:valeur,prop:valeur`, ordre
        indifférent) + `parseHexColor()` (hex 6 chiffres, raccourci 3 chiffres étendu automatiquement,
        une couleur nommée CSS ou une fonction `rgb(...)` est abandonnée proprement, pas la ligne
        entière) + `applyNodeStyle()` (fusionne un patch `{fill?, stroke?}` sur un nœud déjà déclaré,
        ou le mémorise dans `pendingStyles` sinon — généralise l'ancien mécanisme `pendingFills`
        propre à `classDef`/`:::`, réutilisé tel quel par `style`).
      - `classDef Nom1,Nom2 prop:val,...` remplace l'ancienne regex figée (qui exigeait `fill:`
        immédiatement après le nom de classe, pas d'autre propriété, un seul nom) — corrige les 2
        lacunes documentées comme effet de bord du partage du même parseur de propriétés.
      - `style A prop:val,...` : nouveau statement, stylise un nœud directement sans indirection
        `classDef`, différé comme `class` si le nœud n'est pas encore déclaré.
      - `linkStyle N prop:val,...` : nouveau statement, stylise l'arête d'indice `N` (ordre de
        déclaration), ou `linkStyle default ...` pour toutes les arêtes, ou une liste d'indices
        `linkStyle 0,2,4 ...`. Résolu en différé après la passe complète du document (les indices
        peuvent référencer des arêtes déclarées plus loin — `linkStyle` en fin de fichier est la
        convention Mermaid courante) ; un indice hors limites est ignoré silencieusement (V1
        tolerance, spec §10), pas une ligne perdue.
      - `types.ts` : `FlowNode.stroke` (bordure) et `FlowEdge.stroke`/`FlowEdge.strokeWidth` (px,
        même convention que toute autre valeur de taille dans l'AST) nouveaux champs.
        `ooxml-translator.ts` : `nodeLine = hexColor(node.stroke, line)` (même schéma que `nodeFill`
        déjà existant) ; `renderEdge()` prend un `strokeWidthPx` optionnel, converti en EMU
        (`px * EMU_PER_PX`) puis passé à `scaledLineWidth()` comme le fait déjà le poids de trait par
        défaut de chaque `EdgeType`.
      - **Limite connue, documentée** : `node.stroke` n'est pas propagé côté SmartArt pur
        (`chain.ts`/`tree.ts` ne lisent que `node.fill`, jamais `.stroke` — `spPrFor()`) ;
        `linkStyle` n'a de toute façon aucun équivalent possible tant que ces générateurs ne
        dessinent aucun connecteur (même impasse que pour les types d'arête, §5.4). Aucune régression
        : le pipeline OOXML pur (fallback automatique, et fallback hybride) a toujours le rendu
        complet.
      - Vérifié : 10 nouveaux tests unitaires (propriétés multiples/non ordonnées, multi-classe,
        `style` direct différé ou non, raccourci hex 3 chiffres, `linkStyle` par indice/`default`/
        liste, indice hors limites, couleur nommée abandonnée) — suite parser 47/47, fuzz 3/3, suite
        complète du monorepo 174/177 (mêmes 3 échecs SmartArt préexistants, sans lien). 3 tests
        existants ailleurs (`cli.test.mjs`, `smartart-dispatch.test.mjs`,
        `exportService.test.ts`) utilisaient `style X fill:#fff` comme exemple de construction
        *non supportée* pour vérifier la remontée d'avertissements (spec §10) — cassés par ce
        chantier puisque `style` est maintenant supporté ; remplacés par `click A "url"` (une
        directive toujours non reconnue), suite complète repassée au vert. Export CLI réel + rendu
        LibreOffice réel : nœud avec `style` direct (remplissage jaune + bordure rouge), nœud stylé
        via `classDef`/`class` (bleu clair + bordure marine), arête stylée par `linkStyle default`
        (verte) et par indice avec épaisseur (rouge, trait épais) — les 4 rendus simultanément sur un
        seul diagramme, tous corrects.
      - `docs/specs/cahier_des_charges.md` §6.2/§6.3 et `docs/markdown-mermaid-compliance-table.md` §5.3 mis
        à jour (les 2 sous-cas `classDef`, `style`, `linkStyle` passent de "None" à leur statut réel).
- ✅ **Syntaxe générique de forme `id@{ shape: nom, label: "..." }` (v11.3+), ajoutée (2026-09-04)** :
      dernier "gros morceau" restant de la liste "reste" ci-dessous après le label mi-chaîne. Avant
      ce chantier, `A@{ shape: ... }` faisait échouer la ligne entière (`@` non géré, ni par
      `SHAPE_BY_SYNTAX` ni ailleurs) — nœud et toute arête le référençant perdus, même classe de bug
      que les deux précédents (label multi-ligne, arêtes exotiques).
      - Vérifié la liste exacte des noms/alias officiels avant d'écrire quoi que ce soit (table
        "Semantic Name"/"Shape Name Aliases" de la doc Mermaid, ~50 alias pour ~30 formes sémantiques)
        plutôt que de deviner — un alias mal orthographié aurait dégradé silencieusement vers `rect`
        sans jamais être détecté par les tests.
      - `parser.ts` : `SHAPE_ALIAS_MAP` (alias en minuscule -> `NodeShape`), `parseAtShapeProps()`
        (mini-scanner clé:valeur tolérant aux guillemets, gère `label: "Hello, World"` sans fragmenter
        sur la virgule interne), `parseAtShapeSyntax()` — branché dans `parseNodeStatement` (déclaration
        isolée) et `parseNodeRef` (extrémité d'arête, compatible avec `:::classe` existant). Un alias
        reconnu mais sans forme dédiée, ou un nom totalement inconnu (faute de frappe comprise),
        dégrade vers `rect` plutôt que de faire échouer la ligne — cohérent avec le principe spec §10.
      - `types.ts`/`ooxml-translator.ts` : 18 nouvelles variantes `NodeShape`, chacune mappée à un
        `prstGeom` dédié — 15 réutilisent la famille de presets `flowChart*` (galerie de formes
        organigramme native Word/PowerPoint, donc des correspondances exactes plutôt que des
        approximations : `flowChartDocument`, `flowChartPunchedCard`, `flowChartDelay`,
        `flowChartExtract` ×2 (triangle + `flipV` pour l'inversée, même mécanisme que
        `parallelogramAlt`/`trapezoidAlt`), `flowChartInternalStorage`, `flowChartCollate`,
        `flowChartDisplay`, `flowChartOr`, `flowChartSummingJunction`, `flowChartPunchedTape`,
        `flowChartMagneticDisk`, `flowChartMagneticDrum`, `flowChartManualInput` — plus 3 formes de
        base hors famille organigramme (`lightningBolt`, `leftBrace`/`rightBrace`/`bracePair`). Les
        ~30 autres alias retombent sur une forme déjà supportée par la syntaxe bracket (`rounded`→
        `roundRect`, `decision`→`diamond`, `cyl`/`database`→`cylinder`, etc.), sans changement côté
        traducteur. 16 formes du catalogue Mermaid sans equivalent `prstGeom` fidèle sans forme
        composée/vectorielle custom (`bang`, `browser`, `bucket`, `cloud`, `console`, `data-store`,
        `divided-process`, `folder`, `fork`/`join`, `lined-document`, `lined-process`, `loop-limit`,
        `multi-document`, `multi-process`, `person`, `tagged-document`, `tagged-process`) sont
        délibérément non couvertes — dégradent vers `rect` (voir ci-dessus), pas une lacune oubliée.
      - Vérifié : 6 nouveaux tests unitaires (déclaration isolée, extrémité d'arête, label par défaut
        = id, alias vers forme existante, label guillemeté avec virgule interne non fragmenté, nom
        inconnu → `rect` sans avertissement ni perte) — suite parser 37/37, fuzz 3/3, suite complète
        du monorepo 164/167 (mêmes 3 échecs SmartArt préexistants, sans lien). Export CLI réel +
        inspection du XML brut dans le `.docx` généré (confirmation que chaque `prst` attendu est
        bien émis, pas seulement que le parseur ne plante pas) + rendu LibreOffice réel sur les 18
        formes, y compris `lightningBolt` (bâton d'éclair correctement dessiné, pas un rectangle) et
        `flowChartOr`/`flowChartSummingJunction` (cercle barré d'une croix visible sur une boîte à
        peu près carrée — l'apparence de simple ligne observée d'abord sur un libellé long était un
        effet d'aplatissement de la boîte par la largeur du texte, pas une forme manquante, confirmé
        en isolant chaque forme sur un libellé court).
      - `docs/specs/cahier_des_charges.md` §6.1 et `docs/markdown-mermaid-compliance-table.md` §5.2/§5.6 mis
        à jour (la ligne "30 formes étendues : None" devient Partial/Full comme les 11 formes bracket
        existantes — même dégradation SmartArt puisque `chain.ts`/`tree.ts` ne lisent `NodeShape`
        d'aucune forme, cf. la ligne "Rectangle").
- ✅ **Label mi-chaîne d'arête (`A-- texte -->B`), corrigé (2026-09-04)** : item suivant de la liste
      "reste" laissée par le chantier des arêtes exotiques ci-dessous. Cette syntaxe (l'alternative
      recommandée par Mermaid à `A-->|texte|B`) faisait échouer toute la ligne — `parseNodeRef`
      recevait un segment gauche du type `"A-- texte "` (queue de l'opérateur non consommée),
      invalide comme référence de nœud, donc `null` remonté jusqu'à `parseEdgeChain` et le nœud
      **et** l'arête perdus silencieusement (retombée sur "Unsupported line ignored", spec §10).
      Corrigé (`parser.ts`, `MID_LABEL_FAMILIES` + `matchMidLabelEdge()`) : quand le scan de
      `parseEdgeChain` ne matche aucun token complet de `EDGE_OPERATORS` à la position courante, il
      essaie un marqueur d'ouverture de famille (`--`, `-.`, `==`) et cherche en avant, toujours
      hors imbrication de crochets, le marqueur de fermeture qui détermine le type d'arête exact
      (`-->`/`--o`/`--x`/`---` pour `--` ; `.->`/`.-` pour `-.` ; `==>`/`===` pour `==`) — le texte
      entre les deux devient le label. Couvre les 5 formes documentées (flèche, ligne, pointillé,
      épais, cercle, croix) ; fonctionne aussi dans un chaînage sur une ligne (`A-- x -->B-- y -->C`),
      chaque segment indépendant. Vérifié : 4 nouveaux tests unitaires (les 5 familles, chaînage,
      non-régression sur un `--` sans fermeture qui doit rester "Unsupported line ignored" et non
      planter) — suite parser 31/31, fuzz 3/3, suite complète du monorepo 158/161 (mêmes 3 échecs
      SmartArt préexistants, sans lien). Export CLI réel + rendu LibreOffice sur les 6 formes : les
      labels s'affichent tous correctement sur leur trait respectif.
- ✅ **Trois lacunes du parseur trouvées en testant des diagrammes réels, corrigées (2026-09-04)** :
      signalé par l'utilisateur comme prochain chantier après le désactivage SmartArt par défaut
      (voir plus bas) — le parseur ligne-par-ligne perdait silencieusement des nœuds/arêtes entiers
      sur des constructions Mermaid courantes, sans jamais crasher (donc sans jamais remonter
      d'erreur à l'utilisateur).
  - **Label multi-ligne cassant le diagramme.** Trouvé en testant `medium-realistic.mmd` : un
    retour à la ligne physique à l'intérieur de `{}`/`[]`/`()` (`Valider{Config\n valide?}`, syntaxe
    Mermaid valide) faisait échouer les deux moitiés de la déclaration côté parseur (`text.split`
    ligne par ligne), perdant le nœud **et** l'arête qui le référence — diagramme déconnecté.
    Corrigé (`parser.ts`, `joinBracketContinuations()`) : une passe fusionne les lignes tant que
    les crochets ne sont pas rééquilibrés, avant le découpage habituel ; une ligne déjà équilibrée
    (cas normal) repart immédiatement, comportement inchangé. Vérifié : `medium-realistic.mmd`
    passe de diagramme cassé à 12 nœuds/13 arêtes/0 warning, export CLI réel réussi.
  - **5 formes de nœud manquantes** (hexagone, parallélogramme ×2, trapèze ×2, sous-routine,
    cercle double) — étaient soit mal parsées (matchées par erreur sur `diamond`/`ellipse`/`rect`
    avec des délimiteurs résiduels visibles dans le label), soit carrément non reconnues.
    `SHAPE_BY_SYNTAX` étendu (`parser.ts`), nouveaux presets DrawingML dédiés dont deux réutilisent
    le même preset via `flipH`/`flipV` plutôt qu'un second preset (`ooxml-translator.ts`) ; cercle
    double approximé en `ellipse` simple (aucun preset OOXML n'a d'anneau double). Portée du
    parseur : 6 → 11 formes sur ~30 documentées par Mermaid. Vérifié par rendu LibreOffice réel +
    inspection visuelle des 7 formes (voir capture dans la conversation du 2026-09-04).
  - **Arêtes exotiques perdant tout le diagramme** — `-.-`/`===` (ligne sans flèche), `<-->`
    (bidirectionnelle), `--o`/`--x`/`o--o`/`x--x` (têtes cercle/croix), `~~~` (lien invisible), le
    chaînage sur une ligne (`A-->B-->C`) et le fan-out/fan-in via `&` (`A --> B & C`) faisaient
    tous échouer la ligne entière (aucun de ces motifs n'existait dans l'ancien `EDGE_SYNTAX`, ou
    la regex à une seule arête par ligne ne gérait pas les chaînages). Remplacé par
    `parseEdgeChain()` : un scanner qui repère les opérateurs (`EDGE_OPERATORS`, ordonnés du plus
    spécifique au plus court pour que `-.-` ne capture pas prématurément `-.->`) uniquement hors
    imbrication de crochets — donc un label `A[Step 1 --- Step 2]` n'est jamais confondu avec un
    opérateur — puis éclate chaque segment sur `&` avant de relier en produit cartésien. `EdgeType`
    étendu de 4 à 12 variantes ; `LINE_STYLE_BY_EDGE` gère désormais `headEnd`/`tailEnd`
    indépendamment (bidirectionnel) et un mode `invisible` (`<a:noFill/>`). `cross` (`--x`/`x--x`)
    approximé par le marqueur `diamond` — DrawingML n'a pas de marqueur croix natif. Vérifié par
    rendu LibreOffice réel : chaînage, fan-out, fan-in et les 8 styles de trait s'affichent
    correctement, y compris le lien invisible (aucun trait dessiné).
  - **Tests** : 8 nouveaux tests unitaires (multi-ligne, 5 formes, chaînage, fan-out, fan-in, label
    mi-chaîne, 8 types d'arête étendus, non-confusion label/opérateur) — suite parser+fuzz 30/30,
    suite complète du monorepo 154/157 (3 échecs restants préexistants, fuzz SmartArt sans lien,
    confirmés par `git stash` sur `main` avant ces changements). `tsc --noEmit` propre sur tout le
    workspace, suite CLI 30/30 (corpus complet régénéré sans erreur).
  - **Docs synchronisées** : `docs/specs/cahier_des_charges.md` §6.1/§6.2 (matrices de
    correspondance étendues aux nouvelles formes/arêtes) et `docs/markdown-mermaid-compliance-table.md`
    §5.2/§5.4 (statut par ligne mis à jour : topologie désormais correcte dans les 3 stratégies
    pour chaînage/`&`/invisible, style visuel toujours perdu côté SmartArt pur pour les têtes
    multidirectionnelles puisque `chain.ts`/`tree.ts` ne dessinent aucun connecteur).
- ⚠️ **Épaisseur des connecteurs/flèches jamais mise à l'échelle — corrigé, mais limite de fond
      probablement pas entièrement résolue (2026-09-02)** : signalé par l'utilisateur sur des
      captures d'écran d'un **vrai Word** (`medium3`/`medium4`/`medium5`/`large1`, corpus décrit
      juste au-dessus) — les têtes de flèche paraissent beaucoup trop grosses par rapport aux
      rectangles une fois le diagramme réduit à l'échelle de la page.
  - **Cause confirmée** (`ooxml-translator.ts`) : `renderNode`/`renderEdge` calculaient déjà la
    géométrie (position, taille, police — voir l'entrée `NODE_FONT_SIZE_HALFPT` plus bas) à partir
    du même `scale`, mais l'épaisseur du trait (`a:ln w=`, table `LINE_STYLE_BY_EDGE`) restait une
    valeur fixe (12700/25400 EMU) quel que soit `scale` — exactement la même classe de bug que
    celle déjà corrigée pour le texte (`scaledFontSizeHalfPt`), jamais étendue à l'épaisseur de
    trait. Idem pour la bordure des nœuds (`renderNode`, fixe à 12700).
  - **Corrigé** : nouvelle fonction `scaledLineWidth(baseEmu, scale)` (miroir de
    `scaledFontSizeHalfPt`, plancher `MIN_LINE_WIDTH_EMU` = 0,25pt pour ne jamais atteindre zéro),
    appliquée à la fois à la bordure des nœuds et au trait des connecteurs. Nouveau test
    (`translator.test.ts` → `node border and connector line widths shrink along with geometry on a
    scaled-down diagram`). Corpus entier régénéré avec le correctif.
  - **Limite confirmée non corrigible dans l'architecture actuelle** : la tête de flèche
    (`a:tailEnd type="triangle" w="med" len="med"`) n'a pas de taille numérique — `w`/`len` sont
    des enums (`sm`/`med`/`lg`, ST_LineEndWidth/Length), censés être proportionnels à l'épaisseur
    du trait selon la spec ECMA-376. **Confirmé par l'utilisateur dans un vrai Word** : même
    disproportion qu'observé ici en LibreOffice — pas un artefact d'un seul moteur de rendu.
  - **`w="sm" len="sm"` testé, aucune amélioration mesurable** : régénéré `medium4.docx` avec
    l'enum le plus petit disponible, rendu LibreOffice comparé côte à côte à `med` — différence
    imperceptible au même niveau de zoom. Changement annulé (pas de bénéfice démontré, ne valait
    pas de modifier le rendu de tout le corpus sans preuve). Confirme que le plancher de taille
    visuelle vient du moteur de rendu lui-même (Word **et** LibreOffice), pas du choix d'enum —
    les trois paliers sont trop proches les uns des autres pour compenser un facteur d'échelle
    de diagramme qui peut descendre bien en dessous de 0,1.
  - **Pourquoi un contournement (dessiner la flèche nous-mêmes plutôt que via `a:tailEnd`) n'a
    pas été tenté** : casserait le comportement magnétique documenté et testé ("un connecteur
    suit la forme quand on la déplace dans Word", argument de vente central du produit). Cette
    décoration est portée par `a:ln`/`spPr`, indépendamment du chemin géométrique — c'est
    précisément ce qui lui permet de rester correcte quel que soit la façon dont Word recalcule
    le tracé après un déplacement de forme. Un triangle dessiné à la main (dans le `custGeom` du
    connecteur, ou en forme séparée) redeviendrait incorrect/détaché dès le premier déplacement
    interactif d'une des deux formes reliées — trocaerait la lisibilité cosmétique d'un diagramme
    déjà à la limite contre l'éditabilité native, la vraie proposition de valeur du produit.
    Aucune tentative de code faite dans ce sens.
  - **Conclusion : ce n'est pas un bug isolé de flèche, c'est un symptôme de plus de la limite
    déjà ouverte "lisibilité des gros diagrammes"** (§ plus bas) — 150-360 nœuds écrasés dans les
    6,5 pouces de largeur utile d'une page US Letter. Le vrai levier n'est pas une variante XML de
    plus sur la décoration de flèche (déjà exploré, sans résultat), mais l'une des pistes déjà
    listées et jamais tranchées : page de taille custom via saut de section, seuil de nœuds
    refusé explicitement, ou pagination/découpage du graphe lui-même. Décision à prendre avec le
    mainteneur avant tout nouveau code sur ce chantier précis — pas quelque chose à retenter par
    petites touches côté décoration de connecteur.
- ⚠️ **Fermeture du socle avant nouvelles fonctionnalités (pptx, SmartArt) — corpus étoffé +
      thème Word natif, pas encore validé dans un vrai Word (2026-09-02)** : signalé par
      l'utilisateur — le corpus (`test-corpus/corpus/source/`) était presque exclusivement des
      `.mmd` bruts (8 fichiers) contre un seul `.md` à texte riche (`mixed-content.md`, diagrammes
      de 4 et 6 nœuds seulement), et les gros diagrammes (24-318 nœuds, déjà notés plus bas comme
      jamais ouverts dans un vrai Word) n'avaient jamais été combinés à du texte Markdown riche.
  - **Corpus étoffé** : deux nouvelles sources `.md` (voir `test-corpus/corpus/README.md` §"Corpus
    texte"), même structure de rapport que `mixed-content.md` (titres, tableau, liste, citation,
    note de bas de page, blocs de code) mais avec le contenu réel d'un `.mmd` déjà présent dans le
    corpus (frontmatter YAML retiré) plutôt qu'un diagramme réécrit pour l'occasion —
    `large-report.md` (embarque `large1.mmd`, ~360 nœuds) et `medium-report.md` (embarque
    `mermaid-official-code-flow.mmd`, ~115 nœuds, formes variées, re-teste la limite HTML brut
    connue à plus grande échelle). Régénérés sans erreur via le CLI réel, conformité structurelle
    verte (`packages/cli/test/corpus.test.mjs`, découverte automatique du dossier `source/` —
    aucune modification de test nécessaire), rendu LibreOffice headless inspecté visuellement
    (titres/tableau/citation/code corrects, les deux diagrammes complets, aucune forme manquante).
  - **Question soulevée en même temps par l'utilisateur, distincte** : mélange Calibri/Cambria
    visible dans les `.docx` générés. Vérifié en extrayant `theme1.xml`/`styles.xml` d'un `.docx`
    réel plutôt que supposé : c'était le thème Office **2007-2010** de Pandoc tel quel
    (`--print-default-data-file reference.docx`, jamais modifié par ce projet auparavant) —
    `majorFont`=Calibri/`minorFont`=Cambria (accent1 `#4F81BD`, titres gras 12pt de corps), pas
    "standard Word" au sens d'un Word installé aujourd'hui. Décision explicite de l'utilisateur
    (question posée, réponse donnée) : cibler le thème Word moderne (police Aptos, palette de
    thème "Office" 2013+, titres non gras) plutôt que le classique Calibri/Calibri Light.
  - **`packages/cli/assets/reference.docx` (nouveau)** : construit en éditant directement
    `theme1.xml` (polices majorFont/minorFont → Aptos Display/Aptos, palette de couleurs →
    accent1 `#4472C4` etc.) et `styles.xml` (corps 12pt→11pt, interligne simple/10pt-après→
    1,08/8pt-après, `Heading1`-`3` plus gras, `Heading4`-`5` plus italique) d'un reference.docx
    Pandoc de base — **aucun vrai Word disponible ici** pour le faire à la main (méthode
    habituelle), donc reconstruction directe de l'OOXML, documentée avec ses limites/hypothèses
    dans `packages/cli/assets/README.md`. Câblé via `--reference-doc` dans
    `bin/md2nativedocx.mjs` (`REFERENCE_DOC_PATH`, garde `existsSync` avant l'ajout du flag) ;
    `packages/vscode-extension/scripts/bundle-cli.mjs` copie aussi l'asset dans le `.vsix` vendored
    (miroir du même chemin relatif que `md2nativedocx.lua`) — vérifié : le CLI vendored produit
    bien un `.docx` avec `majorFont=Aptos Display`. Le texte des formes de diagramme (nœuds/arêtes)
    n'a pas été touché dans `ooxml-translator.ts` : il ne déclare toujours aucun `w:rFonts`, donc
    il hérite automatiquement de la même police de thème (Aptos) que le corps du texte — cohérence
    gratuite, aucun changement de code translator nécessaire pour ça.
  - **Escalade AGENTS.md** : pas dans la liste explicite (pas une nouvelle dépendance externe —
    fichier statique versionné, pas un paquet npm ; pas un changement de contrat de sortie de
    `packages/core`), mais décision de branding/produit difficile à défaire une fois des documents
    réels générés avec — la question du thème cible (moderne vs. classique) a été posée
    explicitement à l'utilisateur avant tout code, dans l'esprit de la règle plutôt que sa lettre.
  - **Reste à faire, explicitement pas fait ici** : ouvrir tout le corpus (`generated/*.docx`,
    ancien **et** les deux nouveaux fichiers) dans un vrai Word — LibreOffice ne peut ni afficher
    la vraie police Aptos (absente de ce Codespace Linux) ni confirmer la sélection individuelle
    des formes. Valeurs de `reference.docx` (tailles de titre exactes, gras/italique par niveau)
    documentées comme hypothèses de reconstruction à vérifier dans `packages/cli/assets/README.md`,
    pas comme certitudes.
- ✅ **Trois défauts signalés par l'utilisateur sur `demo.docx` (2026-09-01)** : étiquettes de
      flèches mal centrées, marges trop serrées sur ces mêmes étiquettes, et double "grand
      rectangle" visible sur toute forme (sélection Word montrant à la fois le cadre du canevas
      et celui d'un groupe).
  - **Étiquettes d'arête — pas un bug de calcul, un bug de proportions.** Vérifié directement
    (extraction EMU de `demo.docx` + trace pixel sur un rendu LibreOffice) : le centre de la boîte
    d'étiquette coïncidait déjà exactement avec le vrai milieu du segment de connecteur. Le
    problème : `EDGE_LABEL_CX` était une largeur fixe (0,75 po) bien plus large que le texte réel
    ("Oui"/"Non") — sur un segment diagonal, une boîte centrée mais large ne « semble » alignée
    qu'en un seul point de sa largeur, d'où l'impression de décalage. Corrigé
    (`ooxml-translator.ts`, `edgeLabelWidthEmu`) : la boîte est maintenant dimensionnée à son texte
    (réutilise `estimateTextWidth` de `layout.ts`, désormais exportée et paramétrée par taille de
    police — `nodeDimensions` l'appelait à 16px, l'étiquette d'arête l'appelle à sa propre taille
    8pt), avec un facteur de sécurité 1,8× calibré empiriquement (bisection LibreOffice : la table
    de largeur par caractère, calibrée à 16px, sous-estimait franchement une fois mise à l'échelle
    linéairement vers 8pt). Corrige aussi le problème de marge (même cause : boîte surdimensionnée
    + `lIns`/`rIns` à 0) — insets non nuls ajoutés en complément.
  - **Double rectangle — cause confirmée : le groupe racine `wpg:wgp`.** Chaque diagramme était
    encapsulé `wpc:wpc` (canevas) → `wpg:wgp` (groupe) → formes. Un `wpg:wgp`/`wpg:grpSp` est un
    vrai objet "Groupe" Word : premier clic sélectionne tout le paquet (double-clic pour entrer),
    d'où le second contour visible en plus de celui du canevas. Corrigé
    (`ooxml-translator.ts`, `renderContent`) : plus aucune forme n'est groupée, à la racine ni pour
    les sous-graphes — `wpc:wpc` accepte `wps:wsp` en enfant direct sans groupe intermédiaire.
    **Escalade AGENTS.md** : ceci change le contrat de sortie structurel du traducteur (plus de
    `wpg:wgp` du tout dans la sortie) — signalé ici pour revue humaine avant merge, conformément à
    la règle « Changement de l'API publique de packages/core (contrat de sortie du traducteur) ».
  - **Deux régressions trouvées et corrigées en supprimant le groupe, aucune des deux triviale :**
    1. La mise à l'échelle d'un diagramme trop grand (`scaledExtent`) reposait sur le groupe
       racine : les enfants gardaient des coordonnées natives et Word appliquait l'homothétie via
       l'écart `a:chExt`/`a:ext` du groupe. Sans groupe, `scale` est maintenant appliqué
       directement à chaque coordonnée émise (nœuds, arêtes, étiquettes, sous-graphes) —
       mathématiquement équivalent, calculé ici plutôt que délégué à Word.
    2. **Trouvaille plus profonde, non anticipée** : un `wpg:grpSp` placé directement sous
       `wpc:wpc` (sans `wpg:wgp` englobant) se rend à la **mauvaise position** dans LibreOffice —
       son `a:off` déclaré n'est pas honoré (vérifié empiriquement sur un diagramme à 3
       sous-graphes : titres et libellés de nœuds décalés loin de leurs formes, texte tronqué —
       reproduit aussi en cas minimal à 1 sous-graphe/1 nœud). Plutôt que réintroduire un groupe
       pour les sous-graphes, `renderSubgraph` a été réécrit : un sous-graphe ne groupait de toute
       façon jamais de contenu réel (ses nœuds membres sont toujours rendus séparément, en
       coordonnées absolues — jamais nichés dans le groupe), donc son `wpg:grpSp` ne portait qu'une
       unique boîte de titre. Cette boîte est maintenant une simple `wps:wsp` de plus, en
       coordonnées absolues, exactement comme un nœud — élimine le problème à la racine, aucun
       groupe nécessaire nulle part.
    3. **Régression de rendu du texte, trouvée en corrigeant la précédente** : sans groupe, un
       diagramme fortement réduit (`scale` proche de 0,4 sur le cas à 3 sous-graphes) rendait des
       boîtes vides avec le texte flottant hors champ. Cause : l'ancien groupe appliquait sa
       transformation visuelle à tout son contenu rendu, texte inclus, gratuitement — sans lui, la
       taille de police (`w:sz`) et les marges internes (`lIns`/`tIns`/`rIns`/`bIns`, jusqu'ici
       fixes) doivent être mises à l'échelle explicitement comme le reste. Corrigé : `w:sz` déclaré
       explicitement (n'était auparavant qu'hérité du `docDefault` de Pandoc) sur le texte de
       nœud/titre de sous-graphe/étiquette d'arête, et les insets de `bodyPr` scalés eux aussi,
       tous via le même facteur `scale`.
  - **Tests** : 82 tests unitaires/golden dans `packages/core` mis à jour pour la nouvelle
    structure (plus aucune assertion sur un `wpg:wgp` racine) plus les tests `cli`/`pandoc-filter`
    équivalents — suite complète du monorepo verte. Corpus réel régénéré
    (`test-corpus/corpus/generated/*.docx`).
  - **`npm run test:visual` : 12/22 fixtures diffèrent du témoin accepté** (attendu — la géométrie
    de chaque étiquette/nœud/sous-graphe a changé) — revue visuelle manuelle faite sur un
    échantillon (`mixed`, `long-labels`, `fan-out`, `subgraph`) via rendu LibreOffice direct,
    confirmée comme amélioration dans chaque cas inspecté, **mais `--update-baseline` volontairement
    pas exécuté** (revue humaine systématique requise avant, règle du projet — TESTING.md).
- ✅ Scaffold monorepo npm (racine `package.json`, `tsconfig.base.json`, `.eslintrc.cjs`, `.gitignore`)
- ✅ Docs de gouvernance : `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.github/PULL_REQUEST_TEMPLATE.md`,
  templates d'issues (`.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`)
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
- ⚠️ **Premier test manuel dans Word réel (2026-09-02) — a immédiatement trouvé ce que
      LibreOffice + validation XML structurelle ne pouvaient pas trouver.** `demo.docx` (généré
      par `packages/vscode-extension/docs/demo.md`) ouvert dans un vrai Word : « Word a trouvé du
      contenu illisible... Voulez-vous récupérer le contenu de ce document ? ». Le fichier se
      récupère et s'affiche correctement après le clic sur "Oui", donc pas une corruption totale —
      mais un vrai défaut de conformité, pas une divergence de rendu cosmétique.
  - **Cause identifiée** (`packages/cli/src/postprocess.mjs`) : la constante `IGNORABLE` listait
    `w14 w15 w16se w16cid w16 w16cex w16sdtdh w16sdtfl w16du wp14` dans `mc:Ignorable` sur la
    racine `w:document`, mais `EXTENDED_NS` (les `xmlns:` réellement déclarés) n'inclut que
    `wpc`/`mc`/`wp14`/`wpg`/`wps` — neuf préfixes sur dix référencés dans `mc:Ignorable` n'avaient
    **aucune déclaration `xmlns:` correspondante** nulle part dans le document. Invalide au sens
    de la spec Markup Compatibility (ECMA-376 Part 3, un préfixe listé dans `mc:Ignorable` doit
    résoudre vers un namespace en portée) — le genre exact d'entorse à la spec que LibreOffice
    tolère silencieusement mais que le parseur de Word rejette strictement. La chaîne complète
    correspond au boilerplate exact qu'un vrai document Word déclare (probablement copiée depuis
    un document de référence Word sans copier les déclarations `xmlns:` qui l'accompagnent).
  - **Corrigé** : `IGNORABLE` réduit à `'wp14'` (le seul préfixe de la liste réellement déclaré),
    plutôt que d'ajouter les 9 déclarations `xmlns:` manquantes avec des URI reconstitués de
    mémoire — le projet n'émet aucun élément `w14:`/`w15:`/`w16*:`, donc les annoncer comme
    "ignorables" n'apporte rien, et un URI mal reconstitué serait pire qu'un simple retrait.
  - **Nouveau test de non-régression** (`packages/cli/test/postprocess.test.mjs`) : vérifie que
    chaque préfixe de `mc:Ignorable` a une déclaration `xmlns:` correspondante sur la racine —
    exactement le contrôle qui aurait attrapé ce bug avant qu'il n'atteigne un vrai Word. Les 75+
    tests structurels existants ne le pouvaient pas : ils vérifient la présence d'attributs, pas
    la cohérence des préfixes qu'ils référencent.
  - Tout le corpus régénéré (`test-corpus/corpus/generated/*.docx`) porte le même correctif —
    même défaut latent dans chaque fichier depuis l'introduction de `postprocess.mjs`.
  - **Reste à faire** : ouvrir le corpus complet (pas seulement `demo.docx`) dans un vrai Word pour
    chercher d'autres défauts de cette catégorie (têtes de flèche `a:tailEnd`, notamment — présentes
    et positionnées correctement dans le XML, jamais vérifiées visuellement dans Word lui-même).
- ✅ **Nœuds dimensionnés selon leur texte, pas une taille fixe (2026-09-02)** — corrige à la fois
      un défaut visuel signalé par l'utilisateur ("le texte dans les formes est un peu grand, pas
      la même impression que Mermaid dans le visualiseur markdown") **et**, en creusant, la cause
      racine du bug de corruption de texte dans les losanges découvert la veille (ci-dessous,
      historique conservé).
  - **Avant** : chaque nœud recevait la même boîte fixe `NODE_WIDTH`x`NODE_HEIGHT` (120×60px),
    indépendamment de son texte — un texte court flottait dans une boîte trop grande, un texte
    long débordait/se tronquait, et un losange (dont la zone de texte utile est bien plus petite
    que sa boîte englobante) était systématiquement trop étroit pour son propre libellé — c'est
    exactement ce qui produisait le rendu corrompu ("Auth" → glyphe ressemblant à "Λ") documenté
    précédemment ici.
  - **Après** (`packages/core/src/layout/layout.ts`, `nodeDimensions()`) : chaque boîte est
    dimensionnée à son libellé, avec une estimation de largeur de glyphe par classe de caractère
    (majuscule/chiffre/espace/autre — aucune mesure de police réelle possible sans DOM/canvas ni
    nouvelle dépendance, règle n°6), un vrai retour à la ligne glouton mot par mot (jamais au
    milieu d'un mot), et un losange dimensionné au double d'un rectangle équivalent (borne
    suffisante — pas la plus stricte — garantissant que le texte tient dans le rhombe inscrit).
    `NODE_WIDTH`/`NODE_HEIGHT` (renommés en sens : ce sont désormais des planchers minimaux, pas
    une taille imposée) restent exportés pour compatibilité ; `LayoutOptions.nodeWidth/nodeHeight`
    reste une échappatoire explicite pour forcer une taille fixe si besoin.
  - **Trouvaille en cours de route, plus profonde que prévu** : une boîte dimensionnée pile pour
    son texte à l'échelle native peut quand même déborder une fois rendue, si le diagramme entier
    est réduit par `scaledExtent()` pour tenir sur la page (`wp:extent` < `a:chExt`) — la géométrie
    des formes suit cette réduction, le texte (taille de police littérale, jamais réduite en
    conséquence dans le rendu LibreOffice observé ici) semble ne pas la suivre. Non vérifié dans un
    vrai Word — pourrait être un artefact spécifique au rendu LibreOffice. Compensé par une marge
    de sécurité (`SCALE_SAFETY_MARGIN`) plutôt que résolu à la racine (résoudre proprement
    demanderait soit de rendre le texte réellement solidaire de l'échelle du groupe, soit un calcul
    en deux passes — layout provisoire → facteur d'échelle réel → re-layout — hors budget de cette
    session).
  - **Résultat** : net progrès sur les cas courants (diagrammes simples, `demo.md`/`demo-full.md` —
    losanges et libellés longs parfaitement lisibles, proportions proches du rendu Mermaid officiel
    vérifié par comparaison directe). **Limite connue, non résolue** : les diagrammes denses
    (beaucoup de nœuds, donc réduction d'échelle plus agressive) de `test-corpus/visual/fixtures/`
    (`order-flow`, `mixed`, `fan-out`, `cycle`, `shapes`) montrent encore des débordements de texte
    occasionnels — 12 des 22 baselines visuelles diffèrent désormais du témoin accepté (attendu,
    puisque la géométrie de chaque nœud a changé) et **nécessitent une revue humaine avant
    `--update-baseline`** (jamais fait automatiquement ici, conformément à la règle du projet).
    Testé abondamment via `packages/core/test/unit/layout.test.ts` (5 nouveaux tests : croissance
    avec le texte, plancher minimal, retour à la ligne sans dépassement arbitraire, losange plus
    grand qu'un rectangle équivalent, échappatoire `nodeWidth`/`nodeHeight` toujours fonctionnelle).
- ✅ **Troisième bug trouvé le même jour, par l'utilisateur, sur une capture d'écran d'un vrai
      Word (2026-09-02)** : marge basse visiblement plus grande que la marge haute dans le texte
      des formes — pas juste une impression, un vrai décalage vertical.
  - **Cause confirmée** (`packages/core/src/translator/ooxml-translator.ts`) : le `w:pPrDefault`
    du `reference.docx` de Pandoc impose `w:spacing w:after="200"` (10pt) à **tout** paragraphe du
    document qui ne le surcharge pas explicitement — y compris le seul `w:p` de chaque texte de
    forme (nœud, titre de sous-graphe, label d'arête), qui ne l'a jamais fait. Avec `anchor="ctr"`
    centrant toute la boîte de paragraphe (glyphes + ces 10pt invisibles après), le texte visible
    se retrouve décalé vers le haut — rien côté `w:before` pour compenser symétriquement.
  - **Corrigé** : `<w:spacing w:before="0" w:after="0"/>` ajouté explicitement aux trois `w:pPr`
    concernés. Fixture golden (`test/golden/fixtures/two-node.xml`) mise à jour en conséquence
    (comparaison structurelle — le nouvel élément devait aussi y apparaître). Nouveau test
    (`translator.test.ts` → `node/subgraph-title/edge-label text overrides the inherited
    paragraph spacing`). `demo.docx`/`demo-full.docx` régénérés.
  - **Non re-vérifié visuellement** : LibreOffice ne semblait déjà pas montrer d'asymétrie flagrante
    avant ce correctif (l'écart a été repéré sur une capture d'écran Word réelle, pas ici) — à
    confirmer par l'utilisateur dans Word directement.
- ✅ **Deuxième bug trouvé le même jour, par l'utilisateur, en ouvrant `demo-full.docx` (version
      `LR` pré-correctif) dans un vrai Word — corrigé et confirmé par une source faisant autorité,
      pas seulement une hypothèse** : les connecteurs semblaient accrochés au mauvais site (capture
      d'écran Word montrant des lignes qui se croisent entre le losange, "Traiter"/"401" et le
      losange suivant, absent du rendu LibreOffice du même fichier statique).
  - **Cause confirmée** : `SITE = { top: 0, right: 1, bottom: 2, left: 3 }` (`ooxml-translator.ts`)
    n'avait jamais été vérifié que pour le cas vertical (haut/bas, via
    `tools/word-reference/`, un connecteur entre deux rectangles empilés) — le couple gauche/droite
    était une extrapolation "sens horaire depuis le haut" jamais testée. Décodé directement depuis
    `oox-drawingml-cs-presets` du dépôt LibreOffice/core (leur propre miroir du
    `presetShapeDefinitions.xml` officiel de Microsoft, cf. le billet de blog
    [How to use the presetShapeDefinitions.xml file](https://learn.microsoft.com/en-us/archive/blogs/openspecification/how-to-use-the-presetshapedefinitions-xml-file-and-fun-with-drawingml)) :
    `rect` **et** `diamond` listent tous deux leurs sites de connexion dans l'ordre
    top(0)/**left(1)**/bottom(2)/**right(3)** — sens anti-horaire, pas horaire. `right` et `left`
    étaient inversés dans notre code, et ça touche **toutes les formes**, pas seulement les
    losanges — `flowchart LR` est justement le cas qui exerce idx 1/3.
  - **Pourquoi LibreOffice ne montrait rien d'anormal** : le tracé du connecteur lui-même
    (`bentConnectorGeometry`/`straightConnectorGeometry`) est une liste de points littéraux calculée
    par `sitePoint()`, géométriquement correcte indépendamment de cette constante — `idx` ne sert
    qu'à l'attribut `stCxn`/`endCxn` (le comportement magnétique). LibreOffice semble dessiner notre
    tracé littéral tel quel ; Word, lui, semble privilégier sa propre sémantique de site de connexion
    pour au moins certains cas — d'où la divergence visuelle sur un fichier statique identique.
  - **Corrigé** : `SITE` devient `{ top: 0, right: 3, bottom: 2, left: 1 }`. Aucun test existant
    n'affirmait de valeur précise pour gauche/droite (seulement haut/bas, inchangés) — corrigé sans
    casser les 75 tests précédents. Nouveau test ajouté
    (`translator.test.ts` → `horizontal connection-site indices: 3=right at the source, 1=left at
    the target`) : le cas vertical avait sa propre assertion depuis longtemps, l'horizontal n'en
    avait aucune — c'est justement l'angle mort qui a laissé passer ce bug. `demo.docx` et
    `demo-full.docx` régénérés avec le correctif.
  - **Reste à faire** : non re-vérifié sur un vrai document Word (seulement contre la source
    faisant autorité LibreOffice/Microsoft) — `tools/word-reference/create-word-diagram.ps1` ne
    génère qu'un connecteur vertical entre rectangles, jamais un cas horizontal ; l'étendre serait
    la vérification définitive (Windows + Word requis, hors de portée de ce Codespace).
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

## Phase 6 — Google Slides (`.pptx`) et Phase 7 — SmartArt (`mmd2smartart`)

Cadrage complet dans `docs/specs/cahier_des_charges_google_slides.md` et `docs/specs/FUTURE_mmd2smartart_SPEC.md`.
Priorisation décidée par le mainteneur (2026-09-03) : Slides et SmartArt en parallèle (spikes bon
marché, ne touchent pas la production), avant les diagrammes de séquence (gros effort from-scratch)
et l'add-in Word (canal de distribution entièrement nouveau).

- [x] **Spike Phase 0 pptx (2026-09-02/03)** — `.pptx` minimal à la main (2 formes + connecteur,
      mêmes indices de site de connexion que le traducteur docx), ZIP/XML valides, rendu
      LibreOffice Impress propre. `docs/adr/0003-pptx-translator-spike.md`,
      `docs/adr/spikes/spike-pptx/`. **Reste à faire avant la Phase 1 (traducteur de
      production)** : vérification manuelle dans un vrai Google Slides/PowerPoint (sélection
      individuelle des formes, comportement magnétique du connecteur — non testable en headless).
- [x] **Spike Phase 0 SmartArt, 3 manches (2026-09-02/03)** — `docs/adr/0004-smartart-feasibility-spike.md`,
      `docs/adr/spikes/spike-smartart/`. Résultat : chirurgie ZIP validée dans un vrai Word ; le
      modèle de données minimal envisagé par la spec §4 (sans miroir de nœuds `pres`) est rejeté
      catégoriquement par Word à l'ouverture — mais le miroir `pres` s'avère être une table de
      correspondance fixe indexée par profondeur (confirmée sur 3 échantillons Word réels de
      topologies différentes), donc mécaniquement reproductible. **Contrainte dure découverte,
      non documentée par Microsoft** : l'algorithme `hierarchy1` de Word est plafonné à 4 niveaux
      de profondeur (aucun `layoutNode` de rendu au-delà de `hierChild5`/`hierRoot4` dans un
      `layout1.xml` réel) — largeur illimitée en revanche.
- [x] **Classifieur de topologie (2026-09-03)** — `packages/core/src/smartart/classify.ts`,
      `classifyTopology()` exporté depuis le barrel public de `packages/core` (spec §4).
      **Escalade AGENTS.md** : nouvelle branche de sortie publique de `packages/core` — validée
      explicitement par le mainteneur en choisissant cette tâche comme prochaine étape, pas
      décidée unilatéralement. Fonction pure, aucune dépendance à Dagre ni au traducteur OOXML ;
      retourne une raison structurée (`{ eligible: false, reason: ..., at: [...] }`, spec §10.1)
      plutôt qu'un simple booléen. Règle de profondeur ≤ 4 (`MAX_TREE_DEPTH`) ajoutée en plus des
      règles chaîne/arbre/cycle de la spec, directement issue du spike ci-dessus. 12 tests
      unitaires (`packages/core/test/unit/classify.test.ts`) — a immédiatement attrapé un vrai bug
      de conception (un cycle pur satisfaisait aussi le test naïf de chaîne "in/out-degré ≤ 1" ;
      corrigé en distinguant les topologies par présence d'une racine plutôt que par les seules
      bornes de degré). Monorepo entier revérifié vert (build/typecheck/lint/tous les tests des 4
      packages) après l'ajout.
- [x] **Règle exacte de câblage `presOf`/`presParOf` extraite (2026-09-03)** — `spike.md` "Round 4" :
      motif récursif entièrement caractérisé (bundle fixe de 5 points `pres` par profondeur, table
      de noms de transition fixe `Name10`/`Name17`/`Name23`), confirmé sur 3 échantillons Word réels.
- [x] **Décision de licence (2026-09-03)** : ne pas redistribuer le `layout1.xml` authentique de
      Word (contenu propriétaire Microsoft) dans ce dépôt CC0 public — le mainteneur a choisi de
      réécrire un algorithme `dgm:layoutDef` original (vocabulaire `composite`/`tx`/`lin`/`forEach`
      documenté publiquement par Microsoft, pas copié). Fichiers Word réels du spike exclus du
      dépôt (`.gitignore`), gardés en local uniquement comme référence de recherche.
- ⚠️ **Algorithme personnalisé — chain prouvé fonctionnel dans un vrai Word, tree en cours,
      LibreOffice catégoriquement non fonctionnel pour tout algorithme personnalisé (2026-09-03)** :
      `docs/adr/spikes/spike-smartart/custom-algo/` — `layout-chain1.xml` (transcription d'un
      exemple complet documenté par Microsoft, `lin`/`composite`/`tx`/`forEach`) + `data-chain1.xml`
      (modèle de données minimal §4 : doc + nœuds simples + `parOf`, **sans aucun nœud `pres`**) :
      **rendu confirmé correct dans un vrai Word** (capture d'écran : 3 rectangles bleus "Etape
      1/2/3" reliés) — prouve que `forEach axis="ch"` résout dynamiquement la présentation sans
      cache `pres` pré-calculé, au moins pour Word. `layout-tree1.xml` (imbrication à 2 niveaux,
      même principe) : le modèle de données est correctement lu par Word (panneau de texte outline
      montre l'arborescence Racine/Enfant A/Enfant B) mais **aucune forme visible** — bug de
      contraintes géométriques dans l'algorithme (`composite` mal câblé pour un nœud ayant à la
      fois son propre texte et une rangée d'enfants), pas un problème fondamental ; en cours de
      correction, pas encore retesté.
  - **Confirmation catégorique découverte au passage** : `custom-chain1.docx`, pourtant validé
    fonctionnel dans Word, **rend une page blanche sous LibreOffice** — comme tous les algorithmes
    personnalisés testés jusqu'ici (le hand-authored raté de la v1, comme celui-ci qui pourtant
    fonctionne dans Word). LibreOffice ne semble jamais exécuter `forEach`/`presOf`, quel que soit
    l'algorithme, personnalisé ou non — voir hypothèse ci-dessous.
  - **Pause stratégique demandée par le mainteneur (2026-09-03)** avant de continuer à itérer sur
    la géométrie de `layout-tree1.xml` : voir le catalogue de layouts SmartArt ci-dessous d'abord.
- [x] **Catalogue complet des layouts SmartArt** — voir entrée dédiée ci-dessus.
- [x] **Compatibilité LibreOffice résolue pour un algorithme 100 % personnalisé, sans plafond de
      profondeur (2026-09-03, "Round 5")** — le mainteneur a explicitement demandé de pousser la
      compatibilité plutôt que d'accepter la limite Word-only. `docs/adr/spikes/spike-smartart/spike.md`
      "Round 5" : ajouter à la main le miroir `presOf`/`presParOf` (motif du Round 4, retargeté sur
      les noms `layoutNode` de NOTRE PROPRE `layout-chain1.xml`) débloque LibreOffice — texte
      correctement positionné (`custom-chain1-withpres.docx`), même phénomène que le vrai
      `hierarchy1` en Round 2-4. Formes/couleurs complètes obtenues en ajoutant `colors`+`quickStyle`
      (`custom-chain1-realstyle.docx`, rendu identique à du SmartArt intégré). **Testé et confirmé :
      un `colorsDef` entièrement inventé par nous (aucun contenu Microsoft, juste le schéma public
      ECMA-376/Open-XML-SDK) donne le même résultat** (`custom-chain1-ownercolors.docx`) —
      `quickStyle` reste nécessaire (`custom-chain1-nostyle.docx` sans lui retombe au texte seul)
      mais sa version auto-écrite n'a pas encore été testée directement (prochaine étape). **Ceci
      change la direction du générateur** : plus besoin du vrai `hierarchy1` de Word, donc plus de
      plafond de profondeur 4 (qui était spécifique à son implémentation) — la profondeur devient un
      choix de conception (combien de niveaux explicites écrire dans notre propre `layoutDef`, le
      format n'ayant pas de récursion native). `layout-tree1.xml` (imbrication réelle, pas juste une
      liste plate) reste à corriger géométriquement avant de pouvoir appliquer la même recette au
      cas `tree` — fait en Word (données lues correctement) mais formes non visibles pour l'instant.
      Fichiers embarquant du vrai contenu Word (`custom-chain1-realstyle.*`,
      `custom-chain1-ownercolors.*`) exclus du dépôt (`.gitignore`), le reste (algorithme, données,
      `colorsDef` personnalisé) committable.
- [x] **`styleDef`/`quickStyle` entièrement auto-écrit confirmé (2026-09-03)** — recette Round 5
      définitivement close, les 4 parties (algorithme, données+miroir `pres`, `colorsDef`,
      `styleDef`) sont toutes auto-écrites et testées individuellement.
- [x] **Générateur `chain` implémenté (2026-09-03)** — `packages/core/src/smartart/chain.ts`,
      `generateChain()` exporté depuis le barrel public de `packages/core`. Produit les 4 parties
      (`dataXml`/`layoutXml`/`colorsXml`/`styleXml`) — écart assumé par rapport au signature
      `(dataXml, layoutXml)` de la spec §7 étape 4 initiale, qui n'anticipait pas le besoin de
      `colors`/`quickStyle` (découvert en Round 5). `layoutXml`/`colorsXml`/`styleXml` sont des
      constantes (l'algorithme ne dépend pas du diagramme) ; seul `dataXml` est généré par
      diagramme, à partir de l'ordre réel de la chaîne (calculé en suivant les arêtes depuis le
      nœud à in-degré 0, pas l'ordre de déclaration Mermaid). 9 tests unitaires
      (`packages/core/test/unit/smartart-chain.test.ts`, dont un test de propriété `fast-check` sur
      des libellés hostiles arbitraires) — a attrapé deux bugs de test (pas de générateur) au
      passage : le parseur Mermaid existant ne supporte pas le chaînage `A --> B --> C` sur une
      seule ligne (pas corrigé, hors scope de cette tâche — tests réécrits en une arête par ligne),
      et l'aide de vérification de bonne formation XML réutilisée depuis `parser-fuzz.test.ts` ne
      gérait pas la déclaration `<?xml ... ?>` (les fragments du traducteur existant n'en émettent
      jamais, contrairement aux parties SmartArt qui sont des fichiers autonomes). Monorepo entier
      revérifié vert (build/typecheck/lint/tous les tests des 4 packages).
- [x] **`docs/specs/FUTURE_mmd2smartart_SPEC.md` révisée (2026-09-03)** — §3/§3.1 (nouveau)/§4/§7 mis à jour :
      recette réelle à 4 parties, décision de ne plus utiliser les URNs `hierarchy1`/`process1`
      de Word, statut d'avancement par générateur (chain livré, tree en cours au moment de la
      révision, cycle pas commencé), plafond de profondeur signalé comme point ouvert (résolu
      juste après, voir l'entrée suivante).
- [x] **Bug critique découvert et corrigé sur `chain.ts` — le générateur "livré" rendait une page
      blanche (2026-09-03)** : en poursuivant sur `tree`, rendu réel (LibreOffice headless) de la
      sortie **telle que produite par `generateChain()`** — jamais fait jusqu'ici, la suite de
      tests de Round 5/chain ne vérifiait que la structure XML, jamais un rendu effectif. Résultat :
      page blanche, alors que les tests unitaires passaient tous. Cause : `buildChainDataXml`
      n'émettait de `presOf` que pour les nœuds de contenu (`p-main*`), pas pour le point `doc`
      lui-même vers `p-root` — connecteur présent dans tous les fichiers de spike validés
      manuellement (`data-chain1-withpres.xml` etc.) mais oublié dans la généralisation en
      générateur. Sans lui, LibreOffice ne dessine aucune forme, quelle que soit la présence de
      `colors`/`quickStyle`. **Corrigé** (`chain.ts` émet désormais ce `presOf` doc→`p-root`) et
      **revérifié par rendu réel** (plus seulement par test XML) : 3 rectangles "Etape 1/2/3"
      correctement stylés. Un test unitaire mis à jour en conséquence (le compte de `presOf`
      attendu passe de 3 à 4) ; aucun autre test affecté.
- [x] **Générateur `tree` implémenté et corrigé (2026-09-03)** — `packages/core/src/smartart/tree.ts`,
      `generateTree()` exporté depuis le barrel public. Même recette à 4 parties que `chain`.
      Deux bugs distincts corrigés sur `layout-tree1.xml`/la donnée générée avant d'obtenir un
      rendu correct (vérifié par rendu LibreOffice réel, pas seulement structure XML) :
      1. le même `presOf` doc→`p-root` manquant que sur `chain.ts` ci-dessus (cause commune) ;
      2. **bug géométrique identifié** : tous les `dgm:constr` de positionnement (répartition
         35 %/55 % du nœud racine et de sa rangée d'enfants) utilisaient `val="0.35"` etc. en
         pensant exprimer une fraction — `val` est une valeur absolue (donc ~0.35 EMU, une forme
         invisible), pas un pourcentage ; la bonne syntaxe pour une contrainte proportionnelle est
         `refType="h" fact="0.35"` (relatif à la dimension du parent). Corrigé dans
         `docs/adr/spikes/spike-smartart/custom-algo/layout-tree1.xml` et repris dans
         `TREE_LAYOUT_XML`. Rendu final confirmé : boîte racine au-dessus d'une rangée d'enfants
         correctement répartie et stylée. **Portée assumée : arbres de profondeur 2 uniquement**
         (racine + une rangée d'enfants directs) — le partage de hauteur fixe (35/55) ne
         s'adapterait pas correctement à un niveau supplémentaire pour un nœud sans
         petits-enfants ; généraliser à une profondeur adaptative est un chantier à part, pas fait
         ici. En conséquence, `classify.ts`'s `MAX_TREE_DEPTH` est **abaissé de 4 à 2** (l'ancienne
         valeur 4 reflétait la capacité de `hierarchy1` de Word, jamais celle du générateur
         maison) — sinon le classifieur aurait déclaré éligibles des arbres que le générateur ne
         sait pas produire correctement. 7 tests unitaires
         (`packages/core/test/unit/smartart-tree.test.ts`), 2 tests de `classify.test.ts` ajustés
         au nouveau plafond. Monorepo entier revérifié vert (build/typecheck/lint/110 tests core +
         5 pandoc-filter + 23 vscode-extension).
- [ ] **Leçon méthodologique à appliquer avant tout futur générateur SmartArt (cycle, tree à
      profondeur adaptative, etc.)** : les tests unitaires XML-only ne suffisent pas à détecter un
      rendu blanc — l'ont prouvé les deux bugs ci-dessus, invisibles en test mais flagrants à l'œil
      sur un rendu LibreOffice réel. Avant de considérer un générateur "livré", le rendre une fois
      via `soffice --headless --convert-to png` (comme fait ad hoc cette session, pas encore
      formalisé en test automatisé — voir l'item "Tests visuels" plus bas) et inspecter l'image.
- [x] **Dispatch classifieur → générateur câblé dans le vrai pipeline (2026-09-03)** — spec §7
      étape 5, sur demande explicite du mainteneur. Plan validé avant code (règle n°7 d'AGENTS.md,
      §8 de la spec) puis implémenté :
      - `packages/core/src/smartart/dispatch.ts` (`generateSmartArt()`) et `embed.ts`
        (`buildSmartArtDrawingXml()`) — dispatch classifieur→générateur et construction du
        fragment `<w:p>` référençant 4 relIds, tous deux purs (aucune connaissance ZIP/Pandoc).
      - `md2nativedocx-core.mjs` (pont Pandoc) : si `MD2NATIVEDOCX_SMARTART_DIR` est positionnée et
        le diagramme est éligible, écrit les 4 parties dans `<dir>/<uuid aléatoire>/` et émet des
        relIds **provisoires** (`SMARTART_PLACEHOLDER:<uuid>:dm` etc., jamais des ids Word valides)
        — sinon (variable absente, diagramme non éligible, ou erreur) repli silencieux vers
        `wpg:wgp`/`wpc:wpc` inchangé.
      - `postprocess.mjs` (`injectSmartArtParts()`, nouvelle fonction, no-op si aucun marqueur
        présent) : repère les marqueurs après Pandoc, attribue de vrais `rId`, ajoute les parties
        dans `word/diagrams/`, met à jour `[Content_Types].xml` et `document.xml.rels` — extension
        notable de la chirurgie ZIP (au-delà des corrections de namespace déjà en place),
        explicitement validée avant code comme demandé par §8 de la spec.
      - `md2nativedocx.mjs` (CLI, point d'intégration unique couvrant aussi l'extension VS Code qui
        invoque ce même binaire) : crée le dossier temporaire, le passe en variable d'environnement
        à Pandoc, appelle `injectSmartArtParts()` après `postProcessDocx()`, nettoie ensuite.
      - **Bug trouvé et corrigé en testant de bout en bout** (pas en isolation) : `unzip` interprète
        `[Content_Types].xml` comme un motif glob (les crochets sont une classe de caractères) —
        échoue silencieusement à le trouver sans échappement (`\[Content_Types\].xml`).
      - **Tests corpus mis à jour** (2 fixtures qui utilisaient trivialement une chaîne/un arbre
        comme "cas simple" pour tester le chemin OOXML — remplacées par des diagrammes avec fusion
        après branchement, qui restent non éligibles indépendamment de l'évolution du classifieur ;
        une nouvelle paire de tests couvre explicitement les deux chemins, dispatché et replié).
      13 nouveaux tests (`smartart-dispatch.test.ts`, `smartart-embed.test.ts`,
      `smartart-dispatch.test.mjs` côté pandoc-filter, 4 nouveaux dans `postprocess.test.mjs`) +
      2 fixtures corrigées. Vérifié par un export CLI réel de bout en bout (pas seulement les
      tests), rendu LibreOffice à l'appui. **Reste explicitement hors scope de cet item** : hover
      provider + CodeLens conditionnel (spec §10.1), note de fallback dans le document généré
      (spec §10.3) — pas commencés.
- [x] **Note de fallback dans le document généré, expédition des warnings, réglage de template de
      référence (2026-09-03)** — 3 items priorisés explicitement par le mainteneur, tous livrés :
      1. **Note de fallback (spec §10.3)** — `buildSmartArtFallbackNoteXml()` dans
         `packages/core/src/smartart/embed.ts`, exportée depuis le barrel public. `md2nativedocx-
         core.mjs` l'appelle quand `MD2NATIVEDOCX_SMARTART_DIR` est positionnée et
         `classifyTopology()` rejette le diagramme (jamais quand SmartArt n'a pas été tenté, ni sur
         un SmartArt réussi). Phrase discrète (italique, gris `808080`, formatage direct plutôt
         qu'un style nommé — "ou équivalent" autorisé par la spec) juste sous le diagramme, message
         spécifique par `SmartArtIneligibleReason` (pas un disclaimer générique). Vérifié par rendu
         LibreOffice réel.
      2. **Warnings remontés** — `parseMermaid()`'s `warnings` (jusque-là silencieusement ignorés
         dans le pont Pandoc) sont écrits sur stderr, préfixés `md2nativedocx: warning: `, avec le
         message existant de repli SmartArt. `md2nativedocx.mjs` (CLI) compte ces lignes dans le
         stderr capturé de Pandoc, écrit un résumé sur stdout (`Warnings: N (see fichier.log)`) et
         un fichier `.log` texte à côté du `.docx` (même nom de base, écrit à **chaque** export
         réussi, pas seulement s'il y a des warnings). Côté VS Code, `exportService.ts` relit ce
         `.log` (`warningCount`/`logPath` dans `ExportResult`) et `extension.ts` affiche un toast
         `showWarningMessage` ("Exported: X (with N warning(s))") avec une action "View warnings"
         qui ouvre le `.log`.
      3. **Réglage de template de référence** — `md2nativedocx.referenceDocument` (nouvelle
         propriété de configuration VS Code, miroir de `--reference-doc` de Pandoc), résolue contre
         le dossier de l'espace de travail si relative, repli silencieux vers le template intégré
         si le fichier est introuvable (même philosophie que `resolvePandocBin`). Câblé via
         `MD2NATIVEDOCX_REFERENCE_DOC` (même mécanisme que `MD2NATIVEDOCX_PANDOC_BIN`) jusqu'à
         `md2nativedocx.mjs`. Répond au volet "corporate" (voir item correspondant plus bas dans ce
         fichier, marqué fait) — le mécanisme choisi est le réglage, pas une commande "charger un
         fichier de référence".
      Tests : nouveaux tests unitaires (`smartart-embed.test.ts`, `parser.test.ts` pour le point 1
      voisin ci-dessous), `smartart-dispatch.test.mjs` (note conditionnelle + warnings sur stderr),
      `cli.test.mjs` (résumé stdout, contenu du `.log`, réglage de référence honoré/replié),
      `exportService.test.ts` (warningCount/logPath). l10n : nouvelles chaînes traduites dans les
      5 bundles (`fr`/`de`/`es`/`ru`/`zh-cn`) + `package.nls.*.json`. Monorepo entier revérifié vert
      (build/typecheck/lint/213 tests). **Hors scope, non tenté** : hover provider + CodeLens
      conditionnel (spec §10.1), commentaire Word natif en canal secondaire (spec §10.3, la spec le
      marque optionnel).
- [ ] Traducteur `.pptx` de production (spec Google Slides §5-§7) — pas commencé, en attente de la
      vérification manuelle Google Slides/PowerPoint listée ci-dessus.
- [x] **Catalogue complet des layouts SmartArt (2026-09-03)** — `docs/smartart-layout-catalog.md`,
      ~150 layouts (source : Microsoft Support "All SmartArt graphics, described") classés par
      pertinence pour un flowchart Mermaid. Deux pistes concrètes identifiées, non encore spikées :
      `Labeled Hierarchy`/`Horizontal Labeled Hierarchy` (correspond exactement à l'idée
      "subgraph = hiérarchie libellée" notée par le mainteneur, potentiellement plus fidèle
      sémantiquement que le bricolage §5 actuel — le titre du `subgraph` deviendrait une étiquette
      de niveau, pas un nœud fictif) ; et les layouts "convergents" (`Converging Arrows`,
      `Converging Text`, `Funnel`, `Random to Result Process`) pour lever la limitation "fusion
      après branchement", la plus citée dans tout ce chantier — aucun des deux n'a d'échantillon
      Word réel extrait à ce jour, contrairement à `hierarchy1`/`hierarchy2`.
- [x] **Piste "subgraph = hiérarchie libellée" testée, cas général écarté (2026-09-03)** — le
      mainteneur a construit l'échantillon Word réel demandé (`docs/smartart-samples-wishlist.md`) :
      l'étiquette de `Labeled Hierarchy` s'applique par niveau de profondeur, pas par branche —
      confirmé impossible de donner une étiquette différente à deux branches de même profondeur
      dans l'UI Word. Ne couvre donc que le cas restreint "tous les nœuds d'une même profondeur
      appartiennent au même `subgraph`", pas le cas général. Détail dans `spike.md` Round 6,
      `docs/smartart-layout-catalog.md`.
- [ ] **Nouvelle piste "subgraph = `Nested Target`" (2026-09-03)** — cercles concentriques,
      containment réel, mieux motivée que `Labeled Hierarchy` (voir catalogue). Pas encore de
      générateur ni d'échantillon Word analysé — échantillon demandé dans
      `docs/smartart-samples-wishlist.md`, en attente.
- [x] **Piste définitivement close (2026-09-03, `spike.md` Round 7, 3 essais réels indépendants)** :
      `subgraph` = boîte-titre existante + diagramme SmartArt réel intégré via `wpc:graphicFrame`.
      Idée : réutiliser la boîte de titre de sous-graphe déjà produite par `ooxml-translator.ts` et
      y intégrer un diagramme `chain`/`tree`/`cycle` déjà livré, sans parier sur un layout de
      galerie précis. **Trois hypothèses distinctes testées dans un vrai Word, le même échec dur à
      chaque fois** ("erreur lors de l'ouverture du fichier", convertisseur de récupération) :
      (1) construction initiale (mauvais préfixe `wpc:`/`a:` sur les enfants de `graphicFrame`),
      (2) préfixe corrigé en `wpg:` (vérifié contre un exemple Word réel, pas deviné) — échec
      identique, (3) `wpg:` + enveloppe `mc:AlternateContent`/`mc:Choice[Requires="wpg"]` (motif
      standard des vrais documents Word pour ce type d'extension) — échec identique une troisième
      fois. `wpc:wpc`/`wps:wsp` seuls ne posent aucun problème (déjà utilisés massivement par le
      traducteur de production, vérifié dans un vrai Word) — le problème est spécifique à
      `wpc:graphicFrame` portant un diagramme. Cause exacte non isolée plus finement (chaque
      hypothèse testée était plausible et sourcée, pas une supposition en l'air) mais 3 échecs
      identiques sur 3 pistes indépendantes suffisent à clore sans quatrième essai à l'aveugle.
      `Nested Target` reste la piste active pour `subgraph`.
- [ ] **Une fois plusieurs générateurs SmartArt (chain/tree/cycle) validés bout-en-bout** — tâche
      demandée explicitement par le mainteneur (2026-09-03), à faire avant d'aller plus loin sur les
      diagrammes de séquence/l'add-in : télécharger les normes de référence (CommonMark, GitHub
      Flavored Markdown, syntaxe Mermaid flowchart) et construire un **tableau de compliance/
      couverture complet** comparant 3 stratégies de sortie — SmartArt seul, SmartArt+OOXML hybride
      (l'approche actuelle : classifieur puis fallback `wpg:wgp`), OOXML seul (le pipeline
      `wpg:wgp` existant, sans SmartArt). **Chaque hypothèse et chaque limitation prise doit
      apparaître dans le tableau** (ex. : plafond de profondeur 2 pour `tree.ts` — voir
      `MAX_TREE_DEPTH`, disqualification systématique des `subgraph`, fusion après branche non
      supportée par SmartArt, etc.) — objectif explicite : permettre à un successeur de décider en
      connaissance de cause s'il change de stratégie de représentation (voir piste subgraph
      ci-dessus), vise le 100 % de couverture en SmartArt seul moyennant de nouvelles
      stratégies/limitations, ou garde l'approche hybride actuelle. **État de la condition de
      gating (2026-09-03)** : `chain` et `tree` sont désormais tous deux validés bout-en-bout (XML
      + rendu LibreOffice réel, pas seulement tests unitaires) ; `cycle` reste à faire — condition
      pas encore entièrement remplie.
- [x] **Tableau de compliance livré (2026-09-03)** — `docs/markdown-mermaid-compliance-table.md`, sur
      demande explicite du mainteneur, **avant** que la condition de gating ci-dessus soit
      entièrement remplie (`cycle` toujours pas fait) — priorité mainteneur qui prime sur l'ordre
      initialement prévu. Sources téléchargées et citées : CommonMark 0.31.2, GFM 0.29, doc Mermaid
      flowchart (branche `develop`, fonctionnalités jusqu'à v11.17.0). Ligne à ligne, 3 colonnes
      (SmartArt seul / hybride / OOXML seul), chaque case explique le mécanisme et ses limites (pas
      de simple ✅/❌), conformément à la demande. **Découverte notable au passage, non corrigée
      (hors scope de cette tâche)** : le parseur ne retire jamais les guillemets englobants d'un
      texte de nœud écrit `id["texte"]` — la syntaxe pourtant recommandée par Mermaid pour
      l'Unicode et les caractères spéciaux — les guillemets apparaissent donc littéralement dans le
      texte final, dans les 3 stratégies (`id["Hello World"]` → label `"Hello World"` guillemets
      compris, vérifié empiriquement ; `id[Hello World]` sans guillemets → label propre). Idem pour
      les codes d'entité Mermaid (`#quot;`, `#9829;`), `<br/>`, et les "Markdown Strings"
      (backticks + `**gras**`) : aucun n'est interprété, tous restent littéraux. À corriger dans
      `parser.ts` séparément — bug de parseur, pas lié au choix SmartArt/OOXML. (Guillemets et
      codes d'entité corrigés le jour même, plus bas dans ce fichier ; `<br/>`/Markdown strings
      d'abord dégradés en texte plat le jour même aussi, puis en vrais runs riches — voir l'entrée
      "Rich-text runs" tout en haut de ce fichier, 2026-09-04.)
- [x] **Poussée vers le 100% sur la colonne SmartArt seul (2026-09-03, sur demande explicite du
      mainteneur, à l'aide de `docs/smartart-layout-catalog.md`)** — quatre améliorations, chacune
      vérifiée par rendu LibreOffice réel avant d'être considérée faite (pas seulement par test XML,
      leçon du bug `chain.ts` découvert plus tôt dans la session) :
      1. **Libellé d'arête implémenté** : la convention spec §5.2 ("Oui : texte") n'était que
         documentée jusqu'ici — `chain.ts`/`tree.ts`/`cycle.ts` la mettent maintenant réellement en
         œuvre (préfixe au texte du nœud destination).
      2. **Couleur par nœud (`classDef`) implémentée** — découverte clé : un override
         `a:solidFill` sur le `dgm:spPr` du point de **contenu** (pas un point de présentation, où
         ADR 0004 "Round 5" l'avait trouvé sans effet) rend correctement sous LibreOffice. Testé la
         même façon pour la **forme** (`a:prstGeom`) : confirmé sans effet, non implémenté.
      3. **Direction (`TD`/`LR`) prise en compte** : `chain.ts` choisit entre un `layoutDef`
         horizontal (`lin` par défaut) et vertical (`<dgm:param type="linDir" val="fromT"/>`) ;
         `tree.ts` entre racine-en-haut et racine-à-gauche (inversion des contraintes
         `w`/`h`/`t`/`l` + `linDir` sur la rangée d'enfants). Avant ce correctif, aucun des deux
         générateurs ne lisait `flowchart.direction`.
      4. **`cycle.ts` livré** — `packages/core/src/smartart/cycle.ts`, `generateCycle()` exporté.
         Utilise `dgm:alg type="cycle"` (vocabulaire public ECMA-376, celui du "Basic Cycle" intégré
         de Word, mais `layoutDef` auto-écrit — voir `docs/smartart-layout-catalog.md`). **A
         fonctionné au premier essai empirique** (4 nœuds correctement répartis en cercle), sans le
         bug de géométrie qui avait bloqué `tree.ts` — bonne surprise de la session. Les 3 topologies
         du classifieur (chain/tree/cycle) ont donc désormais chacune leur générateur validé.
      18 nouveaux tests unitaires au total (110 → 128 dans `packages/core`) : `smartart-cycle.test.ts`
      (9) + ajouts aux suites chain/tree existantes. `docs/markdown-mermaid-compliance-table.md` mis à jour
      en conséquence. Monorepo entier
      revérifié vert (build/typecheck/lint/128 tests core + 5 pandoc-filter + 23 vscode-extension).
      **Volontairement pas tenté** : override de forme par nœud (confirmé sans effet, voir point 2) ;
      `Labeled Hierarchy` pour `subgraph` et layouts "convergents" pour la fusion après branchement
      (tous deux nécessitent un vrai échantillon Word extrait par le mainteneur, pas quelque chose
      qui peut être fait à l'aveugle) ; profondeur d'arbre adaptative > 2 (chantier de conception à
      part entière, pas une extension incrémentale).
- [x] **Bug des guillemets englobants corrigé (2026-09-03)** — `stripQuotedLabel()` ajouté à
      `packages/core/src/parser/parser.ts`, appliqué au texte de nœud (`parseNodeStatement`,
      `parseNodeRef`) et au libellé d'arête (`parseEdgeStatement`). `id["texte"]` (syntaxe
      recommandée par Mermaid pour l'Unicode) produit désormais un label propre, sans les guillemets
      parasites ; un guillemet interne non englobant reste intact. Priorité maintenue par le
      mainteneur avant toute mise en avant publique du produit. Tests unitaires + vérification par
      rendu LibreOffice réel. `docs/markdown-mermaid-compliance-table.md` §5.3 mis à jour en conséquence.
- [x] **Durcissement du parseur Mermaid — dernier lot, tout est traité (2026-09-04)**
      (`packages/core/src/parser/parser.ts`) — bugs trouvés en construisant
      `docs/markdown-mermaid-compliance-table.md` (2026-09-03), tous vérifiés empiriquement, bénéficiant
      aux **3** stratégies de sortie à la fois (pas spécifique à SmartArt). Le libellé mi-chaîne,
      les arêtes multidirectionnelles/invisibles/chaînage/`&`, et `classDef`/`style`/`linkStyle`
      avaient déjà été traités dans les sessions précédentes (voir plus haut dans ce fichier) ;
      restaient trois trous, tous corrigés aujourd'hui :
      - **`<br/>`, codes d'entité Mermaid, "Markdown Strings"** : `normalizeLabelText()`, un
        nouveau point de passage unique appliqué partout où un libellé quitte `stripQuotedLabel()`
        (nœud, arête, `@{shape: ..., label: ...}`) — `<br/>`/`<br>`/`<br />` devient un espace (pas
        de support multi-ligne côté runs OOXML, donc pas de vrai retour à la ligne possible, mais
        laisser fuir la balise brute n'était pas acceptable non plus) ; les codes d'entité
        (`#9829;` numérique, `#quot;`/`#amp;`/`#lt;`/`#gt;`/`#nbsp;`/`#apos;` nommés) sont décodés
        en le caractère réel ; une chaîne délimitée par des backticks a ses délimiteurs et ses
        marqueurs d'emphase (`**`, `__`, `*`, `_`) retirés plutôt qu'affichés littéralement — pas de
        support de runs riches pour un vrai gras/italique, donc dégradation en texte plat plutôt
        que markup brut. **Le vrai retour à la ligne et les runs gras/italique, dits impossibles
        ici faute de support OOXML, ont depuis été livrés — voir l'entrée "Rich-text runs" tout en
        haut de ce fichier (2026-09-04, punch list item 3) : `normalizeLabelText()` a été remplacé
        par `parseLabel()`, qui produit `labelRuns` en plus du texte aplati.**
      - **Directions `TB`/`BT`/`RL`** : `TB` (alias documenté de `TD`) mappe directement ; `BT`/`RL`
        restent hors du scope V1 (spec §5.1, TD/LR seulement) mais produisent désormais un
        avertissement explicite ("not supported in V1") et retombent sur `TD`, au lieu de tomber
        dans le message générique "Unsupported line ignored" qui n'expliquait rien.
      - **`:::` sur une déclaration de nœud isolée** : `parseNodeStatement()` reconnaît maintenant
        l'`:::` inline comme `parseNodeRef()` le faisait déjà côté arête. Bug **connexe** découvert
        au passage et corrigé dans les deux fonctions : la regex `(.+?):::` exigeait un préfixe non
        vide, donc `A:::crit` (id nu, sans forme) échouait même à une extrémité d'arête malgré le
        commentaire de code prétendant le supporter — `(.*?):::` corrige les deux chemins.
      Vérifié : 7 nouveaux tests unitaires (`parser.test.ts`), suite `core` complète 184/184 (×3
      exécutions, propriétés `fast-check` incluses), `typecheck`/`lint` propres, suite monorepo
      complète 250/250.
      Détail complet avec preuves empiriques dans `docs/markdown-mermaid-compliance-table.md` §5.
- [ ] **Profondeur d'arbre adaptative (> 2)** pour `tree.ts` — le partage de hauteur fixe (35 %
      nœud / 55 % rangée d'enfants) ne peut pas simplement se répéter à un niveau supplémentaire
      sans léser tout nœud sans petit-enfant (voir le commentaire de doc de `MAX_TREE_DEPTH` dans
      `classify.ts` et de `TREE_LAYOUT_XML` dans `tree.ts`). Nécessite un schéma de répartition
      calculé à partir de la forme réelle du sous-arbre (comme le fait `hierarchy1` de Word,
      dynamiquement) plutôt qu'un partage figé — chantier de conception à part entière, pas une
      extension incrémentale du `layoutDef` actuel. Ne nécessite pas d'échantillon Word réel,
      contrairement aux deux items suivants.
- [x] **Spike layouts "convergents" pour la fusion après branchement — écarté avec preuve
      (2026-09-03)**, pas juste par manque de temps. Deux preuves indépendantes, le même jour :
      (1) l'échantillon Word réel de `Converging Arrows` construit par le mainteneur n'a pas
      d'élément "résultat" distinct — le résultat est du texte sur une flèche supplémentaire, pas
      une boîte, alors qu'un nœud de fusion Mermaid réel a toujours son propre texte ; (2) un test
      indépendant du mécanisme `presParOf` lui-même (sur la recette `chain1` déjà éprouvée, sans
      nouvel échantillon Word) montre qu'un point de présentation ne peut avoir qu'un seul parent —
      un second lien `presParOf` vers un point déjà utilisé est silencieusement ignoré par
      LibreOffice, aucun rendu partagé. Conclusion : ni un layout nommé particulier, ni le
      mécanisme sous-jacent, ne semblent supporter une vraie fusion à boîte partagée. Détail complet
      dans `docs/adr/spikes/spike-smartart/spike.md` Round 6. `Funnel` (arité non testée) reste la
      seule variante non vérifiée de cette famille, à reconsidérer seulement si un contre-exemple
      apparaît.
- [x] **Volet "corporate" (2026-09-03)** — décision du mainteneur : un réglage, pas une commande.
      `md2nativedocx.referenceDocument` (VS Code, chemin vers un `.docx` personnalisé, résolu contre
      le dossier de l'espace de travail si relatif) → `MD2NATIVEDOCX_REFERENCE_DOC` →
      `md2nativedocx.mjs` (repli silencieux vers `packages/cli/assets/reference.docx` si le fichier
      est introuvable). Voir l'item "Note de fallback ... réglage de template de référence" plus
      haut dans ce fichier pour le détail complet.

---

## Incident SmartArt "cycle" cassé en Word réel (2026-09-03) — items fermés

Contexte complet et item encore ouvert (cause racine identifiée, pas encore corrigée) : voir
`TODO.md`, section "Incident SmartArt \"cycle\" cassé en Word réel".

- [x] **Mitigation immédiate — SmartArt off par défaut (2026-09-03)** : `smartArtEnabled` dans
      `md2nativedocx.mjs` (`MD2NATIVEDOCX_ENABLE_SMARTART` opt-in, remplace la polarité de
      `MD2NATIVEDOCX_DISABLE_SMARTART` qui reste fonctionnel), `md2nativedocx.smartArt.enabled`
      passé à `default: false` (`package.json` + `extension.ts` + les 6 fichiers `.nls*.json`
      re-traduits). Tests CLI mis à jour (`corpus.test.mjs`) : nouveau test couvrant explicitement
      le défaut off, test existant du chemin SmartArt passé en opt-in explicite. Suite complète
      (`npm run test`) et typecheck extension verts après le changement.
- [x] **Deuxième reproduction, involontaire, du même bug (2026-09-04)** — le `minimal.docx` de
      `test-corpus/word-verification/` (diagramme `A-->B-->C-->A`, un cycle à 3 nœuds, éligible
      SmartArt) refusait lui aussi de s'ouvrir dans Word réel avec le même message d'erreur. Cause :
      ce fichier avait été généré avec SmartArt forcé (`MD2NATIVEDOCX_ENABLE_SMARTART=1`) au lieu du
      défaut réel de la CLI (off), donc dispatché directement dans ce bug non corrigé — pas un
      nouveau bug, juste le même touché par accident via un fixture mal généré. Corrigé en
      régénérant les 5 fixtures `word-verification/` avec les réglages par défaut (voir
      `docs/mvp-acceptance-report.md` §2 et `test-corpus/word-verification/CHECKLIST.md` §1) ; ne
      change rien à l'état de ce chantier (toujours non corrigé, `smartArt.enabled` reste `false`
      par défaut) mais confirme le bug sur un deuxième échantillon indépendant du premier.
- [x] **Cause réelle trouvée et corrigée (2026-09-05)** — détail complet round par round dans
      `docs/adr/0006-dsp-drawing-fallback-spike.md` (9 rounds, 7 tests Word réels). Résumé :
      l'hypothèse initiale (5e partie `dsp:drawing` manquante) s'est révélée **fausse** après test
      réel — trois autres hypothèses structurelles devinées par comparaison manuelle contre
      `handmade_samples/cycle-simple.docx` ont échoué à leur tour (éléments `presOf`/`constrLst`/
      `ruleLst` manquants sur `dgm:layoutNode` ; `adjLst`/`r:blip` manquants sur `dgm:shape` ;
      points de contenu `parTrans`/`sibTrans` absents). La bonne méthode, trouvée en changeant
      d'approche plutôt qu'en devinant une 4e fois : le **SDK Open XML de Microsoft**
      (`DocumentFormat.OpenXml`, .NET, déjà disponible dans ce sandbox) expose `OpenXmlValidator`,
      qui valide contre le même schéma que Word et donne le détail exact de chaque violation.
      Utilisé sur notre propre sortie, il a immédiatement pointé la vraie cause : **`modelId`/
      `srcId`/`destId` est un type union (`ST_ModelId`, ECMA-376 §21.4) qui n'accepte qu'un entier
      non signé ou un GUID, jamais une chaîne libre** — nos trois générateurs utilisaient des ids
      comme `"p-root"`/`"c1"`/`"pp3b"` pour les points de présentation et les connexions (les
      points de contenu, déjà numériques, passaient). Corrigé dans
      `packages/core/src/smartart/{chain,tree,cycle}.ts` (ids remplacés par des entiers
      séquentiels), confirmé sans erreur de schéma restante par le même validateur, sans
      régression LibreOffice/`test:visual`/tests unitaires (2 tests mis à jour, vérifiaient
      littéralement l'ancienne chaîne `"p-root"`). **Confirmé par le mainteneur en vrai Word
      (2026-09-05) : le fichier s'ouvre.** L'incident de corruption est clos. Outil du validateur
      conservé dans `docs/adr/spikes/spike-dsp-drawing/round9-modelid-fix/` — à utiliser en premier
      pour tout futur "Word refuse d'ouvrir le fichier", avant toute comparaison manuelle.
      - **Historique de l'hypothèse initiale (infirmée), gardé pour mémoire** : un échantillon
        Word réel (`handmade_samples/cycle-simple.docx`, Insertion → SmartArt → Cycle simple)
        diffé contre notre sortie avait montré une 5e partie manquante, `word/diagrams/drawingN.xml`
        (`dsp:drawing`, un arbre de formes pré-calculées), faisant penser que Word refusait tout
        `layoutDef` personnalisé sans ce filet de sécurité. Un spike dédié (ADR 0006, rounds 0-1)
        a bien confirmé le câblage exact de cette 5e partie et un comportement LibreOffice
        surprenant (le rendu pré-calculé prime sur l'algorithme en direct une fois présent), mais
        le test Word réel a montré que l'ajouter seul ne suffisait pas — l'hypothèse était fausse,
        la vraie cause était ailleurs (voir ci-dessus).
- [x] **Nouveau bug trouvé en vrai Word une fois la corruption corrigée, corrigé (2026-09-05)** —
      le fichier s'ouvre maintenant, mais `tree` affichait un artefact : la boîte racine ("A")
      montrait aussi une liste à puces des enfants ("• B • C • D") **en plus** des 3 vraies boîtes
      B/C/D déjà correctement affichées en dessous. **Root cause, un angle mort méthodologique
      important, pas juste un bug isolé** : `level1Main`/`level2Main` déclaraient
      `<dgm:presOf axis="desOrSelf" .../>` dans le `layoutDef`. LibreOffice n'exécute jamais
      `forEach`/`presOf` en direct (il affiche seulement le miroir de présentation qu'on a
      pré-calculé à la main dans `data.xml`, ADR 0004 "Round 5") — donc cette ligne n'a **aucun
      effet visible sous LibreOffice**, quelle que soit sa valeur. Le vrai Word, lui, sait
      résoudre `forEach`/`presOf` dynamiquement, et évalué en direct sur la racine,
      `axis="desOrSelf"` correspond à la racine **et à tous ses descendants** — d'où le texte des
      3 enfants qui se retrouve mélangé dans la boîte de la racine. Un `level2Main` (feuille, donc
      sans descendant à ce jour) ne montrait rien d'anormal par comparaison, mais la même ligne y
      est tout aussi incorrecte en principe (latent, pas encore visible tant que
      `tree.ts` reste limité à la profondeur 2). **Corrigé** : `axis="self"` à la place, dans les
      3 générateurs (`chain.ts`/`cycle.ts` avaient la même ligne, jamais visiblement buggée faute
      de vraie imbrication parent-enfant dans leur modèle de données, mais corrigée quand même —
      `axis="self"` est la sémantique correcte partout, pas seulement celle qui ne plantait pas).
      **Implication plus large, à retenir pour la suite du chantier SmartArt** : toute la suite de
      tests actuelle (`test:visual`, LibreOffice) est structurellement aveugle à cette classe de
      bug — un défaut de requête `presOf`/`forEach` dynamique ne peut être détecté que par un vrai
      test dans Word, jamais par le rendu LibreOffice ni par le validateur de schéma (ce n'est pas
      une violation de schéma, c'est une sémantique de requête mal choisie). **En attente de
      re-confirmation en vrai Word** (fichiers régénérés remis au mainteneur) avant de considérer
      ce point clos.
      - **Signalé au passage, pas traité maintenant** : `chain`/`cycle` n'ont toujours pas de
        connecteurs dessinés entre les boîtes (limite déjà documentée dans leurs propres doc
        comments) et le style visuel général (couleurs plates `accent1`) ne ressemble pas à un
        SmartArt "vanilla" créé à la main dans Word (dont les quickstyles par défaut ont souvent
        des dégradés/effets 3D) — décision délibérée liée à la licence (ADR 0004 : ne pas
        redistribuer les quickstyles/styles réels de Microsoft), pas un oubli. À rouvrir
        séparément si le mainteneur veut investir dans un rendu plus proche du natif, plutôt que
        mélangé à ce correctif.

---

## Phase 8 — Personnalisation de l'export (détail complet)

Contexte et pointeur depuis `TODO.md` : section "Phase 8 — Personnalisation de l'export + panneau
de configuration VS Code". Cadrage complet : `docs/specs/export_customization_SPEC.md`.

- [x] **Lot 1 (sous-ensemble solide) — réglages de mise en page/typo via `reference.docx` généré
      dynamiquement (2026-09-05)** : 1.1-1.8 + 1.14 (format/orientation/marges, polices titre+corps,
      taille, interligne, justification, couleur d'accent) livrés et vérifiés en rendu réel
      (LibreOffice headless). 1.11 (style de tableau, sous-spécifié dans la spec) et 1.13 (pied de
      page numéroté, demande une nouvelle partie `word/footer*.xml` + relation + content-type type
      `injectSmartArtParts`) restent **hors scope de cette passe**, fast-follow explicite du même
      Lot 1 — pas une régression de périmètre, décidé avec le mainteneur avant de commencer. **1.13
      livré séparément le même jour, voir entrée dédiée juste en dessous.** 1.11 reste ouvert,
      fusionné avec le Lot 6 (optionnel) faute de presets concrets à choisir.
      - Nouveau module `packages/cli/src/referenceDocBuilder.mjs` : même pattern
        `execFileSync('unzip'/'zip', [...])` que `postprocess.mjs` — **aucune nouvelle dépendance
        npm**. Fonctions pures testables séparément (`resolvePageSize`/`resolveMargins`/
        `resolveLineSpacing`/`patchTheme`/`patchStyles`/`patchSectPr`) + orchestrateur
        `buildReferenceDoc()` qui ne patch que les parties XML réellement concernées par les
        options données (pas de réécriture globale), retourne `null` (no-op) quand rien n'est réglé.
      - **Validé empiriquement avant d'écrire le module** (le point le plus risqué du plan) : Pandoc
        `--reference-doc` reprend bien tel quel le `<w:sectPr>` du gabarit fourni (testé avec des
        valeurs custom distinctives, round-trippées via un vrai `pandoc`) ; les styles `BodyText`/
        `FirstParagraph` que Pandoc applique aux paragraphes réels n'écrasent pas `w:line`/`w:jc`,
        donc patcher `w:docDefaults` dans `styles.xml` suffit à propager interligne/justification
        au corps de texte généré.
      - **Dépendance cachée `MAX_DRAWING_CX`/`MAX_DRAWING_CY` (spec §2.4) rendue dynamique** —
        escaladé et confirmé avec le mainteneur avant de le faire (changement de l'API publique de
        `packages/core`, voir AGENTS.md → "Escalate to a human") : `TranslateOptions` gagne deux
        champs optionnels additifs `maxDrawingCx`/`maxDrawingCy` (EMU), défaut inchangé si absents.
        Câblage bout en bout : CLI calcule la zone utile réelle (page × orientation × marges) via
        `resolveMaxDrawingExtentEmu()`, la passe par `MD2NATIVEDOCX_MAX_DRAWING_CX`/`_CY` (même
        convention qu'un env var par réglage, comme `MD2NATIVEDOCX_SMARTART_DIR`) au subprocess
        Pandoc, que `md2nativedocx-core.mjs` (le pont Lua→core, un par bloc `` ```mermaid ``) relit
        et transmet à `translateToOoxml()`. Scope volontairement limité au pipeline flowchart
        (`ooxml-translator.ts`) — les 3 types non-flowchart (`quadrant`/`venn`/`mindmap`,
        `translator/canvas.ts`) gardent leur propre constante figée, non touchée par cette passe.
      - **Conflit avec `md2nativedocx.referenceDocument` custom (spec §2.1/§5, option (a) confirmée
        avec le mainteneur)** : un gabarit custom gagne toujours, les réglages Lot 1 sont
        silencieusement ignorés pour lui (on ne connaît pas sa mise en page). Note info (pas un
        warning compté — préfixe `md2nativedocx (info): ` distinct du `md2nativedocx: ` que
        `extractWarnings` compte) écrite côté CLI ; dupliquée côté extension VS Code
        (`outputChannel`, car le stderr du CLI n'est lu qu'en cas d'échec, jamais sur un export
        réussi) pour rester visible dans les deux cas d'usage.
      - VS Code : 11 nouveaux réglages `md2nativedocx.layout.*`/`md2nativedocx.typography.*`
        (`package.json` + `package.nls.json`, anglais uniquement — pas de traduction dans les 5
        locales existantes, gap connu, fallback anglais standard de VS Code). `extension.ts` lit
        chaque réglage via `.inspect()` (pas `.get()`) pour ne transmettre au CLI que ce que
        l'utilisateur a **explicitement** touché — sinon la valeur par défaut du schéma (ex. `A4`)
        aurait été envoyée à chaque export, changeant silencieusement le comportement par défaut de
        tous les utilisateurs existants (aujourd'hui : page size implicite de Word/Pandoc, jamais
        A4 forcé). **Suivi noté pour le Lot 4** (panneau Activity Bar/Sidebar, pas encore construit) :
        griser les réglages Lot 1 dans le panneau custom quand `referenceDocument` est fourni,
        demandé par le mainteneur en même temps que la confirmation de l'option (a) — pas
        implémentable avant que le panneau lui-même existe.
      - Tests : `packages/cli/test/reference-doc-builder.test.mjs` (25 tests, fonctions pures +
        `buildReferenceDoc` intégration réelle unzip/zip), 3 nouveaux tests bout-en-bout dans
        `cli.test.mjs` (env vars → `.docx` réel, re-scaling du diagramme sous petite page, conflit
        `referenceDocument`), 2 nouveaux tests `packages/core` (`maxDrawingCx`/`maxDrawingCy`
        override + défaut inchangé si omis). 391 tests au total sur le monorepo (64 cli + 291 core +
        11 pandoc-filter + 25 vscode-extension), tous verts ; `test:visual` 35/35 à 0,000 % de diff
        (comportement par défaut prouvé strictement inchangé) ; lint + typecheck propres partout.
      - Assumption non vérifiée en vrai Word, flaguée comme telle (même catégorie que l'Aptos/
        `packages/cli/assets/README.md`) : les valeurs twips des presets de marges (`normal`
        notamment, 2,5cm/1417 twips — la valeur que la spec elle-même énonce, pas forcément celle
        qu'un vrai Word en locale métrique écrit pour son propre preset "Normales").
- [x] **Lot 1 fast-follow — 1.13 pied de page avec numéro de page, livré (2026-09-05)** (spec
      §1.13) : `md2nativedocx.layout.footerPageNumber`/`MD2NATIVEDOCX_FOOTER_PAGE_NUMBER`, patch du
      `reference.docx` généré (pas du `.docx` final).
      - **Vérifié empiriquement avant d'écrire le code, comme pour le Lot 3** : contrairement à
        `settings.xml` (qui n'est PAS repris, voir Lot 3 ci-dessous), Pandoc reprend bel et bien tel
        quel un pied de page (partie `word/footer1.xml` + relation + `w:footerReference` dans
        `sectPr`) fourni via `--reference-doc` — testé avec un canari (`PAGE` field), confirmé
        survivant dans le `.docx` généré et rendu correctement par LibreOffice. Donc, à la
        différence du TOC, ce réglage patch bien le gabarit (`referenceDocBuilder.mjs`), pas le
        document final — et suit la même règle de conflit que les autres réglages du Lot 1 (ignoré
        silencieusement si `referenceDocument` custom fourni), sans garde-fou spécial à ajouter.
      - Nouvelles fonctions pures `patchRelsForFooter()`/`patchContentTypesForFooter()` +
        constante `FOOTER_PAGE_NUMBER_XML` (un champ `PAGE` centré minimal) dans
        `referenceDocBuilder.mjs`, `patchSectPr()` étendu avec un paramètre `footerRId` optionnel
        (élément `w:footerReference` en premier enfant de `sectPr`, ordre confirmé contre un vrai
        `sectPr` traité par Pandoc, pas juste lu dans le schéma). `nextRelationshipId()` calcule le
        premier `rIdN` libre plutôt qu'un id fixe — `reference.docx` a déjà `rId1`-`rId8` plus un
        `rId30` décoratif (hyperlien externe dans son contenu de démonstration, jamais atteint la
        sortie réelle) qui aurait collisionné avec un id naïf comme `rId9`.
      - **Piège rencontré et déjà documenté ailleurs dans le code, retrouvé ici** : `unzip` traite
        `[Content_Types].xml` comme un motif glob (classe de caractères) et échoue silencieusement
        ("filename not matched") sans échappement — même piège que celui déjà noté dans
        `postprocess.mjs`'s `injectSmartArtParts` (2026-09-03), corrigé de la même façon
        (`\[Content_Types\].xml` côté `unzip`, littéral côté `zip`).
      - 1.11 (style de tableau) reste seul hors scope du Lot 1, faute de presets concrets à choisir
        dans la spec — fusionné avec le Lot 6 (optionnel) ci-dessous plutôt que de deviner un
        catalogue de styles.
      - Tests : 9 nouveaux `reference-doc-builder.test.mjs` (fonctions pures + intégration
        `buildReferenceDoc({footerPageNumber:true})` réelle unzip/zip vérifiant la cohérence
        partie/relation/content-type/sectPr), 1 `cli.test.mjs` bout-en-bout. 418 tests au total,
        tous verts ; `test:visual` 35/35 inchangé.
- [x] **Lot 2 — rendu couleur des emoji/badges, mécanique livrée (2026-09-05)** (spec §1.15,
      §2.5) : `postprocess.mjs` gagne `forceEmojiColorFont()`, appliquée par défaut dans
      `postProcessDocx()` (réglage `md2nativedocx.emoji.forceColorFont`/`MD2NATIVEDOCX_EMOJI_FONT`,
      défaut actif, `=0`/`false` désactive).
      - **Écart avec la description initiale de la spec, trouvé en vérifiant contre un vrai
        `pandoc`** : Pandoc met une phrase entière mélangeant texte et emoji dans un **seul**
        `<w:r>` (pas un run par caractère) — forcer la police sur le run entier aurait aussi changé
        la police du texte normal environnant. Implémenté à la place : découpage aux frontières de
        *graphème* (`Intl.Segmenter`, ES2018+, aucune dépendance ajoutée) — pas caractère par
        caractère, un emoji est souvent plusieurs points de code (base + sélecteur de variation
        `⚠️`, ou séquence ZWJ) qu'il ne faut pas séparer. Classification par
        `\p{Extended_Pictographic}` (répond à la question "liste précise à établir" que la spec
        laissait ouverte) + cas spécial pour les paires d'indicateurs régionaux (drapeaux, aucune
        des deux moitiés n'est `Extended_Pictographic` seule). Gras/italique du run d'origine
        préservés sur les deux segments (texte et emoji) ; seul le segment emoji reçoit
        `w:rFonts`, inséré en premier enfant de `w:rPr` (ordre exigé par le schéma `CT_RPr`) plutôt
        qu'ajouté en fin. Portée volontairement limitée aux runs de forme exacte `<w:r>(<w:rPr>...)?
        <w:t>texte</w:t></w:r>` (celle que Pandoc émet réellement, vérifié) — tout le reste (run
        avec `<w:drawing>`, plusieurs `<w:t>`, etc.) laissé intact plutôt que deviné.
      - **Validation empirique multi-étapes, pas juste unitaire** : ①  d'abord testé dans ce
        Codespace (aucune police emoji installée par défaut) → tofu (glyphes manquants) identique
        avec et sans le patch — pas une régression du patch, juste l'absence totale de police emoji
        dans ce sandbox. ② `fonts-noto-color-emoji` installé ad hoc dans la session (comme
        LibreOffice/Xvfb en leur temps, voir plus bas dans ce fichier) + alias fontconfig temporaire
        `Segoe UI Emoji` → `Noto Color Emoji` (mécanisme identique à
        `test-corpus/visual/fontconfig/fonts.conf`) : rendu réel confirmé — ✅/⚠️/❌ en couleur,
        texte environnant et gras intacts. Confirme que le levier OOXML (forcer `rFonts`) est le
        bon ; ne remplace pas un vrai test **Word** (toujours "à tester", voir décision du
        mainteneur ci-dessus) puisque la substitution de police y est différente (Windows a
        nativement Segoe UI Emoji, macOS/Linux dépendent d'une substitution non garantie).
      - Confirmé sans impact sur le rendu des diagrammes Mermoid eux-mêmes : le texte des formes
        DrawingML utilise `a:t`/`a:r` (pas `w:t`/`w:r`), hors du scope du regex — `test:visual`
        35/35 à 0,000 % de diff après ce changement.
      - Tests : 8 nouveaux `postprocess.test.mjs` (fonction pure + intégration
        `postProcessDocx({emojiFont})`), 1 `cli.test.mjs` bout-en-bout (défaut actif + opt-out).
        410 tests au total, tous verts.
- [x] **Lot 3 — sommaire automatique (TOC), livré (2026-09-05)** (spec §1.10, §2.2) :
      `MD2NATIVEDOCX_TOC`/`MD2NATIVEDOCX_TOC_DEPTH` → `--toc`/`--toc-depth=N` Pandoc, plus
      `<w:updateFields w:val="true" />` dans `settings.xml` (sinon TOC visible vide jusqu'à F9).
      - **Piège trouvé et corrigé en vérifiant empiriquement, pas juste écrit d'après la spec** :
        contrairement à `sectPr`/`theme1.xml`/`styles.xml` (confirmés repris tels quels du
        `reference.docx` par Pandoc, voir Lot 1 ci-dessus), Pandoc **synthétise son propre
        `word/settings.xml` à partir de rien** — un canari inséré dans le `settings.xml` du
        `reference.docx` ne survit pas dans le `.docx` généré, testé et confirmé. Le patch
        `updateFields` a donc dû être déplacé de `referenceDocBuilder.mjs` (qui patch le gabarit
        *avant* Pandoc, inutile ici) vers `postprocess.mjs` (qui patch le `.docx` *final*, déjà
        son rôle établi). Conséquence positive inattendue : le TOC fonctionne donc pleinement même
        avec un `referenceDocument` custom (`settings.xml` patché est celui de Pandoc, pas celui du
        gabarit) — pas besoin du garde-fou "ignoré si custom" du Lot 1 pour ce lot.
      - **Deuxième écart trouvé par rendu réel** : Pandoc place toujours le champ TOC tout en haut
        du corps, avant le titre — alors que la spec demande explicitement le placement "sous le
        H1", et Pandoc n'a pas de flag pour ça. Corrigé par `repositionTocAfterTitle()`
        (`postprocess.mjs`) : déplace le bloc `<w:sdt>` du TOC juste après le premier paragraphe
        `Heading1` (chirurgie XML ciblée par regex, même niveau que les corrections déjà
        appliquées à `document.xml` dans ce module) ; laisse le TOC à sa position Pandoc par
        défaut plutôt que de le supprimer si aucun H1 n'est trouvé.
      - Vérifié par rendu LibreOffice réel (PNG + PDF) : le champ TOC apparaît bien après le titre,
        mais son contenu reste vide ("Table of Contents" sans entrées) — LibreOffice n'évalue pas
        le champ à l'export headless, contrairement à un vrai Word qui, avec `updateFields`,
        proposera/effectuera la mise à jour à l'ouverture. **Confirmé depuis en vrai Word** (voir
        `TODO.md`, section "Retours en attente de clarification") : les entrées se peuplent
        correctement après "Activer la modification" (mode protégé).
      - Tests : 3 nouveaux tests `postprocess.test.mjs` (`repositionTocAfterTitle` pur + intégration
        `postProcessDocx({ toc: true })` réelle unzip/zip), 3 `reference-doc-builder.test.mjs`
        (`patchSettings` pur), 2 `cli.test.mjs` bout-en-bout (TOC placé après le H1 + fonctionne
        avec un `referenceDocument` custom). VS Code : `md2nativedocx.toc.enabled`/`.toc.depth`.
        401 tests au total, tous verts ; `test:visual` 35/35 inchangé.
- [x] **Lot 4 — panneau de configuration Activity Bar + Sidebar, livré (2026-09-05)** (spec §3) :
      nouveau View Container (icône = `icon.svg` existant, réutilisé tel quel — un SVG à formes
      pleines convient au masquage monochrome de l'Activity Bar, pas besoin d'une icône dédiée) +
      Webview View (`registerWebviewViewProvider`), réglages groupés pédagogiquement.
      - **Portée volontairement réduite à ce qui existe réellement** : seuls 4 groupes construits
        (Mise en page, Typographie, Structure du document — TOC + pied de page, Emoji &amp;
        badges, Avancé) — pas de groupe "Tableaux en paysage" (1.9, Lot 5 pas commencé) ni de
        contrôles pour le style de tableau/numérotation des titres (1.11/1.12, jamais spécifiés
        concrètement) : un toggle pour un réglage inexistant serait un contrôle mort, contraire au
        principe "zéro config inutile" d'`UX_SPEC.md`. Pas une réduction de scope improvisée — la
        spec elle-même place le Lot 4 après les Lots 1-3 précisément pour cette raison ("le
        panneau ne fait qu'exposer des réglages qui doivent déjà exister").
      - **Séparation logique pure/glue vscode**, même philosophie que `mermaidBlocks.ts` +
        `extension.ts` : `packages/vscode-extension/src/configPanelHtml.ts` (aucun import
        `vscode`, `buildConfigPanelHtml()` testable en `node:test` sans Extension Development
        Host) construit tout le HTML ; `configPanel.ts` (le `WebviewViewProvider`) ne fait que
        lire/écrire `vscode.workspace.getConfiguration('md2nativedocx')` et appeler la fonction
        pure. Écoute `vscode.workspace.onDidChangeConfiguration` pour rester synchronisé si les
        réglages changent ailleurs (settings.json natif) — aucune double source de vérité (§3.4).
      - **"Pas de texte dupliqué entre les deux surfaces" (§3.2) implémenté littéralement**, pas
        approximé : `configPanel.ts` relit directement `package.nls.json` (via
        `context.extensionUri`) et sert exactement les mêmes chaînes `markdownDescription` que
        `contributes.configuration` en tooltip (backticks/liens markdown légèrement nettoyés pour
        un `title` HTML natif, pas de rendu markdown tenté). Un tooltip qui divergerait du texte du
        panneau natif `Ctrl+,` serait un vrai bug de cohérence, pas juste une redite.
      - **Sécurité** : CSP stricte (`default-src 'none'`, script nonce, aucune ressource externe —
        même logique que "jamais de relation OOXML externe" appliquée ici à un webview) ; toute
        valeur libre affichée (police, couleur, chemin du gabarit custom) est échappée en HTML
        avant insertion — testé explicitement par injection XSS (`<script>` dans un champ police).
      - Grisage des contrôles Lot 1 (mise en page/typo, y compris le pied de page) quand
        `md2nativedocx.referenceDocument` est fourni, TOC/emoji restant actifs — demandé par le
        mainteneur en même temps que la confirmation de l'option (a) lors du Lot 1.
      - Aperçu Niveau 1 (mini-page CSS : format/orientation/marges/police/taille/interligne/
        justification, recalculé côté client à chaque changement) — pas de tentative pour
        1.9/1.15, conforme à la recommandation propre de la spec §3.3.
      - **Vérifié en Extension Development Host réel** (`xvfb-run`, déjà installé ad hoc dans
        cette session — aucune modif `.devcontainer/`), pas seulement en test unitaire : le
        container/la vue se déclarent avec les bons ids, et le webview se résout sans exception
        une fois révélé (`workbench.view.extension.md2nativedocx` puis
        `md2nativedocx.configView.focus`). Aucune vérification visuelle à l'œil possible dans ce
        sandbox (pas d'UI VS Code interactive) — reste à faire manuellement.
      - Escalade `AGENTS.md` traitée : point d'entrée ajouté à `docs/specs/UX_SPEC.md` (tableau
        "Points d'entrée", Partie 1) plutôt que laissé implicite.
      - Tests : 12 nouveaux `configPanelHtml.test.ts` (fonctions pures — groupes, échappement XSS,
        grisage conditionnel, cohérence `describe()`), 2 nouveaux `test/suite/extension.test.ts`
        (réels). 430 tests unitaires + 7 tests Extension Development Host au total, tous verts ;
        `test:visual` 35/35 inchangé.
- [x] **Lot 5 — tableaux en section paysage dédiée, livré (2026-09-05)** (spec §1.9, §2.3) :
      spike dédié réalisé d'abord (`docs/adr/0005-landscape-table-section-spike.md`), puis option
      (a) de ce spike implémentée en entier (solution complète, pas le périmètre réduit (b)).
      - Piège documenté par la spec **confirmé et précisé par rendu réel** (pas juste lu) : le
        paragraphe inséré avant le `Header` porte les réglages **portrait** (ceux de la section qui
        se termine là), celui inséré après le `Table` porte les réglages **paysage** (ceux de la
        section qui vient de s'ouvrir) — l'inverse d'une lecture littérale naïve de "bascule avant
        le Header". Nouveau filtre Lua `Pandoc(doc)` (lookahead direct `Header`→`Table`, blocs non
        adjacents = hors scope assumé) — `md2nativedocx.lua` doit maintenant retourner **une liste
        de deux filtres** (`{mermaid_filter, landscape_table_filter}`) plutôt qu'un seul jeu de
        fonctions globales : un `Pandoc(doc)` défini dans la même table qu'un `CodeBlock` ferait
        ignorer ce dernier par Pandoc (comportement documenté de l'API Lua, pas un bug) — piège non
        prévu par le spike, trouvé en écrivant l'implémentation réelle.
      - **Piège supplémentaire du spike (section vide = page blanche) corrigé sans logique de
        fusion côté Lua** : le filtre émet la paire portrait/paysage indépendamment pour chaque
        `Header`→`Table` trouvé, sans essayer de fusionner les paires contiguës ni de détecter la
        fin de document — deux nouvelles fonctions pures dans `postprocess.mjs`
        (`collapseAdjacentSectionBreaks`/`collapseTrailingLandscapeSection`) nettoient les deux cas
        généralement, après coup, sur le XML final. Un paragraphe ne portant qu'un `sectPr` est une
        forme que Pandoc lui-même n'émet jamais (confirmé), donc reconnaissable sans ambiguïté.
        **Bug trouvé et corrigé pendant l'implémentation (pas anticipé par le spike)** : la première
        version de ces regex utilisait une capture `[\s\S]*?` non bornée pour le contenu du
        `sectPr`, qui a **avalé un `Header`+`Table` entier** en cherchant la *prochaine* occurrence
        du motif de fermeture au lieu de la sienne propre — `.docx` corrompu, trouvé en testant
        vraiment le pipeline CLI de bout en bout (pas juste en lisant le XML). Corrigé en restreignant
        la capture aux seuls enfants auto-fermants (`<w:pgSz/>`/`<w:pgMar/>`), qui ne peuvent
        structurellement jamais contenir un `<w:p>`/`<w:tbl>` imbriqué.
      - **Dépendance cachée trouvée en testant le pipeline réel (pas dans le spike)** : le paragraphe
        "retour au portrait" a besoin de connaître le format de page *réellement* actif — le laisser
        par défaut (aucun réglage Lot 1 touché) exposait un vrai bug : le filtre suppose A4 (le
        défaut de ce projet) alors que le `reference.docx` non patché de Pandoc retombe sur son
        propre défaut Letter/A4 dépendant de l'environnement, désynchronisant silencieusement les
        sections portrait du reste du document. Corrigé : activer `landscapeTables` seul (sans
        toucher page/marges) force maintenant un `sectPr` explicite A4/marges normales dans le
        `reference.docx` généré (`referenceDocBuilder.mjs`, `buildReferenceDoc`) — **changement de
        comportement réel et assumé, pas silencieux** : un utilisateur voulant un autre format doit
        combiner ce réglage avec ceux du Lot 1, comme n'importe quel autre réglage de ce lot déjà.
      - Câblage : `MD2NATIVEDOCX_LANDSCAPE_TABLES` + 6 variables d'env de géométrie (page/marges en
        twips, même convention que `MD2NATIVEDOCX_MAX_DRAWING_CX`/`_CY`) transmises au filtre Lua ;
        réglage VS Code `md2nativedocx.layout.landscapeTables` (groupé avec le reste du Lot 1 pour
        la règle de conflit `referenceDocument`, pas avec TOC/emoji), exposé dans le panneau Lot 4
        (groupe "Mise en page") — la doc-comment de `configPanelHtml.ts` qui excluait spécifiquement
        1.9 de ce panneau ("pas de contrôle pour un réglage qui n'existe pas encore") mise à jour en
        conséquence.
      - Tests : 9 nouveaux `postprocess.test.mjs` (incluant un test de non-régression sur le bug de
        capture ci-dessus), 4 nouveaux `filter.test.mjs` (bout-en-bout via un vrai `pandoc`), 1
        `reference-doc-builder.test.mjs`, 4 `cli.test.mjs` (les 3 scénarios du spike + le défaut
        off), 2 `configPanelHtml.test.ts`. 449 tests unitaires + 7 tests Extension Development Host
        au total, tous verts ; `test:visual` 35/35 à 0,000 % de diff (comportement par défaut prouvé
        strictement inchangé) ; lint + typecheck propres partout.
- [x] **Panneau de config redesigné + 2 nouveaux réglages + un vrai bug corrigé (2026-09-06)** —
      retour du mainteneur après la passe Lot 1-5 ci-dessus (`A3` manquant, polices en texte libre
      sans suggestion, `justify` sans `right`/`center`, sélecteur de couleur peu convivial,
      structure plate sans repli).
      - **Bug réel trouvé en creusant "peut-on ajouter d'autres couleurs personnalisables ?"** :
        `accentColor` ne patchait que `theme1.xml` (`a:accent1`) — chaque style qui référence cette
        couleur (`Heading1`-`9`, `Hyperlink`) garde en plus un `w:val` littéral de secours
        (`w:themeColor="accent1" w:val="4472C4"`), jamais mis à jour. Confirmé par rendu réel
        (couleurs de pixels échantillonnées, pas juste l'XML relu) : **LibreOffice ignore
        purement et simplement le thème patché et affiche l'ancien bleu** pour les titres et les
        liens — un vrai défaut préexistant, pas juste un risque théorique, découvert en implémentant
        la demande du mainteneur plutôt que signalé par lui. Corrigé
        (`referenceDocBuilder.mjs`'s nouvelle `patchAccentColorFallbacks()`) : réécrit le `w:val` de
        tout `w:color` référençant `themeColor="accent1"`, y compris les variantes `themeShade`
        (`Title`/`TOCHeading`) — celles-ci perdent leur teinte plus foncée calculée par Word
        (simplification documentée : reproduire exactement l'algorithme de shade de Word n'a pas été
        tenté) mais restent cohérentes avec la couleur choisie plutôt que de rester bleu. Reverifié
        par rendu réel après fix : titres + lien hypertexte bien dans la couleur custom.
      - **`A3` ajouté** à `layout.pageSize` (`PAGE_SIZES_TWIPS.A3 = {w:16838,h:23811}`, valeur
        standard).
      - **`justify` étendu** à `right`/`center` (en plus de `left`/`both`) — `patchStyles()`
        généralisé (un seul `JUSTIFY_VALUES` set plutôt qu'un `if === 'both'` en dur).
      - **Nouveau réglage `typography.tableHeaderColor`** (hex, vide = pas de remplissage) — patch
        le `<w:tblStylePr w:type="firstRow">` du style de table `Table` par défaut de Pandoc (déjà
        présent avec juste une bordure basse, jamais de remplissage) via un nouveau `<w:shd>`.
      - **Panneau (`configPanelHtml.ts`) redesigné** : "Réglages rapides" toujours visibles en haut
        (macro "modèle de police" — 4 presets Word 2007/2016/2025/LibreOffice qui posent
        `headingFont`+`bodyFont` ensemble ; macro "mise en page" — 4 presets page+orientation+marges
        ; pastilles de couleur d'accent cliquables) + chaque groupe (Mise en page/Typographie/
        Structure/Emoji/Avancé) devient un `<details>` replié par défaut avec son propre bouton
        "Réinitialiser cette section", plus un bouton global "Tout réinitialiser" — les deux
        n'écrivent que `undefined` sur les clés concernées (`configPanel.ts`'s nouveau message
        `reset`) et laissent le mécanisme déjà existant (`onDidChangeConfiguration` → re-rendu
        complet du panneau) faire le travail de rafraîchissement, pas de re-synchronisation DOM
        manuelle nécessaire. Police (titre/corps) : liste déroulante de polices courantes
        Word/LibreOffice + une option "Personnalisé…" qui révèle le champ texte existant (jamais
        une liste validée — ni ce poste ni, surtout, la machine qui ouvrira le `.docx` plus tard, ne
        peut être interrogée sur ses polices installées). Couleur d'accent et couleur d'en-tête de
        tableau : champ hex existant conservé + `<input type=color>` natif (zéro dépendance) +
        pastilles d'exemple, les 3 synchronisés en JS. Nouveau bouton "Parcourir…" pour
        `referenceDocument` (`vscode.window.showOpenDialog`, filtré `.docx`) plutôt qu'un chemin
        tapé à la main.
      - **Délibérément pas fait, demande explicite du mainteneur d'en garder trace séparément** :
        une couleur personnalisable pour le fond des boîtes de sous-graphe dans les diagrammes
        (`SUBGRAPH_FILL`/`SUBGRAPH_LINE`, `packages/core/src/translator/ooxml-translator.ts`) —
        toucherait l'API publique de `packages/core`, même catégorie d'escalade que
        `maxDrawingCx`/`maxDrawingCy` en son temps (voir plus haut dans ce fichier). Pas commencé.
      - **Aussi pas fait, hors du périmètre demandé cette passe** : le manque de multilinguisme du
        panneau lui-même (labels codés en dur en français, indépendants de la langue de VS Code) et
        des réglages Phase 8 dans les 5 `package.nls.<locale>.json` traduits (0 occurrence de
        `layout.pageSize` etc. trouvée en grep) — diagnostiqué cette session, chantier à part vu sa
        taille (traduire 5 fichiers + apprendre à `configPanel.ts` à préférer
        `package.nls.<locale>.json` à `package.nls.json` quand il existe), pas inclus dans cette
        passe.
      - Tests : `packages/cli/test/reference-doc-builder.test.mjs` (+8 tests : A3 dans la boucle
        `resolvePageSize`, `justify` right/center, fix `accentColor`/shaded variants,
        `tableHeaderColor`, idempotence), `packages/vscode-extension/test/unit/configPanelHtml.test.ts`
        (+8 tests : détails repliés + boutons reset, A3/right/center, presets police/page avec
        reverse-match vers "custom", dropdown police avec champ manuel conditionnel, couleur d'en-tête
        de tableau, bouton Parcourir). Vérifié aussi par rendu réel LibreOffice (pas juste les tests
        unitaires) : accentColor sur titre+lien, tableHeaderColor, justify=right, pageSize=A3, tous
        corrects sur un export réel. 471 tests monorepo au total (112 cli + 293 core + 15 pandoc-filter +
        51 vscode-extension), tous verts ; lint + typecheck propres partout.
      - **Reste à faire** : re-vérification en vrai Word demandée au mainteneur (voir
        `test-corpus/word-verification/CHECKLIST.md` "Round 2", en particulier le préréglage de
        marges "moderate" contre le vrai preset Word).

---

## CI/CD & environnement (détail complet)

- [x] `.github/workflows/ci.yml` : typecheck + lint + test (unit/golden) + `npm audit`
      (fail high/critical) + secret scan + CodeQL. `test:visual` sur schedule/release branches
      (flag explicite du trade-off).
- [x] `.github/workflows/codeql.yml` : SAST GitHub natif.
- [x] `.devcontainer/devcontainer.json` : provisioning Pandoc/Lua/LibreOffice, synchronisés
      avec `ci.yml`. Pandoc 3.1.3 et Lua 5.4 sont **version-pinnés** ; LibreOffice est installé
      depuis le repo apt (limitation documentée dans `setup.sh` — voir tâche de suivi ci-dessous).
      ⚠️ Toute modif de `.devcontainer/`/`.vscode/` = revue humaine obligatoire (voir
      AGENTS.md → Codespaces). PR séparée, **non mergée**.
- [x] **Validateur Open XML SDK adopté comme pratique standard (2026-09-05)** — ADR 0007, suite à
      l'incident SmartArt (ADR 0006). `scripts/oxml-validator/` (wrapper C# autour de
      `DocumentFormat.OpenXml.Validation.OpenXmlValidator`, sortie `--json`) +
      `npm run test:oxml-validate` (`scripts/test-oxml-validate.mjs`, dégradation propre si
      `dotnet` absent, même motif que `test:visual`/`test:extension-host`). Documenté dans
      `AGENTS.md` ("Diagnosing 'Word won't open the file'") et `TESTING.md` (8e chapitre).
      **Hors scope, tracé séparément ci-dessous** : les 17 erreurs de schéma préexistantes dans
      `packages/cli/assets/reference.docx` (`styles.xml`/`numbering.xml`/`settings.xml` —
      trouvées par le validateur, déjà tolérées par Word aujourd'hui, sans lien avec l'incident
      SmartArt).
- [x] **Investigation des erreurs de schéma préexistantes — classées "pas notre bug", fermé
      (2026-09-06)** : root-cause isolée en deux temps maintenant que `dotnet` est disponible dans
      ce sandbox (PR #7 mergée, voir ci-dessous). (1) `dotnet run -- packages/cli/assets/
      reference.docx --json` seul (sans passer par un export réel) : 8 erreurs, toutes dans
      `styles.xml`/`settings.xml` (jamais dans `document.xml` du fichier généré — le corps de
      `reference.docx` n'est de toute façon jamais copié dans la sortie, seuls
      `theme1.xml`/`styles.xml`/`settings.xml`/`numbering.xml` le sont). (2) Comparé au
      `reference.docx` **vanilla** de Pandoc lui-même (`pandoc --print-default-data-file
      reference.docx`, aucune modification de ce projet) : **les 8 mêmes erreurs y sont déjà
      présentes à l'identique** (`w:b`/`w:i`/`w:spacing`/`w:tcBorders`/`w:qFormat` mal ordonnés
      dans `styles.xml`, `w:doNotTrackMoves` mal ordonné dans `settings.xml`). Confirmé une
      deuxième fois avec un export **complètement nu** (`pandoc list.md -o list.docx`, zéro
      `--reference-doc`, zéro code de ce projet impliqué) : mêmes styles.xml, plus en prime le
      `w:nsid` de `numbering.xml` à la mauvaise longueur hexBinary et le `w:pStyle` mal ordonné
      dans les `w:pPr` des items de liste — Pandoc **synthétise ces éléments lui-même** au moment
      de générer une liste numérotée, indépendamment de tout `reference.docx`. **Conclusion : la
      totalité des erreurs `test:oxml-validate` rapporte hors `/word/diagrams/` viennent du
      générateur `.docx` de Pandoc lui-même (bug/quirk amont, présent même à vide), pas de ce
      dépôt.** Pandoc génère des millions de `.docx` ouverts sans souci dans Word depuis une
      décennie malgré ça — tolérance confirmée en pratique, pas juste supposée. Item fermé sans
      changement de code : patcher `reference.docx` pour masquer un défaut de Pandoc serait hors
      du périmètre documenté dans `packages/cli/assets/README.md` ("ne pas toucher à autre chose
      que `theme1.xml`/`styles.xml` `docDefaults`/headings") et referait courir le risque déjà
      vécu sur l'incident SmartArt (réordonner de l'XML à la main sans se tromper). À rouvrir
      seulement si Pandoc lui-même publie un fix upstream à absorber, ou si un vrai test Word
      détecte un jour un problème concret (aucun signalé à ce jour).
- [x] **Suivi — PR #7 `.devcontainer`/`ci.yml` pour le SDK `.NET` : mergée (2026-09-06)**. `.NET
      10.0.200` disponible dans ce sandbox — a permis l'investigation ci-dessus. Ancien texte
      (préservé pour mémoire) : branche
      `devcontainer/add-dotnet-sdk`, **PR #7** sur GitHub, en attente de revue humaine. `.NET
      10.0.200` (pinné) ajouté à `.devcontainer/setup.sh` via `dotnet-install.sh` officiel (même
      approche tarball OS-indépendante que Pandoc, pas un paquet apt comme LibreOffice) +
      `actions/setup-dotnet@v4` dans `ci.yml` + `npm run test:oxml-validate` câblé dans le job
      principal.
- [x] **Auto-provisioning `.NET` en production, implémenté et vérifié (2026-09-05)** (ADR 0007
      partie D) : `packages/vscode-extension/src/dotnetProvisioner.ts` (miroir de
      `pandocProvisioner.ts`, manifeste construit à partir des métadonnées de release
      **officielles** de Microsoft, jamais inventées — empreintes SHA-512, pas SHA-256 comme
      Pandoc, trouvaille faite en inspectant un vrai téléchargement), `scripts/
      bundle-oxml-validator.mjs` (empaquette notre DLL validateur *framework-dependent*, ~8,3 Mo,
      dans le `.vsix`), câblage dans `packages/cli/bin/md2nativedocx.mjs`
      (`runWordCompatibilityCheck()`, section dédiée du `.log`, opt-in via
      `MD2NATIVEDOCX_OXML_VALIDATOR_DLL`, jamais un échec d'export si indisponible), réglage
      `md2nativedocx.wordCompatibilityCheck.enabled` (défaut `true`, exposé aussi dans le panneau
      Lot 4). **Vérifié bout en bout dans un environnement sans aucun `.NET`** (`env -i`) :
      téléchargement + vérification SHA-512 + exécution réelle du DLL, `errorCount: 0` correct.
      458 tests du monorepo verts, lint/typecheck propres, `test:visual` 35/35 inchangé. Reste à
      faire par le mainteneur : confirmation finale sur une vraie machine sans `.NET` via
      l'extension packagée, une fois la PR `.NET` (ci-dessus) fusionnée pour pouvoir construire le
      DLL au moment du `npm run package`.
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
      **Preuve empirique trouvée (2026-09-04, voir l'entrée "Corpus visuel" plus haut)** : dans
      l'environnement de cette session, `node scripts/test-visual.mjs` échoue sur 11/24 fixtures
      préexistantes (2 à 9 % de pixels différents) contre leurs baselines déjà commitées, alors
      qu'aucune régression de code ne les touche ; inspection visuelle de `decision` montre la même
      géométrie mais une police différente (plus épaisse/serif dans la baseline commitée) — exactement
      le scénario "environnement de rendu différent" que cette tâche anticipait sans preuve jusque-là.
      Reste à trancher (pinning ou non) ; en attendant, ne pas faire confiance à un échec `test:visual`
      isolé comme preuve de régression sans comparaison visuelle directe.
- [x] **Drift des baselines visuelles corrigé (2026-09-04) — pas par pinning LibreOffice, par pinning
      des polices de substitution.** Root cause affinée : ce n'est pas la version de LibreOffice qui
      variait mais la police de repli choisie pour les familles que `reference.docx` déclare et
      qu'aucune distro Linux ne fournit (`Aptos`/`Aptos Display` dans le thème actuel ; `Calibri`/
      `Cambria` dans d'anciens `reference.docx`) — cette substitution dépend de fontconfig et de
      l'ordre d'énumération des polices installées, qui diffère d'un environnement à l'autre même à
      version LibreOffice identique. Preuve trouvée en comparant visuellement `decision` et
      `long-labels` : l'ancienne baseline (police de repli plus large) tronquait carrément le texte
      dans les boîtes ("Choix" → "Choi", une ligne de `long-labels` coupée) — donc ce n'était pas
      qu'un problème cosmétique, la police de repli non pinnée provoquait un vrai bug de rendu
      (débordement/troncature) sur certaines fixtures. Fix : `test-corpus/visual/fontconfig/fonts.conf`
      (nouveau fichier, commité) force `Aptos`/`Aptos Display`/`Calibri`→`Liberation Sans` et
      `Cambria`→`Liberation Serif` via une règle fontconfig `<match>`, chargé uniquement pour le
      sous-processus `soffice` que lance `scripts/test-visual.mjs` (`FONTCONFIG_FILE`, n'affecte pas
      la config système). Liberation Sans/Serif est une dépendance apt automatique de
      `libreoffice-writer` sur Debian **et** Ubuntu (vérifié) — aucune installation de police
      supplémentaire nécessaire dans `setup.sh`/`ci.yml`, donc aucune modification en zone
      d'escalade (`.devcontainer/`). Les 32 baselines régénérées avec `--update-baseline` (24
      d'origine + 8 fixtures ajoutées depuis) ; `test:visual` repasse maintenant à 0,000 % de diff
      sur les 32/32, déterministe. La tâche "pinning LibreOffice" ci-dessus reste ouverte en tant que
      telle (aucune preuve que la *version* de LibreOffice elle-même dérive, seulement la police) —
      mais elle n'est plus urgente : la substitution de police pinnée absorbe la cause réelle
      observée jusqu'ici.
- [x] `test:visual` : rendu LibreOffice headless → export image → pixel-diff avec seuil, corpus
      20–30 diagrammes (du 3-nœuds au 50-nœuds avec sous-graphes) — 32 fixtures actuellement.

---

## Incident `quadrantChart`/`venn-beta`/`mindmap` cassés en Word réel (2026-09-06) — détail complet

Round 2 de la checklist `test-corpus/word-verification/` (retour du mainteneur, vrai Word Windows) :
les 3 items 7/8/9 échouent — `quadrant.docx`/`venn.docx`/`mindmap.docx` refusent tous de s'ouvrir
("Word a rencontré une erreur lors de l'ouverture du fichier"). Ces 3 types sont **activés par
défaut** (contrairement à SmartArt) — c'était donc un vrai bug de corruption par défaut pour
n'importe quel utilisateur exportant l'un de ces 3 diagrammes, découvert seulement maintenant car
`test:oxml-validate` (l'outil construit précisément pour ce genre de "Word refuse d'ouvrir le
fichier", voir l'incident SmartArt ci-dessus) n'avait **jamais tourné sur leur propre sortie** —
seulement sur SmartArt et 2 fixtures flowchart (`minimal`/`decision`).

- [x] **Cause trouvée et corrigée le jour même** — `dotnet run --project scripts/oxml-validator --
      quadrant.docx --json` a immédiatement pointé la vraie cause (même méthode que l'incident
      SmartArt : validateur d'abord, comparaison manuelle jamais). `<w:jc>` (WordprocessingML,
      `ST_Jc`) recevait des codes courts façon DrawingML (`l`/`ctr`/`r`) au lieu des valeurs longues
      exigées (`left`/`center`/`right`) — confusion entre les deux vocabulaires d'alignement dans
      `packages/core/src/diagrams/{quadrant,venn,mindmap}/translator.ts`. LibreOffice ne valide
      aucun schéma donc ne voyait rien ; Word rejette le fichier entier. Corrigé : `venn.ts`/
      `mindmap.ts` (toujours centré) passent directement à `"center"` ; `quadrant.ts` (alignement
      variable) gagne une table `WORD_JC` qui traduit les 3 codes courts. Reconfirmé par le
      validateur (0 erreur sous `wpc:wpc`, contre 13/8/18 avant) et par rendu LibreOffice réel (35/35
      `test:visual`, 2 baselines mises à jour pour un micro-décalage de texte désormais correctement
      aligné). 3 nouveaux tests de non-régression (un par module) qui vérifient qu'aucun `<w:jc>`
      émis n'est autre chose qu'une valeur `ST_Jc` valide.
- [x] **Angle mort méthodologique corrigé, pas juste le bug lui-même** — `scripts/
      test-oxml-validate.mjs` élargi : (1) `quadrant`/`venn`/`mindmap` ajoutés à
      `PLAIN_FIXTURE_NAMES` (tournent maintenant à chaque `npm run test:oxml-validate`/CI comme
      SmartArt et les 2 fixtures flowchart) ; (2) surtout, la classification "sortie de ce projet vs
      bruit Pandoc" ne filtrait que `/word/diagrams/*` (les parties SmartArt) — **le canevas OOXML
      simple (`wpc:wpc`), utilisé par flowchart ET les 3 nouveaux types, est inline dans
      `document.xml`** et aurait été classé silencieusement comme "bruit Pandoc préexistant, juste
      affiché, jamais en échec" par l'ancien filtre. Élargi à `e.Path.includes('wpc:wpc')` en plus de
      `/word/diagrams/`. Vérifié en rejouant le bug (translators non corrigés, stash temporaire) :
      l'ancien filtre laissait passer le test, le nouveau le fait échouer avec 13/8/18 erreurs
      listées — preuve que ce garde-fou aurait attrapé le bug avant tout envoi au mainteneur.
      **Répond directement à la remarque du mainteneur** ("rendre le check dotnet par défaut...
      pour identifier les soucis") de façon plus robuste qu'un flag CLI par défaut : c'est maintenant
      dans la suite automatisée, ne dépend plus de la discipline d'un développeur qui penserait à
      lancer la commande.
- [ ] **Suivi — pourquoi le check de compatibilité Word (`wordCompatibilityCheck.enabled`) n'a pas
      attrapé ça avant l'envoi** : son défaut `true` ne s'applique qu'à l'extension VS Code
      empaquetée (qui fournit son propre chemin de DLL) — le CLI nu (utilisé pour générer ces
      fixtures) ne lance jamais le check tant que `MD2NATIVEDOCX_OXML_VALIDATOR_DLL` n'est pas
      positionné à la main. Le point ci-dessus (élargissement de `test:oxml-validate`) couvre le cas
      qui a réellement mordu cette fois ; reste une question ouverte séparée, pas encore tranchée :
      faire aussi tourner le check par défaut dans le CLI nu en phase de dev (auto-détection d'un
      `dotnet`/validateur déjà construit localement, sur le même principe que l'auto-provisioning
      Pandoc) — plus lourd (un `dotnet build` à chaque export) et pas encore évalué comme
      rentable face au coût.

---

## Retours en attente de clarification — détail complet (checklist Round 2, 2026-09-06)

- [x] **Emoji pas tous coloriés en vrai Word — hypothèse initiale infirmée par une revue plus
      large, vraie cause probablement hors de portée côté `.docx` (2026-09-06)** : le fix U+FE0F
      (ci-dessous, conservé mais requalifié) reposait sur une corrélation à 4 échantillons
      (✅/❌ monochromes, ⚠️/🚀 en couleur) qui semblait pointer vers "sélecteur de présentation
      manquant". Une revue de 31 symboles en vrai Word (demandée par le mainteneur, table dédiée
      `test-corpus/word-verification/emoji-review.docx`) **infirme cette hypothèse** :
      `✔️`/`✖️` (U+2714/U+2716) portaient déjà U+FE0F dans le texte source d'origine et restent
      monochromes quand même — la preuve que le sélecteur seul ne force pas la couleur de façon
      fiable dans cette combinaison Word/Segoe UI Emoji. Le vrai partage empirique observé :
      **restent monochromes** = `✅` U+2705, `❌` U+274C, `✔` U+2714, `✖` U+2716, `⭐` U+2B50,
      `☑` U+2611 (+ les séquences keycap, lacune déjà connue séparément) ; **tout le reste testé
      s'affiche en couleur**, y compris plusieurs symboles du *même bloc Unicode* que `☑`
      (`☀`/`☁`/`⚠`/`⚙`/`✈`/`☎`/`⚡`, tous dans Miscellaneous Symbols U+2600-U+26FF). Aucune propriété
      Unicode interrogeable depuis le code (bloc, `Default_Emoji_Presentation`, présence de
      sélecteur) n'explique ce partage précis — tout indique une liste figée, probablement décidée
      par Microsoft lui-même, de symboles hérités de l'ère Wingdings (coches/croix/étoile/case à
      cocher, utilisés couramment comme puces de liste fonctionnelles dans des documents bureautiques
      plutôt que comme emoji expressifs) volontairement gardés monochromes — pas un bug de
      résolution de police que ce projet peut corriger depuis la sortie `.docx`. Le fix U+FE0F est
      **conservé** (inoffensif, texte Unicode plus explicite/correct dans l'absolu) mais son
      commentaire de code et la description du réglage `emoji.forceColorFont` ont été corrigés pour
      ne plus prétendre qu'il règle ✅/❌/✔/✖/⭐/☑ — il ne le fait pas, d'après les tests réels à ce
      jour.
      **Recherche web faite (2026-09-06), pas de contournement propre trouvé** : confirme le
      mécanisme général (U+FE0F force la présentation emoji, U+FE0E force le texte — Unicode
      classe bien `✔`/`✖`/`☑` comme "texte par défaut sauf sélecteur explicite", mais `✅`/`⭐`
      sont documentés comme "couleur par défaut", donc leur rendu monochrome ici est *encore plus*
      hors norme), mais rien de spécifique à "générer du `.docx` par programme" ne donne de
      contournement propre. Une piste existe (insérer ces symboles via la police Wingdings/Segoe
      UI Symbol à un point de code "Private Use Area" plutôt que le caractère Unicode standard —
      documentée pour un usage manuel dans Word, `support.microsoft.com`) mais **délibérément pas
      retenue** : remplacerait un texte Unicode portable/copiable/accessible par un mapping
      police-dépendant et fragile, pour un problème purement cosmétique sur une poignée de
      symboles hérités — coût jugé disproportionné par rapport au bénéfice. **Fermé comme
      limitation documentée**, pas de suivi prévu sauf si une piste plus propre apparaît.
      Sources consultées : [Emoji Variation Selector — CodeJam](https://www.codejam.info/2021/11/emoji-variation-selector.html),
      [Check mark sometimes black/white, sometimes green — Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5150507/check-mark-is-sometimes-in-black-and-white-and-som),
      [Insert a check mark symbol — Microsoft Support](https://support.microsoft.com/en-us/office/insert-a-check-mark-symbol-9f39c129-236e-45be-8c91-263b43dc1e1a).
- [x] **La boîte de dialogue "champs qui peuvent faire référence à d'autres fichiers"** : confirmé
      par le mainteneur — en cliquant "Activer la modification" (le fichier étant en mode protégé
      car téléchargé), la boîte de dialogue de mise à jour des champs apparaît et **le TOC se peuple
      correctement**. Comportement standard de Word (mode protégé + `updateFields`), pas un bug —
      fermé.
- [x] **Le TOC restait vide au premier lancement** — résolu par la clarification ci-dessus : le
      "vide au lancement" constaté la première fois correspondait au mode protégé (avant le clic sur
      "Activer la modification"), pas à un échec du mécanisme d'auto-rafraîchissement lui-même, qui
      fonctionne bien une fois la modification activée. Fermé, pas de bug.



---

# Instantané de `TODO.md` avant la purge du 2026-10-06

> `TODO.md` a été réduit le 2026-10-06 à un backlog d'items réellement ouverts. Son contenu
> d'avant la purge est recopié ci-dessous tel quel (titres décalés d'un niveau), pour que tout
> lien ou souvenir vers une ancienne section retrouve son texte. Certains items y sont marqués
> ouverts alors qu'ils ont été réglés depuis : la liste à jour est dans `TODO.md`, le bilan de
> couverture dans `docs/coverage.md`.

> Plan de travail vivant, aligné sur `docs/specs/cahier_des_charges.md` (le **quoi/pourquoi**) et `AGENTS.md`
> (le **comment**). Ce fichier reflète l'état réel du repo à la date de dernière mise à jour.
> Cochez les cases au fur et à mesure. Toute tâche qui touche à l'API publique de
> `packages/core`, ajoute une dépendance, ou assouplit une règle de sécurité doit être
> **escaladée à un humain** avant d'être considérée faite (voir `AGENTS.md` → "Escalate to a human").
>
> Pour une synthèse courte de l'état actuel + prochaines actions (pas le détail complet
> ci-dessous) : `HANDOVER.md`. Pour le détail complet des chantiers fermés (root-cause,
> preuves empiriques, décisions de conception) : `docs/history/TODO_ARCHIVE.md`.

---


### Phase 0 — spikes résolus

Entièrement redondant avec la version structurée ci-dessous ("Phase 0 — Spike technique") et les
ADR 0001/0002 — condensé dans `docs/history/TODO_ARCHIVE.md`.

---

### Historique condensé (2026-08-06 → 2026-09-04)

> Détail complet de chaque chantier fermé ci-dessous (root-cause, preuves empiriques, captures
> d'écran référencées, décisions de conception) : `docs/history/TODO_ARCHIVE.md`, section "État
> actuel (2026-08-06)". Ordre chronologique inverse conservé (le plus récent en premier), comme
> dans le journal d'origine.

- ✅ Restructuration du répertoire de tests, `TESTING.md` écrit en préalable (2026-08-07).
- ✅ Auto-boucle (`A --> A`) : deux bugs de rendu trouvés et corrigés — géométrie dégénérée +
  connecteur auto-référent réécrit par LibreOffice (2026-09-04).
- ✅ Direction de sous-graphe (`direction RL` dans un `subgraph`) : parsée et mémorisée, limite
  Dagre (un seul `rankdir` global pour tout le graphe) documentée et avertie plutôt que silencieuse
  (2026-09-04).
- ✅ Rich-text runs : `<br/>` et Markdown strings (`` **gras** ``/`*italique*`) rendus en vrais runs
  OOXML plutôt qu'aplatis en texte (2026-09-04).
- ✅ Chevauchement de têtes de flèche sur un diagramme mis à l'échelle : corrigé (bascule sur
  l'enum de taille le plus petit une fois l'épaisseur de trait plafonnée) (2026-09-04).
- ✅ Corpus visuel étoffé (formes/arêtes/couleurs étendues, 3 nouvelles fixtures) — a révélé le bug
  de chevauchement de flèches ci-dessus (2026-09-04).
- ✅ `style`/`linkStyle` ajoutés, 3 lacunes `classDef` corrigées au passage (2026-09-04).
- ✅ Syntaxe générique de forme `id@{ shape: nom, label: "..." }` (v11.3+) ajoutée, 18 nouvelles
  formes (2026-09-04).
- ✅ Label mi-chaîne d'arête (`A-- texte -->B`) corrigé (2026-09-04).
- ✅ Trois lacunes du parseur trouvées en testant des diagrammes réels — label multi-ligne, 5
  formes de nœud manquantes, arêtes exotiques (`<-->`, `~~~`, chaînage, `&`) — corrigées
  (2026-09-04).
- ✅ Trois défauts signalés sur `demo.docx` : étiquettes d'arête mal centrées/marges trop serrées,
  double "grand rectangle" (groupe `wpg:wgp` racine supprimé) — corrigés (2026-09-01/02).
- ✅ Scaffold monorepo npm, docs de gouvernance (`AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  templates), environnement Pandoc/Lua dans le Codespace, CI/CD de base, `LICENSE`/`README.md`.
- ✅ `packages/core` (parser + layout Dagre + traducteur OOXML + barrel public), tests
  unitaires/golden/fuzz, `packages/pandoc-filter/`, `packages/cli/` — cœur du MVP.
- ✅ Traducteur conforme aux schémas officiels ECMA-376/MS-OE376, comparé à un document Word réel.
- ✅ Conformité Word — série de corrections (2026-08-07) : namespaces étendus réellement déclarés,
  ids de dessin uniques à l'échelle du document, traducteur redevenu fonction pure, `wp:anchor`→
  `wp:inline`, têtes de flèche/pointillés/épaisseurs de trait effectivement émis, labels d'arête,
  couleur de texte selon luminance du fond, mise à l'échelle des diagrammes trop grands, couleurs
  validées comme hexadécimal, suppression d'un module mort concurrent (`docx-patch.mjs`).
- ❌ `CODE_OF_CONDUCT.md` — **fourni par le mainteneur humain, l'agent ne doit pas en rédiger un.**
- ✅ LibreOffice headless installé dans le Codespace (2026-08-07) — a immédiatement mis au jour 3
  défauts de rendu invisibles à la validation XML structurelle (routage d'arêtes qui sautent un
  rang, titre de sous-graphe superposé, groupe invisible au-delà d'un ratio largeur/hauteur), tous
  corrigés.
- ✅ Premier test manuel dans un vrai Word (2026-09-02) : `mc:Ignorable` référençait 9 préfixes
  sans déclaration `xmlns:` correspondante (Word rejette, LibreOffice tolère) — corrigé, test de
  non-régression ajouté.
- ✅ Nœuds dimensionnés selon leur texte plutôt qu'une taille fixe — corrige aussi la cause racine
  d'un bug de corruption de texte dans les losanges (2026-09-02).
- ✅ Marge basse du texte des formes visiblement plus grande que la marge haute — héritée du
  `w:spacing` par défaut du `reference.docx` de Pandoc, surchargée explicitement (2026-09-02).
- ✅ Connecteurs mal accrochés en horizontal (`flowchart LR`) — indices de site de connexion
  gauche/droite inversés, corrigés et confirmés contre une source faisant autorité
  (LibreOffice/Microsoft `presetShapeDefinitions.xml`) (2026-09-02).

**Deux décisions ouvertes héritées de cet historique, jamais tranchées :**

- [ ] **Lisibilité des gros diagrammes (24 à 318 nœuds dans le corpus, contre ≤ 15 au critère
      MVP)** — piste jamais tranchée avec le mainteneur entre (a) page de taille custom via saut
      de section Word, (b) seuil de nœuds refusé explicitement, (c) pagination/découpage du graphe
      lui-même. **Recoupement avec la Phase 8** (`docs/specs/export_customization_SPEC.md`) : le
      mécanisme de saut de section (`w:sectPr`) qu'il faudrait construire pour (a) est le même que
      celui spécifié pour les tableaux en section paysage dédiée (spec §2.3, Lot 5) — à évaluer
      ensemble plutôt que comme deux chantiers séparés qui réinventeraient la même mécanique OOXML.
- [ ] **Police Aptos (thème Word natif) jamais confirmée dans un vrai Word** — LibreOffice ne peut
      pas la rendre (absente sous Linux), donc les tailles/graisses exactes de `reference.docx`
      restent des hypothèses de reconstruction documentées dans `packages/cli/assets/README.md`,
      pas des certitudes. À vérifier en même temps que le critère d'acceptation MVP "tests manuels
      dans Word réel avant chaque release", déjà ouvert plus bas dans ce fichier.

---

### Phase 0 — Spike technique

- [x] **Trancher Dagre vs Graphviz** — package npm `dagre` installé et utilisé comme moteur par
      défaut (pas de réimplémentation maison). Décision documentée dans `docs/adr/0001-layout-engine.md`.
- [x] **Valider la robustesse du `RawBlock('openxml', ...)`** de Pandoc sur un fragment DrawingML
      groupé complexe (`wpg:wgp`) — test bout-en-bout validé (ZIP valide, XML bien formé, 0
      relation externe). Décision documentée dans `docs/adr/0002-pandoc-integration.md`.
- [x] **Installer les dépendances** : `npm install` à la racine (workspaces).

### Phase 1 — MVP CLI + filtre Pandoc

#### `packages/core` — le moat

##### Traducteur OOXML/DrawingML (`src/translator/`)
- [x] `ooxml-translator.ts` : pixels → EMU (`x × 9525`), génération des formes `<a:prstGeom>`
      selon la matrice §6.1 (rect, roundRect, stadium, diamond, cylinder, ellipse). Étendue
      2026-09-04 à hexagon/parallelogram(Alt)/trapezoid(Alt)/subroutine/doubleCircle — voir
      "Historique condensé" plus haut et `docs/specs/cahier_des_charges.md` §6.1.
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
- [x] 🔮 **Futur-proofing** (voir `docs/specs/FUTURE_docx2mermaid_SPEC.md` §4) — implémenté avec un écart
      assumé par rapport à la spec, tranché avec le mainteneur : `name` reste le label humain sur
      les nœuds (meilleure UX dans le volet Sélection de Word, ce que la spec n'avait pas
      anticipé puisqu'on utilisait déjà `name` ainsi), et l'ID Mermaid d'origine va dans `descr`
      (`cNvPr descr="{id_mermaid}"`), un champ d'accessibilité OOXML déjà standard, invisible
      dans Word. Pour les connecteurs, aucun compromis nécessaire : `name="{id_source}--{id_cible}"`
      comme demandé (le générique `"Connector"` précédent n'avait pas de valeur UX à préserver).

##### Tests (`packages/core/test/`)
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

#### `packages/pandoc-filter/`
- [x] Filtre Lua `md2nativedocx.lua` : `CodeBlock` → `pandoc.RawBlock('openxml', ...)`.
- [x] Appel au module core (binaire/subprocess) — **via `execFile`/`spawn` avec tableau d'arguments,
      jamais de concaténation shell** (règle n°4).

#### `packages/cli/`
- [x] `npx md2nativedocx rapport.md -o rapport.docx` : empaquette l'invocation Pandoc + filtre.
- [x] Gestion des chemins : résolution/validation contre la racine attendue (anti path traversal).
- [x] Erreurs typées (`ParseError`, `TranslationError`) → codes de sortie et messages utiles.

#### Docs & licence
- [x] `LICENSE` : texte légal CC0 1.0 **verbatim** (creativecommons.org/publicdomain/zero/1.0/legalcode).
- [ ] `CODE_OF_CONDUCT.md` : Contributor Covenant (contributor-covenant.org) — **fourni par le
      mainteneur humain, l'agent ne doit pas en rédiger un lui-même.**
- [x] `README.md` complet : tableau de positionnement §12.1 en haut, GIF démo (après Phase 2),
      usage CLI, licence CC0.
- [x] `CONTRIBUTING.md` : mapping §6 comme point d'entrée des contributions externes.

### Phase 2 — Extension VS Code voir aussi docs/specs/UX_SPEC.md

- [x] **`packages/vscode-extension/` scaffoldé et fonctionnel (2026-08-07)**, Partie 1 d'docs/specs/UX_SPEC.md
      au complet : détection automatique des blocs ```` ```mermaid ```` (`src/mermaidBlocks.ts`,
      pur — pas d'API vscode, testable en `node:test` sans Extension Development Host), CodeLens
      "⚙️ Exporter en Word" + "Exporter le bloc seul" au-dessus de chaque bloc
      (`src/codeLensProvider.ts`), pastille de barre de statut redondante avec le CodeLens
      (`src/statusBar.ts`), Palette de Commandes en filet de sécurité, walkthrough d'accueil
      (`contributes.walkthroughs`, 3 étapes), icône `icon.svg` (losange + poignées, rationale dans
      docs/specs/UX_SPEC.md). Les 4 états de l'export (repos/en cours/succès/erreur) implémentés dans
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
    réglages mentionnés dans `docs/specs/cahier_des_charges.md`/`docs/specs/UX_SPEC.md` (choix Dagre/Graphviz,
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
- [x] **Packaging Marketplace réel — fait (2026-09-02)** : `icon.png` (128×128) rastérisé et présent,
      éditeur Marketplace `publisher: "md2nativedocx"` créé, `npm run publish` (`vsce publish
      --no-dependencies --baseContentUrl ... --baseImagesUrl ...`, authentifié via `AZURE_PAT` dans
      `.env`, gitignoré) exécuté avec succès. Deux versions publiées à ce jour, voir
      `packages/vscode-extension/CHANGELOG.md` : **0.1.0** (première version fonctionnelle) et
      **0.2.0** (2026-09-02 — auto-provisioning Pandoc, export Markdown complet sans diagramme
      requis, clic droit Explorer/éditeur, fix des images cassées sur la fiche Marketplace via les
      flags `--base*Url`). README avec démo GIF déjà en place (voir commit `599f4ed`).
- ⚠️ **Démo README désynchronisée du scope réel — 3 nouveaux GIFs préparés, pas encore publiés
      (2026-09-02)** : signalé par le mainteneur, `demo-vscode.gif` (2026-09-01) ne montrait que le
      flux CodeLens, alors que 0.2.0 a ajouté le clic droit, l'export sans diagramme et le `.mmd`
      brut. Trois nouveaux GIFs enregistrés (un par fonction, décision explicite du mainteneur —
      audience plus à l'aise avec Word qu'avec VS Code, donc une légende en langage courant par
      flux plutôt qu'un seul GIF combiné) : `docs/demo-context-menu.gif`, `docs/demo-no-diagram.gif`,
      `docs/demo-raw-mmd.gif` (+ fixtures `docs/demo-no-diagram.md`, `docs/demo-raw.mmd`). README mis
      à jour en conséquence. Process détaillé dans `docs/demo-script.md`. **Volontairement pas
      republié** : décision du mainteneur d'attendre un bundling avec d'autres fonctionnalités
      plutôt qu'un `npm run publish` dédié uniquement à la doc — republication et bump de version à
      faire au moment de ce bundling.
- [ ] **Aperçu (Phase 2.5, docs/specs/UX_SPEC.md)** — pas commencé, prérequis explicitement posé comme
      postérieur au cœur ci-dessus. Rappel de la limite qui ne doit pas être assouplie sans
      décision humaine explicite : lecture seule stricte, aucune interaction d'édition.
- [ ] **Tests manuels dans un vrai VS Code** (pas seulement l'Extension Development Host
      automatisé) — non faits. En particulier : le rendu réel du CodeLens/pastille/walkthrough à
      l'œil, et `vscode.env.openExternal`/`revealFileInOS` depuis un Codespace (censé transiter par
      la machine locale de l'utilisateur via le forwarding VS Code — jamais vérifié en pratique).
- [ ] **Support `.qmd` (Quarto)** — idée loguée le 2026-09-10 (mainteneur). Aujourd'hui
      `activationEvents`/menus contextuels (`package.json`) ne reconnaissent que
      `onLanguage:markdown`/`.md`/`.mmd`. Un `.qmd` est du Pandoc-markdown + frontmatter YAML
      étendu (proche `.Rmd`) — probablement lisible tel quel par le reader `markdown` de Pandoc
      pour la partie texte/diagrammes, mais à vérifier : chunks de code exécutables Quarto
      (` ```{python}`/` ```{r}`, etc.) et frontmatter spécifique (`execute:`, `format: docx: ...`)
      non couverts par notre pipeline actuel — pas juste un ajout d'extension de fichier, un spike
      de compatibilité d'abord.
- [ ] **Clic droit "Exporter en Word" sur l'onglet de l'éditeur** — idée loguée le 2026-09-10
      (mainteneur). Existe aujourd'hui en `explorer/context` (clic droit sur le fichier dans
      l'explorateur) et `editor/context` (clic droit dans le corps du texte) — voir
      `packages/vscode-extension/package.json` `contributes.menus`. Il manque le point de menu
      `editor/title/context` (clic droit sur l'onglet lui-même, en haut du panneau d'édition) :
      même commande (`md2nativedocx.exportDocument`), même condition
      (`resourceExtname == .md || resourceExtname == .mmd`), juste un point de contribution
      supplémentaire — coût attendu faible.

### Phase 3 — Couleurs + sous-graphes

- [x] Mapping `classDef fill:#XXXXXX` → `<a:solidFill><a:srgbClr val="XXXXXX"/></a:solidFill>` (§6.3) —
      déjà livré en Phase 1, case cochée tardivement ici (bookkeeping, aucun code changé).
- [x] `subgraph` → groupes imbriqués `<wpg:grpSp>` avec libellé en `<wps:txbx>` (§6.1), y compris
      l'imbrication à plusieurs niveaux (`subgraphIds` correctement peuplé, réservation d'espace
      de titre récursive — voir entrées 2026-08-07 ci-dessus) — case cochée tardivement ici.

### Phase 4 — Add-in Word (Office.js)

Cadrage fonctionnel (conversion Word↔Markdown, deux modes CLI/Add-in) : `docs/specs/FUTURE_wordextension.md`.
Cadrage technique du sens inverse OOXML→Mermaid (architecture, risques, futur-proofing) :
`docs/specs/FUTURE_docx2mermaid_SPEC.md`. Cadrage de la coquille add-in elle-même (ruban vs menu
contextuel, ce que la plateforme Office.js permet réellement, plan de spikes) :
`docs/adr/0008-word-addin-ribbon-platform-spike.md`. Statut au 2026-09-06 : recherche plateforme
faite, **scaffold codé** (`packages/word-addin/`) — **bloqué sur les 3 spikes ci-dessous, qui
demandent la main du mainteneur dans un vrai Word desktop** (voir "Comment lancer les spikes"
après la liste).

- [x] **Recherche plateforme Office Add-ins faite (2026-09-06)**, décision de pivot prise —
      détail complet et sources : ADR 0008. Résumé : clic droit natif "Copy as MD" **possible**
      (`OfficeMenu id="ContextMenuText"`, mais seulement sur sélection existante) ; clic droit natif
      "Paste MD" **impossible** (pas d'équivalent Word du `ContextMenuCell` d'Excel pour un curseur
      sans sélection) ; entrée native dans "Enregistrer sous" **impossible** (aucun point
      d'extension du manifeste pour ça). **Décision : un ruban dédié** (5 boutons — Charger,
      Enregistrer sous, Couper/Copier/Coller en MD) plutôt que de dépendre du menu contextuel natif,
      qui n'aurait couvert qu'une partie du besoin.
- [ ] **Spike 1 (bloquant, nécessite un vrai Word — pas faisable depuis ce sandbox Linux)** :
      `navigator.clipboard.readText()` fonctionne-t-il de façon fiable depuis un function command
      Office.js dans le vrai Word desktop ? C'est le point de risque n°1 de "Coller en MD". Si non,
      filet de sécurité prévu : boîte de dialogue avec zone de collage manuel (Ctrl+V), réutilisable
      aussi pour "Charger un .md" qui a de toute façon besoin d'un sélecteur de fichier.
- [ ] **Spike 2 (nécessite un vrai Word)** : forme réelle de l'OOXML renvoyé par
      `range.getOoxml()` sur une sélection Word ordinaire (titres/listes/tableaux/gras-italique) —
      condition préalable pour dimensionner le nouveau convertisseur OOXML→Markdown qu'exigent
      "Copier en MD"/"Enregistrer sous .md" (le moteur actuel ne va que dans le sens
      Markdown→OOXML, voir `FUTURE_docx2mermaid_SPEC.md`).
- [ ] **Spike 3 (nécessite un vrai Word)** : rendu/comportement visuel des 5 boutons du ruban dans
      un vrai Word desktop (pas juste Word Online).
- [x] **Scaffold du projet codé (2026-09-06)** : `packages/word-addin/` (nouveau membre du
      workspace npm), généré via `generator-office` (TypeScript, Word, add-in commands) puis
      adapté à la décision de l'ADR — plus de taskpane, un ruban à 6 boutons. Les 3 outils
      d'autonomie retenus sont bien wired-in : `npm run validate` (`office-addin-manifest
      validate`), `npm test` (unitaire via `office-addin-mock`, sans Word — voir
      `test/unit/spikes.test.ts`), `npm run lint`/`typecheck`/`build` (webpack+babel). Le
      validateur `dotnet` (`scripts/oxml-validator/`) n'est pas encore branché : rien ne produit
      d'OOXML tant que "Coller en MD" n'est pas codé, voir l'ordre de construction plus bas.
      Manifeste : 5 boutons de production (`Charger`, `Enregistrer sous`, `Couper`, `Copier`,
      `Coller en MD`) avec des handlers **stub** qui ne font rien d'autre que prouver le câblage
      bout-en-bout (manifeste → `Office.actions.associate` → handler → `event.completed()`) —
      volontairement aucune logique de production tant que les spikes n'ont pas tranché (règle de
      l'ADR §5) — plus un 6ᵉ bouton temporaire `[Dev] Vérifier les spikes` qui exécute les spikes
      1 et 2 et ouvre un panneau copiable (`spike-results.html`) avec le résultat. Icône : mirroir
      horizontal de `packages/vscode-extension/icon.svg` (même diamant scindé graphe/texte, sens
      inversé — ce module va dans le sens texte→graphe).
- [ ] **Spike 3 bis** : confirmer que `npm run lint`/`typecheck`/`test`/`build`/`validate` restent
      verts après toute modification du scaffold (déjà vérifié une première fois le 2026-09-06).
- [ ] **Ordre de construction recommandé une fois les spikes tranchés** : Coller en MD (réutilise
      le moteur existant tel quel, le moins cher) → Copier en MD (bouton ruban + nouveau
      convertisseur OOXML→Markdown) → Couper en MD (extension triviale de Copier) → Enregistrer
      sous/Charger un .md (réutilisent respectivement Copier/Coller à l'échelle du document entier).
      Retirer le bouton `[Dev] Vérifier les spikes` une fois les spikes tranchés et les 5 boutons
      réellement implémentés.

**Comment lancer les spikes (à faire par le mainteneur, vrai Word desktop requis) :**

> **⚠ Outillage retiré le 2026-10-02 (audit npm).** `office-addin-debugging`, `office-addin-dev-certs` et
> `office-addin-manifest` (et les scripts `start`/`stop`/`validate`/`signin`/`signout`) ont été retirés de
> `packages/word-addin` : `node-forge` ≤ 1.4.0 (via `mkcert`, tiré par `dev-certs`) a un advisory « high » sans
> version corrigée, ce qui faisait échouer `npm audit` en CI. `office-addin-mock` est passé en 4.0.1 (tests
> inchangés, 4/4). **Avant de lancer les spikes**, réinstaller ces trois paquets en devDependencies et remettre
> les scripts (voir l'historique git de `packages/word-addin/package.json`), en vérifiant d'abord si un
> `node-forge` corrigé existe. `webpack.config.js` charge `dev-certs` à la demande et donne un message clair s'il
> manque ; `build`, `typecheck` et `test` fonctionnent sans.

```
cd packages/word-addin
npm run start   # office-addin-debugging : trust le certif dev-certs au premier lancement,
                # ouvre Word et sideload l'add-in automatiquement
```

Onglet Accueil → groupe "Md2Docx" → bouton **[Dev] Vérifier les spikes**. Une boîte de dialogue
s'ouvre avec le résultat des spikes 1 (presse-papiers) et 2 (`getOoxml()`), plus un bouton "Copier
tout (JSON)". Pour le spike 3, confirmer à l'œil que les 5 autres boutons s'affichent et répondent
au clic. Reporter les 3 résultats dans `docs/adr/0008-word-addin-ribbon-platform-spike.md` (statut
en tête de fichier + un paragraphe par spike). `npm run stop` arrête le sideloading.

### Phase 5+ — Autres types de diagrammes

- [x] **Cadrage complet écrit (2026-09-04)**, zéro implémentation — voir
      `docs/specs/FUTURE_full_mermaid_coverage_SPEC.md` : taxonomie des 28 types Mermaid restants
      par famille de rendu (extension flowchart quasi-gratuite / graphe nœuds-arêtes / hiérarchique
      / graphique natif / lifeline-chronologie / lanes-grille), prérequis architectural (Phase 0,
      voir point suivant) et priorisation proposée à trancher avec le mainteneur.
- [x] **Bug trouvé en investiguant, pas encore corrigé** : le pipeline n'a aucune notion de type
      de diagramme — `parseMermaid()` tente de lire n'importe quel bloc `` ```mermaid `` comme un
      flowchart. Pour la plupart des 28 autres types, ça échoue proprement (chaque ligne rejetée,
      canevas vide). Mais pour certains (`gitGraph`, `mindmap` testés empiriquement), une syntaxe
      coïncidant par hasard avec une déclaration de nœud flowchart valide (mot nu, `((...))`)
      produit un **faux diagramme silencieux, zéro avertissement** — pire qu'un échec propre.
      Correctif proposé (détection du type de diagramme + note de fallback visible, même mécanisme
      que le fallback SmartArt) : `FUTURE_full_mermaid_coverage_SPEC.md` §4, "Phase 0" — bloquant
      avant tout nouveau type de diagramme, mais a de la valeur dès maintenant indépendamment du
      reste de la roadmap.
- [x] **Couverture 29/29 atteinte (2026-10-02)** — les 28 types restants sont tous livrés :
      `sequenceDiagram` (535aaa8) puis `zenuml` (6c1b724, parseur dédié → même AST et même
      traducteur que sequence). Dernier lot : wardley, eventmodeling, sequence, zenuml.
      **Reste ouvert** : les `.docx` de `test-corpus/word-verification/` pour eventmodeling, sequence
      et zenuml n'ont jamais été ouverts dans un vrai Word ; un cadre de bloc ne s'élargit pas pour
      contenir le texte d'un auto-message ; grammaires sequence/zenuml issues de la doc, non
      vérifiées contre le parseur Mermaid réel. La branche CLI « type non supporté » est désormais
      inatteignable pour les types reconnus.
- [x] **`quadrantChart` shippé (2026-09-04)** — premier type non-flowchart livré, et premier
      module sous `packages/core/src/diagrams/<type>/` (convention §4 item 2 de la spec, appliquée
      pour la première fois plutôt que juste proposée). Voir `docs/smartart-full-catalog-cross-mermaid.md`
      archétype #9 "Matrice" pour le raisonnement : un `quadrantChart` correspond quasiment mot pour
      mot à la catégorie SmartArt Matrix, mais le moteur `dgm:` natif n'apporte rien qu'un simple
      découpage de canevas en 4 rectangles ne fasse déjà — rendu en formes OOXML pures
      (`packages/core/src/translator/canvas.ts`, extrait de `ooxml-translator.ts` pour être
      réutilisable par ce module et les prochains), pas en SmartArt `dgm:layoutDef`. Pas de passe
      Dagre : position calculée directement depuis les `[x, y]` Mermaid. Portée v1 : `title`,
      `x-axis`/`y-axis` (une ou deux étiquettes), `quadrant-1..4`, points avec `color:` optionnel ;
      `radius:`/`stroke-color:`/`stroke-width:`/`classDef` reconnus et ignorés avec avertissement
      (pas de perte silencieuse), aucun n'affecte la position. Vérifié par un export CLI réel +
      rendu LibreOffice headless (pas juste les tests unitaires) — a trouvé et corrigé un vrai
      défaut cosmétique (étiquette d'axe Y repliée sur 2 lignes, marge trop étroite).
- [x] **`venn-beta` shippé (2026-09-04)** — deuxième type non-flowchart livré, même stratégie que
      `quadrantChart` (archétype #11 "Venn" de `docs/smartart-full-catalog-cross-mermaid.md`) :
      formes OOXML pures, pas de `dgm:layoutDef`. Rendu en ellipses `wps:wsp` semi-transparentes
      (alpha 60%) — la couleur des zones de recouvrement vient gratuitement du mélange des cercles
      empilés, aucune géométrie de lentille booléenne calculée à la main. Portée : géométrie de
      recouvrement réelle pour 2 et 3 ensembles (les deux layouts symétriques classiques) ; 4+
      dégrade en rangée sans recouvrement avec une note visible (un vrai Venn N-way proportionnel
      reste un problème géométrique ouvert même pour des outils dédiés). `style` sur une *union*
      (par opposition à un seul `set`) reconnu et averti, pas silencieusement perdu — la couleur de
      recouvrement dérive du mélange des `set` eux-mêmes, pas d'un override indépendant.
      `venn-beta` est un type "New 🔥" Mermaid (grammaire vérifiée superficiellement seulement,
      voir l'avertissement en tête de `FUTURE_full_mermaid_coverage_SPEC.md`) — portée v1 restreinte
      en conséquence : `set`/`union`/`text`/`style fill:`/`title`, `:N` (taille) reconnu et ignoré.
      Vérifié par export CLI réel + rendu LibreOffice headless pour 2, 3 et 4+ ensembles — les
      trois rendent correctement dès la première tentative, aucun bug de géométrie trouvé cette
      fois (contrairement à `quadrantChart`).
- [x] **`mindmap` shippé (2026-09-04)** — troisième type non-flowchart livré, archétype #5
      "Radial" de `docs/smartart-full-catalog-cross-mermaid.md`. Corrige le bug exact qui a motivé
      `FUTURE_full_mermaid_coverage_SPEC.md` §1 : `root((mindmap))` se mal-parsait silencieusement
      en faux nœud flowchart (`((...))` coïncide avec la syntaxe cercle). Formes OOXML pures, pas
      de `dgm:layoutDef` : `chain.ts`/`tree.ts`/`cycle.ts` ne savent explicitement pas dessiner de
      trait de connexion entre formes (limitation documentée) — or les branches d'un mindmap sont
      précisément le point. Layout : arbre radial/ballon calculé (angle = secteur du sous-arbre,
      rayon = palier fixe par profondeur), pas de plafond de profondeur (contrairement à `tree.ts`
      SmartArt, plafonné à 2 par un `layoutDef` à répartition de hauteur fixe). Une topologie
      "étoile" équivalente pour flowchart a été délibérément **pas** ajoutée à `classify.ts` — le
      cas fan-in rend déjà correctement via le pipeline OOXML existant, avec de vrais traits de
      connexion que `chain`/`tree`/`cycle` ne peuvent pas offrir ; voir la note dédiée dans
      `docs/smartart-full-catalog-cross-mermaid.md`.
      **3 vrais bugs trouvés et corrigés par le rendu LibreOffice réel** (pas juste les tests
      unitaires) : (1) connecteurs invisibles — `wps:cxnSp` (élément DrawingML valide) ne rend
      simplement rien dans ce canevas `wpc:wpc` sous LibreOffice ; remplacé par `wps:wsp`+
      `wps:cNvCnPr`, le seul motif de connecteur confirmé fonctionner dans ce projet
      (`ooxml-translator.ts`). (2) Texte tronqué — la taille de police n'était scalée nulle part
      dans `quadrant`/`venn`/`mindmap` une fois le facteur `scale` de `scaledExtent()` < 1
      (`quadrant`/`venn` n'avaient simplement jamais atteint ce cas en test ; le canevas mindmap,
      plus grand, si) : `translator/canvas.ts` gagne `scaledFontSizeHalfPt`/`scaledLineWidthEmu`
      (miroir de l'équivalent déjà correct dans `ooxml-translator.ts`), appliqués aux 3 modules.
      (3) Troncature résiduelle sur les formes non rectangulaires (hexagone/cercle/bang/nuage) —
      leur largeur utile réelle est inférieure à leur boîte englobante ; facteur de marge
      supplémentaire par forme ajouté à `boxSizeFor()`. Les trois corrections vérifiées par un
      second (puis un troisième) rendu réel, pas juste relues dans le code.
- [x] **`swimlane-beta` shippé (2026-09-09)** — quatrième type non-flowchart livré, premier de la
      famille A ("extension directe du flowchart, quasi gratuite") de
      `FUTURE_full_mermaid_coverage_SPEC.md` §3. Confirmé contre `mermaid.js.org/syntax/
      swimlanes.html` (2026-09-09) : swimlane-beta "carries the full Flowchart feature set" —
      grammaire nœuds/arêtes identique au flowchart, seuls les `subgraph` de premier niveau
      changent de sémantique (lane plutôt que boîte imbriquée arbitraire). Implémenté exactement
      comme le pressentait la spec — un alias d'en-tête, pas un nouveau module : `parser.ts`
      reconnaît `swimlane-beta [TD|TB|LR|BT|RL]` au même titre que `graph`/`flowchart` (même
      normalisation TB→TD), et `detectDiagramType()` classe ce header comme `'flowchart'` plutôt
      que comme un type à part — aucune divergence de pipeline, `layout.ts`/`ooxml-translator.ts`
      inchangés, les lanes rendent avec la même boîte de sous-graphe pleine que `subgraph`
      classique. Zéro nouvelle dépendance, zéro changement d'API publique. Vérifié par export CLI
      réel + rendu LibreOffice headless (`test-corpus/visual/fixtures/swimlane.mmd`, 3 lanes/5
      nœuds/flèches inter-lanes avec labels Oui/Non) et par `test:oxml-validate` (0 erreur de
      schéma sous `word/diagrams/`, ajouté à `PLAIN_FIXTURE_NAMES`) — rendu correct dès la première
      tentative, aucun bug trouvé cette fois. Reprise du chantier "faire monter le 3/28" actée avec
      le mainteneur (2026-09-09) : ordre de priorité laissé à l'agent, sequenceDiagram (ci-dessous)
      n'est donc plus un blocage produit mais une question d'ordonnancement par coût.
- [x] **`classDiagram` shippé (2026-09-09)** — cinquième type non-flowchart livré, premier de la
      famille B ("graphe nœuds/arêtes, réutilise Dagre + traducteur étendu") de
      `FUTURE_full_mermaid_coverage_SPEC.md` §3. Grammaire vérifiée contre
      `mermaid.js.org/syntax/classDiagram.html` (2026-09-09). Contrairement à quadrant/venn/mindmap,
      réutilise directement le package `dagre` (déjà une dépendance via `layout/layout.ts`, zéro
      nouvelle dépendance) plutôt que `layout()` lui-même — celui-ci est typé contre l'AST flowchart
      et suppose des boîtes à taille fixe/étiquette mono-ligne, ce qui ne tient pas pour une boîte à
      compartiments multi-lignes. Nouveau module `packages/core/src/diagrams/class-diagram/`
      (parser/translator/types), câblé dans `md2nativedocx-core.mjs` et le barrel public comme les
      précédents. Portée v1 assumée (détail dans le doc-comment de `parser.ts`) : les 8 familles de
      flèches de relation (héritage/réalisation/composition/agrégation/association/dépendance/lien
      plein/pointillé) avec label optionnel après `:` ; membres conservés en texte brut (marqueur de
      visibilité isolé, reste verbatim) plutôt que dissection sémantique complète ; générique
      (`List~int~`) et id entre backticks supportés ; `namespace` reconnu et averti mais ses classes
      internes sont quand même parsées (pile de blocs générique) ; annotations/`classDef`/`style`/
      `note`/cardinalités reconnus et avertis, jamais perdus silencieusement. Boîte à 3 compartiments
      (nom/attributs/méthodes, compartiment omis si vide) rendue en formes `wps:wsp` planes, pas en
      SmartArt `dgm:layoutDef`. Relations en lignes droites centre-à-centre coupées à la bordure de
      chaque boîte (pas de routage Dagre multi-points comme le flowchart) — simplification v1
      assumée et documentée, ce chantier étant typiquement de taille bien plus modeste (quelques
      classes) que les flowcharts à centaines de nœuds où le routage complexe se justifie. Fidélité
      des marqueurs également assumée : `a:headEnd`/`a:tailEnd` n'a pas de variante "contour creux",
      donc triangle creux (héritage/réalisation UML strict) et losange creux (agrégation) ne sont pas
      reproductibles avec l'unique primitive de connecteur confirmée fonctionner dans ce projet —
      substitués par les préréglages intégrés les plus proches et visuellement distincts (`oval` pour
      l'agrégation, triangle plus petit pour association/dépendance vs plus grand pour
      héritage/réalisation) : les 8 types restent visuellement distincts entre eux, pas une
      reproduction pixel-perfect de la notation UML. Vérifié par export CLI réel + rendu LibreOffice
      headless (`test-corpus/visual/fixtures/class-diagram.mmd`, 5 classes/4 relations incluant les
      3 marqueurs triangle/losange/ovale + un spot-check dédié agrégation) et `test:oxml-validate`
      (0 erreur de schéma sous `word/diagrams/`) — rendu correct dès la première tentative, aucun bug
      trouvé cette fois. 24 tests unitaires ajoutés (parser + traducteur).
- [x] **`stateDiagram`/`stateDiagram-v2` shippé (2026-09-09)** — sixième type non-flowchart livré,
      deuxième de la famille B. Grammaire vérifiée contre `mermaid.js.org/syntax/stateDiagram.html`
      (2026-09-09). Refactor au passage : `edgePoint`/`connector`/`rect`/`textBoxLines` extraits de
      `diagrams/class-diagram/translator.ts` vers `translator/graph-shapes.ts` (nouveau module
      partagé) dès que ce deuxième module en a eu besoin des mêmes primitives — même convention
      d'extraction que `canvas.ts` en son temps (voir le doc-comment de `graph-shapes.ts`). Portée
      v1 assumée (détail dans le doc-comment de `parser.ts`) : transitions plates avec label
      optionnel, pseudo-états start/end (chaque occurrence de `[*]` synthétise son propre nœud,
      distingué par position source/cible), `state "Label" as id`, forme alternative `id : Label`,
      stéréotypes `<<choice>>`/`<<fork>>`/`<<join>>`. États composites (`state X { ... }`) reconnus
      et avertis une seule fois, mais leurs états/transitions internes sont quand même analysés
      (aplatis au niveau racine, même pile générique de blocs que la gestion `namespace` de
      classDiagram) plutôt que rendus en boîte de containment imbriquée — limitation documentée, pas
      une perte silencieuse. Notes et `classDef`/`class`/`style` reconnus et avertis, jamais perdus
      silencieusement. Contrairement aux 8 types de relation de classDiagram, toute transition rend
      de façon identique (ligne pleine, triangle à l'extrémité cible) — pas de table marqueur/tiret
      par type nécessaire ici. Pseudo-états rendus en notation UML standard : cercle plein (start),
      cercle plein cerclé (end), losange (choice), barre pleine fine (fork/join, orientée
      perpendiculairement au sens du flux). Deux `warning`s de lint (`detect-unsafe-regex` sur une
      regex combinant les deux extrémités d'une transition, `detect-possible-timing-attacks` sur une
      variable nommée `token` — faux positif classique de cette règle sur ce nom) corrigés en
      splittant sur le littéral `-->`/`:'` plutôt qu'une regex combinée (même précédent que
      `POINT_TAIL` dans `diagrams/quadrant/parser.ts`) et en renommant la variable. Vérifié par
      export CLI réel + rendu LibreOffice headless (`test-corpus/visual/fixtures/state-diagram.mmd`,
      cycle avec les 4 formes de nœud — normal/start/end/choice — et transitions étiquetées) et
      `test:oxml-validate` (0 erreur de schéma sous `word/diagrams/`) — rendu correct dès la première
      tentative, aucun bug trouvé cette fois. 22 tests unitaires ajoutés (parser + traducteur).
- [x] **`erDiagram` shippé (2026-09-09)** — septième type non-flowchart livré, troisième de la
      famille B. Grammaire vérifiée contre `mermaid.js.org/syntax/entityRelationshipDiagram.html`
      (2026-09-09). Portée v1 assumée (détail dans le doc-comment de `parser.ts`) : entités avec bloc
      d'attributs (`type name [PK|FK|UK[,...]] ["commentaire"]`), relations avec cardinalité
      crow's-foot complète sur les deux extrémités et style de trait identifiant (`--`) vs
      non-identifiant (`..`). Alias d'entité **non implémenté** — aucun exemple de syntaxe littérale
      confirmé trouvé sur la page source ; conformément à la règle du projet de ne jamais deviner une
      grammaire non confirmée, plutôt que d'inventer. Fidélité des marqueurs de cardinalité assumée,
      même philosophie que classDiagram : aucun équivalent OOXML pour les glyphes crow's-foot réels
      (cercle "zéro", barre "un", éventail "plusieurs" combinés par paire) — mappés sur les 4
      préréglages `a:headEnd`/`a:tailEnd` disponibles pour rester mutuellement distincts (aucun,
      `oval`, `triangle`, `diamond`) plutôt que fidèles à la notation réelle. Le style de trait
      identifiant/non-identifiant, lui, correspond nativement et fidèlement à plein/pointillé.
- [x] **Bug réel trouvé et corrigé en vérifiant `erDiagram` par rendu réel (2026-09-09)** —
      `translator/graph-shapes.ts`'s `connector()` (utilisé par classDiagram/stateDiagram/erDiagram)
      plaçait `headEnd`/`tailEnd` sur la mauvaise extrémité géométrique dès que le point "from" était
      à droite du point "to" (`x1 > x2`), quel que soit `y` — la logique `flipV` combinée
      (`(x2-x1)*(y2-y1) < 0`) ne couvrait correctement que 2 des 4 cas de quadrant par coïncidence.
      Trouvé visuellement sur `CUSTOMER ||--o{ ORDER` : le losange de cardinalité (censé être sur
      ORDER) apparaissait sur CUSTOMER. Corrigé en remplaçant le `flipV` combiné par deux flips
      indépendants par axe (`flipH = x1 > x2`, `flipV = y1 > y2`), prouvé correct à la main pour les 4
      cas de quadrant (voir le doc-comment de `connector()`). classDiagram/stateDiagram n'affichaient
      pas ce bug dans leurs fixtures existantes par pure coïncidence géométrique (leurs relations
      concernées tombaient dans les 2 cas déjà corrects) — **aucune régression après coup, mais
      confirme que ce bug était déjà silencieusement présent** dans les deux modules précédents pour
      toute disposition Dagre qui l'aurait déclenché. Les 3 baselines visuelles (class-diagram/
      state-diagram/er-diagram) régénérées et revérifiées par rendu réel après le correctif ; seule
      `state-diagram.png` a effectivement changé au niveau pixel (confirmé visuellement correct),
      `class-diagram.png` était déjà byte-identique. `test:oxml-validate` : 0 erreur sur les 3.
      22 tests unitaires ajoutés pour erDiagram (parser + traducteur) ; tests existants inchangés,
      aucun n'asserte sur les attributs `flipH`/`flipV` littéraux.
- [x] **`requirementDiagram` shippé (2026-09-09)** — huitième type non-flowchart livré, quatrième de
      la famille B. Grammaire vérifiée contre `mermaid.js.org/syntax/requirementDiagram.html`
      (2026-09-09). Portée v1 : blocs `requirement`/`functionalRequirement`/etc. (`id`/`text`/`risk`/
      `verifymethod`), blocs `element` (`type`/`docref`), les 7 types de relation
      (`contains`/`copies`/`derives`/`satisfies`/`verifies`/`refines`/`traces`) dans les deux sens
      documentés (`A - type -> B` et `A <- type - B`). `type`/`risk`/`verifymethod` gardés en texte
      libre plutôt que validés contre les listes d'énumération de la spec — aucune preuve que ces
      listes soient exhaustives d'une version Mermaid à l'autre, mieux vaut garder un contenu réel
      que le rejeter sur une liste peut-être incomplète. Rendu : Mermaid lui-même ne distingue pas
      visuellement les 7 types de relation (vérifié sur la page source — tous les exemples rendent la
      même flèche pointillée), donc ce module ne invente pas de distinction que Mermaid ne fait pas
      non plus : toute relation = ligne pointillée + triangle à l'extrémité destination + étiquette
      `«type»`.
- [x] **Bug réel trouvé et corrigé en vérifiant `requirementDiagram` par rendu réel (2026-09-09)** —
      deux relations entre la même paire de boîtes (`test_req`/`test_req2` dans le fixture) se
      dessinaient exactement l'une sur l'autre, rendant les deux étiquettes `«type»` illisibles
      (superposées). Nouvelle primitive partagée `translator/graph-shapes.ts` :
      `parallelEdgeOffset()`/`perpendicularUnit()`/`shiftPoint()`, groupant les relations par paire de
      nœuds non ordonnée et décalant chaque ligne perpendiculairement à elle-même. **Piège trouvé
      deux fois de suite, même famille de bug que le correctif `flipH`/`flipV` de la veille** : dériver
      la direction perpendiculaire (puis, séparément, la direction "le long de la ligne" pour l'étage
      des étiquettes) depuis les points propres de CHAQUE relation plutôt que d'une paire canonique
      (nœuds triés) fait que le sens s'inverse pour une relation déclarée dans l'autre sens
      (`{from:B,to:A}` vs `{from:A,to:B}`), annulant exactement le décalage d'index et recollant les
      deux éléments au même endroit — repéré une première fois sur les connecteurs (corrigé), puis
      une seconde fois sur le décalage "le long de la ligne" des étiquettes (le premier correctif
      avait l'air correct à la lecture mais ne changeait rien au rendu réel — confirmé en
      instrumentant les coordonnées réelles, pas en devinant). **Leçon methodo à retenir** : toute
      logique de décalage dérivée de la direction d'une relation doit être calculée une fois depuis un
      ordre canonique des deux nœuds, jamais depuis `from`/`to` de la relation elle-même. Vérifié par
      export CLI réel + rendu LibreOffice headless + zoom pixel sur la zone à deux relations, à
      chacune des 3 itérations du correctif (pas seulement la version finale) et par
      `test:oxml-validate` (0 erreur). 19 tests unitaires ajoutés pour requirementDiagram (parser +
      traducteur), dont un test de régression dédié à ce piège précis (paire déclarée dans les deux
      sens documentés).
- [x] **`architecture-beta` shippé (2026-09-09)** — neuvième type non-flowchart livré, cinquième de
      la famille B. Type "New 🔥" de Mermaid, grammaire vérifiée contre
      `mermaid.js.org/syntax/architecture.html` (2026-09-09) à la profondeur "structure + quelques
      exemples" seulement (comme prévenu en tête de `FUTURE_full_mermaid_coverage_SPEC.md`). Portée
      v1 assumée (détail dans les doc-comments de `parser.ts`/`translator.ts`) : déclarations
      `group`/`service`/`junction` (id, icône optionnelle, titre optionnel, `in <parent>` optionnel)
      et arêtes avec ports directionnels (`L`/`R`/`T`/`B`) et flèche optionnelle de chaque côté.
      **Deux simplifications v1 documentées, pas silencieuses** : (1) le containment de groupe
      (`in <id>`) est analysé mais pas rendu en boîte imbriquée — tous les nœuds (service/groupe/
      jonction) sont posés à plat dans un même graphe Dagre, avertissement unique émis si au moins un
      nœud a un parent (même précédent que la gestion `namespace` de classDiagram) ; (2) les ports
      `L`/`R`/`T`/`B` sont analysés et conservés dans l'AST mais n'influencent pas encore le point
      d'accroche exact du connecteur (même approche générique `edgePoint()` que les autres modules
      famille B, pas d'amarrage forcé sur le côté nommé). Les icônes Mermaid (bibliothèque SVG
      propriétaire) n'ont aucun équivalent OOXML : les noms reconnus (`cloud`, `database`, `disk`)
      pointent vers les préréglages de forme les plus proches déjà utilisés ailleurs dans ce projet
      (`cloud` de `mindmap`, `can` — cylindre — de `ooxml-translator.ts`), tout le reste dégrade en
      rectangle arrondi neutre. Vérifié par export CLI réel + rendu LibreOffice headless
      (`test-corpus/visual/fixtures/architecture-diagram.mmd`, 1 groupe + 4 services + 1 jonction,
      mélange d'arêtes avec/sans flèche) et `test:oxml-validate` (0 erreur de schéma sous
      `word/diagrams/`) — rendu correct dès la première tentative, aucun bug trouvé cette fois.
      19 tests unitaires ajoutés (parser + traducteur).
- [x] **`gantt` shippé (2026-09-10)** — dixième type non-flowchart livré, premier de la famille D
      (`FUTURE_full_mermaid_coverage_SPEC.md`) — option (b) retenue (formes `wps:wsp` sur une grille
      calendrier, pas de backend `c:chart`), après spike dédié
      (`docs/adr/spikes/spike-gantt-parser/spike.md`) ayant écarté une dépendance runtime au paquet
      npm `mermaid` (chemin de chunk interne non stable + DOM/DOMPurify requis même pour le parsing
      pur) au profit d'une référence de code source vendorée (MIT, lue, jamais importée) pour écrire
      un parseur maison fidèle. Portée v1 : `title`, `dateFormat`, `excludes`
      (`weekends`/jours nommés/dates explicites), `section`, tâches avec id/tags
      (`active`/`done`/`crit`/`milestone`), début en date explicite/`after <ids>`/omis (chaîné sur la
      fin de la tâche précédente **globalement**, pas par section — comportement réel de Mermaid
      confirmé contre la référence vendorée), fin en date explicite/`until <ids>`/durée
      (`d`/`w`/`M`/`y`/`h`, étirée après les jours exclus exactement comme `fixTaskDates` sauf pour
      une date de fin explicite, jamais étirée). Jalons rendus en losange, pas de flèche de
      dépendance dessinée (vrai Mermaid n'en dessine pas non plus). Arithmétique de dates maison
      (`date-utils.ts`, ancrée UTC, déterministe) plutôt que `dayjs` — `packages/core` garde `dagre`
      comme unique dépendance. Vérifié par export CLI réel + rendu LibreOffice headless (calcul
      d'exclusion des week-ends validé à la main contre les largeurs de barres rendues) +
      `test:oxml-validate` (0 erreur de schéma) + baseline `test:visual` + 21 tests unitaires
      (dont un bug réel trouvé et corrigé en écrivant les tests : une durée malformée comme
      `"1.2.3d"` passait la regex volontairement permissive puis produisait une `Invalid Date` faute
      de garde `Number.isFinite`).
- [x] **C4 (`C4Context`/`C4Container`/`C4Component`/`C4Dynamic`/`C4Deployment`) shippé (2026-09-11)**
      — onzième type non-flowchart livré, sixième de la famille B. Grammaire vérifiée contre la
      source markdown réelle de `mermaid-js/mermaid` (`docs/syntax/c4.md` via
      raw.githubusercontent.com — la page rendue mermaid.js.org charge ses exemples dans un éditeur
      interactif qu'un fetch texte seul ne peut pas lire). Syntaxe entièrement différente des types
      précédents (appels de fonction façon PlantUML, `Type(alias, "label", ...)`), donc parseur
      générique (`parseCall` + split d'arguments respectant les guillemets) plutôt que des regex par
      construction comme les autres modules. Portée v1 : les ~20 types d'éléments
      (`Person(_Ext)`/`System(Db/Queue)(_Ext)`/`Container(Db/Queue)(_Ext)`/
      `Component(Db/Queue)(_Ext)`/`Deployment_Node`/`Node(_L/_R)`) réduits à une seule forme AST
      (catégorie + externe + variante db/queue) ; `Rel`/`BiRel`/`Rel_Back`/les variantes
      directionnelles (`Rel_U`/`Rel_D`/etc., sans effet sur ce layout Dagre)/`RelIndex` réduits à une
      seule relation ; `Boundary`/`Enterprise_Boundary`/`System_Boundary`/`Container_Boundary`/
      `Deployment_Node`-comme-conteneur aplatis avec avertissement (même schéma que le `in <parent>`
      d'`architecture-beta` et le `namespace` de `classDiagram`) ; `UpdateElementStyle`/
      `UpdateRelStyle`/`UpdateLayoutConfig`/`AddElementTag`/`AddRelTag` reconnus et avertis une fois,
      sans effet sur le rendu (directives de style/densité, pas de structure). Boîte à 2
      compartiments (nom / ligne stéréotype `[Catégorie, Qualificatif: techno]` + description
      optionnelle) par catégorie, couleur de remplissage distincte par catégorie — externe/db/queue
      signalés uniquement dans le texte du stéréotype, pas par une géométrie dédiée (même choix que
      `requirementDiagram`). Vérifié par export CLI réel + rendu LibreOffice headless
      (`test-corpus/visual/fixtures/c4.mmd`, l'exemple `C4Container` "Internet Banking System" des
      docs Mermaid elles-mêmes — Person/System_Ext/Container/Container_Ext/ContainerDb/
      ContainerDb_Ext dans un `Container_Boundary`) et `test:oxml-validate` (0 erreur de schéma sous
      `word/diagrams/`) — rendu correct dès la première tentative pour la structure/couleurs/
      flèches. Un artefact visuel réel trouvé au rendu et documenté (pas corrigé, cohérent avec le
      reste de la famille) : une relation qui saute un rang (`Rel(customer, spa, ...)`, alors que
      `Rel(web_app, spa, "Delivers")` place séparément `spa` un rang sous `web_app`) traverse
      visuellement la boîte intermédiaire — même limitation "lignes droites, pas de routage Dagre"
      déjà documentée pour toute la famille B, juste plus visible ici. 33 tests unitaires ajoutés
      (parser + traducteur).
- [x] **`gitGraph` shippé (2026-09-11)** — douzième type non-flowchart livré, premier de la famille
      F (re-classé, voir la note "angle mort n°2" de `FUTURE_full_mermaid_coverage_SPEC.md` : pas un
      graphe Dagre, mais des couloirs de branche fixes + un axe de séquence de commits fixe, même
      forme non-Dagre que le layout calendrier de `gantt`). Grammaire vérifiée contre la source
      markdown réelle de `mermaid-js/mermaid` (`docs/syntax/gitgraph.md` via
      raw.githubusercontent.com, même raison que C4 — la page rendue mermaid.js.org charge ses
      exemples dans un éditeur interactif). Portée v1 : aucun support frontmatter/`config:` (ce
      projet n'en a jamais eu pour aucun type — `showBranches`/`showCommitLabel`/`mainBranchName`/
      `mainBranchOrder`/`parallelCommits`/les variables de thème `git0`-`git7` ne sont donc pas une
      lacune spécifique à gitGraph) ; position des commits sur l'axe principal = ordre de
      déclaration (compteur de séquence global), pas l'algorithme temporel réel de Mermaid
      ("distance au parent") ; labels de commit jamais tournés à 45° (comportement fixe équivalent à
      `rotateCommitLabel: false`). `commit`/`branch`/`checkout`/`switch`/`merge`/`cherry-pick`
      complets avec attributs `id`/`type`/`tag`/`order`/`parent` ; `branch "nom-clé-réservé"` entre
      guillemets géré ; tri d'affichage des branches (main toujours première, puis sans `order` par
      ordre d'apparition, puis avec `order` par valeur croissante) vérifié contre l'exemple documenté
      de Mermaid lui-même. Rendu : cercle plein (`NORMAL`), cercle barré d'un X blanc (`REVERSE`),
      carré arrondi (`HIGHLIGHT`), "œil de bœuf" à deux cercles concentriques pour l'approximation du
      "double cercle plein" d'un merge ; chaque arête parent est colorée par la branche du *parent*
      (donc un point de branchement se lit visuellement comme partant de l'autre couloir) ; un
      cherry-pick trace une ligne pointillée grise de traçabilité vers son commit source (pas
      d'icône cerise dédiée — même précédent "pas d'icône exacte" que les icônes d'`architecture-beta`).
      Palette cyclique à 8 couleurs propre à ce projet (pas un calque exact des `git0`-`git7` de
      Mermaid, qui dépendent du thème actif). Un vrai bug trouvé et corrigé pendant la vérification
      visuelle (pas par les tests unitaires, qui ne voient que la structure XML) : la largeur de
      couloir (`commitGap`) était dérivée du label *annoté* d'un cherry-pick
      (`"<id> (cherry-pick of <source>)"`, potentiellement très long) plutôt que de l'id nu — un
      seul cherry-pick verbeux gonflait l'espacement de tous les commits du diagramme, écrasant le
      canevas entier à ~50px de haut une fois mis à l'échelle pour tenir dans la largeur de page.
      Corrigé pour dériver l'espacement du seul id nu (le label annoté peut déborder légèrement dans
      l'espace voisin dans ce cas précis — compromis v1 documenté, même famille que la limitation
      "lignes droites, pas de routage" déjà acceptée ailleurs dans le projet). Vérifié par export CLI
      réel + rendu LibreOffice headless (`test-corpus/visual/fixtures/git-graph.mmd`, l'exemple
      cherry-pick des docs Mermaid elles-mêmes — ZERO/A/ONE/B/MERGE/TWO/THREE/C sur
      main/develop/release) + une vérification visuelle séparée de chaque forme de commit (NORMAL/
      REVERSE/HIGHLIGHT/tag) et de l'orientation `TB:` + `test:oxml-validate` (0 erreur de schéma
      sous `word/diagrams/`) + baseline `test:visual` (zéro régression sur les 43 fixtures
      préexistantes, confirmé par `git status`) + 35 tests unitaires (parser + traducteur).
- [x] **`cynefin-beta` shippé (2026-09-11)** — treizième type non-flowchart livré, second de la
      famille D (formes calculées sur canevas `wpc:wpc`, pas de `c:chart`, même stratégie que
      `quadrantChart`/`venn-beta`). Grammaire vérifiée contre la source markdown réelle de
      `mermaid-js/mermaid` (`docs/syntax/cynefin.md` via raw.githubusercontent.com). L'hypothèse de
      `FUTURE_full_mermaid_coverage_SPEC.md` ("probablement réutilisable avec `quadrantChart`",
      posée avant lecture de la vraie grammaire) s'est révélée fausse une fois vérifiée : pas de
      points `[x, y]` arbitraires, mais 5 domaines **fixes et nommés** (Complex/Complicated/Clear/
      Chaotic + une région centrale Confusion) contenant des listes d'items texte, plus un graphe de
      transitions optionnel — module dédié, pas une variante de `quadrantChart`. Portée v1 : pas de
      support frontmatter/`config:`/variables de thème (`width`/`height`/`padding`/
      `boundaryAmplitude`/`seed`/`*Bg`, même absence de précédent que partout ailleurs dans ce
      projet) ; `accTitle`/`accDescr` reconnus et avertis une fois, sans effet (pas d'équivalent
      OOXML) ; la frontière organique ondulée caractéristique du framework (signature visuelle du
      vrai rendu Mermaid) devient une simple ligne droite — même compromis "géométrie calculée, pas
      fidélité visuelle exacte" déjà accepté pour `venn-beta`. Les 5 domaines aux positions fixes
      documentées (Complex haut-gauche, Complicated haut-droite, Chaotic bas-gauche, Clear
      bas-droite, Confusion au centre) rendent toujours, même vides (cas "Empty framework" des docs).
      Sous-titres de domaine (modèle de décision + type de pratique) repris verbatim des docs
      Mermaid. Plafond de 3 items + badge "+N more" pour la région Confusion, comportement
      documenté reproduit fidèlement (les 4 domaines principaux ne sont eux jamais coupés, même
      choix que Mermaid lui-même). Self-loop de transition (`complex --> complex`) silencieusement
      ignoré, sans avertissement — comportement explicitement documenté par Mermaid, pas une lacune
      de ce projet. Vérifié par export CLI réel + rendu LibreOffice headless
      (`test-corpus/visual/fixtures/cynefin.mmd`, l'exemple "Strategy Categorization" des docs
      Mermaid elles-mêmes, plus une vérification séparée du plafond/badge de la région Confusion) +
      `test:oxml-validate` (0 erreur de schéma sous `word/diagrams/`) + baseline `test:visual` (zéro
      régression sur les 44 fixtures préexistantes, confirmé par `git status`) + 27 tests unitaires
      (parser + traducteur).
- [x] **`pie` shippé (2026-10-02)** — quatorzième type non-flowchart livré, troisième de la famille D
      (formes calculées sur canevas `wpc:wpc`, pas de `c:chart`). Grammaire vérifiée contre
      `docs/syntax/pie.md` de `mermaid-js/mermaid` (raw.githubusercontent.com). Chaque part est un
      `prstGeom="pie"` (`adj1`/`adj2` en 60000e de degré, décalés de -90° car Mermaid démarre à midi,
      sens horaire) ; une part unique à 100 % devient une `ellipse` (un `pie` à angles égaux ne dessine
      rien). Pourcentage au `textPosition` par défaut de Mermaid (0.75), omis sous 1 % comme Mermaid ;
      légende à droite (défaut `legendPosition`), valeur brute ajoutée avec `showData`. Valeurs ≤ 0
      rejetées avec avertissement (règle de la grammaire). Hors portée v1 : frontmatter `config:`
      (`donutHole`, `legendPosition`, `highlightSlice`, `textPosition`) et variables de thème — avertis
      une fois, ignorés. Vérifié par export CLI réel + rendu LibreOffice headless
      (`test-corpus/visual/fixtures/pie.mmd`, exemple "Key elements in Product X" des docs) +
      `test:oxml-validate` (0 erreur sous `word/diagrams/`) + baseline `test:visual` (seule `pie.png`
      est nouvelle, confirmé par `git status`) + 11 tests unitaires. Prochain : `timeline`/`kanban`/
      `packet`/`treemap`… (ordre laissé à l'agent) ; `sequenceDiagram` toujours volontairement plus tard.
- [x] **`timeline` shippé (2026-10-02)** — quinzième type non-flowchart livré, quatrième de la famille D
      (formes calculées sur canevas `wpc:wpc`). Grammaire vérifiée contre `docs/syntax/timeline.md` de
      `mermaid-js/mermaid`. Une colonne par période (gauche→droite), bandeaux de `section` au-dessus,
      barre d'axe, événements empilés en dessous ; couleur par section (ou par période sans section) ;
      retour à la ligne automatique par mot + `<br>` forcé ; lignes `: événement` de continuation.
      Hors portée v1 : direction `TD` (v11.14+, reconnue, avertie, rendue en LR) et frontmatter/thème
      (avertis une fois). Vérifié par export CLI réel + rendu LibreOffice (exemple "England's History
      Timeline" des docs) + `test:oxml-validate` (0 erreur) + baseline `test:visual` (seule
      `timeline.png` nouvelle) + 10 tests unitaires.
- [x] **`kanban` shippé (2026-10-02)** — seizième type non-flowchart livré, cinquième de la famille D.
      Grammaire vérifiée contre `docs/syntax/kanban.md` de `mermaid-js/mermaid`. Colonnes = lignes les
      moins indentées, cartes = lignes plus indentées ; les 3 formes `id[Titre]`/`[Titre]`/`Titre` ;
      métadonnées `@{ ticket, assigned, priority }` (priorité = liseré gauche rouge/orange/bleu/bleu clair).
      **Décision de sécurité** : `ticketBaseUrl` (frontmatter) volontairement ignoré — il transformerait
      les tickets en hyperliens, or ce projet n'émet jamais de référence distante (AGENTS.md règle 3) ;
      les tickets restent du texte brut. Refactor au passage : primitives de boîtes extraites dans
      `translator/boxes.ts` dès le 2e consommateur (timeline + kanban), timeline reste pixel-identique
      (0.000 % de différence confirmé). Vérifié par export CLI réel + rendu LibreOffice (exemple complet
      des docs Mermaid) + `test:oxml-validate` (0 erreur) + baseline `test:visual` (seule `kanban.png`
      nouvelle) + 8 tests unitaires. Prochain : `packet`/`treemap-beta`/`radar-beta`…
- [x] **`packet` shippé (2026-10-02)** — dix-septième type non-flowchart livré, sixième de la famille D.
      Grammaire vérifiée contre `docs/syntax/packet.md` de `mermaid-js/mermaid`. Champs `n`, `a-b` et
      `+count` (démarre après le champ précédent), titre via `title` ou `title:` du frontmatter ; 32 bits
      par ligne, bit 0 à gauche, premier/dernier bit imprimés au-dessus de chaque segment ; un champ qui
      traverse une ligne est scindé en un segment étiqueté par ligne. Libellés non coupables dans une
      boîte étroite (drapeaux TCP 1 bit) réduits à la taille qui tient plutôt que coupés en pleine
      lettre (constaté au rendu réel). Plafond de 65536 bits (entrée hostile). Hors portée v1 :
      `showBits`/`bitOrder: descending`/`bitsPerRow` (frontmatter `config`, averti une fois).
      **Vrai bug transversal trouvé en vérifiant celui-ci** : `detectDiagramType()` ne sautait pas un
      bloc frontmatter `---…---` initial, donc tout diagramme précédé de frontmatter (exemple TCP
      officiel inclus) tombait silencieusement dans le pipeline flowchart — le traitement frontmatter
      de pie/timeline/kanban était lui aussi inatteignable dans ce cas. Corrigé (+ tests, dont
      `---` non terminé/tardif non pris pour du frontmatter). Vérifié par export CLI réel + rendu
      LibreOffice + `test:oxml-validate` (0 erreur) + baseline `test:visual` (seule `packet.png`
      nouvelle) + 12 tests unitaires.
- [x] **`treemap-beta` shippé (2026-10-02)** — dix-huitième type non-flowchart livré, septième de la
      famille D. Grammaire vérifiée contre `docs/syntax/treemap.md` de `mermaid-js/mermaid`. Hiérarchie
      par indentation (tabulation = 4 colonnes), feuilles `"Nom": valeur`, sections = somme de leurs
      enfants, `:::classe` + `classDef fill/color/stroke` (hex 3/6 chiffres ou quelques noms CSS de base,
      comme l'exemple `fill:red` des docs ; toute autre valeur ignorée, jamais écrite dans le XML).
      Layout squarified (Bruls et al.), enfants triés par valeur décroissante comme Mermaid/d3 ; section =
      rectangle teinté + bandeau d'en-tête, feuille = libellé + valeur ; libellés tronqués aux lignes qui
      tiennent, mot trop large réduit à la taille qui tient (constaté au rendu réel : « Training » se
      coupait en pleine lettre) via nouveau `fitFont()` partagé dans `translator/boxes.ts`. Profondeur
      plafonnée à 32 (entrée hostile). Alias `treemap` sans `-beta` accepté par la détection. Hors portée
      v1 : frontmatter/thème (averti une fois). Vérifié par export CLI réel + rendu LibreOffice +
      `test:oxml-validate` (0 erreur) + baseline `test:visual` (seule `treemap.png` nouvelle) + 10 tests
      unitaires.
- [x] **`journey` shippé (2026-10-02)** — dix-neuvième type non-flowchart livré, huitième de la
      famille D. Grammaire vérifiée contre `docs/syntax/userJourney.md` de `mermaid-js/mermaid`.
      `title`, `section`, lignes `Tâche: score: Acteur1, Acteur2`. Une colonne par tâche, bandeaux de
      section, ligne de score teintée rouge → vert (texte `n/5`, pas de glyphe emoji), une ligne par
      acteur avec cellule colorée là où il participe. Score hors 1..5 borné (avertissement), score non
      numérique : ligne ignorée (avertissement) ; plafond de 500 tâches (entrée hostile). Hors portée v1 :
      frontmatter/thème (averti une fois). Vérifié par export CLI réel + rendu LibreOffice +
      `test:oxml-validate` (0 erreur) + baseline `test:visual` (seule `journey.png` nouvelle) + 8 tests
      unitaires. Fixture `test-corpus/word-verification/journey.docx` pas encore ouverte dans Word réel.
- [x] **`treeView-beta` shippé (2026-10-02)** — vingtième type non-flowchart livré, neuvième de la
      famille D. Grammaire vérifiée contre `docs/syntax/treeView.md` de `mermaid-js/mermaid`. Hiérarchie
      par indentation (tabulation = 4 colonnes) ou par caractères de tracé (`├ └ │ ─`), libellés nus ou
      entre guillemets, `/` final = dossier (gras), `## description` (italique), `:::highlight` (fond
      jaune ; autres classes ignorées, averties une fois), `icon(...)` ignoré (averti une fois). Une ligne
      par nœud, barres de connexion fines (rectangles). Profondeur plafonnée à 32, 2000 nœuds max (entrée
      hostile). Hors portée v1 : frontmatter/thème/icônes. Vérifié par export CLI réel + rendu
      LibreOffice + `test:oxml-validate` (0 erreur) + baseline `test:visual` (seule `tree-view.png`
      nouvelle) + 9 tests unitaires. Fixture `test-corpus/word-verification/tree-view.docx` pas encore
      ouverte dans Word réel.
- [x] **`radar-beta` shippé (2026-10-02)** — vingt-et-unième type non-flowchart livré, dixième de la
      famille D. Grammaire vérifiée contre `docs/syntax/radar.md` de `mermaid-js/mermaid`. `title`,
      `axis id["Label"], ...`, `curve id["Label"]{1,2,3}` ou `curve id{ axe: valeur, ... }` (plusieurs par
      ligne), options `showLegend`, `max`, `min`, `graticule circle|polygon`, `ticks`. Graticule (cercles
      ou polygones), rayons par axe, un polygone freeform translucide par courbe (`a:custGeom` fermé,
      alpha 30 %), légende à droite. Courbes keyées réordonnées selon l'ordre des axes, trous = `min`.
      Moins de 3 axes : note. Plafond de 64 axes/courbes (entrée hostile). Hors portée v1 : lissage
      `curveTension` (polygones à arêtes droites), frontmatter/thème (averti une fois), valeurs de
      graduation non affichées. Vérifié par export CLI réel + rendu LibreOffice + `test:oxml-validate`
      (0 erreur) + baseline `test:visual` (seule `radar.png` nouvelle) + 9 tests unitaires. Fixture
      `test-corpus/word-verification/radar.docx` pas encore ouverte dans Word réel.
- [x] **`ishikawa-beta` shippé (2026-10-02)** — vingt-deuxième type non-flowchart livré, onzième de la
      famille D. Grammaire vérifiée contre `docs/syntax/ishikawa.md` de `mermaid-js/mermaid` : première
      ligne = effet, puis catégories et causes par indentation (l'exemple officiel indente effet et
      catégories au même niveau — géré). Arête principale horizontale + tête (effet) à droite, catégories
      en diagonale alternées dessus/dessous, causes de tout niveau aplaties en lignes le long de l'arête
      (sous-causes en gris italique, décalées). Plafonds : 8 niveaux, 500 lignes. Hors portée v1 :
      frontmatter/thème (averti une fois), arêtes de sous-causes ramifiées (aplaties). `pathShape` extrait
      de radar vers `translator/path-shape.ts` (deuxième consommateur). Vérifié par export CLI réel +
      rendu LibreOffice + `test:oxml-validate` (0 erreur) + baseline `test:visual` (seule `ishikawa.png`
      nouvelle) + 7 tests unitaires. Fixture `test-corpus/word-verification/ishikawa.docx` pas encore
      ouverte dans Word réel.
- [x] **`xychart-beta` shippé (2026-10-02)** — vingt-troisième type non-flowchart livré, douzième de la
      famille D. Grammaire vérifiée contre `docs/syntax/xyChart.md` de `mermaid-js/mermaid` : en-tête
      `xychart-beta`/`xychart` + `horizontal`, `title`, `x-axis` (liste de catégories ou `"titre" min --> max`),
      `y-axis ["titre"] [min --> max]`, séries `bar`/`line` nommées ou non, labels de points `540 "label"`.
      Grille et graduations « propres » (pas 1/2/5×10^k), une boîte par barre, une polyligne + marqueurs par
      courbe, titres d'axes, légende si une série est nommée, orientation horizontale par une seule géométrie
      catégorie/valeur. Plafonds : 12 séries, 200 points. Différences avec Mermaid : barres multiples côte à
      côte dans une bande, axe x numérique rendu en libellés régulièrement espacés, `config.xyChart`/thème
      ignorés (averti une fois). Vérifié par export CLI réel + rendu LibreOffice + `test:oxml-validate` + baselines
      `test:visual` (`xychart.png`, `xychart-horizontal.png` nouvelles) + 8 tests unitaires. Fixture
      `test-corpus/word-verification/xychart.docx` pas encore ouverte dans Word réel.
- [x] **`block-beta` shippé (2026-10-02)** — vingt-quatrième type non-flowchart livré, treizième de la
      famille D. Grammaire d'après `docs/syntax/block.md` de `mermaid-js/mermaid` : `columns N`, blocs avec
      `:span`, `space`/`space:N`, groupes imbriqués `block:id:span … end` (grille interne propre), formes
      rect/round/stadium/circle/diamond (les autres formes retombent sur un rectangle avec leur libellé),
      liens `-->`, `---`, `-.->`, `==>`, `<-->` avec libellé, `style`/`classDef`/`class`/`:::` (couleurs hex
      validées uniquement). Plafonds : 500 blocs, 200 liens, profondeur 8, 24 colonnes. Différences avec
      Mermaid : liens droits (peuvent traverser un bloc intermédiaire), `config`/thème ignorés. Vérifié par
      export CLI réel + rendu LibreOffice + `test:oxml-validate` (0 erreur dans les parties diagramme) +
      baseline `test:visual` (`block.png` nouvelle) + 8 tests unitaires. Fixture
      `test-corpus/word-verification/block.docx` pas encore ouverte dans Word réel.
- [x] **`sankey-beta` shippé (2026-10-02)** — vingt-cinquième type non-flowchart livré, quatorzième de la
      famille D. Corps CSV `source,target,value` (guillemets RFC-4180, `""` = guillemet littéral), grammaire
      d'après `docs/syntax/sankey.md` de `mermaid-js/mermaid` (non re-vérifiée contre la source). Nœuds
      répartis en colonnes par plus long chemin (puits poussés dans la dernière colonne), barres de hauteur
      proportionnelle au flux, rubans en S (Bézier cubique échantillonnée en polygone) d'épaisseur = valeur,
      couleur de la source, libellé nom + valeur. Auto-liens et liens fermant un cycle ignorés avec
      avertissement. Plafonds : 500 liens, 200 nœuds. Différences avec Mermaid : rubans polygonaux,
      `config`/thème (`linkColor`, `nodeAlignment`, couleurs) ignorés. Vérifié par export CLI réel + rendu
      LibreOffice + `test:oxml-validate` + baseline `test:visual` (`sankey.png` nouvelle) + 7 tests unitaires.
      Fixture `test-corpus/word-verification/sankey.docx` pas encore ouverte dans Word réel.
- [x] **`wardley-beta` shippé (2026-10-02)** — vingt-sixième type non-flowchart livré, quinzième de la
      famille D. Grammaire cette fois **vérifiée** contre `docs/syntax/wardley.md` de `mermaid-js/mermaid` et
      contre le vrai `@mermaid-js/parser` 11.17.2 (AST sondé sur un exemple couvrant toutes les formes).
      Couvre : `title`, `size`, `anchor`, `component` (+ `label [dx, dy]`, `(inertia)`, `(build|buy|outsource|market)`),
      `pipeline { component … }`, liens (`->`, `-->`, `-.->`, `+>`, `+<`, `+<>`, `+'texte'>`, `; annotation`),
      `evolve`, `note`, `annotations`/`annotation`, `accelerator`/`deaccelerator`, `evolution` (étapes, `@frontière`,
      `A / B`). Coordonnées `[visibilité, évolution]` en 0–1 ou 0–100 ; hors plage = entité ignorée avec
      avertissement (Mermaid, lui, lève une erreur). Plafonds : 200 nœuds, 500 liens, 100 de chaque autre type ;
      `size` borné à 300–2400. Différences avec Mermaid : libellés de liens non pivotés, ancres en point plein,
      `config`/thème ignorés ; `build` dessiné en triangle, `buy` losange, `outsource` carré, `market` cercle
      (comme `component` simple, non distingué). Vérifié par export CLI réel + rendu LibreOffice +
      `test:oxml-validate` (0 erreur dans les parties diagramme) + baseline `test:visual` (`wardley.png` nouvelle)
      + 7 tests unitaires. Fixture `test-corpus/word-verification/wardley.docx` pas encore ouverte dans Word réel.
- [x] **Grammaires `block` et `sankey` vérifiées (2026-10-02)** — sondées avec le vrai `mermaid.parse` (mermaid 11.x,
      jison, jsdom pour DOMPurify ; ces deux types ne sont pas dans `@mermaid-js/parser`). Tout ce que nous
      acceptions comme valide est accepté par Mermaid. Nos parseurs sont des sur-ensembles tolérants (avertissement
      au lieu d'erreur) : `A:::classe` en `block`, formes sans guillemets (`A((c))`, `A[[x]]`, `A{{x}}`),
      groupe `block:g` non fermé ; en `sankey`, `sankey-beta` vide et enregistrements à 2/4 champs sont des erreurs
      Mermaid mais des avertissements chez nous. Tests de non-régression ajoutés (+2).
- [x] **`eventmodeling` shippé (2026-10-02)** — vingt-septième type non-flowchart livré, seizième de la famille D.
      Grammaire **vérifiée** en sondant le vrai `@mermaid-js/parser` 1.2.1 (grammaire Langium reconstituée +
      `parse()` sur ~35 cas). Couvre : `tf`/`timeframe`/`rf`/`resetframe` + numéro 1-3 chiffres, types
      `ui|cmd|command|evt|event|rmo|readmodel|pcr|processor`, noms qualifiés `Namespace.Nom`, `->> id` multiples,
      `[[data]]`, données inline (`{…}`, `"…"`, `'…'`, type en backticks), blocs `data X {…}` et `note id {…}`,
      `entity`, `gwt … given … (when …)? then …`. Rendu : une colonne par frame, couloirs UI/Automation,
      Commande/Read model, Événements (multipliés par namespace), cartes colorées, flèches explicites ou
      implicites (frame précédente, sauf `rf`), données tronquées sous le nom, notes sous la carte, scénarios en pied.
      Mermaid rejette `title`/`accTitle` et les `note` inline ici : avertissement chez nous. Les types de sources
      invalides (ex. `evt ->> ui`) ne sont pas signalés (le validateur Langium ne tourne pas via `parse()`).
      Différences : couloirs triés par groupe puis par première apparition, `config`/thème ignorés. Plafonds :
      100 frames, 300 liens, 100 blocs data/notes, 50 scénarios. Vérifié par export CLI réel + rendu LibreOffice +
      `test:oxml-validate` (0 erreur dans les parties diagramme) + baseline `test:visual` (`eventmodeling.png`
      nouvelle) + 7 tests unitaires. Fixture `test-corpus/word-verification/eventmodeling.docx` pas encore ouverte
      dans Word réel. Reste : `sequenceDiagram`/`zenuml`.
- [x] **`sequenceDiagram` shippé (2026-10-02)** — vingt-huitième type non-flowchart livré, premier de la famille E
      (lignes de vie). **La grammaire n'est PAS dans `@mermaid-js/parser`** (sondé : aucun chunk séquence) : le lexer
      jison est dans le paquet `mermaid` lui-même, donc grammaire transcrite depuis `docs/syntax/sequenceDiagram.md`
      (pas vérifiée contre un parseur réel). Couvre : `participant`/`actor` (+ `as`, `@{…}` retiré), `create`/`destroy`,
      les 10 flèches standard (`->`, `-->`, `->>`, `-->>`, `<<->>`, `<<-->>`, `-x`, `--x`, `-)`, `--)`) avec
      raccourci `+`/`-`, `activate`/`deactivate`, `Note left of|right of|over`, blocs `loop|alt|opt|par|critical|break|rect`
      avec `else|and|option`, `box` (parsé, non dessiné), `autonumber [début [pas]]`, `title`, `<br/>`, `#NN;`.
      Avertis et ignorés : demi-flèches, connexions centrales `()`, `link`/`links`/`properties`, frontmatter.
      Rendu : boîtes en haut et en bas, lignes de vie pointillées, barres d'activation imbriquées, auto-messages en
      boucle, croix (`-x`, `destroy`) dessinées en deux traits, pastille de numéro, cadres de bloc avec étiquette,
      condition et séparateurs pointillés, `rect` en fond teinté, participant `create` tardif. Différences :
      espacement des colonnes par règle simple, pas de personnage filaire pour `actor`, flèche asynchrone = petit
      triangle. Plafonds : 50 participants, 500 éléments, 20 blocs imbriqués. Vérifié par export CLI réel + rendu
      LibreOffice + `test:oxml-validate` (0 erreur) + baseline `sequence.png` (venn.png restauré : dérive non traitée)
      + 6 tests unitaires + 1 test CLI. Fixture `test-corpus/word-verification/sequence.docx` pas encore ouverte dans
      Word réel. Limite visible : un cadre de bloc ne s'élargit pas pour contenir le texte d'un auto-message.
      Reste : `zenuml` (voir ci-dessous).
- [x] **`zenuml` shippé (2026-10-02)** — vingt-neuvième et dernier type de la liste. Plugin externe
      (`@mermaid-js/mermaid-zenuml`), syntaxe « code » sans rapport avec `sequenceDiagram` ; grammaire transcrite
      depuis `docs/syntax/zenuml.md` (non vérifiée contre l'ANTLR du plugin). Choix d'architecture : un parseur
      (`diagrams/zenuml/parser.ts`) qui produit **le même AST** que `sequenceDiagram`, rendu par
      `translateSequenceToOoxml` — pas de second traducteur. Couvre : `title`, participants (`Nom`, `A as Alias`,
      annotateurs `@Actor` seul visible, les autres avertis), messages async `A->B: texte`, appels sync
      `A.m(args)` / `Client->A.m() {…}` imbriqués (barre d'activation), `new A(args)`, réponses (`a = A.m()`,
      `return x`, `@return`), fragments `while|for|foreach|forEach|loop`, `if/else if/else`, `opt`, `par`,
      `try/catch/finally` (rendu comme `break`). Un appel de premier niveau part d'un participant implicite
      « Starter » placé à gauche. Aussi : le traducteur séquence élargit désormais la zone de texte d'une flèche
      courte pour ne plus tronquer son libellé. Vérifié par export CLI réel + rendu LibreOffice +
      `test:oxml-validate` (0 erreur) + baseline `zenuml.png` + 4 tests unitaires + 1 test CLI. Fixture
      `test-corpus/word-verification/zenuml.docx` pas encore ouverte dans Word réel. Le test CLI « garde-fou » qui
      utilisait un type non géré a été remplacé : plus aucun type reconnu n'est non géré.

### Phase 6 — Google Slides (`.pptx`) et Phase 7 — SmartArt (`mmd2smartart`)

Cadrage complet dans `docs/specs/cahier_des_charges_google_slides.md` et `docs/specs/FUTURE_mmd2smartart_SPEC.md`.
Priorisation décidée par le mainteneur (2026-09-03) : Slides et SmartArt en parallèle (spikes bon
marché, ne touchent pas la production), avant les diagrammes de séquence (gros effort from-scratch)
et l'add-in Word (canal de distribution entièrement nouveau).

> Détail complet des items fermés ci-dessous (spikes, preuves empiriques dans un vrai Word,
> décisions de conception round par round) : `docs/history/TODO_ARCHIVE.md`, section "Phase 6/7".

- ✅ Spike Phase 0 pptx (2026-09-02/03) — `docs/adr/0003-pptx-translator-spike.md`. Reste :
  vérification manuelle dans un vrai Google Slides/PowerPoint.
- ✅ Spike Phase 0 SmartArt, 3 manches (2026-09-02/03) — `docs/adr/0004-smartart-feasibility-spike.md`.
  Chirurgie ZIP validée dans un vrai Word ; contrainte dure trouvée (algorithme `hierarchy1` de
  Word plafonné à 4 niveaux de profondeur), contournée depuis (voir Round 5 ci-dessous).
- ✅ Classifieur de topologie (2026-09-03) — `packages/core/src/smartart/classify.ts`,
  `classifyTopology()`, exporté depuis le barrel public.
- ✅ Règle exacte de câblage `presOf`/`presParOf` extraite (2026-09-03, "Round 4") — confirmée sur
  3 échantillons Word réels.
- ✅ Décision de licence (2026-09-03) : pas de redistribution du `layout1.xml` authentique de Word
  (propriétaire) dans ce dépôt CC0 — algorithme `dgm:layoutDef` original réécrit à la place.
- ✅ Compatibilité LibreOffice résolue pour un algorithme 100 % personnalisé, sans plafond de
  profondeur (2026-09-03, "Round 5") — recette à 4 parties (algorithme + données + `colorsDef` +
  `styleDef`) entièrement auto-écrite, plus besoin du `hierarchy1` de Word donc plus de plafond
  de profondeur 4 imposé par son implémentation.
- ✅ `styleDef`/`quickStyle` entièrement auto-écrit confirmé (2026-09-03) — recette Round 5
  définitivement close, les 4 parties testées individuellement.
- ✅ Générateur `chain` implémenté (2026-09-03) — `packages/core/src/smartart/chain.ts`,
  `generateChain()`, exporté depuis le barrel public.
- ✅ `docs/specs/FUTURE_mmd2smartart_SPEC.md` révisée (2026-09-03) en conséquence de Round 5.
- ✅ Bug critique corrigé sur `chain.ts` — le générateur "livré" rendait une page blanche
  (2026-09-03) : `presOf` doc→`p-root` manquant, corrigé et revérifié par rendu réel.
- ✅ Générateur `tree` implémenté et corrigé (2026-09-03) — `packages/core/src/smartart/tree.ts`.
  **Portée assumée : profondeur 2 uniquement** (racine + une rangée d'enfants directs) — en
  conséquence `MAX_TREE_DEPTH` (`classify.ts`) abaissé de 4 à 2.
- [ ] **Leçon méthodologique à appliquer avant tout futur générateur SmartArt** (cycle, tree à
      profondeur adaptative, etc.) : les tests unitaires XML-only ne suffisent pas à détecter un
      rendu blanc — deux bugs invisibles en test mais flagrants à l'œil sur un rendu LibreOffice
      réel (voir item précédent). Toujours rendre une fois via `soffice --headless --convert-to
      png` et inspecter l'image avant de considérer un générateur "livré".
- ✅ Dispatch classifieur → générateur câblé dans le vrai pipeline (2026-09-03, spec §7 étape 5) —
  `packages/core/src/smartart/dispatch.ts`/`embed.ts`, marqueurs provisoires résolus en vrais
  `rId` par `postprocess.mjs` (`injectSmartArtParts()`), repli silencieux vers `wpg:wgp` sinon.
- ✅ Note de fallback dans le document généré, expédition des warnings (stderr + fichier `.log` +
  toast VS Code "View warnings"), réglage `md2nativedocx.referenceDocument` — 3 items priorisés
  par le mainteneur, tous livrés (2026-09-03).
- [x] **Traducteur `.pptx` de production livré (2026-10-02)** — `packages/pptx`
      (`docs/adr/0010-pptx-production-translator-plan.md`) : `md2nativedocx deck.md -o deck.pptx`,
      une diapositive 16:9 par bloc Mermaid (titre = dernier titre Markdown, texte hors diagramme
      ignoré), les 29 types via une seule réécriture `wps:wsp` → `p:sp`/`p:cxnSp` de la sortie du core
      (agrandie pour remplir la diapositive, ×2,5 max). Vérifié : 22 tests pptx + 3 tests CLI,
      `test:oxml-validate` (un deck des 62 fixtures, 0 erreur de schéma), rendu LibreOffice Impress des
      62 diapositives relu à l'œil + 6 baselines `test-corpus/visual/baseline-pptx/`, clean-room
      `verify:npm-packages`. **Mise à jour 2026-10-05** : `all-types-deck.pptx` (62 diapositives) s'ouvre
      sans invite dans un vrai PowerPoint (mainteneur) après deux correctifs trouvés par essais réels
      — parties manquantes (`presProps`/`viewProps`/`tableStyles`/`txStyles`, `161dcd1`) et arêtes
      polyligne émises en `p:cxnSp` + `custGeom` (`afa3943`, trouvé par dichotomie : PowerPoint exige
      une géométrie prédéfinie sur un connecteur). Option `--show-source` ajoutée (`25b67ed`).
      L'import dans Google Slides est confirmé OK par le mainteneur (2026-10-05). Note : liens droits =
      connecteurs, polylignes = formes libres sans accroche magnétique ; l'extension VS Code (`bundle-cli.mjs`) ne vendorise pas encore
      `@md2nativedocx/pptx` (le `.pptx` n'y est pas exposé) ; `ci.yml` : les jobs Windows/macOS listent
      leurs workspaces à la main et ne lancent pas les tests pptx (changement `ci.yml` à relire par un
      humain, non fait).
- ✅ Catalogue complet des layouts SmartArt (2026-09-03) — `docs/smartart-layout-catalog.md`, ~150
  layouts classés par pertinence pour un flowchart Mermaid. Deux pistes identifiées : `Labeled
  Hierarchy` (subgraph = hiérarchie libellée) et les layouts "convergents" (fusion après
  branchement) — toutes deux évaluées ci-dessous.
- ✅ Piste "subgraph = hiérarchie libellée" testée, cas général écarté (2026-09-03) — l'étiquette
  de `Labeled Hierarchy` s'applique par niveau de profondeur, pas par branche ; ne couvre que le
  cas restreint où tous les nœuds d'une même profondeur partagent le même `subgraph`.
- ✅ Piste "subgraph = `Nested Target`" écartée (2026-10-06) — l'échantillon `handmade_samples/cible.docx`
  (en fait *Basic Target*, `target1`) montre des anneaux frères dans le modèle de données (imbrication
  seulement visuelle, 5 max), les nœuds d'un anneau en texte à puces, et aucune arête possible ; des
  anneaux concentriques ne savent pas non plus montrer deux `subgraph` côte à côte. Détail :
  `docs/smartart-layout-catalog.md`. Les flowcharts avec `subgraph` restent en formes Word.
- ✅ Piste définitivement close (2026-09-03, 3 essais réels indépendants) : `subgraph` = boîte de
  titre existante + diagramme SmartArt intégré via `wpc:graphicFrame` — 3 hypothèses distinctes,
  le même échec dur à l'ouverture dans un vrai Word à chaque fois. `Nested Target` a depuis été écartée aussi
  (2026-10-06).
- ✅ Tableau de compliance livré (2026-09-03) — `docs/markdown-mermaid-compliance-table.md` (3
  colonnes : SmartArt seul / hybride / OOXML seul), livré avant même que `cycle.ts` existe, sur
  priorité explicite du mainteneur. A mis au jour au passage un bug de guillemets/entités/Markdown
  strings non interprétés (corrigé, voir items suivants).
- ✅ Poussée vers le 100 % sur la colonne SmartArt seul (2026-09-03) — 4 améliorations vérifiées
  par rendu réel : libellé d'arête, couleur par nœud (`classDef`), direction `TD`/`LR` prise en
  compte, et `cycle.ts` livré (`generateCycle()`, a fonctionné au premier essai empirique). Les 3
  topologies du classifieur ont désormais chacune leur générateur validé.
- ✅ Bug des guillemets englobants corrigé (2026-09-03) — `stripQuotedLabel()`, `id["texte"]`
  (syntaxe recommandée par Mermaid pour l'Unicode) produit un label propre.
- ✅ Durcissement du parseur Mermaid — dernier lot (2026-09-04) : `<br/>`/codes d'entité/Markdown
  Strings dégradés proprement, directions `TB`/`BT`/`RL` avec avertissement explicite au lieu du
  message générique, `:::` sur une déclaration de nœud isolée.
- [x] **Profondeur d'arbre adaptative (> 2)** (fait, confirmé en vrai Word v11-v13, 2026-10-06) pour `tree.ts` — le partage de hauteur fixe (35 %
      nœud / 55 % rangée d'enfants) ne peut pas simplement se répéter à un niveau supplémentaire
      sans léser un nœud sans petit-enfant. Nécessite un schéma de répartition calculé à partir de
      la forme réelle du sous-arbre (comme `hierarchy1` de Word le fait dynamiquement) — chantier
      de conception à part entière, pas une extension incrémentale. Ne nécessite pas d'échantillon
      Word réel, contrairement aux deux items précédents.
- ✅ Spike layouts "convergents" pour la fusion après branchement — écarté avec preuve (2026-09-03,
  2 preuves indépendantes : pas de boîte "résultat" distincte dans l'échantillon Word réel, et un
  point de présentation ne peut avoir qu'un seul parent `presParOf`).
- ✅ Volet "corporate" (2026-09-03) — décision du mainteneur : un réglage
  (`md2nativedocx.referenceDocument`), pas une commande. Voir aussi `docs/specs/export_customization_SPEC.md`
  §2.1 pour son évolution vers un gabarit généré dynamiquement (Phase 8).
- [x] **`timeline` en frise SmartArt + texte riche dans les boîtes (2026-10-06, confirmé en vrai Word, v16)** —
      `smartart/timeline.ts` (layout original `timeline1-n<N>` : axe en flèche, pastille par période, boîtes
      alternées au-dessus/en dessous via `posOdd`), branché quand SmartArt est actif, sans sections et si le texte
      tient à 10 pt ; titre en paragraphe gras au-dessus. `<br/>`/gras/italique désormais conservés dans toutes
      les boîtes SmartArt (`smartart/text.ts`, `7d79e39`). Un premier essai en simple chaîne de boîtes (v15) a été
      rejeté par le mainteneur (« ressemble à du flowchart classique »). v16 validé en vrai Word (CHECKLIST
      Round 18, `posOdd` honoré en `no-drawing`). Suite possible : `journey` sur la même frise.
- [x] **SmartArt pour journey, timeline à sections, kanban, gitGraph, stateDiagram, classDiagram (2026-10-06,
      confirmé en vrai Word, v17)** — frise groupée (`timeline-grouped.ts`, `391025b`), liste groupée kanban (`kanban.ts`,
      `c97c324`), cas simples gitGraph/state/class via les générateurs validés (`from-graph.ts`, `e93e353`). Validé
      en vrai Word (CHECKLIST Round 19, v17, `no-drawing` compris). Option ouverte
      (décision produit) : `venn-beta` sans texte d'intersection en SmartArt « Venn simple » ; `quadrantChart`
      reste en formes (les points `[x, y]` n'ont pas d'équivalent SmartArt).
- [x] **Formes Mermaid par nœud dans les SmartArt (2026-10-06, confirmé en vrai Word, v18)** — losange, cercle,
      cylindre, hexagone… en override `a:prstGeom` sur le point de présentation de la boîte, comme Word écrit
      *Changer la forme* (`smartart/node-shape.ts`, `41f74ae`). CHECKLIST Round 20 : formes redessinées par Word en
      `no-drawing`, *Rétablir la forme* OK.
- [ ] **SmartArt « pixel perfect » : pas de conclusion à ce jour (2026-10-05)** — `smartArt.enabled`
      reste à `false` par défaut. ADR 0006 : corruption corrigée (ids `modelId`) mais « en attente de
      confirmation Word réelle finale » ; `smartart-cycle-recheck.docx` rend encore des formes vides
      (voir « Retours en attente »). À trancher avant de promouvoir SmartArt au-delà de l'option.
- [ ] **Piste — graphiques Word natifs `c:chart` avec classeur embarqué (idée loguée 2026-10-05, pas
      commencée, mainteneur : « dans les chantiers, à côté de SmartArt »).** Contexte : une question
      publique (mermaid-js/mermaid#8060) demande des `pie`/`xychart` « double-cliquables » dans Word
      avec données éditables (Chart Design → Edit Data). Aujourd'hui `pie`/`xychart`/`radar` sortent en
      **formes natives** (mise en forme éditable, pas les données) — choix « famille D (b) ».
      - Même schéma d'intégration que SmartArt : le filtre émet un dessin référençant `c:chart`,
        `postprocess.mjs` injecte `word/charts/chartN.xml`, ses relations/content types et
        `word/embeddings/*.xlsx` (relation interne, jamais `TargetMode="External"`, règle 3).
      - Le classeur (`.xlsx` = petit zip de 5-6 parties XML) est ce qui rend « Edit Data » possible ;
        `zipUtils.mjs` sert déjà sans dépendance — à confirmer qu'aucune nouvelle dépendance n'est
        nécessaire (sinon : escalade, règle 6).
      - Chemin par paliers proposé : (1) `pie` seul, `c:chart` avec valeurs en cache, sans classeur
        (couleurs/styles éditables, pas les données) ; (2) ajout du classeur ; (3) vérification dans un
        vrai Word (Edit Data) ; (4) `xychart` puis `radar` ; réglage `shapes`/`natif`, `shapes` par
        défaut tant que Word n'a pas confirmé.
      - Prérequis : ADR (assumer l'exception à la règle 7 « ne pas toucher aux internes du zip », déjà
        contournée par SmartArt), validation `test:oxml-validate`, rendu LibreOffice, et la même
        leçon que SmartArt (valider par schéma avant de deviner). Perte assumée : le rendu Word d'un
        graphique n'est pas le rendu Mermaid 1:1.
      - **Confié à l'agent (mainteneur, 2026-10-05)** : à réaliser (ADR puis spike) ; le changement de
        contrat du traducteur reste signalé au mainteneur avant fusion.

---

### Session 2026-10-06 — extension VS Code 0.6.0 publiée

- ✅ **0.6.0 publiée sur la Marketplace** (`0758e65`, tag `vscode-v0.6.0`, premier tag de version du
  dépôt). Contenu : `packages/vscode-extension/CHANGELOG.md` § 0.6.0.
- ✅ SmartArt confirmés dans un vrai Word : connecteurs d'arbre (v9), profils de look (v10), arbres
  multi-niveaux dans les 4 directions (v11-v12), organigramme compact (v13), `mindmap`/`treeView-beta`
  (v14). → La case « Profondeur d'arbre adaptative (> 2) » (Phase 6/7) est faite.
- ✅ Nouveaux défauts de l'extension : SmartArt activé, graphiques Word natifs activés (`pie`, `xychart`,
  `radar`). Le core et le CLI restent en opt-in (variables d'environnement).
- ✅ Revue UX de l'extension (lots A-D) : export PowerPoint, CodeLens repensés, sous-menu clic droit, ligne
  « ce que deviendra ce diagramme » + survol, réglages en sections, panneau traduit (comble le gap l10n
  Phase 8), nouveaux GIF.
- ✅ CI : 3 nouveaux avis high/critical (`compression`, `proxy-addr`, `source-map-js`, tous en dev sous
  `packages/word-addin`) corrigés par simple mise à jour du lockfile vers les versions corrigées.
- [ ] **Mainteneur** : installer la 0.6.0 depuis la Marketplace sur le poste Windows d'entreprise et
  exporter un document mixte (les nouveaux défauts changent le rendu des utilisateurs existants).

---

### Session 2026-10-05 — vérifications réelles, manuel utilisateur, pptx durci

- ✅ Tous les types livrés (29/29) ; `docs/manual/manuel-utilisateur.{md,docx}` : manuel de 38 pages
  (couverture, sommaire champ Word pré-rempli, introduction, réglages, Markdown standard, une page
  A4 par type avec source | rendu côte à côte). **Vérifié dans un vrai Word par le mainteneur
  (couverture, sommaire, matrice d'équation : OK).** Le générateur est resté hors du dépôt : le `.md`
  est la source à éditer.
- ✅ `all-types-deck.pptx` : s'ouvre dans PowerPoint **et s'importe dans Google Slides** (mainteneur : OK).
- ✅ Incident Pandoc sans droits admin (Windows) : re-testé sur le poste d'origine, **résolu**. Le rapport
  de terrain est archivé dans `docs/history/missing_pandoc_bugfix.md`.
- ✅ `packages/core` : tous les traducteurs honorent `maxDrawingCx/Cy` (`CanvasOptions`, `23a441b`).
- ✅ Bug de schéma Word corrigé : `w:b`/`w:i` avant `w:color`/`w:sz` (`6d1f8a7`).
- ✅ **CI verte sur `npm audit`** (`e8c8e90`) : `braces` (GHSA-vfj7-8cjw-p6xm) n'a **aucune version
  corrigée** (toutes les versions publiées, jusqu'à 3.0.3, sont touchées), donc aucune mise à jour ne
  pouvait faire passer l'audit simple. Deux garde-fous : (1) `npm audit --omit=dev --audit-level=high`
  strict, sans exception, sur l'arbre livré (0 vulnérabilité) ; (2) `scripts/audit-gate.mjs` sur tout
  l'arbre, qui échoue sur tout avis high/critical **sans entrée datée et motivée** dans
  `audit-exceptions.json` (une seule aujourd'hui : braces, expire le **2026-12-31** — à réexaminer ;
  toute exception expirée cesse de couvrir son avis).
- ⏸ **Add-in Word, 3 spikes (Phase 4) : EN ATTENTE** (décision mainteneur, 2026-10-05).

#### Chantiers confiés à l'agent (mainteneur : « c'est dans ta banette »)

- ✅/⏳ **Graphiques Word natifs `c:chart` + classeur embarqué** : `pie` livré et **confirmé dans un vrai Word** (paliers 1-2, Edit Data OK, `64e2739`) ; `xychart` et `radar` livrés (palier 3), validés par schéma + rendu, **Word réel en attente** (CHECKLIST Round 5). Opt-in `MD2NATIVEDOCX_NATIVE_CHARTS=1`. Reste : réglage dans l'extension VS Code, documentation utilisateur, décision de défaut. Historique du chantier : Plan par paliers
      en Phase 6/7. Livrable d'abord : l'ADR (exception à la règle 7 déjà créée par SmartArt) puis le
      spike palier 1 (pie, valeurs en cache, sans classeur) validé par `test:oxml-validate` + LibreOffice,
      puis le classeur, puis vérification dans un vrai Word (le mainteneur ouvre/clique Edit Data).
- ✅ **SmartArt « pixel perfect » + profils de style** — **confirmé dans un vrai Word par le mainteneur (2026-10-05) : v3/v4/v5 s'ouvrent sans avertissement, « très joli »**. Livré : `dsp:drawing` pré-calculé (cinquième partie que Word écrit toujours ; Word et LibreOffice l'affichent comme rendu en cache → même géométrie des deux côtés), opt-in `MD2NATIVEDOCX_SMARTART_DRAWING=1` (avec `MD2NATIVEDOCX_ENABLE_SMARTART=1`) ; `cycle` restructuré (CHECKLIST Rounds 6-7, fichiers `smartart-v3.docx` / `smartart-v4-drawing.docx`). Historique et contraintes : État : `chain`/`tree`
      validés dans Word, `cycle` rend des formes vides dans Word (`smartart-cycle-recheck.docx`), ADR 0006
      « en attente de confirmation Word réelle finale ». Contrainte : le rendu final est celui du moteur de
      mise en page de Word appliqué à notre `layoutDef` ; notre `dsp:drawing` de repli doit coïncider avec
      lui. Boucle d'essais réels avec le mainteneur nécessaire (je ne peux pas ouvrir Word).
- [ ] Ranger le générateur du manuel dans `scripts/` (aujourd'hui hors dépôt).
- [ ] Réponse publique mermaid-js/mermaid#8060 postée par le mainteneur (formes natives vs objet graphique).

#### Autres suites possibles (sans le mainteneur)

- Vendoriser `@md2nativedocx/pptx` dans l'extension VS Code ; tests pptx dans les jobs Windows/macOS de
  `ci.yml` (changement à relire par un humain) ; `.qmd` ; clic droit « Exporter en Word » ; l10n du
  panneau de configuration.

---

### Phase 8 — Personnalisation de l'export + panneau de configuration VS Code

Cadrage complet : `docs/specs/export_customization_SPEC.md`. Détail complet de chaque lot
(root-cause, décisions de conception, comptes de tests) : `docs/history/TODO_ARCHIVE.md`, section
"Phase 8".

- [x] Lot 1 (2026-09-05) : réglages de mise en page/typo (page/orientation/marges, polices,
      interligne, justification, couleur d'accent) via un `reference.docx` généré dynamiquement
      (`packages/cli/src/referenceDocBuilder.mjs`). `TranslateOptions` a gagné
      `maxDrawingCx`/`maxDrawingCy` (changement d'API publique, escaladé et confirmé). 1.11 (style
      de tableau) hors scope, fusionné au Lot 6.
- [x] Lot 1 fast-follow 1.13 (2026-09-05) : pied de page numéroté.
- [x] Lot 2 (2026-09-05) : rendu couleur des emoji/badges (`forceEmojiColorFont`, découpage par
      graphème `Intl.Segmenter`). Non vérifié en vrai Word au moment du fix — hypothèse infirmée
      depuis, voir "Retours en attente de clarification" plus bas.
- [x] Lot 3 (2026-09-05) : sommaire automatique (TOC), placé sous le H1 par chirurgie XML
      (`repositionTocAfterTitle`). Auto-population à l'ouverture confirmée depuis en vrai Word (mode
      protégé, voir "Retours en attente de clarification").
- [x] Lot 4 (2026-09-05) : panneau de configuration Activity Bar + Sidebar, zéro texte dupliqué
      avec `contributes.configuration` (relit `package.nls.json` directement), CSP stricte +
      échappement XSS testé.
- [x] Lot 5 (2026-09-05) : tableaux en section paysage dédiée
      (`docs/adr/0005-landscape-table-section-spike.md`), option complète implémentée.
- [x] Panneau redesigné + 2 réglages + un vrai bug corrigé (2026-09-06) : couleur d'accent ne
      patchait pas les `w:val` de secours des styles (`Heading1`-`9`/`Hyperlink`) — corrigé
      (`patchAccentColorFallbacks()`). `A3` ajouté, `justify` étendu à right/center,
      `typography.tableHeaderColor` ajouté, presets police/mise en page + sélecteur de couleur
      natif dans le panneau.
- [ ] Lot 6 (optionnel) — numérotation automatique des titres (1.12), raffinements de style de
      tableau (1.11).
- [ ] **Escaladé, pas commencé** : couleur de fond des boîtes de sous-graphe personnalisable
      (toucherait l'API publique de `packages/core`) — demande explicite du mainteneur de garder
      une trace séparée.
- [ ] **Gap l10n connu** : les réglages Phase 8 et le panneau lui-même ne sont traduits dans aucune
      des 5 locales existantes. *Mise à jour 2026-10-06 : le panneau suit maintenant la langue de VS Code
      (0.6.0) ; les descriptions de réglages (`package.nls.*.json`) restent partiellement traduites.*
- [ ] Re-vérification en vrai Word demandée au mainteneur (marges "moderate" notamment) —
      `test-corpus/word-verification/CHECKLIST.md` "Round 2".

---

### Phase 9 — Outillage autour du moteur (copy/paste VS Code, MCP, CLI standalone)

Idées loguées le 2026-09-08 (discussion avec le mainteneur + retour croisé sur une analyse de
roadmap produite par Gemini, `docs/roadmap.md`, intégrée ici puis supprimée comme doublon
2026-09-08). Priorisation tranchée le 2026-09-08 : **Copy as Word passe en actif** ; Paste Word as
MD reste explicitement différé (dépend du même convertisseur manquant que l'add-in Word).

- [ ] **"Copy as Word" côté extension VS Code (actif)** — clic droit sur une sélection dans un
      `.md`/`.mmd`, copie l'OOXML généré vers le presse-papiers pour un collage natif dans Word.
      Pendant de l'add-in Word (Phase 4) mais porté par l'extension elle-même plutôt que par
      Office.js : permet de se passer de l'add-in quand il n'est pas installé/autorisé. Contrairement
      à l'add-in, tourne en Node complet côté extension host — pas contraint au sous-ensemble
      "bundlable navigateur" du moteur.
  - [ ] **Spike presse-papiers (bloquant)** : `vscode.env.clipboard` ne fait que du texte brut ; il
        faudrait écrire du `CF_HTML`/RTF sur le presse-papiers OS pour qu'un `Ctrl+V` dans Word colle
        du contenu riche. Vérifier si le module `clipboard` d'Electron est réellement accessible
        depuis l'extension host (process séparé du process principal, jamais testé ici) — sinon,
        solution de repli à évaluer (binaire externe type `clipboardy`, ou passer par un fichier
        temporaire + presse-papiers "fichier" du système).
  - [ ] **Vérifier ce que Word fait réellement d'un collage HTML/RTF** : probable que ça donne des
        formes aplaties/image plutôt que des shapes OOXML natives individuellement sélectionnables
        (ce que l'add-in obtient via `range.insertOoxml()`). À confirmer avant de vendre cette
        feature comme équivalent fonctionnel de l'add-in.
- [ ] **"Paste Word as MD" côté extension VS Code (différé)** — sens inverse, volontairement pas
      commencé : bloqué sur le même trou que l'add-in ("Copier en MD", Phase 4) — aucun
      convertisseur OOXML/HTML→Markdown n'existe dans le codebase. Cibler `CF_HTML` (plus simple à
      parser que l'OOXML brut ; Pandoc sait déjà faire `html → markdown`) plutôt que l'OOXML de
      `getOoxml()`. **Construire ce convertisseur une seule fois pour servir les deux features**
      (cet outillage VS Code + "Copier/Coller en MD" de l'add-in, Phase 4) — à reprendre une fois
      Copy as Word livré, pas avant.
- [ ] **Serveur MCP** (`mermaid-to-office-mcp` ou similaire) — wrapper fin autour du CLI existant,
      pas un nouveau moteur. Cas d'usage : un client MCP (Claude Desktop, Claude Code, Cursor...)
      génère du Mermaid puis appelle l'outil pour produire un `.docx`/`.pptx` natif directement.
      Coût jugé faible tant que `packages/cli` reste la seule chose enveloppée (pas de logique
      dupliquée). Dépend en pratique du chantier CLI standalone ci-dessous (le serveur MCP shell-out
      vers le même binaire que celui publié).
- [x] **CLI standalone préparé pour npm (2026-09-08)** — `packages/core`/`pandoc-filter`/`cli` ne
      sont plus `"private": true`, ont chacun un `README.md`, et `packages/cli/package.json` a
      gagné `repository`/`homepage`/`keywords`/`engines`. Deux vrais bugs de publication trouvés en
      vérifiant en conditions réelles (`npm pack` + install dans un dossier hors du monorepo, pas
      seulement en faisant confiance au hoisting du workspace) :
  - `pandoc-filter` important `@md2nativedocx/core` sans jamais le déclarer en dépendance (marchait
    ici uniquement par accident du hoisting npm) — corrigé.
  - `pandoc-filter`'s `files` excluait `bin/` (le pont JS que le filtre Lua et le CLI utilisent
    tous les deux) — un package publié tel quel aurait été cassé. Corrigé.
  - `bin/md2nativedocx.mjs`'s `FILTER_CANDIDATES` (deux chemins relatifs codés en dur pour localiser
    `md2nativedocx.lua`) ne couvrait ni le monorepo dev ni le bundle vendored VS Code — aucun des
    deux ne correspond à la disposition `node_modules/@md2nativedocx/` plate d'un vrai
    `npm install`. Remplacé par `import.meta.resolve()` (résolution native de Node, correcte dans
    les 3 cas par construction). `scripts/verify-npm-packages.mjs` (câblé en CI) automatise ce
    test en clean-room pour que ça ne régresse plus jamais silencieusement.
  - Au passage : `@types/dagre`/`fast-check` dans `packages/core` étaient en `dependencies` alors
    qu'ils ne servent qu'aux tests/typecheck — déplacés en `devDependencies` (sinon poids mort
    livré à chaque installeur).
  - [ ] **Suivi ouvert, bloquant la vraie publication** : aucun identifiant npm dans ce sandbox
        (`.env` n'a pas de token, le scope `@md2nativedocx` n'existe pas encore sur le registre).
        **Action mainteneur** : créer un compte npm (perso ou org — un scope public est gratuit
        dans les deux cas), générer un "Automation" token (npmjs.com → Access Tokens), et l'ajouter
        à `.env` (racine du repo, déjà gitignored) sous une clé du genre `NPM_TOKEN=...` — même
        pattern que `VSCE_PAT` déjà utilisé pour publier l'extension VS Code. Une fois le token en
        place, la publication (`npm publish` dans l'ordre core → pandoc-filter → cli, `npm whoami`
        pour confirmer l'auth d'abord) peut être faite directement depuis une session ici.
  - [ ] **Limite connue, pas corrigée** : le CLI standalone n'a pas le provisioning automatique
        Pandoc de l'extension VS Code — il faut Pandoc 3.1.3+ déjà installé et sur le PATH (documenté
        dans `packages/cli/README.md`). Extraire cette logique (aujourd'hui dans
        `packages/vscode-extension`) vers un endroit partagé reste à faire si ce manque devient un
        vrai problème pour l'audience CI/scripts — voir [[project_corporate_pandoc_reliability_2026-09]].
- [ ] **Option écartée pour l'instant : binaire compilé par OS.** Discuté avec le mainteneur
      (2026-09-08) — verdict : pas maintenant, coût réel identifié :
  - Taille : non-problème (GitHub Releases est gratuit, ~2 Go/fichier de plage) — un binaire Node
    SEA (Single Executable Application, natif depuis Node 20, zéro nouvelle dépendance) pèse
    ~80-100 Mo par plateforme, sans commune mesure avec le bundling Pandoc/VSIX déjà écarté plus
    haut pour la même raison de coût.
  - Build : maintenant bon marché grâce au matrix CI Windows/macOS/Linux déjà en place (Phase CI
    2026-09-08) — extension naturelle plutôt que nouveau chantier.
  - **Le vrai bloqueur : signature de code, coût récurrent réel.** macOS (Gatekeeper) demande un
    compte Apple Developer (99 $/an) + notarisation ; Windows (SmartScreen) demande un certificat
    de signature (~100-400 $/an) pour éviter l'avertissement "éditeur non reconnu" à chaque
    installation — exactement la friction qu'on essaie d'éliminer pour la persona "poste corporate
    non technique" visée par tout le projet. Sans signature, ça reste utilisable (clic-droit/
    "Exécuter quand même") mais dégrade l'expérience de premier contact.
  - Risque d'ingénierie : Node SEA est encore jeune, aspérités ESM/modules natifs connues —
    probablement un effort de débogage du même ordre que la saga Windows Pandoc/Lua de cette
    session, une fois testé en vrai sur les 3 OS.
  - **À reprendre seulement si un vrai besoin confirmé apparaît** (quelqu'un qui n'a vraiment aucun
    Node et ne peut pas l'installer) plutôt que de payer la facture de signature par anticipation.
- [ ] **Option écartée pour l'instant : réécrire le moteur en Python (`python-docx`/`python-pptx`).**
      Proposée dans l'analyse Gemini (`docs/roadmap.md`, supprimée 2026-09-08) comme moyen de
      découpler le moteur de VS Code/Node. Verdict implicite du 2026-09-08 : le CLI standalone
      (item ci-dessus) obtient déjà le découplage visé (appelable par l'extension, un futur serveur
      MCP, du CI/CD, un backend web) **sans réécriture** — juste en publiant `packages/core`/`cli`
      sur npm. Réécrire en Python doublonnerait tout le traducteur OOXML/DrawingML déjà mûr et
      testé (golden/fuzz/visuel) sans bénéfice net identifié. À rouvrir seulement si un cas d'usage
      concret exige spécifiquement l'écosystème Python (ex. intégration dans un pipeline data
      existant), pas par défaut.

---

### CI/CD & environnement

- [x] `.github/workflows/ci.yml`/`codeql.yml` : typecheck + lint + test + `npm audit` + secret scan
      + CodeQL. `test:visual` sur schedule/release.
- [x] `.devcontainer/devcontainer.json` : Pandoc/Lua pinnés, LibreOffice non pinné (voir item ouvert
      ci-dessous). Toute modif = revue humaine obligatoire (AGENTS.md → Codespaces).
- [x] Validateur Open XML SDK adopté (2026-09-05, ADR 0007) : `scripts/oxml-validator/` +
      `npm run test:oxml-validate`. 17 erreurs de schéma préexistantes dans `reference.docx`
      **investiguées et classées "pas notre bug" (2026-09-06)** — confirmées identiques dans le
      `reference.docx` vanilla de Pandoc et dans un export nu sans aucun code de ce projet ; Pandoc
      génère ces `.docx` sans souci dans Word depuis une décennie malgré ça. Fermé sans changement
      de code.
- [x] Auto-provisioning `.NET` en production (2026-09-05, ADR 0007 partie D) — vérifié bout en bout
      dans un environnement sans aucun `.NET`.
- [x] PR #7 `.devcontainer`/`ci.yml` pour le SDK `.NET` : mergée (2026-09-06).
- [ ] **Pinning LibreOffice — toujours pas tranché.** Non pinné aujourd'hui (limitation documentée
      dans `setup.sh`). Risque identifié : l'environnement de dev (Ubuntu 24.04) diffère de l'image
      déclarée (`devcontainer.json`, Debian bookworm) et du CI (`ubuntu-latest`) — un dépôt apt
      Debian vs Ubuntu n'est pas garanti aligné en version LibreOffice. **Cause du drift déjà
      trouvée et corrigée (2026-09-04) — pas la version de LibreOffice, la police de
      substitution** : `test-corpus/visual/fontconfig/fonts.conf` pin `Aptos`/`Calibri`/`Cambria`
      vers Liberation Sans/Serif pour le sous-processus `soffice` uniquement (`FONTCONFIG_FILE`,
      aucune modif `.devcontainer/`) — a aussi corrigé un vrai bug de troncature de texte, pas
      juste un défaut cosmétique. La question du pinning de *version* LibreOffice reste ouverte en
      tant que telle mais n'est plus urgente, la cause réelle observée jusqu'ici étant absorbée.
- [x] `test:visual` : rendu LibreOffice headless → pixel-diff, 32 fixtures.

Détail complet (root-cause, preuves empiriques) : `docs/history/TODO_ARCHIVE.md`, section
"CI/CD & environnement".

---

### Critère d'acceptation MVP (spec §9)

- [x] **Flowchart ≤ 15 nœuds : 0 croisement de flèches nécessitant un réarrangement manuel dans
      >90 % des cas testés (2026-09-03)** — preuve géométrique objective (pas une relecture
      visuelle), voir `docs/mvp-acceptance-report.md` §1 : 23/24 = 95,8 % sur le corpus visuel
      étendu de 2 fixtures adversariales (`scripts/mvp-crossing-report.mjs`). La seule exception
      (`crossing-stress-bipartite.mmd`, graphe biparti quasi-complet) est documentée comme un cas
      pathologique non représentatif d'un flowchart typique, pas un défaut de layout.
- [ ] Tests manuels dans Word réel avant chaque release : chaque forme individuellement
      sélectionnable, texte sans débordement, connecteurs attachés après déplacement d'une boîte.
      **Premier passage fait le 2026-09-03** (`test-corpus/word-verification/`, détail dans
      `docs/mvp-acceptance-report.md` §2) : 2 des 5 fichiers étaient cassés par un bug du harnais
      de test (corrigé, re-vérification en attente), et un vrai écart de fidélité a été trouvé —
      les sous-graphes imbriqués n'affichent aucune boîte de conteneur visible (seul le titre
      flotte), confirmé identique dans le rendu LibreOffice déjà accepté comme baseline (donc pas
      une régression Word, un angle mort du test visuel lui-même). Reste à faire : re-tester les 2
      fichiers corrigés, confirmer explicitement le test "déplacer une boîte, le connecteur reste
      attaché".
- [x] **Boîte de conteneur de sous-graphe — corrigé (2026-09-03)**, tranché par le mainteneur : on
      n'est pas lié au rendu de Mermaid (OOXML fait ce qu'on veut), mais viser la même ressemblance
      topologique là où c'est gratuit. `renderSubgraph()` (`ooxml-translator.ts`) dessine maintenant
      un rectangle plein gris (`SUBGRAPH_FILL`/`SUBGRAPH_LINE`, bordure tiretée) sur toute la boîte
      du cluster (`box.width`/`box.height`, déjà calculée par `layout.ts`), rendu avant le titre et
      avant les nœuds (ordre d'émission = ordre de z dans ce format) donc jamais au-dessus. Vérifié
      visuellement sous LibreOffice sur les 4 fixtures à sous-graphes (`subgraph`, `lr-subgraphs`,
      `multiple-subgraphs`, `nested-3-levels` — baselines mises à jour après revue). 149/149 tests
      `packages/core` toujours verts, aucune régression.
- [x] **SmartArt désactivé par défaut (2026-09-03)** — voir "Incident cycle" ci-dessous.

### Incident SmartArt "cycle" cassé en Word réel (2026-09-03) — clos

Un cycle à 3 nœuds produisait un `.docx` que Word refusait d'ouvrir ; `smartArt.enabled` est passé
à `false` par défaut en mitigation immédiate. Cause réelle trouvée le 2026-09-05 après 9 rounds
(`docs/adr/0006-dsp-drawing-fallback-spike.md`) : `modelId`/`srcId`/`destId` est un type union
(`ST_ModelId`) qui n'accepte qu'un entier ou un GUID, jamais une chaîne libre (`"p-root"`, etc.) —
trouvé par l'**Open XML SDK Validator** de Microsoft, pas par comparaison manuelle (3 hypothèses
manuelles précédentes avaient toutes échoué). **Leçon méthodologique adoptée depuis** : lancer le
validateur en premier pour tout futur "Word refuse d'ouvrir le fichier", avant toute comparaison
manuelle — voir `AGENTS.md`. Confirmé ouvert en vrai Word par le mainteneur (2026-09-05). Un second
bug trouvé une fois le fichier ouvrable (`tree` affichait le texte des enfants dupliqué dans la
boîte racine, `axis="desOrSelf"` au lieu de `axis="self"`) — corrigé, en attente de reconfirmation
en vrai Word.

Détail round par round : `docs/adr/0006-dsp-drawing-fallback-spike.md` et
`docs/history/TODO_ARCHIVE.md`, section "Incident SmartArt cycle".

---

### Incident `quadrantChart`/`venn-beta`/`mindmap` cassés en Word réel (2026-09-06) — clos

Round 2 de la checklist Word réelle : les 3 types (activés par défaut, contrairement à SmartArt)
produisaient un `.docx` refusé par Word — jamais passés par `test:oxml-validate` jusqu'ici. Cause
trouvée le jour même par le validateur (même méthode que l'incident SmartArt) : `<w:jc>` recevait
des codes courts DrawingML (`l`/`ctr`/`r`) au lieu des valeurs `ST_Jc` longues
(`left`/`center`/`right`). Corrigé dans les 3 traducteurs. **Angle mort méthodologique corrigé en
plus du bug** : `test:oxml-validate` ne classait que `/word/diagrams/*` comme "sortie de ce
projet" — élargi à `wpc:wpc` (le canevas OOXML simple, utilisé par ces 3 types et par flowchart),
qui était jusque-là silencieusement classé "bruit Pandoc préexistant".

- [ ] **Suivi ouvert** : le check de compatibilité Word (`wordCompatibilityCheck.enabled`) ne
      s'applique qu'à l'extension VS Code empaquetée, jamais au CLI nu en dev — question de
      rentabilité d'un `dotnet build` à chaque export, pas encore tranchée.

Détail complet : `docs/history/TODO_ARCHIVE.md`, section "Incident quadrant/venn/mindmap".

### Incident "tout export échoue sur Windows nu" (2026-09-08) — clos

Rapport de diagnostic sur un poste de test Windows "from scratch" (v0.5.1) : le toast affichait
"Pandoc could not be found on this machine", mais Pandoc/.NET étaient entièrement provisionnés
(confirmé via le cache disque) — le vrai crash (`spawnSync unzip ENOENT`) venait de
`buildReferenceDoc()`/`postProcessDocx()`/`injectSmartArtParts()`, qui shell-outaient vers
`unzip`/`zip`, absents nativement sur Windows. Comme `md2nativedocx.layout.pageSize`/
`.orientation` ont des valeurs par défaut non vides, ce chemin s'exécute sur **chaque export**, pas
seulement en cas de personnalisation — donc pas un cas limite corporate mais une régression
universelle sur Windows nu. Explique pourquoi ça n'avait jamais été vu : toutes les vérifications
"vrai Word" précédentes généraient le `.docx` dans le devcontainer Linux et ne transféraient que le
fichier fini vers Windows — c'était la première exécution de bout en bout du CLI empaqueté sur un
Windows natif.

Trois correctifs, tous poussés le jour même :
1. `unzip`/`zip` remplacés par `adm-zip` (JS pur, nouvelle dépendance directe de `packages/cli`,
   approuvée par le mainteneur) dans `postprocess.mjs`/`referenceDocBuilder.mjs` — plus aucun
   binaire externe pour patcher les entrées du `.docx` (`bd45d66` pour le diagnostic,
   `6e3a563` pour ce correctif racine).
2. `buildReferenceDoc()` s'exécutait au chargement du module, avant que `main()` ait un
   try/catch — toute erreur y produisait un stack trace Node brut au lieu du message
   `md2nativedocx: ... failed: ...` standard. Enveloppé.
3. `exportService.ts`'s `runCli()` classait n'importe quel `ENOENT` dans stderr comme "Pandoc
   manquant" — resserré pour ne matcher que le marqueur contrôlé du CLI
   (`md2nativedocx: Pandoc failed (exit ENOENT)`), pour ne plus jamais mélanger un `ENOENT`
   interne non lié à Pandoc (celui-ci, ou un futur) avec l'absence réelle de Pandoc.

Vérifié en reproduisant exactement l'environnement du rapport (PATH réduit à node/pandoc/tar, sans
`zip`/`unzip`) : l'export réussit et produit un `.docx` valide. Suite complète verte (113 cli + 15
pandoc-filter + 296 core), typecheck clean.

- [x] **Publié en 0.5.2 sur le Marketplace (2026-09-08).**
- [ ] **Suivi ouvert** : re-confirmer sur le vrai poste de test Windows qui a rapporté le bug (pas
      seulement reproduit en sandbox Linux) avant de considérer le sujet définitivement clos.

### Incident crash Pandoc/Lua sur Windows — `os.tmpname()` + spawn Node cassé (2026-09-08) — clos, publié 0.5.3

Un collègue de Nicolas a eu, sur chaque export : `md2nativedocx: Pandoc failed (exit 11)` +
`Access violation in generated code when reading 0xffffffffffffffff` (stack GHC/HsLua). Un autre
collègue de l'équipe (via GitHub Copilot, "GHCP") avait déjà patché le fichier `.lua` en direct sur
la machine du premier avant que le mainteneur ne demande une revue ici — deux bugs réels et
indépendants, tous les deux dans **notre propre code**, pas Pandoc :

1. `md2nativedocx.lua` appelle `os.tmpname()` pour chaque bloc mermaid — la liaison HsLua vers
   `tmpnam()` de la libc a un défaut Windows documenté de longue date (peut renvoyer un chemin à la
   racine du disque) qui, sur au moins une build Pandoc réelle (3.9.0.2, installée via WinGet),
   crashe purement et simplement plutôt que d'échouer proprement. Corrigé avec les primitives
   portables propres à Pandoc : `pandoc.system.with_temporary_directory` + `pandoc.path.join`
   (version de GHCP adoptée telle quelle, meilleure que le premier correctif local du mainteneur —
   nettoyage garanti y compris en cas d'erreur).
2. **Deuxième bug, plus fondamental, trouvé en corrigeant le premier** : le filtre Lua invoque son
   "core bridge" Node via un chemin `.mjs` nu (`core_bin .. ' ' .. tmp`) — ça ne marche que sur Unix
   (shebang + bit exécutable) ; Windows n'a ni l'un ni l'autre, donc **aucun diagramme n'a jamais pu
   être rendu sur Windows**, indépendamment du crash ci-dessus (confirmé par le premier vrai run du
   nouveau job CI Windows : ~20 tests en échec, tous "`w:drawing` manquant"). Corrigé (version de
   GHCP adoptée) : invocation explicite `"<node>" "<core_bin>" "<tmp>"` sur Windows, avec la double
   paire de guillemets nécessaire pour contourner le comportement de `cmd /c`. **Pièce manquante du
   patch de GHCP, ajoutée ici** : `MD2NATIVEDOCX_NODE_BIN` n'était jamais renseigné par notre propre
   code — retombait silencieusement sur un `node` nu du PATH, réintroduisant un cran plus profond
   exactement le problème "pas de Node installé" déjà réglé en 0.5.1 pour le spawn extérieur
   (`exportService.ts` → `process.execPath`). `bin/md2nativedocx.mjs` renseigne maintenant cette
   variable avec `process.execPath`.
3. **Troisième correctif, indépendant mais lié** : `ensurePandoc()` vérifiait un pandoc du PATH
   *avant* notre propre build 3.1.3 pinnée — donc n'importe quel pandoc trouvé sur le PATH (le
   3.9.0.2 ci-dessus, installé pour une tout autre raison) gagnait silencieusement, sans même que
   notre téléchargement ne soit tenté. Décision explicitement laissée en suspens dans
   `missing_pandoc_bugfix.md` §8 — cet incident la tranche : le build pinné passe désormais en
   premier, le PATH ne sert plus que de dernier recours.
4. `isBlockedByPolicy()` avait le même défaut de classification trop large que l'`ENOENT` de
   l'incident précédent (scan de tout le stderr pour "EACCES"/"EPERM"/"1260") — resserré sur le
   marqueur contrôlé du CLI, même principe.

Job CI Windows (ajouté juste avant cet incident) déterminant pour le diagnostic : a confirmé le
hang CI de 50+ minutes était bien causé par `os.tmpname()` (plus de hang après le premier correctif
partiel), puis a directement révélé le bug n°2 (les ~20 échecs "`w:drawing` manquant"), puis un
dernier problème mineur : `unzip`/`zip -p ... '\[Content_Types\].xml'` (échappement des crochets
pour le glob) se comporte différemment sur le build Windows d'Info-ZIP — 3 helpers de test
(`corpus.test.mjs`/`postprocess.test.mjs`/`reference-doc-builder.test.mjs`) basculés sur `adm-zip`
pour cette lecture précise (code produit non affecté, uniquement des helpers de test).

Publié en **0.5.3** sur le Marketplace (2026-09-08). Suite complète verte partout (113 cli + 296
core + 15 pandoc-filter + 64 vscode-extension + 4 word-addin), typecheck clean.

- [ ] **Suivi ouvert 1** : re-confirmer avec le collègue concerné que l'auto-update vers 0.5.3
      règle bien le crash sur sa machine réelle.
- [x] **Suivi ouvert 2, clos (2026-09-08)** : plutôt que de committer `handmade_samples/
      cycle-simple.docx` ou de le remplacer par une fixture `test-corpus/` statique, investigation
      plus poussée a trouvé que l'hypothèse même du smoke-test (`errorCount === 0`) ne tient plus
      pour **aucun** export aujourd'hui : les parties issues du `reference.docx` de Pandoc (styles/
      numbering/settings) portent ~17 défauts de schéma préexistants et déjà documentés (voir
      `scripts/test-oxml-validate.mjs`, "bruit Pandoc, pas nous"), vérifié empiriquement (même sur
      `test-corpus/word-verification/minimal.docx`). Vrai correctif : `bundle-oxml-validator.mjs`
      génère maintenant un diagramme minimal à la volée via le CLI du projet lui-même au moment du
      smoke-test (aucune fixture statique, aucune question de licence) et applique la même
      classification `word/diagrams`/`wpc:wpc` que `test:oxml-validate` au lieu d'un `errorCount`
      brut. Job CI macOS ajouté au passage (même template que Windows).

### Retours en attente de clarification (checklist Round 2, 2026-09-06)

- [x] **Emoji pas tous coloriés en vrai Word — fermé comme limitation documentée (2026-09-06)** :
      hypothèse initiale (sélecteur U+FE0F manquant) infirmée par une revue de 31 symboles en vrai
      Word. Partage empirique réel : `✅ ❌ ✔ ✖ ⭐ ☑` (+ keycaps) restent monochromes quel que soit
      le sélecteur, tout le reste s'affiche en couleur — aucune propriété Unicode interrogeable
      n'explique ce partage, probablement une liste Microsoft figée (héritage Wingdings). Recherche
      web faite, pas de contournement propre trouvé sans sacrifier la portabilité du texte. Le fix
      U+FE0F est conservé (inoffensif) mais sa documentation ne prétend plus régler ces 6 symboles.
- [x] **TOC vide au premier lancement — pas un bug, fermé** : mode protégé de Word (fichier
      téléchargé) ; se peuple correctement après "Activer la modification".
- [ ] **Connecteurs non attachés sur 2 arêtes précises d'un graphe biparti quasi-complet**
      (`crossing-stress-bipartite.docx`, item 5) : A1→B3 et A3→B2 ne suivent pas leurs boîtes quand
      on les déplace, alors que les autres arêtes du même fichier restent bien attachées. Fixture
      délibérément adversariale (12 croisements géométriques déjà documentés,
      `docs/mvp-acceptance-report.md` §1) — pas représentative d'un flowchart typique, mais un vrai
      bug de rattachement magnétique (`stCxn`/`endCxn`) potentiellement lié à un indice de site de
      connexion mal choisi dans un graphe très dense. Pas encore investigué (priorité plus basse que
      l'incident ci-dessus, qui affecte des diagrammes non adversariaux par défaut).
- [ ] **`smartart-cycle-recheck.docx` : forme vierge, conteneur SmartArt visible mais aucune boîte
      dessinée** (le volet de données latéral montre bien A/B/C, donc le modèle de données est
      intact) — différent du bug de corruption (le fichier s'ouvre, `smartart-tree-recheck.docx` lui
      confirme le fix `axis="self"` correctement). `smartArt.enabled` reste `false` par défaut donc
      priorité plus basse ; probablement un souci de géométrie/contrainte propre à `cycle.ts`'s
      `layoutDef`, pas encore investigué.

---

### Piste — Contribuer le moteur en amont à Pandoc (idée loguée 2026-09-10)

Idée du mainteneur, pas scopée : cloner le dépôt Pandoc et proposer une branche/PR portant notre
traduction diagramme → OOXML. À noter avant de s'engager, pour cadrer une vraie discussion plutôt
que de partir tête baissée :

- Pandoc est écrit en Haskell ; `packages/core` est en TypeScript. Une "PR vers Pandoc" ne peut donc
  pas être un simple portage de notre code — soit une réécriture du traducteur en Haskell (gros
  chantier, double maintenance de deux implémentations dans deux langages), soit une proposition
  plus modeste côté Pandoc (ex. un point d'extension officiel pour qu'un filtre externe injecte du
  `RawBlock('openxml')` groupé sans les limitations actuelles, si de telles limitations existent —
  pas vérifié).
- Notre architecture actuelle (cahier des charges §0/§4) traite déjà Pandoc comme un hôte externe
  mature qu'on ne modifie pas, précisément pour ne pas avoir à maintenir un fork — proposer un
  changement upstream inverse cette logique et engage une relation avec un projet tiers (revue de
  mainteneurs Pandoc, délais hors de notre contrôle, exigences de style Haskell/tests du projet).
- Avant de cloner quoi que ce soit : clarifier l'objectif réel — remonter un besoin/une limitation
  précise à l'issue tracker de Pandoc (léger, rapide) vs. proposer du code (lourd, incertain). À
  trancher avec le mainteneur avant tout spike.

### Règles non négociables (rappel — voir AGENTS.md)

1. Rester dans le scope : tout ce qui n'est pas diagramme → OOXML est délégué à Pandoc.
2. Échapper `& < > " '` dans tout texte utilisateur avant insertion XML.
3. Jamais de relation OOXML externe (`TargetMode="External"`).
4. Jamais de commande subprocess construite par concaténation de chaîne.
5. DTD + entités externes désactivés sur tout parseur XML (tests inclus).
6. Pas de dépendance sans justification d'une ligne dans la PR.
7. Ne pas toucher aux internals ZIP du `.docx` (c'est le job de Pandoc).

### Escalader à un humain

- Changement de l'API publique de `packages/core` (contrat de sortie du traducteur).
- Nouvelle dépendance.
- Exception à la règle "pas de relation OOXML externe".
- Assouplissement d'une règle de lint sécurité ou d'une ligne du tableau de sécurité.
- Modification de `.devcontainer/` ou `.vscode/`.
- Questions de licence.

## 2026-10-07 — incidents Windows de septembre clos

La 0.7.0 installée depuis la Marketplace sur le poste Windows d'entreprise a été validée par le mainteneur : `spawnSync unzip ENOENT` et le crash Pandoc/Lua `os.tmpname` sont clos.

## 2026-10-07 — première publication npm

`@md2nativedocx/core`, `pandoc-filter`, `pptx` et `cli` publiés en 0.1.0 (ordre des dépendances ; `pptx` est requis par `cli`). Vérifié depuis le registre : `npx @md2nativedocx/cli@0.1.0` produit un `.docx` valide dans un répertoire vierge. Le registre a mis environ 5 minutes à répondre 200 après le publish.
