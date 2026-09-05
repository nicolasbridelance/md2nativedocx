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

- [ ] Taskpane avec zone de collage Mermaid.
- [ ] Appel au même module core (bundlé navigateur) — raison du choix TypeScript.
- [ ] Insertion via `context.document.body.insertOoxml(xmlString, Word.InsertLocation.replace)`.

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

Cadrage complet dans `docs/specs/export_customization_SPEC.md`. Origine : échange avec le
mainteneur (2026-09-04) sur la mise en page Word (tableaux en paysage, polices/marges/TOC
configurables) et sur la perte de couleur des emoji/badges (✅/⚠️) à l'ouverture dans Word. Pas
encore priorisé par rapport à la Phase 6/7 en cours (Slides/SmartArt) — voir "Questions ouvertes"
de la spec, §5.

- [x] **Lot 1 (sous-ensemble solide) — réglages de mise en page/typo via `reference.docx` généré
      dynamiquement (2026-09-05)** : 1.1-1.8 + 1.14 (format/orientation/marges, polices titre+corps,
      taille, interligne, justification, couleur d'accent) livrés et vérifiés en rendu réel
      (LibreOffice headless). 1.11 (style de tableau, sous-spécifié dans la spec) et 1.13 (pied de
      page numéroté, demande une nouvelle partie `word/footer*.xml` + relation + content-type type
      `injectSmartArtParts`) restent **hors scope de cette passe**, fast-follow explicite du même
      Lot 1 — pas une régression de périmètre, décidé avec le mainteneur avant de commencer.
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
- [ ] **Lot 2 — rendu couleur des emoji/badges** (spec §1.15, §2.5) : post-traitement dans
      `postprocess.mjs`, force `w:rFonts` "Segoe UI Emoji" sur les runs contenant un emoji.
      Réglage `md2nativedocx.emoji.forceColorFont` (défaut `true`). **À valider empiriquement
      multi-plateforme avant de considérer le lot terminé** (option 1 retenue par le mainteneur,
      "à tester" — filet de secours "pastilles `w:shd` custom" documenté dans la spec si ça
      échoue sur une plateforme donnée).
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
        proposera/effectuera la mise à jour à l'ouverture. **Non vérifié dans un vrai Word** que
        les entrées se peuplent bien à l'ouverture — même catégorie que les autres items "à tester
        dans un vrai Word" déjà ouverts dans ce fichier.
      - Tests : 3 nouveaux tests `postprocess.test.mjs` (`repositionTocAfterTitle` pur + intégration
        `postProcessDocx({ toc: true })` réelle unzip/zip), 3 `reference-doc-builder.test.mjs`
        (`patchSettings` pur), 2 `cli.test.mjs` bout-en-bout (TOC placé après le H1 + fonctionne
        avec un `referenceDocument` custom). VS Code : `md2nativedocx.toc.enabled`/`.toc.depth`.
        401 tests au total, tous verts ; `test:visual` 35/35 inchangé.
- [ ] **Lot 4 — panneau de configuration Activity Bar + Sidebar** (spec §3) : nouveau View
      Container + Webview View (`registerWebviewViewProvider`), réglages groupés
      pédagogiquement (mise en page / typographie / structure / tableaux paysage / emoji /
      avancé), aperçu CSS "Niveau 1" pour la mise en page/typo uniquement (pas de simulation
      honnête possible pour saut de section ou rendu emoji, spec §3.3). Lecture/écriture via
      `vscode.workspace.getConfiguration` — pas de double source de vérité avec
      `contributes.configuration`. **Escalade `AGENTS.md`** : ajouter le point d'entrée à
      `docs/specs/UX_SPEC.md` (tableau "Points d'entrée", Partie 1) plutôt que de le laisser
      implicite. Dépend des Lots 1–3.
- [ ] **Lot 5 — tableaux en section paysage dédiée** (spec §1.9, §2.3) : le saut de section
      s'insère avant le **titre** qui précède le tableau, pas avant le tableau. Nouveau filtre
      Lua (`Pandoc(doc)` avec lookahead `Header`→`Table`, en plus du seul `CodeBlock` mermaid
      traité aujourd'hui) — piège OOXML documenté dans la spec (le `sectPr` de fin de section se
      code dans le dernier paragraphe de la section qui se termine, pas en tête de la suivante).
      **Prévoir un spike dédié avant d'estimer plus finement** (même pratique que Pandoc/ADR 0002
      et SmartArt/ADR 0004) — lot le plus risqué du chantier, dépend du Lot 1.
