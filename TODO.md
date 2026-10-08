# TODO — `md2nativedocx`

> Backlog des items **réellement ouverts** au 2026-10-07, chacun vérifié contre le code et l'historique.
> Rien de terminé ici : un item fini sort du fichier (son détail va dans le message de commit, ou dans
> `docs/history/TODO_ARCHIVE.md` s'il mérite un récit). L'ancien `TODO.md` complet (1 500 lignes, tous
> les chantiers fermés) est recopié en fin de `docs/history/TODO_ARCHIVE.md`.
>
> État du produit : `HANDOVER.md`. Ce que devient chaque type Mermaid : `docs/coverage.md`. Règles et
> escalades : `AGENTS.md`. Suite du produit (V2 moteur, V3 aller-retour) : `docs/specs/01-…`, `03-…`,
> `04-…` et `docs/adr/0012-evolution-by-extraction.md` ; phases au §11 du cahier des charges.
> **Priorité depuis le 2026-10-08 : la cible LibreOffice / ODF** (§0 ci-dessous,
> `docs/specs/05-libreoffice-odf-spec.md`).

---

## 0. Priorité — cible LibreOffice / ODF (phase 0, reconnaissance)

Fait : S0, un `.odt` produit par Pandoc à partir d'un bloc brut `{=opendocument}`, formes et
connecteur attaché rendus par LibreOffice ; S1, le connecteur suit la forme déplacée (par l'API UNO,
sans fenêtre) (`docs/adr/spikes/spike-odf-connector/`) ; S3, l'import Markdown de LibreOffice 26.2
perd l'info-string `mermaid` et ne gère pas les maths (`docs/adr/spikes/spike-odf-markdown-import/`).

Mainteneur :

- [ ] Trancher les points de la spec 05 §8 au fil de l'eau (API du core, `AGENTS.md`, place de la V2).

Agent :

- [ ] **S2** : colorer et dimensionner les formes ODF depuis un bloc brut (styles automatiques
      impossibles dans un bloc brut ?) ; si un post-traitement du `.odt` est nécessaire, proposer la
      liste autorisée (amendement de la règle 7 : décision du mainteneur).
- [ ] **S4** : lire le filtre Markdown de LibreOffice (traitement des blocs de code, info-string) et
      lister les options d'intégration côté LibreOffice ; aucun contact public avant.
- [ ] **S5** : choisir un validateur ODF (équivalent de `scripts/oxml-validator/`), justification de
      dépendance de développement à l'appui.
- [ ] Puis ADR de fin de phase 0 et début de la phase 1 (`.odt` pour les flowcharts).

## 1. En attente du mainteneur

- ⏸ **Add-in Word (Phase 4), en pause, hors de `main`** : le scaffold vit sur la branche
  `word-addin-scaffold`. Les 3 spikes demandent un vrai Word desktop (presse-papiers depuis une
  *function command*, forme de `getOoxml()`, rendu du ruban). Mode opératoire :
  `docs/adr/0008-word-addin-ribbon-platform-spike.md` et la section Phase 4 de l'archive.

## 2. Faisable par l'agent

- [ ] **Démo vidéo dans un vrai Word, 40 secondes** (spec 04, priorité 1). Reportée par le mainteneur
      (2026-10-07) : le GIF animé existant suffit pour l'instant, d'autres pourront suivre. L'agent prépare
      le `.docx` de démo et le découpage plan par plan quand le mainteneur voudra enregistrer.
- [ ] **Générateur du manuel dans `scripts/`.** `docs/manual/manuel-utilisateur.{md,docx}` a été
      produit par un script resté hors dépôt. Aujourd'hui le `.md` est la source à éditer à la main.
      Le manuel ne dit encore rien des SmartArt ni des graphiques Word, qui sont pourtant devenus les
      défauts de l'extension : à ajouter en même temps (s'appuyer sur `docs/coverage.md`).
      Le `.md` dit depuis le 2026-10-07 les plafonds, la note grise et le serveur MCP (Principes) ; le
      `.docx` n'a pas été régénéré (script hors dépôt, sommaire écrit à la main).
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

## 2bis. Chantier V2 — moteur (ADR 0012 accepté le 2026-10-07)

> **Décidé le 2026-10-08** (spec 05 §8.4) : passe après le §0. Continuent, marquées « ▶ » : ce qui
> sert aussi la sortie ODF, et les risques de sécurité déjà ouverts. Les autres, « ⏸ », attendent
> la fin de la phase 1 ODF.

Ordre de la spec 04 §2, ramené au code (détail section par section : `docs/specs/01-v2-engine-spec.md`,
annexe A). Chaque étape laisse le dépôt vert ; les sorties actuelles ne changent pas d'un octet
(golden tests et `test:visual` en garde-fou).

- [ ] ⏸ **Erreurs typées côté core** (spec 01 §9) : `MermaidParseError` existe mais les parseurs sont
      tolérants ; voir si un appelant de `renderDiagram()` a besoin de plus avant d'inventer une taxonomie.
      Côté CLI c'est fait le 2026-10-07 : `ConversionError` (`stage`), codes de sortie 0 / 1 / 2
      documentés dans `packages/cli/README.md`.
