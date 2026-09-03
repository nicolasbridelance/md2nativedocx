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

## Phase 6 — Google Slides (`.pptx`) et Phase 7 — SmartArt (`mmd2smartart`)

Cadrage complet dans `cahier_des_charges_google_slides.md` et `FUTURE_mmd2smartart_SPEC.md`.
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
- [x] **`FUTURE_mmd2smartart_SPEC.md` révisée (2026-09-03)** — §3/§3.1 (nouveau)/§4/§7 mis à jour :
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
- [x] **Tableau de compliance livré (2026-09-03)** — `docs/smartart-compliance-table.md`, sur
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
      `parser.ts` séparément — bug de parseur, pas lié au choix SmartArt/OOXML.
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
      (9) + ajouts aux suites chain/tree existantes. `docs/smartart-compliance-table.md` mis à jour
      en conséquence. Monorepo entier
      revérifié vert (build/typecheck/lint/128 tests core + 5 pandoc-filter + 23 vscode-extension).
      **Volontairement pas tenté** : override de forme par nœud (confirmé sans effet, voir point 2) ;
      `Labeled Hierarchy` pour `subgraph` et layouts "convergents" pour la fusion après branchement
      (tous deux nécessitent un vrai échantillon Word extrait par le mainteneur, pas quelque chose
      qui peut être fait à l'aveugle) ; profondeur d'arbre adaptative > 2 (chantier de conception à
      part entière, pas une extension incrémentale).
- [ ] **Durcissement du parseur Mermaid** (`packages/core/src/parser/parser.ts`) — bugs trouvés en
      construisant `docs/smartart-compliance-table.md` (2026-09-03), tous vérifiés empiriquement,
      bénéficiant aux **3** stratégies de sortie à la fois (pas spécifique à SmartArt) :
      - texte de nœud entre guillemets (`id["texte"]`, la syntaxe recommandée par Mermaid pour
        l'Unicode) garde les guillemets littéralement dans le label — `id[texte]` sans guillemets
        n'a pas ce problème ;
      - `<br/>`, les codes d'entité Mermaid (`#quot;`, `#9829;`), et les "Markdown Strings"
        (backticks + `**gras**`) ne sont jamais interprétés, tous restent littéraux ;
      - directions `TB` (alias documenté de `TD`), `BT`, `RL` non reconnues, retombent
        silencieusement à `TD` ;
      - libellé d'arête au milieu du tiret (`A-- texte -->B`) non supporté, seule la forme
        `A-->|texte|B` l'est ;
      - `classDef` échoue dès que `fill:` n'est pas la première propriété (`stroke:...,fill:...`),
        ou avec plusieurs classes (`classDef a,b ...`) ;
      - `:::` (raccourci de classe) ne fonctionne que sur une extrémité d'arête, jamais sur une
        déclaration de nœud isolée (`A[Texte]:::foo` seul sur sa ligne) ;
      - arêtes multidirectionnelles (`o--o`, `x--x`, `<-->`), liens invisibles (`~~~`),
        modificateurs de longueur (`---->`), chaînage sur une ligne (`A-->B-->C`), opérateur `&`
        (`a --> b & c`), `style`/`linkStyle` : aucun n'est reconnu.
      Détail complet avec preuves empiriques dans `docs/smartart-compliance-table.md` §5.
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
- [ ] **Volet "corporate"** (noté par le mainteneur, 2026-09-03, à faire après le tableau ci-dessus) :
      documenter comment un utilisateur charge le template Word de son entreprise pour générer
      directement dans ce template, depuis l'extension VS Code — via un réglage
      (`md2nativedocx.referenceDoc` ou équivalent, chemin vers un `.docx` de référence personnalisé,
      dans l'esprit de `--reference-doc` de Pandoc déjà utilisé en interne pour
      `packages/cli/assets/reference.docx`) ou une commande explicite "Charger un fichier de
      référence". Mécanisme d'exposition côté VS Code pas encore déterminé — à concevoir.

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