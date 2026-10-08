# Cahier des charges — Cible LibreOffice / ODF

> **Statut au 2026-10-08 : priorité du projet** (décision du mainteneur). Phase 0 (reconnaissance)
> terminée (S0 à S5, ADR 0013). Phase 1 à commencer. Rien n'est encore livré.
> Révise `docs/specs/cahier_des_charges.md` §2.1, qui laissait ODF aux contributeurs externes.

## 1. Contexte et décision

En 2026, les deux suites bureautiques qui ne sont pas Microsoft ont ajouté le Markdown natif :

- **LibreOffice 26.2** (février 2026) : import et export Markdown dans Writer, depuis un fichier ou le
  presse-papiers, avec modèles ODT ou DOCX. Parseur MD4C (CommonMark), issu d'un projet GSoC 2025.
- **Google Docs et Drive** (5 octobre 2026) : ouverture, édition et collaboration sur des `.md`.

Aucune des deux ne rend un bloc ```` ```mermaid ```` en formes éditables (rien dans les annonces ni
dans la presse au 2026-10-08 ; absence de preuve, pas preuve d'absence). C'est exactement ce que fait
ce projet côté Word.

**Décision du 2026-10-08 (mainteneur) : la cible LibreOffice / ODF devient la priorité.** La raison
donnée au §2.1 du cahier pour l'écarter (le public principal vit dans Word, et Word importe mal l'ODF)
reste vraie pour la sortie `.docx`. Elle ne s'applique pas ici : la cible ODF vise un autre public
(LibreOffice, Collabora, secteur public européen, organisations « LibreOffice d'abord »), qui ouvre
les fichiers dans LibreOffice, pas dans Word.

**Pourquoi LibreOffice plutôt que Google.** Le format interne de Google Docs est propriétaire et non
documenté ; l'API Docs n'a aucune primitive de création de forme ; le presse-papiers de Docs ne
transporte qu'un identifiant opaque pour les formes ; et les conditions d'utilisation de Google
interdisent la rétro-ingénierie. ODF y sert seulement d'import/export. LibreOffice, lui, est libre,
son format est une norme ISO (ISO/IEC 26300) et ses contributions sont publiques. Google reste
accessible par l'import `.pptx` dans Slides (déjà confirmé) et, plus tard, par l'API Slides
(`cahier_des_charges_google_slides.md`, phase 2).

**Ce qui ne change pas :** la sortie `.docx` reste la sortie riche (SmartArt, graphiques natifs) ;
Pandoc assemble le document, comme pour le `.docx` (règle 7 d'`AGENTS.md`) ; toutes les règles de
sécurité s'appliquent à l'ODF (§7).

## 2. Ce qu'on sait, et à quel point

| Fait | État | Source |
|---|---|---|
| LibreOffice 26.2 importe le Markdown (Writer) | **Vérifié** 2026-10-08 sur 26.2.6.3 (import seulement ; export non testé) | S3, `docs/adr/spikes/spike-odf-markdown-import/` |
| Éléments Markdown gérés par cet import | **Vérifié** : titres, emphase, liens, listes, tableaux (avec alignement) ; maths **non** gérées, laissées en texte et altérées (`\,` → `,`) | S3 |
| Ce que devient un bloc ```` ```mermaid ```` à l'import LibreOffice | **Vérifié** : un paragraphe « Texte préformaté » ; l'info-string `mermaid` est perdue | S3 |
| Pandoc 3.1.3 transmet tel quel un bloc brut `{=opendocument}` dans un `.odt` | **Vérifié** 2026-10-08 | S0, `docs/adr/spikes/spike-odf-connector/` |
| LibreOffice 24.2 affiche `draw:custom-shape` et `draw:connector` attaché aux deux formes (par `draw:id`, points de collage) dans ce `.odt` | **Vérifié au rendu** 2026-10-08 | S0 |
| Le connecteur suit la forme quand on la déplace dans LibreOffice | **Vérifié par l'API UNO** 2026-10-08 (déplacement scripté, enregistrement, rendu) ; glisser à la souris non vu | S1 |
| Le Codespace a LibreOffice 24.2, antérieur au Markdown | Vérifié | `soffice --version` |

