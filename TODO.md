# TODO — `md2nativedocx`

> Backlog des items **réellement ouverts** au 2026-10-06, chacun vérifié contre le code et l'historique.
> Rien de terminé ici : un item fini sort du fichier (son détail va dans le message de commit, ou dans
> `docs/history/TODO_ARCHIVE.md` s'il mérite un récit). L'ancien `TODO.md` complet (1 500 lignes, tous
> les chantiers fermés) est recopié en fin de `docs/history/TODO_ARCHIVE.md`.
>
> État du produit : `HANDOVER.md`. Ce que devient chaque type Mermaid : `docs/coverage.md`. Règles et
> escalades : `AGENTS.md`.

---

## 1. En attente du mainteneur

- [ ] **Installer la 0.7.0 depuis la Marketplace sur le poste Windows d'entreprise** et exporter un
      document mixte. Les nouveaux défauts (SmartArt et graphiques Word activés) changent le rendu des
      utilisateurs existants à la mise à jour automatique. Profiter de la même occasion pour clore les
      deux incidents Windows de septembre (`spawnSync unzip ENOENT`, crash Pandoc/Lua `os.tmpname`), qui
      n'ont été re-vérifiés qu'en reproduction Linux (récit : `docs/history/TODO_ARCHIVE.md`).
- [ ] **Décision produit : `venn-beta` en SmartArt ?** Un *Venn simple* SmartArt est faisable quand
      aucune intersection ne porte de texte ; sinon on garde les ellipses translucides. Voir backlog
      §3, piste A.
- [ ] **Publication npm** des paquets `core` → `pandoc-filter` → `cli` : bloquée sur un jeton. Créer un
      compte ou une organisation npm (scope `@md2nativedocx`, gratuit en public), générer un jeton
      *Automation*, l'ajouter à `.env` (`NPM_TOKEN=…`). La publication peut ensuite se faire depuis une
      session (`npm whoami` d'abord). `scripts/verify-npm-packages.mjs` vérifie déjà les paquets en
      salle blanche.
- [ ] **Changement `ci.yml` à relire** : les jobs Windows et macOS listent leurs workspaces à la main
      et ne lancent pas les tests `packages/pptx`. Une ligne à ajouter, mais `ci.yml` est un fichier
      à revue humaine (AGENTS.md).
- [ ] **Avant la première PR externe** : choisir DCO (`git commit -s`), CLA ou rien (AGENTS.md,
      « Licensing »).
- ⏸ **Add-in Word (Phase 4), en pause, hors de `main`** : le scaffold vit sur la branche
  `word-addin-scaffold`. Les 3 spikes demandent un vrai Word desktop (presse-papiers depuis une
  *function command*, forme de `getOoxml()`, rendu du ruban). Mode opératoire :
  `docs/adr/0008-word-addin-ribbon-platform-spike.md` et la section Phase 4 de l'archive.

## 2. Faisable par l'agent

- [ ] **Générateur du manuel dans `scripts/`.** `docs/manual/manuel-utilisateur.{md,docx}` a été
      produit par un script resté hors dépôt. Aujourd'hui le `.md` est la source à éditer à la main.
      Le manuel ne dit encore rien des SmartArt ni des graphiques Word, qui sont pourtant devenus les
      défauts de l'extension : à ajouter en même temps (s'appuyer sur `docs/coverage.md`).
- [ ] **Descriptions de réglages partiellement traduites** (`packages/vscode-extension/package.nls.*.json`) ;
      le panneau, lui, suit la langue de VS Code depuis la 0.6.0.
- [ ] **Deux défauts visuels connus** :
      - `sequenceDiagram` : un cadre de bloc (`loop`, `alt`…) ne s'élargit pas pour contenir le texte
        d'un auto-message ;
      - `crossing-stress-bipartite` : deux connecteurs (A1→B3, A3→B2) ne suivent pas leurs boîtes quand
        on les déplace dans Word. Fixture volontairement adversariale ; probablement un indice de site
        de connexion mal choisi dans un graphe très dense.
- [ ] **Exception d'audit `braces` (GHSA-vfj7-8cjw-p6xm) : expire le 2026-12-31.** Vérifier alors si
      une version corrigée existe ; sinon prolonger avec motif dans `audit-exceptions.json`.

## 3. Backlog — pistes SmartArt et graphiques (analysées, pas commencées)

Cinq pistes restent après la campagne SmartArt d'octobre. Pour chacune : ce que ça apporterait, ce
qui bloque ou coûte, mon avis. Toutes passent par le même circuit que les précédentes : rendu
LibreOffice, `test:oxml-validate`, puis un fichier `smartart-vNN-*` ouvert dans un vrai Word
(CHECKLIST).

- **A. `venn-beta` → SmartArt *Venn simple*.** Gain : un Venn restylable depuis l'onglet Création SmartArt,
  cohérent avec le reste. Limite : SmartArt n'a pas de texte d'intersection, et ses cercles ont tous
  la même taille (le `:N` de Mermaid est déjà ignoré). Coût : un `layoutDef` de plus, petit (cercles en
  anneau, transparence par le `colorsDef`). Avis : à faire si le mainteneur dit oui, en ne l'appliquant
  qu'aux Venn sans `text` d'union ; les autres restent en formes.
- **B. Petit `gantt` sur la frise SmartArt.** Gain : un planning court (quelques jalons, quelques
  tâches) lisible en frise. Limite : la frise perd l'échelle de temps (durées, chevauchements), ce qui
  est l'information principale d'un Gantt. Avis : n'en vaut la peine que pour un Gantt fait
  uniquement de jalons ; sinon les formes sur calendrier sont meilleures. Priorité basse.
- **C. `requirementDiagram` (derive/contains seuls) et frontières C4 en hiérarchie SmartArt.** Gain :
  réutilise les générateurs d'arbre déjà validés, comme `classDiagram` héritage seul. Limite : ces
  diagrammes ont rarement une seule relation et un seul parent par boîte ; le cas éligible sera rare.
  Avis : peu coûteux (même mécanique que `from-graph.ts`), utile seulement si un vrai document en
  contient. À faire sur demande.
- **D. `treemap-beta` en graphique Word *Compartimentage* (`cx:chartex`).** Gain : un vrai graphique
  Word avec données éditables, comme `pie`. Limite : `cx:chartex` est un format différent de `c:chart`
  (parties, relations et types de contenu à part), lu par Word 2016+ seulement ; LibreOffice ne
  l'affiche pas, donc aucun rendu de contrôle hors Word. Avis : faisable, mais chaque essai coûte un
  aller-retour dans un vrai Word. À ouvrir par un ADR (complément de l'ADR 0011), pas directement en
  code.
- **E. SmartArt et graphiques dans le `.pptx`.** Gain : PowerPoint lit les mêmes parties `dgm:` et
  `c:chart` que Word ; aujourd'hui le deck n'a que des formes. Limite : `packages/pptx` réécrit la
  sortie formes du core ; il faudrait y porter l'injection des parties (`postprocess.mjs` côté Word),
  et PowerPoint a déjà montré qu'il est plus strict que le validateur (voir HANDOVER, incident pptx).
  Avis : la piste la plus utile des cinq pour qui présente, mais la plus coûteuse à valider
  (bissection dans un vrai PowerPoint en cas de réparation).

Écartées avec preuve, à ne pas rouvrir sans élément nouveau : fusion après branchement, `subgraph`
(trois formes essayées), frise en simple chaîne. Détail : `docs/coverage.md` § « What was ruled out ».

## 4. Idées notées, non engagées

- **Gros diagrammes** (24 à 318 nœuds dans le corpus) : page de taille personnalisée par saut de
  section, seuil refusé explicitement, ou découpage du graphe. Jamais tranché. Le mécanisme de section
  existe déjà pour les tableaux en paysage (ADR 0005).
- **« Copy as Word » depuis VS Code** : copier l'OOXML d'une sélection pour un collage natif dans Word.
  Spike bloquant : `vscode.env.clipboard` ne fait que du texte ; il faudrait écrire du HTML/RTF dans le
  presse-papiers système, et vérifier ce que Word en fait (formes natives ou image).
- **« Paste Word as MD »** et les boutons « Copier en MD » de l'add-in : demandent un convertisseur
  HTML/OOXML → Markdown qui n'existe pas. Le construire une seule fois pour les deux.
- **Serveur MCP** : fine couche autour du CLI (un assistant génère du Mermaid, l'outil rend le
  `.docx`/`.pptx`). Plus simple une fois le CLI publié sur npm.
- **Provisioning Pandoc dans le CLI** : seule l'extension télécharge Pandoc ; le CLI exige Pandoc ≥ 3.1.3
  sur le `PATH`. À partager si le public CI/scripts le demande.
- **Contribuer à Pandoc en amont** : Pandoc est en Haskell, une PR ne serait pas un portage. Remonter
  d'abord un besoin précis sur leur suivi, si un jour il y en a un.
- **Phase 8, lot 6** (numérotation automatique des titres, styles de tableau) et **couleur de fond des
  sous-graphes** (toucherait l'API publique du core : escalade).
- **Contrôle de compatibilité Word au CLI en dev** (`wordCompatibilityCheck` n'existe que dans
  l'extension empaquetée) : coût d'un `dotnet build` par export, jamais tranché.
- **Aperçu dans VS Code (Phase 2.5 de `docs/specs/UX_SPEC.md`)** : jamais commencé ; lecture seule
  stricte si un jour.
- **Environnement** : LibreOffice et Xvfb ne sont pas épinglés en version (`.devcontainer/` : revue
  humaine). Pas urgent : la dérive observée venait des polices, réglée par
  `test-corpus/visual/fontconfig/fonts.conf`.

Écartées après discussion (2026-09-08), à rouvrir seulement sur un besoin concret : binaire compilé
par OS (coût récurrent de signature macOS/Windows), réécriture du moteur en Python (doublon sans
bénéfice ; le CLI npm donne déjà le découplage).
