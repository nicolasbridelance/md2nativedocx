# TODO — `md2nativedocx`

> Backlog des items **réellement ouverts**, revérifié contre le code et l'historique le 2026-11-19.
> Rien de terminé ici : un item fini sort du fichier (son détail va dans le message de commit, ou dans
> `docs/history/TODO_ARCHIVE.md` s'il mérite un récit). L'ancien `TODO.md` complet (1 500 lignes, tous
> les chantiers fermés) est recopié en fin de `docs/history/TODO_ARCHIVE.md`.
>
> État du produit : `HANDOVER.md`. Ce que devient chaque type Mermaid : `docs/coverage.md`. Règles et
> escalades : `AGENTS.md`. Suite du produit (V2 moteur, V3 aller-retour) : `docs/specs/01-…`, `03-…`,
> `04-…` et `docs/adr/0012-evolution-by-extraction.md` ; phases au §11 du cahier des charges.
> **Priorité depuis le 2026-11-13 : la robustesse (§R ci-dessous)**, après l'incident `flux_arcs`
> sur la 0.8.0 publiée ; R1 à R3 sont faits, reste R4 (gabarit Word). La cible LibreOffice / ODF (§0,
> `docs/specs/05-libreoffice-odf-spec.md`) reprend ensuite. Les numéros de section existants ne bougent pas : d'autres documents les citent.

---

## Ordre de travail (réévalué le 2026-11-19)

Le produit est complet pour son usage principal (Markdown + Mermaid/PlantUML → Word éditable) et
publié partout (npm, Marketplace, Open VSX, MCP). Ce qui limite le projet aujourd'hui, ce n'est plus la
couverture mais la fiabilité dans un vrai Word et le nombre d'utilisateurs. D'où cet ordre :

1. ~~R4.1, R4.2~~ : mesurés dans Word le 2026-11-19, rien à adopter (détail au §R). R4.3 n'a pas de
   symptôme : le chantier robustesse est clos.
2. **Conformité syntaxique Mermaid 1:1** (§2, « Conformité Mermaid ») : objectif 100 % de la syntaxe
   officielle, mesuré et non supposé. Étage 1 (exemples officiels) en cours, étage 2 (différentiel contre
   `mermaid`) ensuite.
3. **Retours d'usage réels** (§1) : les diagrammes PlantUML et Mermaid du mainteneur, et ceux des
   premiers utilisateurs. Tout ce qui en sort passe devant le reste de cette liste.
4. **ODF phase 2, mesure seulement** (§0) : convertir les formes déjà produites pour Word vers ODF sur
   trois types variés, puis décider. Ne pas étendre aux 28 types avant cette mesure.
5. **Convertisseur dans le navigateur, spike** (§4, « Pistes de distribution ») : seule piste qui
   touche des utilisateurs sans installation ni serveur. Une demi-journée pour savoir si Pandoc
   WebAssembly peut appeler le moteur JS ; décision du mainteneur ensuite (périmètre).
6. **Entretien au fil de l'eau** (§2) : exception d'audit `braces` le 2026-12-31, manuel, défaut
   `crossing-stress-bipartite`.

Au second plan, sans date : V2 moteur (§2bis, seulement les ▶), pistes SmartArt (§3), idées (§4).

## R. Robustesse (incident `flux_arcs`, 2026-11-13) — clos, restes ci-dessous

R1 à R3 sont faits et publiés (0.8.1 à 0.8.3) : écriture sûre de la sortie, bloc non fermé signalé,
contrôle Word honnête, fins d'instruction, couleurs de texte, sous-graphes, durcissements de sécurité.
Plan, journal et constats vérifiés : `docs/history/TODO_ARCHIVE.md`, section « 2026-11-19 — §R
robustesse » ; récit : `docs/history/incident-flux-arcs-2026-11.md`.

Restes de R1 à R3 :

- [x] **R2.1, diagrammes de séquence** (2026-11-19, décision du mainteneur : compatibilité 1:1 avec
      Mermaid) : `;` y finit une instruction, même entre guillemets ou parenthèses ; `#59;` reste un `;`
      littéral ; le texte après un `;` qui n'est pas une instruction devient un avertissement.
- [ ] **npm** : « Require two-factor authentication and disallow bypass 2fa tokens » sur les 5 paquets
      (`mcp` compris) et vérifier que l'ancien jeton classique est révoqué (il n'est plus dans `.env`).
      Mainteneur, ou Claude in Chrome sur npmjs.com.