## 3. Deux portes d'entrée

**A. Notre pipeline écrit un `.odt`.** `md2nativedocx doc.md -o doc.odt` : Pandoc écrit l'ODT, notre
filtre remplace chaque bloc Mermaid par du XML `draw:` brut (`RawBlock('opendocument', …)`), exactement
comme il le fait avec `RawBlock('openxml', …)` pour le `.docx`. S0 montre que le mécanisme marche.
C'est dans le périmètre de la règle 1 : on ne produit que le diagramme, Pandoc fait le reste.

**B. LibreOffice ouvre un `.md` et y rend les blocs Mermaid en formes.** C'est l'expérience qui
répond vraiment au « Markdown natif » de 2026, mais elle se passe dans LibreOffice. Le filtre
Markdown y est écrit en C++ (MD4C) ; notre moteur est en TypeScript. Options à examiner (S4) : une
extension LibreOffice (UNO) qui appelle notre moteur ; un point d'extension proposé en amont
(« bloc de code avec telle info-string → convertisseur externe ») ; une contribution en C++, qui serait
une réécriture, pas un portage (même constat que pour Pandoc en Haskell, `TODO.md` §4).

**Tranché par S4 (2026-10-08) : une extension LibreOffice.** Les développeurs ont déjà refusé de garder
l'info-string (bug 172530, WONTFIX : il faudrait changer la norme ODF) et préfèrent garder Mermaid hors
du code de base (bug 172531). L'extension reconnaît un bloc Mermaid à son contenu
(`detectDiagramType()`, plus une analyse qui doit réussir) et le remplace par le diagramme natif ;
d'abord comme commande, ensuite à l'ouverture d'un `.md`. Détail :
`docs/adr/spikes/spike-odf-libreoffice-filter/`.

**Ordre retenu : A d'abord.** Toutes les variantes de B supposent un moteur qui sait déjà produire de
l'ODF ; A le construit et se livre seul. B reste de la recherche jusqu'à la fin de S4, et rien n'est
promis publiquement (ni aux développeurs LibreOffice) avant.

## 4. Correspondance OOXML → ODF

| Concept | OOXML (existant) | ODF (cible) | Point d'attention |
|---|---|---|---|
| Groupe du diagramme | `wpg:wgp` dans `w:drawing` | `draw:g` ancré comme caractère (`as-char`) | **Tranché par S2** : formes ancrées une à une au paragraphe, le connecteur se détache à l'ouverture |
| Forme | `wps:wsp` + `a:prstGeom` | `draw:custom-shape` + `draw:enhanced-geometry draw:type="…"` | Table des géométries prédéfinies (rectangle, losange, ellipse, …) à établir |
| Connecteur attaché | `stCxn` / `endCxn` (`id`, `idx`) | `draw:connector` + `draw:start-shape` / `draw:end-shape` (référence à `draw:id` / `xml:id`) + `draw:start-glue-point` | Points standard : 0 haut, 1 droite, 2 bas, 3 gauche ; ce n'est pas la numérotation OOXML |
| Unités | EMU | Longueurs avec unité (`cm`, `in`) | Conversion simple |
| Texte | `a:t` | `text:p` / `text:span` | Même échappement XML |
| Couleurs, traits | Propriétés en ligne (`a:solidFill`, `a:ln`) | **Styles** (`draw:style-name` → `office:automatic-styles`) | **Tranché par S2** : pas de post-traitement. Le filtre déclare les styles par une variable d'un gabarit `opendocument` dérivé de celui de Pandoc ; les flèches (`draw:marker`) vivent dans le `reference.odt` |
| Graphique Word (`pie`, `xychart`, `radar`) | `c:chart` + classeur embarqué (ADR 0011) | Objet graphique ODF (`chart:chart` dans un sous-document) | À évaluer en phase 2 |
| SmartArt | `dgm:` + dessin de secours | **Aucun équivalent** | Sortie en formes, comme le dessin de secours |

