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