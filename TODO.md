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
      (l'ancienne réimplémentation maison est jetée). Spike : `scripts/spike-layout.mjs`.
- [x] **Valider `RawBlock('openxml', ...)`** sur un fragment `wpg:wgp` complexe — validé
      bout-en-bout (Pandoc 3.1.3 → `.docx` → ZIP valide, XML bien formé, 0 relation externe).
      Spike : `scripts/spike-pandoc/`. ADR 0002.
- [x] Documenter les deux décisions dans `docs/adr/0001-layout-engine.md` et
      `docs/adr/0002-pandoc-integration.md`.
- [x] Écrire `.devcontainer/devcontainer.json` + `setup.sh` (Pandoc 3.1.3, Lua 5.4, LibreOffice).
      ⚠️ PR séparée, **non mergée** — revue humaine obligatoire (règle `.devcontainer/`).
- [x] `npm install`, `build`, `typecheck`, `lint` sur l'existant — base vérifiée (0 erreur).
- [x] `.github/workflows/ci.yml` + `codeql.yml` écrits.

---

## État actuel (2026-08-06)

**Fait :**
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
- ❌ Phase 2 (extension VS Code), Phase 3 (couleurs + sous-graphes), Phase 4 (add-in Word),
      Phase 5+ (autres diagrammes)
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
      est complet et fonctionnel, mais seulement **3 fixtures** ont une baseline
      (`test-corpus/visual/{fixtures,baseline}/` : `shapes`, `edge-types`, `colors`, couvrant les
      6 formes, les 4 types de trait + label, et le contraste de texte clair/sombre) — la spec §9
      demande un **corpus de 20 à 30 diagrammes représentatifs** (3 à 50 nœuds, avec
      sous-graphes). Le corpus existant à 8 diagrammes (`test-corpus/source/`, 24 à 318 nœuds,
      voir "Lisibilité des gros diagrammes" ci-dessous) n'y est délibérément pas inclus tant que
      le routage des arêtes qui sautent un rang n'est pas corrigé. **Reste à faire** : étoffer
      `test-corpus/visual/fixtures/` jusqu'à la taille demandée par la spec une fois les deux
      limitations de layout ci-dessous réglées (sinon les baselines figeraient des rendus
      buggés). Seuil 1 % de pixels différents (tolérance 24/255 par canal pour absorber
      l'anti-aliasing). Une baseline n'est **jamais** générée automatiquement au premier run
      (aurait canonisé silencieusement un
      bug, comme les deux exemples ci-dessous le montrent) — `--update-baseline` explicite après
      revue visuelle. `npm run test:visual` (skip proprement si LibreOffice absent du PATH) ;
      `npm run test:visual:update-baseline` pour régénérer après revue.
- ❌ **Tests manuels dans Word réel** (critère d'acceptation MVP, spec §9) — les corrections de
      conformité ci-dessus sont validées structurellement (XML bien formé, ZIP valide, ids
      uniques, hiérarchie comparée à un document Word réel) et maintenant aussi visuellement
      (LibreOffice), **pas** par une ouverture dans Word lui-même — le rendu OOXML de LibreOffice
      diverge de Word sur des détails (ex. les têtes de flèche `a:tailEnd` : présentes et
      correctement positionnées dans le XML, mais leur rendu par Word reste à vérifier).
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
- ⚠️ **Limitation de routage restante, distincte de ce qui précède** : une arête qui « saute »
      un rang (ex. `B -->|non| D` alors que `B -->|oui| C` et `C --> D` existent aussi) est
      tracée en ligne droite entre B et D sans tenir compte des nœuds intermédiaires. Dagre sait
      router ce cas (nœuds virtuels de contournement) mais `layout.ts`/`LayoutResult` n'exposent
      que des boîtes de nœuds, pas les tracés d'arêtes calculés par Dagre — le traducteur ne les
      consulte donc jamais. Résultat : la ligne traverse littéralement l'intérieur de `Action`
      dans l'exemple `oui`/`non` ci-dessus (vérifié : `Choix` et `Fin` centrés à x=60, `Action`
      occupe x=[50,170], la ligne droite B→D tombe dedans), et son label hérite du même
      chevauchement. Touche directement le critère d'acceptation MVP (spec §9 : « 0 croisement
      de flèches nécessitant un réarrangement manuel dans >90 % des cas »). Corriger proprement
      demanderait de exposer les points de route de Dagre et d'émettre un connecteur coudé
      (`prstGeom` bent/curved plutôt que `line`) — portée plus large qu'une correction ponctuelle,
      à trancher séparément.
- ⚠️ **Titre de sous-graphe superposé au premier nœud**, trouvé en générant les baselines
      `test:visual` : Dagre calcule la boîte d'un cluster au plus juste autour de ses nœuds
      enfants, sans réserver d'espace pour la barre de titre que `renderSubgraph`
      (`ooxml-translator.ts`) dessine en haut de cette même boîte — le titre (ex. « Groupe
      externe ») s'affiche par-dessus le premier nœud contenu. Corriger proprement demande de
      faire grandir la boîte de chaque sous-graphe de la hauteur du titre dans `layout.ts` et de
      décaler récursivement tout son contenu (répété à chaque niveau d'imbrication) — chirurgie
      de l'arbre de layout, pas une correction locale au traducteur. Fixture et détail dans
      `test-corpus/visual/known-issues/subgraph.mmd` + son `README.md`, volontairement exclue de
      `test-corpus/visual/fixtures/` pour ne pas canoniser ce rendu comme référence.
- ⚠️ **Lisibilité des gros diagrammes** : le corpus va de 24 à 318 nœuds, alors que le critère
      d'acceptation MVP porte sur ≤ 15 nœuds. La mise à l'échelle automatique empêche Word de
      rogner, mais un diagramme de 318 nœuds ramené à 6,5 pouces de large fait 1 mm de haut et
      reste illisible. C'est une limite du couple layout/page, pas un défaut de format : à
      trancher (pagination ? découpage ? orientation paysage ? refus explicite au-delà d'un
      seuil ?) avant de considérer le corpus comme un cas d'usage supporté.

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
- [ ] 🔮 **Futur-proofing** (voir `FUTURE_docx2mermaid_SPEC.md` §4) : chaque forme émise porte
      son ID Mermaid d'origine dans `<wps:cNvPr name="...">` ; chaque connecteur porte
      `"{id_source}--{id_cible}"` dans le `name` de son `<wpg:cxnSp>`. Coût quasi nul maintenant
      (le traducteur connaît déjà ces IDs), coûteux à ajouter une fois le format de sortie
      stabilisé et les golden tests figés dessus.

#### Tests (`packages/core/test/`)
- [x] `unit/` : tests unitaires parser + layout + traducteur.
- [x] `golden/` : fixtures XML attendues pour des flowcharts connus, comparaison **structurelle**
      (pas texte brut) pour tolérer les réordonnancements d'attributs.
- [x] `fuzz/` : tests property-based (`fast-check`) sur la frontière d'entrée non fiable —
      **le parseur est la frontière la plus exposée** (entrée possiblement générée par IA).
- [x] Tests d'injection XML sur chaque fonction de `packages/core` qui touche du texte utilisateur
      (labels avec `& < > " '`), pas seulement le chemin nominal.
- [x] Tout parseur XML utilisé (y compris en test) : **DTD et entités externes désactivés** (règle n°5).
- [ ] Test golden dédié : pour chaque forme et connecteur des fixtures existantes, vérifier que
      `cNvPr/name` contient l'ID Mermaid attendu (futur-proofing §4).

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

- [ ] Détection automatique des blocs ```` ```mermaid ```` dans les `.md`.
- [ ] CodeLens "⚙️ Exporter en Word" au-dessus de chaque bloc.
- [ ] Deux modes : export du bloc seul / export du document entier (via pipeline 5.4.a).
- [ ] Packaging Marketplace + README avec démo animée.

## Phase 3 — Couleurs + sous-graphes

- [ ] Mapping `classDef fill:#XXXXXX` → `<a:solidFill><a:srgbClr val="XXXXXX"/></a:solidFill>` (§6.3).
- [ ] `subgraph` → groupes imbriqués `<wpg:wgp>` avec libellé en `<wps:txbx>` (§6.1).

## Phase 4 — Add-in Word (Office.js)

- [ ] Taskpane avec zone de collage Mermaid.
- [ ] Appel au même module core (bundlé navigateur) — raison du choix TypeScript.
- [ ] Insertion via `context.document.body.insertOoxml(xmlString, Word.InsertLocation.replace)`.

## Phase 5+ — Autres types de diagrammes

- [ ] Diagrammes de séquence (priorité, demande la plus fréquente après flowchart).

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
      fiabiliser `test:visual` en CI.
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