## 5. Architecture

C'est la « troisième cible vraiment différente » que `04-roadmap-and-open-decisions.md` §5.7 et
l'ADR 0012 attendaient avant toute abstraction : `.pptx` réutilise le DrawingML, l'ODF non.

- **Flowchart :** `layout()` produit déjà des positions neutres. Le traducteur ODF part de là,
  comme le traducteur OOXML.
- **Les 28 autres types** passent aujourd'hui de leur parseur directement au XML OOXML. Deux voies :
  1. convertir le fragment OOXML en ODF, comme `packages/pptx` convertit déjà le fragment Word
     (`fragment-converter.ts`, ADR 0010). Peu coûteux, déjà un précédent, mais l'écart entre
     DrawingML et ODF est plus grand qu'entre deux dialectes DrawingML ;
  2. faire produire à chaque type un modèle de scène neutre (formes, positions, connecteurs, styles
     sémantiques), traduit ensuite vers OOXML et ODF. Plus propre, plus cher : c'est la réécriture que
     l'ADR 0012 interdit tant que deux implémentations réelles ne la justifient pas.

  **Recommandation :** mesurer d'abord la voie 1 sur trois types variés à la fin de la phase 1 ;
  n'extraire le modèle neutre que là où les deux traducteurs (OOXML et ODF) montrent ce qu'ils
  partagent. Le modèle extrait sera aussi ce qu'un tiers (Google, LibreOffice, draw.io) pourrait
  réutiliser.

## 6. Phases

**Phase 0 — Reconnaissance (aucun code produit).**

- **S0 (fait, 2026-10-08).** Un `.odt` produit par Pandoc à partir d'un bloc brut `{=opendocument}` :
  deux formes et un connecteur attaché, rendu correct dans LibreOffice 24.2.
- **S1 (fait, 2026-10-08).** Forme déplacée par l'API UNO dans LibreOffice 24.2 sans fenêtre : le
  connecteur suit et reste attaché, y compris après enregistrement ; les trois objets sont distincts.
- **S2 (fait, 2026-10-08).** Couleurs, hauteur, texte centré et flèches sans post-traitement du
  paquet : gabarit `opendocument` dérivé avec une variable dans `office:automatic-styles`, remplie
  par le filtre ; `draw:marker` dans le `reference.odt` ; diagramme dans un `draw:g` ancré comme
  caractère (`docs/adr/spikes/spike-odf-styles/`).
- **S3 (fait, 2026-10-08).** LibreOffice 26.2.6 officiel, extrait dans le Codespace sans toucher à
  `.devcontainer/` : le bloc Mermaid devient du texte préformaté sans son info-string, les tableaux
  passent, les maths restent du texte altéré. 26.2.6 est épinglé (spec 05 §8.3).
- **S4 (fait, 2026-10-08).** Le filtre jette l'info-string (`BeginCodeBlock()` ne reçoit pas le
  détail du bloc) et n'active pas les maths de MD4C. LibreOffice a déjà refusé de garder l'info-string
  (bug 172530) et préfère Mermaid hors du code de base (bug 172531) : la porte B sera une extension
  (`docs/adr/spikes/spike-odf-libreoffice-filter/`).
- **S5 (fait, 2026-10-08).** `odfvalidator` 0.13.0 de l'ODF Toolkit (Java, Apache-2.0) : un `.odt`
  Pandoc ordinaire passe sans erreur ; notre connecteur manquait de `svg:viewBox` (corrigé dans S2).
  Son ajout au dépôt (`test:odf-validate`) attend l'accord du mainteneur, règle 6
  (`docs/adr/spikes/spike-odf-validator/`).

