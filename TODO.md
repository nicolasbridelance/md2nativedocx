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

## Ordre de travail (validé par le mainteneur le 2026-11-20)

Le produit est complet pour son usage principal (Markdown + Mermaid/PlantUML → Word éditable) et
publié partout (npm, Marketplace, Open VSX, MCP). Ce qui limite le projet aujourd'hui, ce n'est plus la
couverture mais la fiabilité dans un vrai Word et le nombre d'utilisateurs. Le chantier robustesse
(§R) est clos. D'où cet ordre :

1. ~~**Ménage de la vitrine**~~ (fait le 2026-11-20) : releases GitHub 0.8.3 à 0.13.0 créées depuis le
   CHANGELOG (étape ajoutée à la procédure de release, `HANDOVER.md`), Discussions activées, Dependabot
   #39 mergé.
2. ~~**Convertisseur dans le navigateur**~~ (fait le 2026-11-20 : `packages/web`, publié sur GitHub Pages
   par `.github/workflows/pages.yml` ; spike : `docs/adr/spikes/spike-browser-converter/spike.md`).
   Décisions du mainteneur du même jour : héberger `pandoc.wasm`, ZIP et WASI écrits par le projet. Le
   post-traitement du CLI travaille désormais sur un paquet en mémoire (`docxPackage.mjs`). Restes, §4
   « Convertisseur navigateur ».
3. ~~**Documents de conformité à jour**~~ (fait le 2026-11-20) : `docs/compliance/*` et `SECURITY.md`
   réécrits (canaux, licences par canal, flux réseau, CI, MCP, `.odt`/`.pptx`, PlantUML, OIDC). Trouvé au
   passage et corrigé : le `.vsix` et la page web embarquaient du code MIT sans ses notices ; elles sont
   désormais générées au build (`scripts/third-party-licenses.mjs`). Restes, §4 « Conformité, restes ».
4. **Conformité syntaxique Mermaid 1:1** (§2, « Conformité Mermaid ») : étage 2 (différentiel contre
   `mermaid`), puis les avertissements de l'étage 1 par rendement (classes, ER, états).
5. **Retours d'usage réels** (§1) : les diagrammes PlantUML et Mermaid du mainteneur, et ceux des
   premiers utilisateurs. Tout ce qui en sort passe devant le reste de cette liste.
6. **PlantUML, types suivants sur les moteurs existants** (§2) : use case, component (puis deployment),
   mindmap / WBS ; ensuite object, gantt.
7. **draw.io dans les deux sens** (§4, décision du mainteneur le 2026-11-20) : sortie `.drawio` d'abord,
   import ensuite.
8. **ODF phase 2, mesure seulement** (§0) : convertir les formes déjà produites pour Word vers ODF sur
   trois types variés, puis décider. Ne pas étendre aux 28 types avant cette mesure.
9. **Entretien au fil de l'eau** (§2) : exception d'audit `braces` le 2026-12-31, manuel, défaut
   `crossing-stress-bipartite`.

Au second plan, sans date : V2 moteur (§2bis, seulement les ▶), pistes SmartArt (§3), idées (§4).

## Retours du benchmark agents (projet séparé)

