# TODO — `md2nativedocx`

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


## Phase 0 — spikes résolus

Entièrement redondant avec la version structurée ci-dessous ("Phase 0 — Spike technique") et les
ADR 0001/0002 — condensé dans `docs/history/TODO_ARCHIVE.md`.

---

## Historique condensé (2026-08-06 → 2026-09-04)

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

## Phase 2 — Extension VS Code voir aussi docs/specs/UX_SPEC.md

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

## Phase 3 — Couleurs + sous-graphes

- [x] Mapping `classDef fill:#XXXXXX` → `<a:solidFill><a:srgbClr val="XXXXXX"/></a:solidFill>` (§6.3) —
      déjà livré en Phase 1, case cochée tardivement ici (bookkeeping, aucun code changé).
- [x] `subgraph` → groupes imbriqués `<wpg:grpSp>` avec libellé en `<wps:txbx>` (§6.1), y compris
      l'imbrication à plusieurs niveaux (`subgraphIds` correctement peuplé, réservation d'espace
      de titre récursive — voir entrées 2026-08-07 ci-dessus) — case cochée tardivement ici.

## Phase 4 — Add-in Word (Office.js)

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

## Phase 5+ — Autres types de diagrammes

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
- [ ] Diagrammes de séquence (priorité, demande la plus fréquente après flowchart — mais famille
      de layout "lifeline", pas la moins chère techniquement ; arbitrage documenté comme
      "angle mort n°1" dans la spec ci-dessus, pas tranché).
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

## Phase 6 — Google Slides (`.pptx`) et Phase 7 — SmartArt (`mmd2smartart`)

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
- [ ] Traducteur `.pptx` de production (spec Google Slides §5-§7) — pas commencé, en attente de la
      vérification manuelle Google Slides/PowerPoint listée ci-dessus.
- ✅ Catalogue complet des layouts SmartArt (2026-09-03) — `docs/smartart-layout-catalog.md`, ~150
  layouts classés par pertinence pour un flowchart Mermaid. Deux pistes identifiées : `Labeled
  Hierarchy` (subgraph = hiérarchie libellée) et les layouts "convergents" (fusion après
  branchement) — toutes deux évaluées ci-dessous.
- ✅ Piste "subgraph = hiérarchie libellée" testée, cas général écarté (2026-09-03) — l'étiquette
  de `Labeled Hierarchy` s'applique par niveau de profondeur, pas par branche ; ne couvre que le
  cas restreint où tous les nœuds d'une même profondeur partagent le même `subgraph`.
- [ ] **Nouvelle piste "subgraph = `Nested Target`" (2026-09-03)** — cercles concentriques,
      containment réel, mieux motivée que `Labeled Hierarchy`. Pas encore de générateur ni
      d'échantillon Word analysé — échantillon demandé dans `docs/smartart-samples-wishlist.md`,
      en attente.
- ✅ Piste définitivement close (2026-09-03, 3 essais réels indépendants) : `subgraph` = boîte de
  titre existante + diagramme SmartArt intégré via `wpc:graphicFrame` — 3 hypothèses distinctes,
  le même échec dur à l'ouverture dans un vrai Word à chaque fois. `Nested Target` reste la piste
  active.
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
- [ ] **Profondeur d'arbre adaptative (> 2)** pour `tree.ts` — le partage de hauteur fixe (35 %
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

---

## Phase 8 — Personnalisation de l'export + panneau de configuration VS Code

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
      des 5 locales existantes.
- [ ] Re-vérification en vrai Word demandée au mainteneur (marges "moderate" notamment) —
      `test-corpus/word-verification/CHECKLIST.md` "Round 2".

---

## Phase 9 — Outillage autour du moteur (copy/paste VS Code, MCP, CLI standalone)

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

## CI/CD & environnement

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

## Critère d'acceptation MVP (spec §9)

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

## Incident SmartArt "cycle" cassé en Word réel (2026-09-03) — clos

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

## Incident `quadrantChart`/`venn-beta`/`mindmap` cassés en Word réel (2026-09-06) — clos

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

## Incident "tout export échoue sur Windows nu" (2026-09-08) — clos

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

## Incident crash Pandoc/Lua sur Windows — `os.tmpname()` + spawn Node cassé (2026-09-08) — clos, publié 0.5.3

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

## Retours en attente de clarification (checklist Round 2, 2026-09-06)

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

## Piste — Contribuer le moteur en amont à Pandoc (idée loguée 2026-09-10)

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