### R4 — Gabarit et compatibilité Word : vérifier dans Word avant de changer (branche `fix/reference-docx-parity`)

- [x] **R4.1 `w:latentStyles` et `a:objectDefaults` : mesuré dans Word, pas rétablis** (2026-11-19, Word
      piloté par COM, comparé à un document Word vierge et au gabarit de Pandoc). Leur absence n'est pas
      un défaut : sans `latentStyles`, la galerie de styles est celle d'un Word vierge (celle de Pandoc la
      remplace par Compact, First Paragraph, Author…) ; sans `objectDefaults`, une forme insérée par
      l'utilisateur prend les défauts de Word (en mode 15 : fond d'accent, texte blanc centré, comme un
      document vierge ; en mode 12 : fond blanc, texte noir, exactement comme avec le gabarit de Pandoc).
      Seul écart corrigé : `w:qFormat` sur `Caption` et `TOC Heading`, pour que « Légende » et « En-tête
      de table des matières » soient dans la galerie comme dans un Word vierge.
- [x] **R4.2 `compatibilityMode` = 15 : mesuré, pas adopté** (2026-11-19). Pandoc n'écrit aucun
      `w:compat`, donc Word ouvre en mode 12. Corpus rendu page par page dans Word (COM), mode 12 contre la
      même archive avec seulement `w:compat` ajouté : `all-types-mega` 42/42 pages (11 légèrement
      décalées), `markdown-features` et `combined-settings-demo` inchangés en nombre de pages, **le manuel
      passe de 65 à 77 pages**. Cause : en mode 15, Word recalcule la largeur automatique des colonnes des
      tableaux Pandoc (sans largeur fixe) ; dans un tableau « source | diagramme », la colonne de texte tombe
      à quelques caractères et le dessin déborde à droite. La règle sous l'en-tête de tableau disparaît aussi.
      Preuves : `test-corpus/word-verification/assets/r4.2-compat15/`. Gain du mode 15 (formes ajoutées par
      l'utilisateur à l'aspect actuel, plus de mention « Mode de compatibilité ») inférieur à ce coût. À
      rouvrir seulement si les tableaux reçoivent des largeurs fixes, ce qui touche les propriétés de
      tableau de `document.xml`, hors de la liste de la règle 7 : **escalade**.
- [ ] **R4.3 Formes de sous-graphe** (`<wps:bodyPr/>` nu, sans `wps:style`) : valides au schéma.
      Les aligner sur les nœuds seulement si un round Word montre une différence.
- [x] **R4.4 Titre de sous-graphe à l'échelle 1** *(mergé `9dfdb65`, publié en 0.8.3 ; correctif écrit 2026-11-16 sur `fix/subgraph-title-font` : titre 10 pt, marges verticales à 0, en OOXML et ODF ; rendu Word vérifié 2026-11-16 par pilotage COM : le titre tient sur une ligne ; à confirmer à l'œil par le mainteneur, `titre-sousgraphe-avant/apres.docx`). **Bug trouvé au passage et corrigé** : un sous-graphe listé avant celui qu'il contient perdait l'imbrication (`buildGraph` rattachait l'enfant avant de l'avoir créé) : cadre extérieur écrasé à 0 de large, ou niveaux empilés (`nested-3-levels`)* *(constaté dans Word le 2026-11-16, sur `subgraph-direction.docx`, mais pas dû à R2.4 : `nested-3-levels.docx`, réduit à ~50 %, est correct)* : la barre de titre fait `SUBGRAPH_TITLE_HEIGHT` = 24 px (≈ 18 pt) pour un texte de 12 pt (`NODE_FONT_SIZE_HALFPT`), plus les marges `tIns`/`bIns` : à l'échelle 1, le titre touche ou mord la bordure. Piste : police du titre plus petite (ou barre plus haute), mais cela déplace tous les diagrammes à sous-graphes et leurs golden : round Word avant adoption. Contrôle de non-régression : `nested-3-levels.docx` et `swimlane.docx`.
- **Écarté sans preuve d'un problème** : envelopper `wpc` dans `mc:AlternateContent`, car ce rendu a
  été validé de nombreuses fois dans Word réel. Corriger les erreurs de Pandoc en post-traitement :
  hors de la liste fermée de la règle 7 d'AGENTS.md (`styles.xml` / `numbering.xml` d'une sortie
  Pandoc), donc **escalade** si un jour c'est utile.