- [ ] ▶ **Limites de ressources : reste le délai du CLI et du pont.** Fait le 2026-10-07 : plafonds de
      graphe pour tout ce qui passe par Dagre (500 nœuds conteneurs de `subgraph` compris, 800 arêtes,
      surchargeables par `maxNodes` / `maxEdges`), plafond de source (`maxSourceLength`, 1 000 000
      caractères), `DiagramTooLargeError` typée, une note visible à la place du diagramme trop gros dans le
      pont du filtre et dans `pptx` (le document se convertit). Le **délai** est dans `packages/mcp` : chaque
      appel tourne dans un processus enfant tué avec ses descendants à l'échéance (30 s / 120 s). Les plafonds
      bornent le pire cas sans le rendre bon marché (~35 s mesurés pour 400 nœuds / 800 arêtes), d'où le
      délai ; le CLI et le pont n'ont toujours pas le leur. Taille du paquet : `packages/mcp` refuse d'écrire
      un `.docx` de plus de 100 Mo ; `convert()` n'a pas de plafond (l'ajouter = option d'API, escalade).
- [ ] ▶ **MCP : Pandoc lit et télécharge les images du Markdown** (chemins relatifs à la racine, URL
      `http(s)`) : fuite de fichier ou SSRF possible si le serveur reçoit du Markdown non fiable.
      Documenté dans `packages/mcp/README.md`. Une vraie réponse demande une option de `convert()` (donc
      l'API du CLI : escalade), pas un contournement dans l'adaptateur.
- [ ] ⏸ **Déterminisme, investigation** : ids `randomUUID()` des parties, horodatage Pandoc,
      dates d'entrées `adm-zip`. Ne rien promettre avant un test bout en bout.
- [ ] ⏸ **Corpus Word vérifié** : la `CHECKLIST.md` existe (rounds 4-20) ; y ajouter version et build de
      Word par round, et une table d'index fixture → comportement attendu → validateur → date.
- [ ] ▶ **Pandoc comme contrat** : plage supportée testée en CI (`ci.yml`, revue humaine) ; post-traitement
      XML au lieu de regex là où ça renforce vraiment, en réutilisant `fast-xml-parser` déjà présent
      dans `packages/pptx` (nouvelle dépendance pour `cli` : escalade).
- [ ] ▶ **Identité des objets** (spec 01 §5, spec 04 §5.2 ; ADR 0012 règle 7, précisée : seulement pour
      les types qui ont un vrai id source, et rien de plus dans `descr` d'ici là) : l'id Mermaid des nœuds de flowchart est dans
      `cNvPr/@descr`, qui est le **texte de remplacement lu par les lecteurs d'écran** (bruit
      d'accessibilité). Choisir un autre emplacement, vérifié dans un vrai Word, avant le spike V3.0, et
      le choisir avec son équivalent ODF (`draw:id` / `xml:id`, renommés par LibreOffice à
      l'enregistrement : spike S1).
- ⏸ Puis, adaptateurs minces sur l'API publique : documentation SDK Node, serveur MCP
  (`render_diagram`, `convert_document`), Quarto (vérifier d'abord : le filtre lance `node`, absent de
  Quarto, et l'injection SmartArt/graphiques vit dans le CLI, pas dans le filtre). Puis les deux sondes
  PlantUML et draw.io (cahier §11).

## 3. Backlog — pistes SmartArt et graphiques (analysées, pas commencées)

Quatre pistes restent après la campagne SmartArt d'octobre. Pour chacune : ce que ça apporterait, ce
qui bloque ou coûte, mon avis. Toutes passent par le même circuit que les précédentes : rendu
LibreOffice, `test:oxml-validate`, puis un fichier `smartart-vNN-*` ouvert dans un vrai Word
(CHECKLIST).

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

Écartées, à ne pas rouvrir sans élément nouveau : `venn-beta` en SmartArt (décision du mainteneur, 2026-10-07 : on garde les ellipses) ; fusion après branchement, `subgraph`
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
- **Spike V3.0 — aller-retour Word** (`docs/specs/03-v3-human-editing-roundtrip-spec.md`) : générer
  quelques flowcharts et SmartArt, les retoucher dans un vrai Word, relever ce qui survit (ids,
  connecteurs, points SmartArt). Pas avant que V2 ait fixé l'identité des objets ; lire un `.docx`
  extérieur fait entrer la ZIP bomb dans le tableau de sécurité d'`AGENTS.md` (escalade).
- **Provisioning Pandoc dans le CLI** : seule l'extension télécharge Pandoc ; le CLI exige Pandoc ≥ 3.1.3
  sur le `PATH`. À partager si le public CI/scripts le demande.
- **Contribuer à Pandoc en amont** : Pandoc est en Haskell, une PR ne serait pas un portage. Remonter
  d'abord un besoin précis sur leur suivi, si un jour il y en a un.
- **Phase 8, lot 6** (numérotation automatique des titres, styles de tableau) et **couleur de fond des
  sous-graphes** (toucherait l'API publique du core : escalade).
- **Contrôle de compatibilité Word au CLI en dev** (`wordCompatibilityCheck` n'existe que dans
  l'extension empaquetée) : coût d'un `dotnet build` par export, jamais tranché.
- **Aperçu dans VS Code (Phase 2.5 de `docs/specs/UX_SPEC.md`)** : jamais commencé ; lecture seule
  stricte si un jour. La V3 (§3.4 de la spec 03) envisage un éditeur visuel dans VS Code : si l'aperçu
  se fait, le construire comme composant réutilisable plutôt que spécifique à VS Code.
- **Environnement** : le LibreOffice d'apt (moteur des tests visuels) et Xvfb ne sont pas épinglés
  en version ; celui de la cible ODF l'est (`scripts/install-libreoffice-pinned.sh`). Pas urgent : la dérive observée venait des polices, réglée par
  `test-corpus/visual/fontconfig/fonts.conf`.

Écartées après discussion (2026-09-08), à rouvrir seulement sur un besoin concret : binaire compilé
par OS (coût récurrent de signature macOS/Windows), réécriture du moteur en Python (doublon sans
bénéfice ; le CLI npm donne déjà le découplage).