- [ ] Lot 6 (optionnel, non demandé explicitement) — numérotation automatique des titres (1.12),
      raffinements de style de tableau (1.11).

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

## Incident SmartArt "cycle" cassé en Word réel (2026-09-03)

Un cycle à 3 nœuds (`A-->B-->C-->A`), le cas le plus simple possible, produisait un `.docx` que
Word refuse d'ouvrir ("erreur lors de l'ouverture du fichier"). `cycle.ts` (comme `chain.ts`/
`tree.ts`) n'avait jamais été testé en Word réel, seulement sous LibreOffice headless — la table de
compliance (`docs/markdown-mermaid-compliance-table.md`) affichait "✅ Full" sur cette seule base, corrigée
depuis (§2 point 5 ajouté). Comme `smartArt.enabled` valait `true` par défaut (CLI et extension déjà
publiée 0.3.0), c'était un bug de corruption par défaut pour tout flowchart utilisateur en boucle
fermée, pas un cas de labo.

- ✅ **Mitigation immédiate — SmartArt off par défaut (2026-09-03)** : `smartArtEnabled`
      (`MD2NATIVEDOCX_ENABLE_SMARTART` opt-in), `md2nativedocx.smartArt.enabled` à `default: false`.
      Détail complet : `docs/history/TODO_ARCHIVE.md`.
- [ ] **Cause racine probable identifiée, pas encore corrigée** : échantillon Word réel fourni par
      le mainteneur (`handmade_samples/cycle-simple.docx`, Insertion → SmartArt → Cycle simple dans
      Word) diffé contre notre sortie. Différence structurelle majeure : le fichier Word réel a une
      **5e partie**, `word/diagrams/drawingN.xml` (`dsp:drawing` — un arbre de formes concrètes
      *pré-calculées*, `dsp:sp`/`a:xfrm` avec positions absolues réelles, pas l'algorithme abstrait),
      référencée depuis `data1.xml` via `<dgm:extLst><a:ext uri="http://schemas.microsoft.com/
      office/drawing/2008/diagram"><dsp:dataModelExt relId="rIdX" .../></a:ext></dgm:extLst>`, plus
      la relation `.../relationships/diagramDrawing` et l'override de content-type
      `application/vnd.ms-office.drawingml.diagramDrawing+xml`. Notre générateur (`chain.ts`/
      `tree.ts`/`cycle.ts`) n'émet **aucune** de ces 4 choses — c'était déjà une question ouverte
      dans `docs/adr/spikes/spike-smartart/spike.md` ("Whether the dgm:extLst/dsp:dataModelExt
      placement... are what real Word actually expects"), jamais tranchée faute d'échantillon.
      Hypothèse à confirmer : Word refuse d'ouvrir un `dgm:dataModel` avec un `layoutDef` personnalisé
      (non un des siens, référencé par URN Microsoft comme `urn:microsoft.com/office/officeart/
      2005/8/layout/cycle2` dans l'échantillon réel) s'il n'a pas ce filet de sécurité pré-rendu à
      afficher. Bonne nouvelle : le générateur `wpc:wpc`/`wps:wsp` existant (chemin OOXML-only)
      calcule déjà exactement ce dont un `dsp:drawing` a besoin (mêmes coordonnées de layout,
      logique de rendu de formes très proche du schéma `dsp:sp`) — pas besoin de réinventer un
      moteur de rendu, juste un nouvel émetteur XML `dsp:*` alimenté par les mêmes données. Ne pas
      réactiver `smartArt.enabled` par défaut avant que ce filet soit implémenté et re-testé en Word
      réel sur `chain`/`tree`/`cycle` tous les trois (aucun des trois n'a de signal Word réel positif
      sur la sortie de production — `chain` a seulement un échantillon isolé fait main, ADR 0004
      "Round 5").
- ✅ **Deuxième reproduction, involontaire, du même bug (2026-09-04)** — un fixture de test
      généré avec SmartArt forcé a retouché le même bug non corrigé ; corrigé en régénérant avec
      les réglages par défaut, ne change rien à l'état du chantier (toujours non corrigé). Détail
      complet : `docs/history/TODO_ARCHIVE.md`.

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