Le banc `md2nativedocx-agent-benchmark` mesure si un agent IA produit un meilleur DOCX avec ce moteur
que sans. Son cahier des charges, ses protocoles, ses résultats et ses propres chantiers (TODO du banc)
vivent dans ce dépôt séparé, avec un évaluateur indépendant ; seul ce qu'il demande au moteur est suivi
ici. Repères : 5/54 sans moteur contre 24/54 avec (0/45 contre 18/45 sur les tâches graphiques) ;
36/36 quand l'agent convertit le Markdown entier en un appel guidé, contre 17/36 avec un CLI
facultatif ; 18/20 documents inédits passent la grille Word complète.
[Notebook Kaggle public](https://www.kaggle.com/code/nbridelancetb/editable-word-diagrams-md2nativedocx-benchmark).

- [ ] **Connecteurs routés : reste après le passage au `bentConnector5` (2026-11-24).** Un détour de
  flowchart est désormais un connecteur coudé de Word, attaché (`translator/elbow-connector.ts`) ; la
  géométrie libre ne reste que si aucun couloir de Dagre n'est dégagé. Vérifié par rendu dans Word et
  PowerPoint (LR, TB, BT, RL ; F02, S02, S03 ; F16, le même raccourci dans le rapport multipage du banc,
  rendu dans Word le 2026-11-25 : détour sous les nœuds, attaché aux deux bouts). Reste : (1) l'œil du
  mainteneur sur `test-corpus/word-verification/routed-connectors.docx`, après déplacement d'une forme :
  Word recalcule alors le chemin lui-même et peut traverser un nœud (mesuré par le banc), comme pour tout
  connecteur ; (2) LibreOffice Writer, à l'ouverture du
  `.docx`, retrace lui-même ces détours en ligne droite à travers le nœud : il ignore les réglages des
  `bentConnector4`/`5` (attachés ou non ; il respecte ceux du `bentConnector3`) et faisait déjà de même
  avec l'ancienne géométrie libre (rendus identiques avant et après, baselines `test:visual` inchangées).
  Limite de LibreOffice, notée dans le manuel ; le `.odt` n'est pas concerné. Bug à signaler à LibreOffice (décision du mainteneur).
  Détail dans le banc : `ROUTED_CONNECTOR_RESULTS.md`.
- [ ] **Pagination dans les régressions Word.** La persistance des connecteurs est faite (2026-11-25,
  `npm run test:word-connectors`, TESTING.md §6) : 219 connecteurs des 32 flowcharts du corpus visuel
  restent attachés après la sauvegarde de Word et sont retracés quand l'une ou l'autre forme bouge,
  avant et après réouverture. Les 2 détours de `crossing-stress-bipartite` dessinés en géométrie libre
  (aucun coude dégagé) sont, eux, chargés par Word comme des formes simples, détachés : limite connue du
  repli, comptée à part par le contrôle. Reste la fixture de pagination de 30 pages du banc (table sur
  trois pages, dessins sur des pages distinctes) à reprendre.
- [ ] **Rapport de conversion exploitable par un agent.** Le bloc concerné est fait (2026-11-25) : chaque
  avertissement porte le numéro de son diagramme et la ligne de sa clôture d'ouverture
  (`diagram 2, line 14: ...`) dans le `.log`, la sortie du CLI et la réponse MCP, et en données dans
  `convert().diagnostics` (marqueur `md2nativedocx-diagram:` du filtre Lua ; ligne omise si les clôtures
  du source ne correspondent pas une à une aux blocs vus par Pandoc). Reste la **cause en code stable**
  (`unsupported-line`, `smartart-fallback`…) : les avertissements de `renderDiagram()` sont des chaînes,
  en faire des objets change l'API publique de `core` → décision du mainteneur. Le banc mesurera d'abord
  l'effet du bloc localisé (un avertissement réel fait passer la reprise de 9/12 à 11/12).

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
            0 mal typé, 0 échec (départ : 304, et 50 dessinés comme des organigrammes). Après agentflow + usecase : **406 propres** (75 %), 14 de types pas dessinés. Faits : en-tête YAML
            central, types agentflow/railroad/usecase reconnus (note), `;` en séquence, organigrammes (ids de
            lien `e1@-->`, libellés entre guillemets sur plusieurs lignes, `click` écarté exprès).
            Reste, par ordre de rendement (détail : `REPORT.md`) :
            - ~~**ER (19)**~~ : relations en toutes lettres, alias, `direction`, relation sans espaces, noms entre
              guillemets (faits avant) ; ~~`subgraph`, `style` / `classDef` / `:::` / `class`~~ (faits le 2026-11-21 :
              `ErDiagram.groups`, `ErEntity.group` / `fill` / `stroke` / `textColor`, mise en page des groupes par le
              moteur des organigrammes via `LayoutOptions.nodeSizes` ; vus dans Word et LibreOffice, `.pptx` validé) :
              **25/25**, étage 1 à **492 propres (91 %)** ;
            - ~~**Gantt (7)**~~ (fait le 2026-11-21) : dates résolues en passes comme Mermaid (références avant),
              `ms`/`s`/`m`, `dateFormat X`/`x`, `includes`, `weekend friday`, `inclusiveEndDates`, `vert` ; axe
              continu borné à 880 px (`gantt/time-axis.ts`), `axisFormat` (sous-ensemble de `d3-time-format`),
              `tickInterval`, `weekday` ; jours exclus grisés ; jalon centré comme dans Mermaid. **10/11**, le
              dernier garde volontairement son avertissement (`tickInterval 1decade`, que Mermaid ignore aussi) ;
              comparateur Gantt au différentiel : **11/11 identiques** ; étage 1 à **498 propres (92 %)**. Sortie
              inchangée octet pour octet pour un Gantt de 40 jours ou moins (fixture visuelle comprise). Vu dans
              Word (`test-corpus/word-verification/gantt-axis.*`). Ajouts d'API, optionnels : `GanttTag` `'vert'`,
              `GanttChart.axisFormat` / `tickInterval` / `weekday` / `shadedDays`, type `GanttTickInterval`.
              Reste : `displayMode: compact` (en-tête YAML, non transmis au parseur ; couvert par la notice
              « options non appliquées »).
            - ~~**mindmap (4)**~~ (fait le 2026-11-21) : parseur refait sur la grammaire de Mermaid 12.3 (libellé
              entre guillemets sur plusieurs lignes, `::icon` / `:::` rattachés au dernier nœud ajouté comme
              `decorateNode()`), tout libellé lu en Markdown comme Mermaid (`parser/label.ts`, partagé avec les
              organigrammes ; `_` dans un mot n'ouvre plus d'italique, règle CommonMark) ; rendu gras / italique /
              lignes en formes et en SmartArt, retour à la ligne à 200 px ; chaque forme dimensionnée sur la zone de
              texte de son preset OOXML (la racine en cercle affichait « mindma », un `))bang((` perdait sa troisième
              ligne dans Word). Comparateur au différentiel : **15/15 identiques** ; étage 1 à **499 propres (92 %)**.
              Vu dans Word et LibreOffice (`test-corpus/word-verification/mindmap-labels*`). Restent, voulus :
              `::icon` (#0, #11) et `:::` (#12), non dessinables dans un document (police d'icônes et feuille de
              style de la page web), avertis. Ajouts d'API, optionnels : `MindmapNode.labelRuns` / `icon` /
              `className`. Reste : `colorBy: depth` (en-tête YAML `config.mindmap`, non transmis ; couvert par la
              notice « options non appliquées »). Baselines `test:visual` `mindmap` (docx, pptx) rafraîchies depuis la CI Linux, revues (boîtes un peu plus larges, « Marketing » enfin lisible dans son `bang`).
            - ~~**requirement (4)**~~ (fait le 2026-11-21) : parseur refait sur la grammaire de Mermaid 12.3
              (noms et valeurs entre guillemets, nom non cité avec espaces, `:::` après un nom ou seul sur sa ligne,
              mots-clés insensibles à la casse, `risk` / `verifymethod` affichés comme Mermaid, bloc défini deux fois :
              le premier gardé, averti ; relation vers une boîte absente : avertie) ; `direction`, `style`,
              `classDef`, `class` appliqués (défaut, puis classes, puis `style`, comme le diagramme de classes ;
              couleurs validées). Boîte dessinée comme `requirementBox` de Mermaid (stéréotype `«Functional
              Requirement»` puis nom en gras, champs `ID:` / `Text:` / `Risk:` / `Verification:` / `Type:` /
              `Doc Ref:` centrés, lus en Markdown) ; `contains` en trait plein avec cercle barré côté contenant,
              les six autres en pointillés avec flèche ouverte (`a:tailEnd type="arrow"`) ; libellés sur fond blanc,
              place réservée par Dagre (en LR le libellé masquait la flèche). Comparateur au différentiel :
              **9/9 identiques** (et `normText` du différentiel ne retire plus un `_` dans un mot, règle de `marked`) ;
              étage 1 à **503 propres (93 %)**. Vu dans Word et LibreOffice
              (`test-corpus/word-verification/requirement-diagram.*`). Ajouts d'API, optionnels :
              `Requirement` / `RequirementElement` `fill` / `stroke` / `textColor` / `bold` / `italic` (type
              `RequirementBoxStyle`), `RequirementDiagram.direction`. Baseline `test:visual`
              `requirement-diagram` rafraîchie depuis la CI Linux, revue (seule image modifiée).
            - **classes (25)** : noms entre backticks, `<|..`, `<|--|>`, ~~sucettes `()--`/`--()`~~ (faites le
              2026-11-21 : relation `lollipop` et `ClassDiagram.interfaces`, une interface par relation comme Mermaid ;
              cercle creux au bout du trait, nom au-delà ; vérifié dans Word, `test-corpus/word-verification/
              class-lollipops.*` ; **différentiel : 252/252 identiques à Mermaid**, étage 1 : les 38 exemples de classes
              propres sauf #36, dont la classe CSS vit dans une feuille de style externe. Les ends `()` de PlantUML restent
              des lignes simples, avec avertissement : à brancher sur la même relation), ~~annotations
              `<<interface>>` (en ligne ou seules)~~ (faites le 2026-11-20 : `ClassBox.annotations`, `«interface»`
              au-dessus du nom, la première seulement comme Mermaid ; aussi les stéréotypes PlantUML et le
              SmartArt ; comparées au différentiel ; vérifié dans Word, `test-corpus/word-verification/
              class-annotations.*`), ~~`namespace`~~ (fait le 2026-11-20 : `ClassDiagram.namespaces`, qualifiés comme
              Mermaid (imbrication, noms pointés et ancêtres implicites, `["label"]`), identiques à Mermaid au
              différentiel ; cadres en pointillé dans un graphe Dagre composé, bande de titre réservée comme pour un
              sous-graphe ; pas de SmartArt avec un `namespace` ; vérifié dans Word, `test-corpus/word-verification/
              class-namespaces.*` ; `hierarchicalNamespaces: false` (option YAML imbriquée) non lu), ~~`class X:::style`
              (avec ou sans corps), styles~~ (faits le 2026-11-20 : `style`, `classDef` + `:::` / `cssClass`, `classDef
              default`, superposés comme Mermaid ; `ClassBox.fill` / `stroke` / `textColor`, validés avant le XML, repris
              par le SmartArt ; lecture des styles partagée avec l'organigramme (`parser/css-style.ts`), `textColorFor`
              mis en commun (`translator/text-color.ts`) ; vérifié dans Word, `test-corpus/word-verification/
              class-styles.*`), ~~cardinalités~~ (faites le 2026-11-20 : `fromCardinality` / `toCardinality`, identiques à
              Mermaid au différentiel, aussi en PlantUML ; une relation avec libellé ou cardinalités réserve leur place
              dans la mise en page Dagre, comme les libellés d'arêtes de l'organigramme ; au passage, un libellé entre
              guillemets ne fait plus disparaître la relation ; vérifié dans Word, `test-corpus/word-verification/
              class-cardinalities.*`), ~~notes~~ (faites le 2026-11-20 : `ClassDiagram.notes`, identiques à Mermaid au
              différentiel ; nœuds Dagre à coin replié, aux couleurs de note de Mermaid, trait pointillé vers leur classe ;
              une note garde le diagramme hors SmartArt ; vérifié dans Word, `test-corpus/word-verification/
              class-notes.*`. Les notes PlantUML restent avertis : à brancher sur le même champ) ;
            - ~~**Couleurs nommées (`red`, `white`) ignorées sans avertissement**~~ (fait le 2026-11-21 : les 148 noms de
              CSS Color 4 dans `parser/css-named-colors.ts`, lus par `parseHexColor` pour l'organigramme, les classes, les
              états et le treemap, qui avait sa propre table de 10 noms, remplacée) ;
            - **`classDef default` de l'organigramme** n'est toujours pas appliqué (manuel, limites) alors que les
              classes l'appliquent depuis le 2026-11-20 : aligner ;
            - **Vu dans Word le 2026-11-20 :** un libellé de relation de classes est posé au milieu du trait, sans
              fond : il peut tomber sur la bordure d'un `namespace` (`classDiagram#20`) ou d'une autre classe. Même
              remarque que pour l'ER ; à traiter ensemble (fond blanc, ou position évitant les cadres) ;
            - **Vu dans Word le 2026-11-20, pas encore corrigé :** les compartiments de membres d'une classe
              réservent 22 px par ligne (`ROW_H`, `class-diagram/translator.ts`) alors que Word en écrit environ
              18 : un vide grandit sous les membres (5 lignes : ~20 px, `classDiagram#25`). Mesurer la hauteur de
              ligne réelle (police de membre à 9 pt) avant de changer `ROW_H` : toutes les classes bougent ;
            - **états** : ~~états composites en boîtes imbriquées, régions `--`~~ (faits le 2026-11-21 :
              `StateNode.parent` / `direction`, `StateDiagram.regions` ; un `[*]` de début et de fin par bloc comme
              Mermaid (avant : un nœud par occurrence) ; mise en page de l'intérieur vers l'extérieur, un graphe
              Dagre par bloc, ce qui évite l'échec connu de Dagre sur les clusters à cycles et fait d'un lien vers un
              composite un lien ordinaire ; direction propre de chaque composite (TB par défaut, comme la base de
              Mermaid) ; libellés posés dans la place que Dagre leur garde, transitions jumelles écartées ; aussi en
              PlantUML (direction du diagramme) ; différentiel étendu aux parents, **22/22** ; vérifié dans Word,
              `test-corpus/word-verification/state-composites.*`), ~~notes~~ (faites le 2026-11-21 : `StateDiagram.notes`, à gauche/droite
              en Mermaid, aussi haut/bas en PlantUML ; chaque note agrandit la boîte de mise en page de son état, donc
              Dagre la tient à l'écart des autres boîtes ; une note du côté où arrivent les transitions est décalée hors
              de l'axe de l'état ; différentiel étendu aux notes ; vérifié dans Word, `test-corpus/word-verification/
              state-notes.*`), ~~styles~~ (faits le 2026-11-21 : `classDef` + `class` / `:::`, `style`, superposés comme Mermaid ;
              `fill` / `stroke` / `textColor` / `bold` / `italic` sur `StateNode`, repris par le SmartArt (couleurs) ;
              `classDef default` appliqué à tous les états, que le parseur de Mermaid 12.3 refuse pourtant dans ce type ;
              `font-weight` / `font-style` lus par `parser/css-style.ts`, **pas encore dessinés pour l'organigramme ni les
              classes** ; différentiel étendu aux styles, **22/22** ; vérifié dans Word, `test-corpus/word-verification/
              state-styles.*`). Au passage, une transition dont le trait droit traverserait une autre boîte suit la route
              de Dagre (visible depuis la fusion des `[*]` : `Still --> [*]` traversait deux états, `stateDiagram#20`).
              Les 22 exemples d'états officiels sont propres ; étage 1 à **470 propres (87 %)** Une transition qui
              traverse le bord d'un composite est tracée droite, sans routage ;
            - **séquence** : ~~types de participant~~ (faits le 2026-11-21 : `SequenceParticipant.kind`, chaque type
              dessiné par son symbole UML, `diagrams/sequence/participant-glyph.ts`, aussi pour PlantUML et ZenUML ;
              vu dans Word, LibreOffice et en `.pptx`) ; ~~groupes `box` (#16) et connexions centrales `()` (#17)~~
              (faits le 2026-11-21 : `SequenceDiagram.boxes`, bandeau derrière les colonnes, aussi `box` PlantUML ;
              `central` sur le message, un point sur la ligne de vie ; vus dans Word et LibreOffice, `.pptx`
              validé) : **36/38**, étage 1 à **482 propres (89 %)**. Les menus `link` (#36, #37) restent ignorés
              exprès (un lien vers une URL, règle 3) ;
            - **organigrammes** : ~~liens vers un sous-graphe~~ (faits le 2026-11-20 : le lien s'arrête au bord du
              cadre, sous-graphe rangé comme un seul bloc quand aucun lien ne traverse sa bordure, comme Mermaid ;
              vérifié dans Word et LibreOffice, `test-corpus/word-verification/subgraph-links.*` ; le sens élargi
              de `FlowEdge.from`/`to`, qui peut être un id de sous-graphe, accepté par le mainteneur le même jour) ;
              ~~titre d'en-tête à dessiner~~ (fait le 2026-11-20 : un `title:` de frontmatter sur un type sans
              instruction `title` (organigramme, classes, états, ER, et tous les autres) est un paragraphe en gras
              au-dessus du dessin, aligné à gauche comme le dessin, `keepNext` ; aussi en `.odt` ; vérifié dans Word
              et LibreOffice, `test-corpus/word-verification/frontmatter-titles.*` ; étage 1 à **437 propres
              (81 %)**) ; ~~`view: collapsed`~~ (fait le 2026-11-20 : `Subgraph.collapsed` dans l'AST, repli avant la
              mise en page par `layout/collapse-subgraphs.ts` comme dans Mermaid, forme `collapsedGroup` aux
              couleurs des sous-graphes, titre puis `• • •` ; `.docx`, `.odt`, SmartArt ; vérifié dans Word et
              LibreOffice, `test-corpus/word-verification/collapsed-subgraphs.*` ; étage 1 à **438 propres** ;
              ajouts d'API publique `NodeShape` `'collapsedGroup'` et `Subgraph.collapsed`, à publier avec `core`).
              Organigrammes officiels : un seul avertissement reste (#102, direction ignorée comme dans Mermaid) ;
            - **Écart de mise en page relevé le 2026-11-20, non traité :** Mermaid range à part tout sous-graphe
              qu'aucun lien ne traverse et, sans `direction` propre, **inverse** sa direction (TB ↔ LR,
              `extractor` de son rendu dagre). Ici, seuls les sous-graphes à direction propre ou visés par un lien
              sont rangés à part, dans la direction du diagramme. Adopter la règle de Mermaid changerait le rendu
              de la plupart des diagrammes à sous-graphes (baselines `test:visual`) : décision du mainteneur ;
            - ~~**séquence (11)**~~ (fait : 36/38, les 2 restants voulus, voir plus haut), ~~**C4 (6)**~~ (fait le 2026-11-21, voir
              ci-dessous), ~~**architecture (5)**~~ (fait le 2026-11-24 : dessiné comme Mermaid 12.3, icônes intégrées, grille
              déduite des ports, `align`, groupes imbriqués, `{group}`, `-[label]-` ; vérifié dans Word et LibreOffice,
              `test-corpus/word-verification/architecture.*` ; comparateur différentiel encore à écrire, voir plus bas ;
              à lui de dire si Mermaid fait aussi passer la flèche Gateway → Server sur le titre « Public API » du
              groupe, comme la baseline `test:visual` du 2026-11-24 : cytoscape exige un vrai canvas sous jsdom),
              ~~**Gantt (7)**~~ (fait), ~~**mindmap (4)**~~ (fait), ~~**requirement (4)**~~ (fait),
              ~~**treeView (4)**~~ (fait le 2026-11-21, voir ci-dessous), divers (8) ;
            - ~~**C4 (6)**~~ (fait le 2026-11-21) : dessiné comme Mermaid 12.3 le dessine (son moteur C4 lu sur les
              exemples officiels, code propre au projet). Pas de Dagre : grille dans l'ordre de déclaration, 4 éléments
              puis 2 cadres par ligne (`UpdateLayoutConfig`), cadres imbriqués autour de ce qu'ils contiennent
              (`C4Diagram.boundaries`) : pointillés pour `*Boundary`, trait plein pour `Deployment_Node` / `Node*`, qui
              n'est plus une boîte ; libellé, `[ENTERPRISE]` / `[SYSTEM]` / `[CONTAINER]` / type du nœud. Couleurs de
              Mermaid par catégorie et pour l'externe, texte blanc, stéréotype `[Software System]` ; personne à tête
              (proportions de Mermaid), `Db` en cylindre, `Queue` en cylindre couché (`translator/custom-geometry.ts`,
              extrait de `participant-glyph.ts`). `UpdateElementStyle` (élément ou cadre) et `UpdateRelStyle`
              (couleurs, décalage du libellé) appliqués, couleurs validées ; relations numérotées en `C4Dynamic` ; un
              second `Rel` entre les mêmes extrémités remplace le premier, un `Rel` sans libellé est écarté (averti),
              comme dans Mermaid. Le texte est mesuré à la taille arrondie au demi-point que Word reçoit une fois le
              dessin réduit à la page (sinon une ligne débordait d'un cylindre de `c4#0`). Comparateur au
              différentiel : **6/6 identiques** ; étage 1 : **6/6 propres**, **510 propres (94 %)**. Vu dans Word et
              LibreOffice (`test-corpus/word-verification/c4-boundaries.*`), 0 erreur de schéma dans `document.xml`.
              Ajouts d'API, optionnels : `C4Diagram.boundaries` / `level` / `layout`, `style` sur élément et relation,
              types `C4Boundary`, `C4ElementStyle`, `C4RelationshipStyle`, `C4LayoutConfig`, `C4Level` ; retrait :
              `C4Category` `'node'` (un nœud de déploiement est un cadre ; accepté par le mainteneur le 2026-11-21). Restent, connus : traits droits (Mermaid
              courbe ceux après le premier), qui peuvent passer sur une forme ou sur le libellé d'un cadre
              (`c4#5`) ; `$shape`, `$sprite`, `$tags`, `$link` non appliqués (avertis pour `UpdateElementStyle`).
              Baseline `test:visual` `c4` rafraîchie depuis la CI Linux, revue (seule image modifiée) ;
            - ~~**treeView (4)**~~ (fait le 2026-11-21) : parseur refait sur la grammaire de Mermaid 12.3
              (`treeView.langium` et sa lecture des arbres en traits : niveau par colonne de branche et pas de
              l'arbre ; tabulation = 1 colonne hors traits ; noms entre `"…"` ou `'…'` ; annotation reconnue après
              une espace seulement, la dernière de chaque sorte gagne ; `/` final retiré à l'affichage ;
              `title` / `accTitle` / `accDescr`). Rendu comme celui de Mermaid, vu dans son SVG : racine implicite
              `/` au-dessus des entrées (en formes et en SmartArt, `tree-view/implicit-root.ts` ; un arbre à
              plusieurs entrées devient donc une SmartArt), dossiers en gras, descriptions en vert italique dans
              une colonne, bande `highlight` ambre jusqu'au bord droit, traits noirs, `title` au-dessus (le titre
              de frontmatter devient l'instruction `title`). `icon(none)` / `icon()` acceptés sans
              avertissement (#8 propre). Comparateur au différentiel : **13/13 identiques** ; étage 1 à **504
              propres (93 %)**. Corrigé en passant : dans Word, une boîte SmartArt à fond clair (`classDef`,
              `style`, `highlight`) gardait le texte blanc du style, illisible ; le modèle de données porte
              maintenant la couleur lisible (`textColorOnFill`, `smartart/text.ts`), pour toutes les SmartArt.
              Vu dans Word et LibreOffice (`test-corpus/word-verification/tree-view*`), 0 erreur de schéma
              dans `document.xml` et `word/diagrams/`. Restent, voulus : `icon(logos:react)` (#1, #7, #9),
              non dessinable (paquet d'icônes de la page web). Restent, à faire : les icônes intégrées de
              Mermaid (`folder`, `file`, et `showIcons: true` qui les met partout) ; les options `config.treeView`
              (`showIcons`, `rowIndent`, `lineThickness`, couleurs), couvertes par la notice « options non
              appliquées ». Ajouts d'API, optionnels : `TreeViewNode.className` / `icon`,
              `TreeViewDiagram.title` / `accTitle` / `accDescr` ; changement de sens : `TreeViewNode.label`
              n'a plus le `/` final d'un dossier (`isDirectory` le porte). Baseline `test:visual` `tree-view`
              rafraîchie depuis la CI Linux, revue (seule image modifiée ; fixture corrigée : `index.ts :::highlight`).
            - **types à dessiner** : ~~agentflow, usecase~~ (faits le 2026-11-19, via le moteur d'organigramme :
              `diagrams/flowchart-source.ts`, acteurs en bonhomme : forme `actor`, géométrie personnalisée) ; ~~railroad~~
              (fait le 2026-11-20 : `diagrams/railroad/`, conception propre au projet, CC0 : la syntaxe vient de la doc
              Mermaid, le code n'en reprend rien ; une première version traduite du code Mermaid (MIT) a été
              remplacée le jour même, décision du mainteneur : rester 100 % CC0, on lit et on réinterprète, on ne
              copie pas ; 4 dialectes, 14/14 exemples propres, rendu vérifié dans Word, 0 erreur de schéma dans
              `document.xml`). Le corpus officiel n'a plus aucun type « pas encore dessiné » : **420 propres (78 %)**.
              Ajout d'API publique : `DiagramType` `'railroad'` et les types/fonctions `Railroad*` (à publier avec
              la prochaine release de `core`). Reste : baseline
              `test:visual` pour railroad (à produire en CI, pas sur Windows) ; `.odt` (note, comme tous les types
              non organigrammes).
            - **Corrigé le 2026-11-20 : `wrap="none"` dans Word.** Word redimensionne une zone de texte
              `wrap="none"` à la largeur de son texte, bord gauche fixe (vérifié par l'export PDF de Word ;
              `noAutofit`, `txBox`, `anchorCtr` n'y changent rien) : texte centré décalé à gauche (titres pie /
              quadrant / séquence, noms des participants), texte aligné à droite décollé (axes du quadrant),
              boîtes remplies rétrécies (Ishikawa). Correctif : `unwrappedTextFrame` (`canvas.ts`) élargit les
              zones de texte invisibles du côté où le texte peut déborder, `wrapDrawingCanvas` les ramène dans le
              canevas (LibreOffice décale tout le dessin sinon), les boîtes remplies passent en `wrap="square"`.
              Vérifié dans Word et LibreOffice sur 31 types. Le même jour, les étiquettes d'arêtes du flowchart
              et les nœuds de mindmap en formes passent aussi en `wrap="square"` (vérifié dans Word) : plus aucun
              `wrap="none"` dans `core`. Baselines `test:visual` rafraîchies depuis la CI Linux (34 images,
              dérive due surtout à 52aeea8, l'espace réservé aux étiquettes d'arêtes ; toutes revues).
              Séquence : les libellés de blocs (`alt`, gardes, `[failed]` d'un `else`) passent au-dessus des
              barres d'activation (corrigé le 2026-11-20, vérifié dans Word).
            - **Décision du mainteneur, 2026-11-19 : ajouts d'API publique de `core` acceptés** — `DiagramType`
              `'agentflow'` et `'usecase'` (+ `'mermaidUnsupported'`), `NodeShape` `'actor'`, `EdgeType`
              `'generalization'` et `'realization'`. Tous additifs ; à publier avec la prochaine release de
              `core` (0.7.0, pré-1.0). Faits le même jour : bonhomme (acteurs), triangle creux (classes,
              généralisation), losange creux (agrégation). Reste à valider hors de cette machine :
              `test:odf-validate`, `test:visual` (CI), et un rendu dans Word du bonhomme et des triangles
              (vérifiés dans PowerPoint seulement).
            - Limite de l'étage 1 : il ne voit que les avertissements. Un faux nœud créé sans avertissement
              (comme `e1@{ … }` avant correction) n'est visible qu'à l'étage 2.
      - [~] **Étage 2 — différentiel contre `mermaid`** (dépendances de dev `mermaid` + `jsdom` accordées
            par le mainteneur le 2026-11-19, tests uniquement, jamais au runtime). Outil livré le 2026-11-20 :
            `tools/mermaid-differential/` (hors workspaces, son propre lockfile, `mermaid@12.3.0` épinglé comme le
            corpus), rapport `test-corpus/mermaid-official/DIFFERENTIAL.md`, verrou CI (job *Mermaid differential*,
            `expected-match.json`). Comparateurs : organigrammes, séquence, classes, états, ER, Gantt (ajouté le 2026-11-21, dates résolues comparées en UTC), cartes mentales (ajouté le 2026-11-21 : arbre, formes, texte, icônes et classes), exigences (ajouté le 2026-11-21 : boîtes, champs affichés, relations, direction, styles), arborescences, C4 (ajouté le 2026-11-21 : éléments, cadres et leur imbrication, relations, styles, configuration de grille). Premier passage :
            252 exemples comparés, 217 identiques, 35 écarts dont 7 sans avertissement ; **les 7 corrigés le
            2026-11-20** (flèche longue avec libellé, membres de sous-graphe à la règle de Mermaid, titre de
            sous-graphe lu comme un libellé, `participant X@{…} as …` et `"alias"`, entités nommées HTML 4 partagées
            par organigrammes et séquence, ce qui a aussi supprimé un `RangeError` sur `#99999999;`) : **225
            identiques, 27 écarts, tous avec avertissement** (classes, ER, liens vers un sous-graphe — faits depuis —, état seul). Vu
            dans Word au passage : deux sous-graphes empilés (`flowchart#104`) se touchent, sans marge entre eux.
            ER refait le 2026-11-20 (cardinalités en toutes lettres, symboles collés ou inversés, alias `p[Person]`,
            noms entre guillemets, déclarations seules, `direction`, `:::classe`) : **25/25 ER identiques à Mermaid**,
            237/252 au total. Vu dans Word : les libellés de relation ER sont posés sur le trait, sans fond.
            Classes le même jour (relations selon la grammaire de Mermaid : extrémité optionnelle de chaque côté,
            trait plein ou pointillé, donc `<|..`, `|>..` et la relation double `<|--|>` ; noms entre backticks avec
            espaces ; `class X <<annotation>>` et `class X:::style`) : **36/38**, **245/252 au total**. Liens vers un
            sous-graphe le même jour (#100 à #103) : **250/252**, étage 1 à **431 propres (80 %)**. Restent les
            « sucettes » `()--` / `--()` (#15, #16) : une interface dessinée en petit cercle, forme à ajouter au
            traducteur, pas une lecture à corriger.
            Reste : comparateurs des autres types (architecture…). Au 2026-11-21 : **306/306 identiques**.
            Rejouer à chaque montée de version de Mermaid, corpus et épingle ensemble.

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
- **Convertisseur navigateur, restes** (livré le 2026-11-20, `packages/web`) :
  - options de page et de typographie (`referenceDocBuilder` à passer sur `DocxPackage`, comme le
    post-traitement), tableaux en paysage (le filtre lit `os.getenv`, absent de `pandoc.wasm` : passer
    par des métadonnées Pandoc, ce qui servirait aussi le CLI) ;
  - images du Markdown (déposer les fichiers avec le `.md`, passés à `pandoc.wasm`) ; `.odt` ;
  - avertissements du moteur en anglais seulement, même sur la page en français ;
  - Pandoc 3.14 dans la page, 3.1.3 épinglé pour le CLI en CI : à rapprocher (§2bis « Pandoc comme contrat ») ;
  - la sélection des blocs de diagramme existe en Lua et en JS (`diagram-blocks.mjs`) : n'en garder qu'une
    si le CLI passe un jour par l'AST JSON.
- **Conformité, restes** : le hook gitleaks n'est pas installé d'office dans un Codespace (installer gitleaks et
  lancer `npm run hooks:install` depuis `.devcontainer/setup.sh` touche `.devcontainer/`, donc escalade).
- **Mesure d'usage** (seulement si le site navigateur existe) : compteurs agrégés sans cookie
  (`page_view`, `docx_generated`, `docx_generated_with_native_diagram`), jamais de contenu.
- **draw.io, dans les deux sens : décidé par le mainteneur le 2026-11-20** (point 7 de l'ordre de
  travail ; extension du périmètre de la règle 1 accordée). Sortie `.drawio` par diagramme d'abord
  (depuis le modèle positionné, avant DrawingML), import `.drawio` → formes Word ensuite. L'import lit un
  fichier extérieur : avant d'écrire le lecteur, ajouter sa ligne au tableau de sécurité d'`AGENTS.md`
  (XXE, et plafonds de taille et de ratio pour le contenu compressé, deflate + base64, d'un `.drawio`),
  ce qui est une escalade à soumettre. SVG par diagramme en complément. VSDX seulement sur demande.

Écartées après discussion (2026-09-08), à rouvrir seulement sur un besoin concret : binaire compilé
par OS (coût récurrent de signature macOS/Windows), réécriture du moteur en Python (doublon sans
bénéfice ; le CLI npm donne déjà le découplage).