### R5 — Architecture : ce qu'on retient de la proposition « 4 étages »

L'ADR 0012 interdit de réécrire un traducteur qui fonctionne. On ne fait **ni** IR complète, **ni**
builder XML générique. On garde ce qui s'extrait sans refonte :
- [x] l'étape de normalisation en entrée, qui est R2.1 (`parser/normalize-statements.ts`, reste `sequence`) ;
- [ ] une fonction unique `buildWordShape()` dans `ooxml-translator.ts`, introduite uniquement là où
      R2 / R4.3 modifient déjà le code ;
- [ ] des types bornés (`HexColor`, coordonnées EMU finies et positives) seulement aux endroits
      où un bug réel les justifie.

### Décisions demandées au mainteneur (escalade AGENTS.md)

- Manifeste hors bande au lieu des marqueurs (contrat public de `renderDiagram()`).
- `eslint-plugin-regexp` ou `recheck` (nouvelle dépendance).
- ~~Option de `convert()` pour refuser les ressources externes~~ : faite (`sandbox`, `--sandbox`, `MD2NATIVEDOCX_SANDBOX`).
- Test « vrai Word » en CI : les runners GitHub n'ont pas Word. Pour l'instant, round manuel avant
  chaque release ; une machine Windows avec Office en runner auto-hébergé serait une décision de
  coût et de sécurité.

## 0. Cible LibreOffice / ODF (phase 1 : `.odt` pour les flowcharts) — reprend après §R

Phase 0 terminée le 2026-10-08 : spikes S0 à S5 sous `docs/adr/spikes/spike-odf-*`, conclusions et
décisions (API, licences, règles) dans `docs/adr/0013-odf-output-phase-0.md`.

Phase 1 terminée le 2026-10-08 (détail des items fermés : `docs/history/TODO_ARCHIVE.md`,
section « 2026-11-13 — phase 1 ODF »).

Limites connues de la phase 1, à reprendre :

- [ ] Formes prédéfinies à zone de texte étroite (triangle, accolades, `das`, sous-routine) : le texte
      se coupe au milieu des mots.
- [ ] Les options de page et de typographie ne s'appliquent pas au `.odt` (A4, marges 2,54 cm).
- [ ] Pandoc 3.1.3 écrit un `abstract` hors paragraphe (invalide, aussi avec son propre gabarit).

Ensuite, dans l'ordre :

- [ ] Phase 2 (spec 05 §5-§6) : mesurer la voie 1 (conversion du fragment OOXML en ODF) sur trois types
      variés avant d'étendre aux 28 autres types.
- [x] Export `.odt` dans l'extension VS Code : livré en 0.8.0 (`ff8f564`, menu « Exporter en LibreOffice (.odt) »).
- [ ] Porte B (extension LibreOffice, spike S4). Présentation sur le bug 172531 seulement avec une
      première version montrable.

## 1. En attente du mainteneur

- ⏸ **Add-in Word (Phase 4), en pause, hors de `main`** : le scaffold vit sur la branche
  `word-addin-scaffold`. Les 3 spikes demandent un vrai Word desktop (presse-papiers depuis une
  *function command*, forme de `getOoxml()`, rendu du ruban). Mode opératoire :
  `docs/adr/0008-word-addin-ribbon-platform-spike.md` et la section Phase 4 de l'archive.
- **Retours d'usage réels** (priorité 2 de l'ordre de travail). PlantUML : séquence, classes, états et
  activité sont livrés (0.9.0 à 0.12.0), tous les exemples officiels passent ; aucun vrai diagramme du
  mainteneur n'a encore été essayé. Restes connus : barres fork/join (activité), états composites en
  boîtes imbriquées (Mermaid aussi), notes non dessinées. Les autres types PlantUML deviennent une note.

## 2. Faisable par l'agent