**Phase 1 — `.odt` pour les flowcharts.** CLI `-o doc.odt`, tests golden ODF, `test:visual` étendu à
Writer en `.odt`, validateur de S5. Critère de fin : un flowchart de 10 nœuds avec sous-graphes,
ouvert dans LibreOffice, formes et connecteurs éditables (même critère que la phase 0 historique du
`.docx`).

**Phase 2 — Les 28 autres types**, par la voie retenue au §5 ; graphiques ODF pour `pie`, `xychart`,
`radar` si la phase 1 laisse de la marge.

**Phase 3 — Porte B** : extension LibreOffice, adaptateur mince sur la sortie ODF du core (S4).

## 7. Sécurité

Les règles d'`AGENTS.md` s'appliquent telles quelles : échappement XML de tout texte venu de
l'utilisateur, aucun parseur XML avec DTD, sous-processus sans chaîne shell. L'ODF ajoute ses propres
équivalents de la règle 3. Le traducteur ODF ne doit **jamais** émettre :

- de macro ni de script (`office:scripts`, `script:event-listener`, `office:event-listeners`) ;
- de référence externe : `xlink:href` vers une URL dans `draw:image`, `draw:object`,
  `draw:plugin`, `draw:applet` ou `draw:floating-frame` ; source DDE (`office:dde-source`) ;
- d'objet lié hors du paquet.

Ces interdictions sont à ajouter au tableau de sécurité d'`AGENTS.md` au moment de la phase 1
(modification du tableau : décision du mainteneur).

## 8. Décisions qui reviennent au mainteneur

1. **API publique du core : décidé le 2026-10-08** (ADR 0013, délégué à l'agent). Une fonction à
   part, `renderDiagramOdf()`, qui rend un fragment `<text:p>` + `draw:g` et la liste des styles
   automatiques ; pas d'option de format dans `renderDiagram()`, dont le résultat est fait pour Word.
2. **`AGENTS.md` et licences : décidé le 2026-10-08** (ADR 0013). Règle 7 : aucune opération sur un
   `.odt` produit par Pandoc ; seuls le gabarit `opendocument` dérivé et notre `reference.odt` lui
   sont fournis. Règle 3 étendue aux interdits du §7, règle 2 aux valeurs de style, nouvelle ligne au
   tableau de sécurité, ligne « Zip bomb » mise à jour. Gabarit dérivé livré sous BSD-3-Clause avec la
   notice de Pandoc ; `reference.odt` écrit par le projet (CC0), jamais celui de Pandoc (GPL-2+).
3. **Environnement : décidé le 2026-10-08.** LibreOffice 26.2.6 épinglé (version et SHA-256) dans
   `scripts/install-libreoffice-pinned.sh`, appelé par `.devcontainer/setup.sh` et par le job
   `visual` de `ci.yml`. Installé à côté de celui d'apt, qui reste le moteur des tests visuels, sous
   le nom `soffice-26.2`. La CI vérifie que son import Markdown marche toujours. Choix de 26.2 plutôt
   que 26.8.0, sortie le même jour : comportement identique sur le test S3, et une version `.0` est la
   moins mûre de sa série. Passer à 26.8 à partir de 26.8.2, ou dès qu'un changement du filtre
   Markdown nous concerne.
4. **Place du chantier V2 : décidé le 2026-10-08** (le mainteneur s'en remet à l'agent). Ne
   continuent que les tâches qui servent l'ODF ou qui ferment un risque de sécurité déjà ouvert ;
   la répartition tâche par tâche est dans `TODO.md` §2bis.
5. **Nom du projet** : `md2nativedocx` porte « docx ». Rien à changer maintenant ; à rouvrir si la
   sortie ODF prend de l'ampleur.
6. **Communication publique** : rien de promis (LinkedIn, développeurs LibreOffice) avant S1 à S4.
   S4 fait : le bon endroit est le bug 172531, **quand une première version de l'extension sera
   montrable** (accord du mainteneur, 2026-10-08). Pas avant.
7. **Validateur ODF : accepté le 2026-10-08** (`npm run test:odf-validate`, en CI).
