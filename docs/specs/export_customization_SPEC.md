# Personnalisation de l'export — spec

> Origine : échange avec le mainteneur (2026-09-04) — deux constats de départ : (1) la plupart des
> tableaux gagneraient à être en paysage dans Word, avec un saut de section dédié plutôt qu'une
> page paysage globale ; (2) les émoji ✅/⚠️/❌ perdent leur couleur à l'ouverture dans Word, au
> point que ✅ et ⚠️ deviennent des pastilles grises indiscernables.
>
> À lire avec `docs/specs/cahier_des_charges.md` (le quoi/pourquoi général) et
> `docs/specs/UX_SPEC.md` (comportement à l'écran de l'extension VS Code, Partie 1).

---

## 0. Cadrage — ce que cette spec change (et ne change pas) à l'architecture

Rappel (`cahier_des_charges.md` §0 et §2) : ce projet ne réimplémente pas le rendu Markdown → Word.
Pandoc fait tout le travail de fond (texte, tableaux, TOC, styles) à partir d'un `reference.docx` ;
ce dépôt n'ajoute que la traduction OOXML des diagrammes Mermaid. `reference.docx` est aujourd'hui
un **fichier statique unique**, committé dans `packages/cli/assets/reference.docx`, avec un
`<w:sectPr/>` vide (page/marges livrées telles quelles par les défauts de Pandoc) et des polices
figées dans son `theme1.xml`/`styles.xml`.

**Ce que cette spec ajoute :** un `reference.docx` **généré dynamiquement** par export, à partir du
gabarit statique existant, patché selon les réglages choisis par l'utilisateur (page, marges,
polices, justification, TOC). **Ça ne réintroduit aucun moteur de rendu maison** — le rendu réel du
texte/tableaux/TOC reste 100 % délégué à Pandoc, exactement comme avant ; on rend seulement
paramétrable un fichier qui était figé. Le point réellement nouveau (hors de ce principe de
délégation) est le §1.9 (tableaux en section paysage dédiée), qui demande d'étendre le filtre Lua
au-delà de son unique rôle actuel (`CodeBlock` mermaid) — voir §2.3.

---

## 1. Catalogue des paramètres

| # | Paramètre | Valeurs | Défaut proposé | Effort |
|---|---|---|---|---|
| 1.1 | Format de page | A4, Letter, Legal | A4 (ou détection locale VS Code — voir §5) | S |
| 1.2 | Orientation par défaut | Portrait, Paysage | Portrait | S |
| 1.3 | Marges | Presets Word : Normales (2,5 cm) / Étroites (1,27 cm) / Modérées / Larges, + valeur libre | Normales | S |
| 1.4 | Police des titres | Aptos Display, Calibri, Arial, custom | Aptos Display | S |
| 1.5 | Police du corps de texte | Aptos, Calibri, Arial, custom | Aptos | S |
| 1.6 | Taille de police de base | 9–14 pt | 11 pt | S |
| 1.7 | Interligne | Simple, 1,15, 1,5, Double | 1,08 (défaut Word actuel) | S |
| 1.8 | Justification du texte par défaut | Justifié, Aligné à gauche | Aligné à gauche (défaut Word) | S |
| 1.9 | **Tableaux en section paysage dédiée** | On/Off | Off | **L** |
| 1.10 | Sommaire automatique (TOC) sous le H1 | On/Off, profondeur (2–4) | Off | M |
| 1.11 | Style de tableau (bordures/bandes) | Presets `reference.docx` | inchangé | S |
| 1.12 | Numérotation automatique des titres | On/Off | Off | M |
| 1.13 | Pied de page avec numéro de page | On/Off | Off | S |
| 1.14 | Couleur d'accent du thème | Palette / hex custom | inchangé | S |
| 1.15 | **Rendu couleur des emoji/badges** | On/Off (police emoji forcée) | On | M |

Détail des points qui ne sont pas de simples réglages `reference.docx` :

### 1.9 — Tableaux en section paysage dédiée

