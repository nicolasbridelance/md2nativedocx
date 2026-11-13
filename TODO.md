# TODO — `md2nativedocx`

> Backlog des items **réellement ouverts** au 2026-11-13 (§R ajouté ce jour ; le reste au 2026-10-07), chacun vérifié contre le code et l'historique.
> Rien de terminé ici : un item fini sort du fichier (son détail va dans le message de commit, ou dans
> `docs/history/TODO_ARCHIVE.md` s'il mérite un récit). L'ancien `TODO.md` complet (1 500 lignes, tous
> les chantiers fermés) est recopié en fin de `docs/history/TODO_ARCHIVE.md`.
>
> État du produit : `HANDOVER.md`. Ce que devient chaque type Mermaid : `docs/coverage.md`. Règles et
> escalades : `AGENTS.md`. Suite du produit (V2 moteur, V3 aller-retour) : `docs/specs/01-…`, `03-…`,
> `04-…` et `docs/adr/0012-evolution-by-extraction.md` ; phases au §11 du cahier des charges.
> **Priorité depuis le 2026-11-13 : la robustesse (§R ci-dessous)**, après l'incident `flux_arcs`
> sur la 0.8.0 publiée. La cible LibreOffice / ODF (§0, `docs/specs/05-libreoffice-odf-spec.md`)
> reprend ensuite. Les numéros de section existants ne bougent pas : d'autres documents les citent.

---

## R. Priorité — robustesse (incident `flux_arcs`, 2026-11-13)

**Ce qui s'est passé.** Un utilisateur sous Windows et OneDrive Entreprise exporte `flux_arcs.md` avec
l'extension 0.8.0. Word plante, puis affiche « erreur grave » à chaque réouverture de ce chemin.
Trois analyses faites par un autre modèle sont arrivées (texte collé, 2026-11-13). Leur contre-analyse
a fait le test qui tranche : une copie identique octet pour octet du `.docx` s'ouvre, se modifie et
s'enregistre sans problème dans Word. **Le contenu XML n'est donc pas la cause du plantage.**
Cause retenue :
1. Le CLI écrase le fichier pendant que Word l'ouvre. Word note « Opération annulée » à 08:54:40 et
   l'écrasement a lieu à 08:54:42-43, dans un dossier synchronisé par OneDrive.
2. Word met ensuite ce chemin en quarantaine dans `Resiliency` / `PotentialDataLossInfo2`.

Le fichier exporté ne contenait **aucun** diagramme. Le bloc ```` ```mermaid ```` n'était pas fermé,
et Pandoc 3.1.3 en a fait un paragraphe de texte brut sans le moindre avertissement (reproduit le
2026-11-13).

**Vérifié dans le code le 2026-11-13** (tout ce qui suit l'est, sauf mention « à vérifier ») :

| Affirmation des analyses | Verdict |
|---|---|
| Écriture directe sur la cible, sans fichier temporaire ni contrôle du verrou (`bin/md2nativedocx.mjs:153`, `src/pptxExport.mjs:60`) | **vrai** |
| « Exporter le document » lit le fichier sur disque et ignore les modifications non enregistrées (aucun `isDirty`) | **vrai** |
| Un bloc non fermé est abandonné sans rien dire (`mermaidBlocks.ts:71`) | **vrai** (côté Pandoc aussi) |
| `class A,B c;` rejeté à cause du `;` (`parser/parser.ts:668`, `block/parser.ts:237`) | **vrai, et pire** : une **arête** finie par `;` (`R1 --> P2;`) est aussi ignorée, donc des liens disparaissent |
| `color:` ignoré dans `classDef` / `style` (`ooxml-translator.ts:794`) | **vrai** |
| Marqueur `SMARTART_PLACEHOLDER:([^:]+)` puis `join(smartArtDir, id)` sans contrôle (`postprocess.mjs:468`, `:556`) | **vrai** (traversée de chemin depuis la prose) |
| `escapeXml` laisse passer les caractères interdits en XML 1.0 (`xml-escape.ts:28`) | **vrai** |
| Le contrôle Word ne compte que `/word/diagrams/` (`bin/md2nativedocx.mjs:204`) | **vrai** ; le message « 0 error(s) » est trompeur |
| « 13 erreurs viennent du `reference.docx` maison » | **faux** : 11 erreurs sur les styles `*Tok` de coloration syntaxique, plus `w:nsid` et `doNotTrackMoves`, sont toutes écrites par Pandoc 3.1.3. Aucune dans `document.xml` |
| Style de tableau par défaut `Table` avec `tblStylePr` : « régression 0.8.0 » | **faux** : identique au `reference.docx` de Pandoc |
| Pas de `compatibilityMode` dans `settings.xml` | vrai, mais Pandoc ne le met pas non plus. Ce n'est pas une régression ; c'est une amélioration possible (R4) |
| `latentStyles` et `a:objectDefaults` absents | **vrai, écart réel introduit par `a8d411a`** (Pandoc les avait) |
| Injection de formules dans les classeurs `.xlsx` des graphiques | **ne s'applique pas** : le texte est écrit en `inlineStr`, les nombres passent par `Number.isFinite`, aucun `<f>` (`chartParts.mjs:44-64`) |

**Règles du chantier.** Une PR par lot (ou par point si le lot est gros), dépôt vert à chaque étape.
Les commits de R3 portent le préfixe `security:`. Pas de refonte (ADR 0012) : on extrait, on ne
réécrit pas. Une modification de message non commitée sur `bin/md2nativedocx.mjs`
(« No problem found… do not affect how Word opens the file ») est **à abandonner**. Elle affirme ce
que le contrôle ne vérifie pas ; R1.4 la remplace.

### R1 — L'incident lui-même → release 0.8.1 (branche `fix/safe-docx-write`)

- [x] **R1.1 Écriture sûre de la sortie.** Un seul utilitaire `writeOutputSafely(path, buffer)` dans
      `packages/cli/src/`, utilisé par `bin/md2nativedocx.mjs` (`.docx`, `.odt`, journal) et `pptxExport.mjs` :
      - refus si le fichier de verrou Word existe dans le dossier de sortie. Il y a deux formes :
        `~$` + nom complet, et `~$` + nom privé de ses 2 premiers caractères pour les noms longs ;
      - refus si la cible existe et ne s'ouvre pas en `r+` (EBUSY / EPERM / EACCES sous Windows) ;
      - écriture dans `<cible>.<pid>.tmp` dans le **même dossier**, `fsync`, puis `rename` ; le
        temporaire est supprimé en cas d'échec, et la cible d'origine n'est jamais tronquée ;
      - échec signalé par `ConversionError` (`stage: 'write'`), code de sortie 2 et message
        utilisable : « X.docx est ouvert dans Word : fermez-le ou exportez sous un autre nom ».
      - Tests : verrou présent → refus et cible intacte au même octet près ; réussite → aucun `.tmp`
        laissé ; échec de `rename` simulé → cible intacte.
- [x] **R1.2 Extension : notification claire** quand le CLI renvoie l'erreur `write`, avec un bouton
      « Exporter sous… ». Aujourd'hui l'erreur ne serait visible que dans le canal de sortie.
- [x] **R1.3 Enregistrer avant d'exporter.** Dans l'export du document et l'export multi-fichiers, si
      un `TextDocument` ouvert correspond au fichier et `isDirty`, faire `await doc.save()` avant de
      lancer le CLI. (Choisi plutôt que d'exporter `getText()` : Pandoc résout images et chemins
      relatifs depuis le disque.)
- [x] **R1.4 Contrôle Word honnête.** Classer chaque erreur du validateur :
      - **les nôtres** : `/word/diagrams/*`, `/word/charts/*`, `/word/document.xml` ;
      - **connues de Pandoc** : liste fermée de signatures relevées le 2026-11-13 (styles `*Tok` →
        `w:rPr`, `w:nsid` de `numbering.xml`, `doNotTrackMoves`), liée à la version de Pandoc ;
      - **autre** : signalé comme erreur.
      Le message dit par partie ce qui a été vérifié, sans jamais affirmer un effet sur Word. Test sur
      un `.docx` dont le canevas `wpc` est cassé exprès : le contrôle **doit** le signaler, ce qui
      vérifie l'« angle mort » annoncé par les analyses.
- [x] **R1.5 Bloc ```` ```mermaid ```` non fermé.**
      - `mermaidBlocks.ts` renvoie les blocs non fermés au lieu de `break` ;
      - avertissement à l'export, et diagnostic `DiagnosticCollection` dans l'éditeur avec un Quick
        Fix « ajouter ```` ``` ```` » ;
      - côté CLI, détection équivalente avant Pandoc, avec un avertissement dans le journal.
- [ ] **R1.7 (suite de R1.4, hors release 0.8.1) Un seul classement des erreurs du validateur.**
      `scripts/test-oxml-validate.mjs` (`isOwnDiagramOutput`) garde son propre filtre, déjà plus large que
      l'ancien filtre du CLI mais distinct de `classifyValidatorErrors` (`packages/cli/src/wordCheck.mjs`).
      Le brancher dessus pour que CI et journal classent pareil, et que `test:oxml-validate` distingue aussi
      les écarts Pandoc connus des erreurs « autres » au lieu de les compter en bloc.
- [ ] **R1.6 Release.** Extension 0.8.1 et CLI en patch. Vérification manuelle par le mainteneur sur
      son poste Windows + OneDrive : export pendant que le `.docx` est ouvert dans Word → message, pas
      de plantage. Rédiger alors `docs/history/incident-flux-arcs-2026-11.md` et faire sortir R1 d'ici.

#### Journal de R1 : réalisé, écarts avec le plan, reste à faire (tenu à jour au fil de l'eau)

| Lot | État | Écart avec le plan / limite connue |
|---|---|---|
| R1.1 | fait | Test d'échec de `rename` : la cible est un dossier, donc l'échec survient au contrôle `r+` et non au `rename` ; il prouve que la cible reste intacte mais pas le nettoyage du `.tmp`. |
| R1.2 | fait | Pas de « Exporter sous… » dans l'export multi-fichiers (un nom par fichier à choisir) : l'échec est compté et détaillé dans le canal de sortie. Dialogue non testé dans un VS Code réel (`test:extension-host` non lancé). |
| R1.3 | fait | L'export d'un seul diagramme n'enregistre pas : il lit le tampon de l'éditeur, pas le disque. `doc.save()` non testé dans un VS Code réel. |
| R1.4 | fait | La liste « connue de Pandoc » est plus large que prévu : le validateur signale aussi, dans `document.xml`, `tblHeader val="true"`, `jc="start"` et l'ordre `pStyle`/`numPr` des listes (3.1.3). `scripts/test-oxml-validate.mjs` garde son filtre propre → R1.7. |
| R1.5 | fait | `parseMermaidBlocks` inchangé (fonction séparée `findUnclosedMermaidFences`, pour ne pas décaler les index des appelants). Détection dupliquée TS/`.mjs` (extension TS, CLI vendorisé). Quick Fix et diagnostics non testés dans un VS Code réel. L'export `.pptx` ne signale pas ce cas (parseur propre). |
| R1.6 | à faire | Release 0.8.1 + vérification manuelle du mainteneur (Windows + OneDrive) + `docs/history/incident-flux-arcs-2026-11.md`. |
| R1.7 | à faire | Hors 0.8.1 : un seul classement des erreurs du validateur (CI et journal). |

### R2 — Fidélité du parseur sur le cas `flux_arcs` (branche `fix/mermaid-statement-endings`)

- [ ] **R2.1 Fins d'instruction.** Une passe de normalisation partagée dans `packages/core/src/parser/` :
      - CRLF ;
      - `;` final ;
      - plusieurs instructions sur une ligne séparées par `;` (`A-->B; B-->C`) ;
      - commentaire `%%` en fin de ligne, mais pas `%%{init}%%` ;
      - BOM.
      Les `;` à l'intérieur d'une étiquette entre guillemets ou crochets sont préservés.
      Brancher d'abord le flowchart, puis chaque parseur, avec un test en table : « chaque type
      accepte les `;` finaux ». Les golden ne doivent pas bouger.
- [ ] **R2.2 `color:` dans `classDef` / `style`** → couleur du texte du nœud, passée par
      `validateHexColor`, en OOXML **et** en ODF. Sinon, le calcul automatique actuel reste.
- [ ] **R2.3 Diagramme réduit au point d'être illisible.** Avertissement (journal et extension) quand
      la police effective tombe sous 7 pt, avec une suggestion : `TB` ou page en paysage. Un plancher
      de police imposé obligerait à agrandir les boîtes, donc à toucher le layout : à rattacher à
      l'idée « Gros diagrammes » du §4, pas ici.
- [ ] **R2.4 `direction` dans un `subgraph`** (déjà signalé par un avertissement) : layout récursif
      par sous-graphe. C'est une vraie fonctionnalité, pas un correctif ; à chiffrer après R1-R3.

### R3 — Sécurité (branche `security/untrusted-text-hardening`)

- [ ] **R3.1 Marqueurs SmartArt et graphiques.**
      - Identifiant limité au format UUID (`[0-9a-f]{8}-…`, ce que génère `randomUUID()`), pour
        `SMARTART_PLACEHOLDER` comme pour `CHART_PLACEHOLDER` ;
      - contrôle que `resolve(dir, id)` reste bien dans `dir` ;
      - un identifiant inconnu est ignoré sans planter.
      - Tests : prose contenant `SMARTART_PLACEHOLDER:../../x:dm`, et un document qui documente le
        projet lui-même.
      - Le manifeste hors bande proposé par les analyses change le contrat de `renderDiagram()` :
        **escalade**, pas dans ce lot.
- [ ] **R3.2 Caractères interdits en XML 1.0** (`\x00-\x08`, `\x0B`, `\x0C`, `\x0E-\x1F`, demi-paires
      UTF-16 isolées, `￾`, `￿`) remplacés par U+FFFD dans `escapeXml`. Vérifier qu'aucun
      autre point d'écriture ne contourne `escapeXml` (`esc` de `chartParts.mjs`, `pptx`, ODF).
      Ajouter à `test:fuzz` une propriété : toute chaîne JS dans une étiquette donne un XML bien
      formé.
- [ ] **R3.3 Intégrité après renumérotation.** Test sur un document avec plusieurs diagrammes,
      des images Markdown et des zones de texte : chaque `stCxn` / `endCxn` désigne un `cNvPr id`
      existant dans le même canevas, et les ids sont uniques dans tout le document. Vérifie les
      regex de `renumberDrawingIds()`.
- [ ] **R3.4 Temps de réponse sur entrées pathologiques.**
      - Budget pour `planFor` (appelé à chaque frappe dans l'extension), sur une ligne de 100 Ko, des
        crochets jamais fermés ×50 000 et un graphe complet K40 ;
      - délai pour le CLI et le pont, qui reste à faire (voir « Limites de ressources », §2bis) ;
      - `eslint-plugin-regexp` / `recheck` contre les ReDoS : nouvelle dépendance, **escalade**.
- [ ] **R3.5 Images `\\serveur\partage` et `file://` lues par Pandoc** (fuite de hash NTLM sous
      Windows). Même sujet que l'item MCP du §2bis : une option de `convert()` est nécessaire
      (**escalade**). En attendant, documenter le risque dans le README de l'extension.

### R4 — Gabarit et compatibilité Word : vérifier dans Word avant de changer (branche `fix/reference-docx-parity`)

- [ ] **R4.1 Rétablir `w:latentStyles` et `a:objectDefaults`** dans `packages/cli/reference-docx-src/`,
      écrits par le projet (pas copiés de Pandoc : licence, voir `a8d411a`). Contrôles :
      `test:oxml-validate`, puis un aller-retour dans Word (galerie de styles, insertion d'une forme
      par l'utilisateur).
- [ ] **R4.2 `compatibilityMode` = 15** : sort Word du « mode de compatibilité ». Cela peut changer
      la mise en page, donc il faut un round CHECKLIST dans un vrai Word avant de l'adopter.
- [ ] **R4.3 Formes de sous-graphe** (`<wps:bodyPr/>` nu, sans `wps:style`) : valides au schéma.
      Les aligner sur les nœuds seulement si un round Word montre une différence.
- **Écarté sans preuve d'un problème** : envelopper `wpc` dans `mc:AlternateContent`, car ce rendu a
  été validé de nombreuses fois dans Word réel. Corriger les erreurs de Pandoc en post-traitement :
  hors de la liste fermée de la règle 7 d'AGENTS.md (`styles.xml` / `numbering.xml` d'une sortie
  Pandoc), donc **escalade** si un jour c'est utile.

### R5 — Architecture : ce qu'on retient de la proposition « 4 étages »

L'ADR 0012 interdit de réécrire un traducteur qui fonctionne. On ne fait **ni** IR complète, **ni**
builder XML générique. On garde ce qui s'extrait sans refonte :
- [ ] l'étape de normalisation en entrée, qui est R2.1 ;
- [ ] une fonction unique `buildWordShape()` dans `ooxml-translator.ts`, introduite uniquement là où
      R2 / R4.3 modifient déjà le code ;
- [ ] des types bornés (`HexColor`, coordonnées EMU finies et positives) seulement aux endroits
      où un bug réel les justifie.

### Décisions demandées au mainteneur (escalade AGENTS.md)

- Manifeste hors bande au lieu des marqueurs (contrat public de `renderDiagram()`).
- `eslint-plugin-regexp` ou `recheck` (nouvelle dépendance).
- Option de `convert()` pour refuser les ressources externes (API du CLI).
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
- [ ] Export `.odt` dans l'extension VS Code (elle n'embarque aujourd'hui que le `reference.docx`).
- [ ] Porte B (extension LibreOffice, spike S4). Présentation sur le bug 172531 seulement avec une
      première version montrable.

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