- [ ] **Conformité Mermaid, objectif 1:1** (décidé le 2026-11-19 ; proposé dès 2026-09 par
      `docs/adr/spikes/spike-gantt-parser/spike.md`, jamais fait). Le bug du `;` en séquence a été trouvé
      par un utilisateur, pas par un test : c'est ce que ce chantier doit rendre impossible.
      - [~] **Étage 1 — exemples officiels** (`test-corpus/mermaid-official/`, `mermaid@12.3.0`, 541 exemples ;
            `node scripts/mermaid-conformance.mjs --report` ; verrou CI : `mermaid-official.test.ts`). Au
            2026-11-19 : **379 propres (70 %)**, 112 avec avertissement, 50 de types pas encore dessinés (note),
            0 mal typé, 0 échec (départ : 304, et 50 dessinés comme des organigrammes). Faits : en-tête YAML
            central, types agentflow/railroad/usecase reconnus (note), `;` en séquence, organigrammes (ids de
            lien `e1@-->`, libellés entre guillemets sur plusieurs lignes, `click` écarté exprès).
            Reste, par ordre de rendement (détail : `REPORT.md`) :
            - **ER (19)** : relations en toutes lettres (`1 to zero or more`, `only one to`, `many(0) optionally
              to 0+`), alias d'entité `a["Customer Account"] { … }`, `direction`, `subgraph`, `:::classe`,
              relation sans espaces (`id1||--||id2`), noms d'entité entre guillemets ;
            - **classes (25)** : noms entre backticks, `<|..`, `<|--|>`, sucettes `()--`/`--()`, annotations
              `<<interface>>` (en ligne ou seules), `class X:::style` (avec ou sans corps), cardinalités, notes,
              `namespace`, styles ;
            - **états (13)** : états composites en boîtes imbriquées, notes, styles ;
            - **organigrammes (8)** : liens vers un sous-graphe, titre d'en-tête à dessiner ;
            - **séquence (11)**, **C4 (6)**, **architecture (5)**, **Gantt (7)**, **mindmap (4)**, **requirement (4)**,
              **treeView (4)**, divers (8) ;
            - **types à dessiner** : agentflow, railroad, usecase (50 exemples, une note aujourd'hui).
            - Limite de l'étage 1 : il ne voit que les avertissements. Un faux nœud créé sans avertissement
              (comme `e1@{ … }` avant correction) n'est visible qu'à l'étage 2.
      - [ ] **Étage 2 — différentiel contre `mermaid`** (dépendances de dev `mermaid` + `jsdom` accordées
            par le mainteneur le 2026-11-19, tests uniquement, jamais au runtime) : pour chaque exemple,
            comparer ce que Mermaid comprend (nœuds, liens, messages, blocs) à notre AST. Recette jsdom :
            `docs/adr/spikes/spike-gantt-parser/`. Rejouer à chaque montée de version de Mermaid.

- [ ] **Générateur du manuel dans `scripts/`.** `docs/manual/manuel-utilisateur.{md,docx}` a été
      produit par un script resté hors dépôt. Aujourd'hui le `.md` est la source à éditer à la main.
      Le manuel ne dit encore rien des SmartArt ni des graphiques Word, qui sont pourtant devenus les
      défauts de l'extension : à ajouter en même temps (s'appuyer sur `docs/coverage.md`).
      Le `.md` dit depuis le 2026-10-07 les plafonds, la note grise et le serveur MCP (Principes) ; le
      `.docx` n'a pas été régénéré (script hors dépôt, sommaire écrit à la main).
- [ ] **Défaut visuel connu** :
      - `crossing-stress-bipartite` : deux connecteurs (A1→B3, A3→B2) ne suivent pas leurs boîtes quand
        on les déplace dans Word. Fixture volontairement adversariale ; probablement un indice de site
        de connexion mal choisi dans un graphe très dense.
- [ ] **Exception d'audit `braces` (GHSA-vfj7-8cjw-p6xm) : expire le 2026-12-31.** Vérifier alors si
      une version corrigée existe ; sinon prolonger avec motif dans `audit-exceptions.json`.

## 2bis. Chantier V2 — moteur (ADR 0012 accepté le 2026-10-07)