Exemple donné par le mainteneur :

```
===saut de section===
5.3 tatitata
-------------
|bla | bli | blu |
---------------
===saut de section===
```

Le saut de section doit s'insérer **juste avant le titre qui précède le tableau**, pas juste avant
le tableau lui-même — sinon le titre resterait seul en fin de page portrait, séparé de son
contenu. Voir faisabilité et piège technique en §2.3.

### 1.10 — Sommaire automatique

Pandoc sait générer un TOC nativement (`--toc`, `--toc-depth`), mais ce flag n'est **pas encore
utilisé** (`packages/cli/bin/md2nativedocx.mjs`, `pandocArgs`). Point d'attention Word : un champ
TOC généré par Pandoc s'affiche "vide" ou obsolète tant que l'utilisateur ne force pas une mise à
jour des champs (F9), sauf si `word/settings.xml` porte `<w:updateFields w:val="true"/>` — dans ce
cas Word propose lui-même la mise à jour à l'ouverture. À intégrer dans le patch `reference.docx`.

### 1.15 — Rendu couleur des emoji/badges

**Décision du mainteneur (2026-09-04, option 1 retenue)** : forcer une police couleur ("Segoe UI
Emoji") sur les runs contenant des caractères emoji, plutôt que remplacer les emoji par des
pastilles custom (`w:shd`). Raison donnée : plus "natif", et corrige potentiellement *tous* les
emoji d'un coup (pas seulement ✅/⚠️/❌) via le même mécanisme de fallback — **à valider
empiriquement**, voir §2.5 et §5.

---

## 2. Architecture technique

### 2.1 Générateur de `reference.docx` paramétré ("template builder")

Nouveau module (proposition : `packages/cli/src/referenceDocBuilder.mjs`), invoqué avant l'appel
Pandoc quand au moins un réglage de mise en page est actif :

1. `unzip` le `reference.docx` de base (`packages/cli/assets/reference.docx`) dans un dossier
   temporaire — **même mécanisme `execFileSync('unzip'/'zip', [...])` déjà utilisé dans
   `packages/cli/src/postprocess.mjs`**, donc **aucune nouvelle dépendance npm** (règle
   `AGENTS.md` "nouvelle dépendance → escalade").
2. Patcher les fichiers XML concernés (remplacement de nœuds ciblés, pas de réécriture complète) :
   - `word/theme/theme1.xml` → `<a:latin typeface="...">` (titres/corps), couleur d'accent.
   - `word/styles.xml` → `w:docDefaults` (taille, interligne, `w:jc` justification), style `Table`
     (bordures/bandes si 1.11).
   - `word/document.xml` → `<w:sectPr>` final (`w:pgSz` taille+orientation, `w:pgMar` marges).
   - `word/settings.xml` → `<w:updateFields w:val="true"/>` si TOC activé.
3. Rezipper vers un fichier temporaire, le passer via la variable d'env déjà câblée
   `MD2NATIVEDOCX_REFERENCE_DOC` (mécanisme existant, `md2nativedocx.mjs:49-51`).

**Conflit à trancher (voir §5)** : que faire si l'utilisateur a *déjà* fourni son propre
`md2nativedocx.referenceDocument` (réglage existant) **et** active des réglages de page/police ?
Deux options : (a) les réglages de cette spec ne s'appliquent qu'au gabarit par défaut, ignorés
silencieusement si un `referenceDocument` custom est fourni (avec message d'info) ; (b) patcher
quand même le document custom fourni. (a) est plus sûr et plus simple — proposé par défaut.

### 2.2 TOC — câblage Pandoc

Ajouter `--toc --toc-depth=<N>` à `pandocArgs` (`md2nativedocx.mjs:137-143`) si 1.10 actif, en plus
du patch `updateFields` de §2.1.

### 2.3 Tableaux en section paysage dédiée — nouveau filtre Lua

Aucune détection de blocs Markdown (titres, tableaux) n'existe aujourd'hui dans le code du projet —
tout l'AST reste interne à Pandoc. L'API Lua de Pandoc expose cependant un callback global
`Pandoc(doc)` avec accès à `doc.blocks` (lookahead sur tout le document), en plus des callbacks par
type de bloc (`Header`, `Table`). Il faut :

1. Repérer, dans `doc.blocks`, chaque séquence `Header` immédiatement suivi (à travers d'éventuels
   blocs vides) d'un `Table`.
2. Injecter un `pandoc.RawBlock('openxml', ...)` portant un `<w:sectPr>` de bascule **avant** ce
   `Header** — pas avant le `Table`.
3. Injecter un second `<w:sectPr>` (retour à l'orientation précédente) **après** le `Table`.

**Piège OOXML documenté à respecter** : en Word, un saut de section n'est pas une balise
"début/fin" — le `<w:sectPr>` d'une section se code dans le **dernier paragraphe de la section qui
se termine** (`<w:pPr><w:sectPr>...</w:sectPr></w:pPr>`), et la section suivante hérite du
`<w:sectPr>` de fin de corps de document (`<w:body><w:sectPr>`) jusqu'à son propre paragraphe de
fin. Une insertion naïve "avant le Header" produirait un découpage décalé d'un paragraphe. À
valider par un spike ciblé (2-3 documents de test) avant implémentation définitive — cohérent avec
la pratique du projet (spikes avant ADR, voir `docs/adr/0002-pandoc-integration.md`).

Ce filtre est un nouveau territoire pour `packages/pandoc-filter/md2nativedocx.lua`, qui ne
réagissait jusqu'ici qu'à `CodeBlock` (classe `mermaid`). Le mécanisme de sortie
(`RawBlock('openxml', ...)`) est déjà éprouvé (ADR 0002) — c'est la détection Header→Table et le
placement exact du `sectPr` qui sont nouveaux.

### 2.4 Dimensionnement des diagrammes — dépendance cachée

`packages/core/src/translator/ooxml-translator.ts:160-175` code en dur la zone utile de page pour
un Letter portrait 1 pouce de marge (`MAX_DRAWING_CX`/`MAX_DRAWING_CY`, en EMU) pour mettre à
l'échelle les diagrammes Mermoid trop larges. Si 1.1/1.2/1.3 deviennent configurables, ces deux
constantes doivent devenir des paramètres calculés (format × orientation × marges) transmis au
traducteur — sinon un diagramme restera dimensionné pour du Letter portrait même si l'utilisateur a
choisi A4 paysage, avec un risque de dépassement de page ou de mise à l'échelle inutilement
petite. **Dépendance transversale, à ne pas oublier au moment de l'implémentation de 1.1–1.3.**

### 2.5 Rendu couleur des emoji — post-traitement

Ajout dans `packages/cli/src/postprocess.mjs` (qui manipule déjà le ZIP final via `unzip`/`zip`,
donc réutilise l'infrastructure existante) :

1. Charger `word/document.xml` du `.docx` final.
2. Repérer les runs de texte (`<w:t>`) contenant un caractère dans les plages Unicode emoji
   (U+1F300–U+1FAFF, U+2600–U+27BF, U+2190–U+21FF sélectivement, etc. — liste précise à établir).
3. Pour chaque run concerné, forcer `<w:rFonts w:ascii="Segoe UI Emoji" w:hAnsi="Segoe UI Emoji"/>`
   dans son `<w:rPr>` (créer le `rPr` s'il n'existe pas), sans toucher au reste du run.
4. Réinjecter et rezipper.

**Risque connu, à tester avant de généraliser** : "Segoe UI Emoji" est une police Windows — le
rendu sur macOS/Linux (LibreOffice, Word Mac) dépendra de la substitution de police locale, qui
n'est pas garantie de préserver la couleur. Le mainteneur a choisi cette option en connaissance de
cause ("à tester"). Si le test échoue sur une plateforme donnée, l'option 2 initialement écartée
(pastilles `w:shd` custom, indépendantes de toute police) reste un filet de secours documenté ici
pour ne pas repartir de zéro si besoin.

Réglage associé : `md2nativedocx.emoji.forceColorFont` (boolean, défaut `true`), conformément à la
demande du mainteneur d'en faire une option désactivable.

---

## 3. Panneau de configuration VS Code (Activity Bar + Sidebar)

### 3.1 Ce qu'on construit, en vocabulaire VS Code exact

Ce que le mainteneur décrit ("icône dans la barre d'activité à gauche, qui ouvre dans la colonne où
il y a les fichiers/git...") correspond à :
- Un **View Container** custom contribué dans l'**Activity Bar** (`contributes.viewsContainers.activitybar`)
  — l'icône à gauche, à côté de celles de l'Explorateur/Recherche/Git/Extensions.
- Une **vue** (`contributes.views`) à l'intérieur de ce container, dans la **Primary Sidebar** (le
  nom exact de "la colonne de gauche où il y a les fichiers, git etc.").
- Cette vue est une **Webview View** (`vscode.window.registerWebviewViewProvider`) — HTML/CSS/JS
  custom, pas un simple arbre de réglages natif VS Code, pour permettre sliders/tooltips/aperçu.

### 3.2 Contenu — organisation pédagogique

Groupes proposés, dans l'ordre (du plus visible au plus fin) :

1. **Mise en page** — format de page, orientation par défaut, marges (presets illustrés).
2. **Typographie** — police titres/corps (menus déroulants avec aperçu du nom dans sa propre
   police via `font-family` CSS), taille de base, interligne, justification (toggle avec icône).
3. **Structure du document** — sommaire automatique (toggle + profondeur), numérotation des
   titres, style de tableau.
4. **Tableaux en paysage** — toggle 1.9, avec un texte d'aide expliquant précisément le
   comportement (saut de section avant le titre, pas avant le tableau) pour éviter la surprise.
5. **Emoji & badges** — toggle 1.15, avec une note franche sur la dépendance à la police système du
   lecteur final (voir §2.5).
6. **Avancé** — pointeur vers `md2nativedocx.referenceDocument` (réglage existant, pour qui veut
   fournir son propre gabarit complet, auquel cas les réglages ci-dessus sont désactivés/grisés
   dans le panneau — cohérent avec §2.1 "conflit à trancher", option (a)).

Chaque contrôle porte une info-bulle (`title` HTML natif ou tooltip custom) reprenant la
description déjà présente dans les `%configuration.*.markdownDescription%` du `package.json` de
l'extension, pour ne pas dupliquer de texte entre les deux surfaces (palette de commandes / settings.json
natif ET panneau custom lisent la même source de vérité `package.json`).

### 3.3 Aperçu "avant/après" — ce qui est réaliste

Un vrai rendu Word pixel-parfait dans une Webview n'est pas réaliste (nécessiterait un moteur de
rendu docx dans le navigateur — hors scope). Deux niveaux d'ambition possibles, du plus simple au
plus honnête visuellement :

- **Niveau 1 (recommandé pour un premier lot)** : une mini-simulation CSS d'une page — un
  rectangle proportionné au format/orientation choisi, avec les marges dessinées, un titre et un
  paragraphe factices dans la police/taille/interligne/justification choisis (rendu CSS direct,
  pas une image). Donne une intuition correcte du *ratio* et de la *typo*, sans prétendre montrer
  le rendu Word exact.
- **Niveau 2 (optionnel, plus coûteux)** : déclencher un export réel d'un petit document
  d'exemple avec les réglages courants et proposer un bouton "ouvrir l'aperçu" (le `.docx` généré,
  ouvert par l'OS) — fidèle à 100 % mais rompt le flux "tout dans VS Code" et demande Pandoc
  installé à ce stade (déjà une dépendance du projet, donc pas bloquant).

Proposition : Niveau 1 pour la mise en page/typo (peu coûteux, bon ROI pédagogique), pas de
tentative de Niveau 1 pour 1.9/1.15 (saut de section et rendu emoji ne se prêtent pas à une
simulation CSS honnête — préférer juste un texte d'explication clair + éventuellement Niveau 2 à la
demande).

### 3.4 Persistance

Lecture/écriture via l'API standard `vscode.workspace.getConfiguration('md2nativedocx')`
`.get()`/`.update()` — mêmes clés que `contributes.configuration` (`package.json`), donc le panneau
custom et les réglages natifs VS Code (`Ctrl+,`) restent toujours synchronisés, aucune double
source de vérité. Toggle Utilisateur/Espace de travail dans le panneau (mappé sur
`ConfigurationTarget.Global`/`.Workspace`).

### 3.5 Contrainte héritée de `UX_SPEC.md`

`UX_SPEC.md` fixe une limite dure : *"aucune édition WYSIWYG des diagrammes hors de Word"*. Le
panneau décrit ici n'y touche pas (réglages globaux de document, pas d'édition de formes) — à
noter explicitement dans `UX_SPEC.md` au moment de l'implémentation, comme nouveau point d'entrée
(tableau "Points d'entrée", Partie 1), plutôt que de le considérer couvert implicitement.

---

## 4. Phasage proposé

| Lot | Contenu | Dépend de | Effort |
|---|---|---|---|
| 1 | 1.1–1.8, 1.11, 1.13, 1.14 via template builder (§2.1) + réglages `settings.json` natifs (pas encore de panneau custom) | — | M |
| 2 | 1.15 rendu emoji (§2.5) | — (indépendant) | M |
| 3 | 1.10 TOC (§2.2) | Lot 1 (patch `updateFields` dans le même builder) | S/M |
| 4 | Panneau Activity Bar/Sidebar (§3) réunissant les réglages des lots 1–3 | Lots 1–3 (le panneau ne fait qu'exposer des réglages qui doivent déjà exister) | M/L |
| 5 | 1.9 tableaux en section paysage dédiée (§2.3) | Lot 1 (le builder doit déjà savoir patcher `sectPr`) | **L** — le plus risqué, prévoir un spike dédié avant d'estimer plus finement |
| 6 (optionnel) | 1.12 numérotation des titres, raffinements de style de tableau | Lot 1 | S/M |

Le Lot 5 est volontairement isolé en dernier : c'est le seul qui sort du principe "on ne fait que
patcher `reference.docx`" et touche au filtre Lua, donc le seul avec un vrai risque d'ingénierie
(cf. piège de placement `sectPr`, §2.3) et le seul qui bénéficierait d'un spike/ADR avant
implémentation, comme fait pour Pandoc (ADR 0002) et SmartArt (ADR 0004).

---

## 5. Questions ouvertes / décisions à valider avec le mainteneur

- **Conflit `referenceDocument` custom vs réglages de cette spec** (§2.1) : figer l'option (a)
  (réglages ignorés si un gabarit custom est fourni) comme comportement par défaut ?
- **Défaut du format de page** (1.1) : A4 fixe, ou détection depuis la locale VS Code
  (`vscode.env.language`) pour un défaut US Letter en anglais américain ?
- **Fiabilité réelle de l'option 1 (police emoji forcée)** sur macOS/Linux/LibreOffice — à tester
  empiriquement avant de la considérer comme acquise ; prévoir un test de non-régression visuel
  (le projet a déjà une infra de test visuel, `npm run test:visual`) sur au moins un document
  contenant ✅/⚠️/❌ une fois l'implémentation faite.
- **Niveau d'aperçu du panneau** (§3.3) : Niveau 1 seul suffit-il pour une première version, ou le
  mainteneur veut-il le bouton "aperçu réel" (Niveau 2) dès le Lot 4 ?
- **Priorité de ce chantier vs Phase 6/7 en cours** (Slides/SmartArt, `TODO.md`) — à trancher
  explicitement, comme fait le 2026-09-03 pour prioriser Slides/SmartArt avant les séquences et
  l'add-in Word.