> **Décidé le 2026-10-08** (spec 05 §8.4) : passe après le §0 (et, depuis le 2026-11-13, après le §R). Continuent, marquées « ▶ » : ce qui
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
      délai ; le CLI a le sien depuis le 2026-11-15 (Pandoc arrêté après 10 min, `MD2NATIVEDOCX_TIMEOUT_MS`),
      le pont du filtre reste borné seulement par ce délai de Pandoc. Taille du paquet : `packages/mcp` refuse d'écrire
      un `.docx` de plus de 100 Mo ; `convert()` n'a pas de plafond (l'ajouter = option d'API, escalade).
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
- ⏸ Puis, adaptateurs minces sur l'API publique : documentation SDK Node, ~~serveur MCP~~ (fait :
  `@md2nativedocx/mcp`, publié le 2026-11-19), Quarto (vérifier d'abord : le filtre lance `node`, absent de
  Quarto, et l'injection SmartArt/graphiques vit dans le CLI, pas dans le filtre). Puis la sonde draw.io (cahier §11) ; celle de
  PlantUML est dépassée : séquence, classes, états et activité sont livrés (0.9.0 à 0.12.0).

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
- **Contrôle de compatibilité Word au CLI en dev** (le CLI ne le lance que si
  `MD2NATIVEDOCX_OXML_VALIDATOR_DLL` est posé, ce que seule l'extension empaquetée fait ; sinon le journal dit
  `Not checked`) : coût d'un `dotnet build` par export, jamais tranché.
- **Aperçu dans VS Code (Phase 2.5 de `docs/specs/UX_SPEC.md`)** : jamais commencé ; lecture seule
  stricte si un jour. La V3 (§3.4 de la spec 03) envisage un éditeur visuel dans VS Code : si l'aperçu
  se fait, le construire comme composant réutilisable plutôt que spécifique à VS Code.
- **Environnement** : le LibreOffice d'apt (moteur des tests visuels) et Xvfb ne sont pas épinglés
  en version ; celui de la cible ODF l'est (`scripts/install-libreoffice-pinned.sh`). Pas urgent : la dérive observée venait des polices, réglée par
  `test-corpus/visual/fontconfig/fonts.conf`.

### Pistes de distribution (revue externe du 2026-11-19, rien d'engagé)

Les correctifs CLI de la même revue sont faits (b65f055, 863f586 : extension inconnue refusée, entrée
protégée, `--reference-doc`/`--toc`/`--version`, journal non bloquant, README npm). Restent, à trancher :

- **`--fail-on-warning`** : faire échouer une CI quand un diagramme devient une note. Seulement au
  premier pipeline qui le demande ; distinct de la validation Open XML.
- **`--json`** (`output`, `warnings`, `validation: passed|failed|not_run`) : pas sans consommateur
  identifié.
- **MCP distant** (Streamable HTTP, un outil `export_word(markdown, filename)` qui renvoie un lien HTTPS
  temporaire) pour claude.ai et ChatGPT : demande un service hébergé (isolation des conversions, quotas,
  pas de journal du Markdown). Décision mainteneur : c'est un service à opérer, pas du code. Le flux local
  (`@md2nativedocx/mcp` en stdio, `.mcpb` pour Claude Desktop) reste prioritaire et ne coûte rien.
- **Convertisseur 100 % navigateur sur GitHub Pages** (Pandoc WebAssembly + `core` en Web Worker, pont
  Lua → Node remplacé par un appel JS) : alternative au MCP distant sans serveur ni envoi du texte.
  Spike d'abord : Pandoc wasm sait-il appeler un filtre JS, et `convert()`/postprocess (adm-zip, `node:fs`)
  se portent-ils sans toucher la règle 7 ? Premier test : un flowchart, réseau coupé après chargement.
- **Mesure d'usage** (seulement si le site navigateur existe) : compteurs agrégés sans cookie
  (`page_view`, `docx_generated`, `docx_generated_with_native_diagram`), jamais de contenu.
- **draw.io** : sortie `.drawio` par diagramme d'abord (depuis le modèle positionné, avant DrawingML),
  import `.drawio` → formes Word ensuite (lit un fichier extérieur : périmètre et sécurité à revoir).
  SVG par diagramme en complément. VSDX seulement sur demande. Touche le périmètre (règle 1) : escalade.

Écartées après discussion (2026-09-08), à rouvrir seulement sur un besoin concret : binaire compilé
par OS (coût récurrent de signature macOS/Windows), réécriture du moteur en Python (doublon sans
bénéfice ; le CLI npm donne déjà le découplage).
