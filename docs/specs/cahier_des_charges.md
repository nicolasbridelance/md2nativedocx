# Cahier des charges — `md2nativedocx`

> Convertir un document Markdown contenant du Mermaid en un `.docx` complet — texte, tableaux, mise en forme — **et des diagrammes en véritables formes vectorielles OOXML natives et éditables**, pas en images PNG figées.

---

## 0. Résumé exécutif

**Le constat validé par étude de marché (voir §12.1) :** la conversion Markdown → Word "texte" (titres, listes, tableaux, code) est un marché saturé — une dizaine d'outils quasi identiques la font déjà bien, Pandoc en tête depuis 20 ans. En revanche, **100 % des outils existants réduisent les diagrammes (Mermaid, Graphviz, PlantUML) à une image PNG intégrée**. Le texte source est parfois conservé en fallback, jamais la structure. Ce vide existe alors même que le problème adjacent — "texte de diagramme → formes natives éditables" — est déjà résolu ailleurs (draw.io, tldraw, Lucidchart), mais jamais porté vers OOXML/Word.

**La décision d'architecture qui change tout :** au lieu de réécrire un pipeline complet (parseur MD → layout → traducteur OOXML → injecteur ZIP), on ne construit **que** le module qui manque — layout + traduction OOXML d'un diagramme — et on le branche sur deux hôtes déjà matures et éprouvés :
- **Pandoc**, via un filtre Lua qui injecte du OOXML brut (`pandoc.RawBlock('openxml', ...)`) à la place du bloc ```` ```mermaid ````, pour tout usage document complet (CLI, VS Code, CI/CD) ;
- **Office.js**, via `Body.insertOoxml()` / `Range.insertOoxml()`, pour l'insertion directe dans un document Word déjà ouvert (add-in).

Cette décision réduit le périmètre réel de développement d'environ 50 %, élimine un stack technique entier (plus besoin de réimplémenter le parsing Markdown ni la manipulation de l'archive .docx), et concentre 100 % de l'effort d'ingénierie sur le seul segment défendable : le moteur de traduction diagramme → DrawingML.

**Ça ne réduit en rien l'ambition du produit livré.** Vu de l'utilisateur, `md2nativedocx` convertit un `.md` complet en `.docx` complet, en une seule commande — Pandoc est un détail d'implémentation invisible, pas une limite de scope produit. Le nom du projet reflète cette ambition ; le moteur de diagrammes en est le moat technique (§5.3), pas le périmètre fonctionnel annoncé (§1).

---

## 1. Vision et positionnement

**Ce que le projet EST :** `md2nativedocx`, un convertisseur Markdown → Word **complet** — texte, tableaux, mise en forme, diagrammes — livré comme CLI et extension VS Code. En interne, tout ce qui n'est pas un diagramme est délégué à Pandoc (§2) ; en surface, l'utilisateur obtient un `.docx` entier en une commande, exactement comme il l'attend d'un convertisseur à part entière.

**Ce qui fait le moat, pas le scope :** contrairement aux ~10 clones déjà sur le marché (cf. §12.1), les diagrammes ne sont pas aplatis en PNG — ce sont de véritables formes OOXML éditables. C'est la seule chose que personne d'autre ne fait, et donc la seule chose qu'on développe réellement nous-mêmes (§5.3). Le reste (parsing, tableaux, styles) n'est pas "hors scope produit" : il est délégué plutôt que réécrit, ce qui n'enlève rien à ce que l'utilisateur reçoit.

**Proposition de valeur, en une phrase :** *"Les boîtes restent des boîtes, pas des pixels."* Un diagramme généré par une IA ou collé depuis Mermaid Live Editor devient, une fois dans Word, un groupe de formes que l'utilisateur peut sélectionner individuellement, redimensionner, recolorer et reconnecter — exactement comme s'il l'avait dessiné à la main avec l'outil Formes de Word.

---

## 2. Non-objectifs (scope explicitement exclu)

| Exclu du scope | Raison | Délégué à |
|---|---|---|
| Parsing Markdown générique (titres, listes, gras, liens) | Marché saturé, déjà résolu | Pandoc |
| Rendu des tableaux, notes de bas de page, TOC | Idem | Pandoc + `reference.docx` |
| Formules mathématiques (LaTeX `$...$`/`$$...$$`) | Idem — Pandoc les traduit déjà en équations OOXML natives (`m:oMath`, bibliothèque texmath), **éditables dans Word au même titre que nos formes de diagramme**. Vérifié empiriquement 2026-09-01 (intégrale, fraction, matrice — rendu LibreOffice correct) et verrouillé par un test de non-régression. Un argument de positionnement gratuit, pas juste une case cochée : voir §12.1 | Pandoc |
| Thèmes / styles corporate | Idem | `reference.docx` de Pandoc |
| Diagrammes de séquence, Gantt, classes, ER, C4 | Complexité disproportionnée pour la V1 | Roadmap V2+ (voir §11) |
| Couleurs et styles Mermaid (`classDef`, `style`) | Cohérence visuelle > fidélité pixel en V1 | Mapping simplifié vers le thème Word (voir §6.3) |
| Édition WYSIWYG des diagrammes hors de Word | Hors périmètre — l'édition se fait dans Word une fois inséré | — |
| Manipulation bas niveau de l'archive .docx (ZIP) | Déjà géré de façon robuste par le writer Pandoc | Pandoc |
| HTML brut inline/bloc dans le Markdown (`<img>`, `<br/>`, `<div>`, etc.) | Le writer docx de Pandoc n'a pas d'équivalent OOXML pour du HTML arbitraire — limitation héritée du délégué, pas un choix de scope. Silencieusement supprimé (pas d'erreur) — voir `test-corpus/corpus/README.md` § Limites connues | Pandoc (comportement actuel : suppression silencieuse) |

Le principe directeur : **chaque ligne de code écrite doit concerner la traduction diagramme → OOXML, rien d'autre.** Toute tentation de "juste aussi gérer les tableaux nous-mêmes" est un signal d'alerte de dérive de scope.

### 2.1 Piste ouverte aux contributeurs externes (hors roadmap de l'équipe cœur)

**Export ODF/ODT.** Techniquement peu coûteux à ajouter vu l'architecture (§5.3 isole déjà le traducteur du parseur et du layout — un second traducteur ciblant `<draw:custom-shape>`/`<draw:frame>` en plus du traducteur OOXML suffirait, sans toucher au reste du pipeline). **L'équipe cœur ne le développera pas elle-même** : le cas d'usage principal (§3) est spécifiquement centré sur Microsoft Word, et le support ODF de Word reste connu pour ses pertes de fidélité à l'import — packager du natif via ODT réintroduirait justement le risque que ce projet existe pour éliminer côté OOXML. Ceci dit, la demande (secteur public européen, organisations LibreOffice-first) est réelle et légitime pour qui cible cet écosystème directement plutôt que Word. Documenté ici comme point d'extension propre pour quiconque veut s'en emparer — licence CC0 (§13), aucune permission à demander.

### 2.2 Piste future — lecture inverse (docx2mermaid)

Direction symétrique : relire un `.docx` édité à la main dans Word pour en extraire du Mermaid stable, permettant une boucle IA-génère → humain-édite-dans-Word → IA-continue. Contrairement à l'ODF (§2.1), le statut n'est pas « l'équipe cœur ne le fera pas » — juste « pas avant que la V1 soit stable ». Spec complète : `docs/specs/FUTURE_docx2mermaid_SPEC.md`. Seule action déjà actionnée dans la V1 actuelle : les formes et connecteurs portent leur ID Mermaid d'origine dans `cNvPr/name` (§5.3 de ce document), pour que cette relecture soit possible sans réécrire le traducteur plus tard.

---

## 3. Personas cibles

1. **L'ingénieur "docs-as-code"** (persona primaire — la plus susceptible de mettre une étoile GitHub). Rédige en Markdown versionné dans Git, génère des schémas d'architecture via IA, doit produire une revue de conception lisible par des non-développeurs.
2. **Le rédacteur technique/fonctionnel.** Vit dans Word, colle du Mermaid généré par un assistant IA, veut un schéma modifiable sans réapprendre une syntaxe.
3. **Le pipeline CI/CD documentaire.** Génère automatiquement des rapports (audits, specs) à partir de contenu Markdown produit par IA, dans un contexte batch/headless.

---

## 4. Architecture technique — vue d'ensemble

```
                    ┌─────────────────────────────┐
                    │   Bloc ```mermaid détecté    │
                    │   dans un document source    │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼────────────────┐
                    │  CŒUR : md2nativedocx-core       │
                    │  (TypeScript)                    │
                    │  1. Parseur Mermaid → AST         │
                    │  2. Moteur de layout (X,Y)        │
                    │  3. Traducteur OOXML/DrawingML    │
                    │     → chaîne XML <w:drawing>      │
                    └───────┬──────────────────┬────────┘
                            │                  │
             ┌──────────────▼───┐   ┌─────────▼──────────────┐
             │  Filtre Lua       │   │  Office.js Add-in      │
             │  → RawBlock       │   │  → insertOoxml()       │
             │    'openxml'      │   │    directement dans    │
             │  → Pandoc assemble│   │    le document ouvert  │
             │    le .docx entier│   │                        │
             └───────────────────┘   └────────────────────────┘
                  (CLI / VS Code /            (Add-in Word,
                   CI, documents complets)      insertion ponctuelle)
```

Un seul cœur technique, deux points d'intégration. C'est la simplification majeure par rapport à la première version du canvas (qui prévoyait 3 stacks distincts : Python/Tkinter, Node/VS Code, Office.js/React).

---

## 5. Composants détaillés

### 5.1 Parseur — Mermaid → AST intermédiaire

- Entrée : bloc de texte Mermaid (flowchart uniquement en V1 : `graph`/`flowchart TD|LR`).
- Sortie : AST JSON typé — nœuds (id, texte, forme), arêtes (source, cible, type de tête, label), sous-graphes (`subgraph` → conteneur).
- Ne pas réécrire un parseur Mermaid depuis zéro si une bibliothèque JS existante permet d'accéder à l'AST post-parsing sans forcer le rendu SVG complet — à valider en spike technique avant de s'engager sur "parseur maison".

### 5.2 Moteur de layout

- **Décision à trancher explicitement (spike requis, voir §11 Phase 0) :** Graphviz (WASM, `@hpcc-js/wasm`) vs Dagre (pur JS, même moteur que Mermaid en interne).
- **Argument pour Dagre :** fidélité visuelle avec l'aperçu Mermaid d'origine que l'utilisateur a déjà vu (même moteur), zéro dépendance binaire/WASM, cohérent avec un stack 100 % TypeScript.
- **Argument pour Graphviz :** `splines=ortho` et le moteur de coordinate assignment sont plus matures pour des layouts destinés à un rendu en coudes (comme le fait le connecteur Word).
- Recommandation par défaut : **démarrer avec Dagre** (cohérence de stack, fidélité au rendu source), garder Graphviz en option de secours pour les diagrammes denses (>25 nœuds) où le crossing minimization de `dot` est mesurablement meilleur.
- Sortie : JSON de coordonnées `{ nodeId: {x, y, width, height} }` en pixels logiques.

### 5.3 Traducteur OOXML / DrawingML — le cœur du projet

- Conversion pixels → EMU (`x × 9525`).
- Génération des formes (`<a:prstGeom>`) selon la matrice §6.1.
- Génération des connecteurs magnétiques (`<a:cxnSp>` ancrés sur les `id` de forme via `<a:stCxn>`/`<a:endCxn>`) pour conserver le comportement dynamique natif de Word si l'utilisateur déplace une boîte ensuite.
- Encapsulation en `<wpg:wgp>` (groupe de dessin) inséré dans `<w:drawing><wp:inline>...`.
- Sortie : une chaîne XML unique, autonome, injectable telle quelle.

### 5.4 Ponts d'intégration

#### 5.4.a CLI + filtre Lua Pandoc
```lua
-- md2nativedocx.lua (esquisse)
function CodeBlock(el)
  if el.classes[1] == "mermaid" and FORMAT:match("docx") then
    local ooxml = md2nativedocx.translate(el.text)  -- appel au binaire/module core
    return pandoc.RawBlock("openxml", ooxml)
  end
end
```
Usage bas niveau : `pandoc rapport.md -o rapport.docx -L md2nativedocx.lua --reference-doc=template-entreprise.docx`
Usage final (§8) : `npx md2nativedocx rapport.md -o rapport.docx` — le CLI empaquette cette invocation Pandoc pour l'utilisateur, qui n'a jamais besoin de connaître l'existence du filtre Lua.
→ Le texte, les tableaux, le template corporate : gérés par Pandoc. Le diagramme : géré par nous. Zéro code de manipulation de ZIP à écrire.

**Point de vigilance technique (documenté dans les discussions Pandoc) :** un `RawBlock('openxml', ...)` est reparsé/validé par le writer avant injection — il faut valider par test que des fragments DrawingML complexes (imbriqués, avec `wpg:wgp`) survivent cette étape sans troncature, avant de considérer ce mécanisme comme acquis pour des shapes group complexes.

#### 5.4.b Extension VS Code
- Détection automatique des blocs ```` ```mermaid ```` dans les fichiers `.md`.
- CodeLens "⚙️ Exporter en Word" au-dessus de chaque bloc.
- Deux modes : export du bloc seul (image de secours pour prévisualisation rapide) ou export du document entier via le pipeline 5.4.a.
- **C'est le point d'entrée principal visé pour l'acquisition d'étoiles GitHub** (découverte naturelle via la Marketplace + recherche "mermaid word" sur GitHub).

#### 5.4.c Add-in Word (Office.js)
- Taskpane avec zone de collage Mermaid.
- Appel au même module core (compilé/bundlé pour le navigateur — c'est la raison de choisir TypeScript pour le cœur plutôt que Python).
- Insertion via `context.document.body.insertOoxml(xmlString, Word.InsertLocation.replace)` — **aucune dépendance à Pandoc pour ce canal**, l'insertion se fait directement dans le document déjà ouvert.
- Priorité de développement : basse (Phase 2, voir roadmap) — audience plus restreinte et cycle de validation Microsoft 365 plus long.

#### 5.4.d Association de fichier Windows (optionnel, exploratoire)
- Idée : associer l'extension `.md` (Paramètres Windows > Applications par défaut) à un petit exécutable qui enchaîne le CLI `md2nativedocx` (§5.4.a) puis lance `winword.exe` sur le `.docx` généré.
- Expérience utilisateur : double-clic sur un `.md` → s'ouvre "comme si" Word le supportait nativement, sans add-in ni sideloading.
- Limite connue : Windows uniquement — pas d'équivalent aussi direct côté macOS.
- Statut : non prioritaire. Réutilise entièrement 5.4.a (coût d'implémentation faible) mais audience et demande réelle non validées — à évaluer après la Phase 2 selon les retours communauté.

---

## 6. Matrices de correspondance

### 6.1 Formes (nœuds)

| Syntaxe Mermaid | Description | `prstGeom` OOXML |
|---|---|---|
| `id[Texte]` | Rectangle | `rect` |
| `id(Texte)` | Rectangle arrondi | `roundRect` |
| `id([Texte])` | Stade / pilule | `stadium` (fallback `roundRect` si non supporté) |
| `id{Texte}` | Losange (décision) | `diamond` |
| `id[(Texte)]` | Base de données | `cylinder` |
| `id((Texte))` | Cercle | `ellipse` |
| `subgraph ... end` | Sous-groupe | `<wpg:wgp>` imbriqué avec libellé en `<wps:txbx>` |

### 6.2 Liens (arêtes)

| Syntaxe Mermaid | Description | `headEnd`/`tailEnd` Word |
|---|---|---|
| `-->` | Flèche standard | `triangle` |
| `---` | Ligne simple | `none` |
| `-.->` | Flèche pointillée | `triangle` + `<a:prstDash val="dash"/>` |
| `==>` | Flèche épaisse | `triangle` + largeur de trait augmentée |
| `-->|Texte|` | Flèche avec label | ajout d'un `<wps:txbx>` positionné au milieu du connecteur |

### 6.3 Couleurs et styles (`classDef`, `style`)

- **V1 :** ignorés, comme dans le canvas d'origine — rendu en style Word par défaut (thème du document).
- **V1.1 (amélioration low-cost à haute valeur perçue) :** mapping simplifié `classDef fill:#XXXXXX` → couleur de remplissage OOXML (`<a:solidFill><a:srgbClr val="XXXXXX"/></a:solidFill>`), sans tenter de reproduire les dégradés ou styles CSS avancés de Mermaid. Ce mapping partiel couvre déjà le cas d'usage le plus fréquent (mise en évidence d'un nœud critique) pour un coût de développement faible.

---

## 7. Schémas de données intermédiaires

```json
// AST intermédiaire (sortie du parseur)
{
  "nodes": [
    { "id": "A", "label": "Début", "shape": "stadium" },
    { "id": "B", "label": "Décision ?", "shape": "diamond" }
  ],
  "edges": [
    { "from": "A", "to": "B", "type": "arrow", "label": null }
  ],
  "subgraphs": []
}
```

```json
// Sortie du moteur de layout
{
  "A": { "x": 0,   "y": 0,   "width": 120, "height": 60 },
  "B": { "x": 200, "y": 0,   "width": 140, "height": 90 }
}
```

---

## 8. Stack technique récapitulative

| Composant | Techno | Justification |
|---|---|---|
| Cœur (parseur + layout + traducteur) | TypeScript | Réutilisable tel quel côté Node (CLI/Pandoc) et côté navigateur (Office.js) |
| Moteur de layout | Dagre (défaut) / Graphviz WASM (option) | Fidélité + légèreté (voir §5.2) |
| Intégration document complet | Filtre Lua Pandoc | Zéro réécriture du parsing MD ni de l'injection ZIP |
| Extension éditeur | VS Code Extension API + CodeLens | Point d'entrée principal, zéro friction |
| Intégration Word en direct | Office.js (`insertOoxml`) | Pas de dépendance Pandoc pour ce canal |
| Distribution CLI | `npx md2nativedocx` (Node bundlé), Pandoc comme dépendance externe documentée | Un seul écosystème à maintenir (abandon du stack Python/Tkinter du canvas initial) |

---

## 9. Stratégie de test

- **Tests unitaires** sur le traducteur OOXML : un flowchart Mermaid connu → un fragment XML attendu (golden files), diffé structurellement (pas texte brut, pour tolérer les réordonnancements d'attributs XML non significatifs).
- **Tests de non-régression visuelle :** rendu du .docx généré via LibreOffice headless → export image → comparaison pixel-diff avec seuil de tolérance, sur un corpus de 20 à 30 diagrammes représentatifs (du flowchart à 3 nœuds au diagramme à 50 nœuds avec sous-graphes).
- **Tests manuels obligatoires dans Word réel** avant chaque release : vérifier que chaque forme est individuellement sélectionnable, que le texte ne déborde pas (cf. risque §10), que les connecteurs restent attachés après déplacement manuel d'une boîte.
- **Critère d'acceptation MVP :** sur un flowchart de 15 nœuds ou moins, 0 croisement de flèches nécessitant un réarrangement manuel dans >90 % des cas testés.

---

## 10. Risques et limites

| Risque | Mitigation |
|---|---|
| Débordement de texte dans les formes | Formule de padding généreuse forfaitaire (pas de mesure de police en temps réel — cf. philosophie 80/20 du canvas d'origine) |
| Fidélité layout Dagre vs rendu visuel attendu par l'utilisateur | Choix de Dagre justement pour minimiser cet écart (§5.2) |
| Fragments `openxml` complexes tronqués par le reparsing Pandoc | Suite de tests dédiée en Phase 0 avant tout engagement d'architecture |
| Diagrammes denses (>40 nœuds) : lisibilité du layout automatique | Documenté comme limite connue en V1 ; utilisateur invité à simplifier ou basculer sur Graphviz en option |
| Divergence de comportement CLI (Node) vs Add-in (navigateur) pour un même diagramme | Un seul cœur TypeScript partagé (§8) — élimine structurellement ce risque par construction |
| Couleurs/styles Mermaid avancés non supportés | Documenté explicitement comme non-objectif V1 (§2), mapping simplifié en V1.1 (§6.3) |

---

## 11. Roadmap

| Phase | Contenu | Definition of Done |
|---|---|---|
| **Phase 0 — Spike technique** | Trancher Dagre vs Graphviz ; valider empiriquement la robustesse du `RawBlock('openxml')` sur un fragment DrawingML groupé complexe | Un flowchart à 10 nœuds converti bout en bout, ouvert sans erreur dans Word |
| **Phase 1 — MVP CLI + filtre Pandoc** | Formes de base (§6.1), liens de base (§6.2), pas de couleurs | Critère d'acceptation §9 rempli sur corpus de test |
| **Phase 2 — Extension VS Code** | CodeLens, packaging Marketplace | Publication publique + README avec démo animée (voir §12.2) |
| **Phase 3 — Couleurs + sous-graphes** | Mapping `classDef` (§6.3), `subgraph` → groupes imbriqués | — |
| **Phase 4 — Add-in Word** | Taskpane Office.js, `insertOoxml` | Publication AppSource (sideload d'abord) |
| **Phase 5+ — Autres types de diagrammes** | Diagrammes de séquence en priorité (demande la plus fréquente après flowchart) | Piloté par les retours communauté post-launch |

---

## 12. Stratégie "5000 étoiles"

### 12.1 Positionnement concurrentiel (issu de l'étude de marché)

| Outil | Diagramme natif éditable dans Word ? |
|---|---|
| mdclaudy, md2docx.app, markdowntoword.pro, iLoveMD, markdownutils.com, etc. | ❌ — PNG intégré uniquement |
| Pandoc seul (sans filtre) | ❌ — PNG intégré uniquement |
| draw.io, tldraw, Lucidchart | ✅ mais **pas dans Word** — canevas propriétaire uniquement |
| `md2nativedocx` (ce projet) | ✅ **dans Word, en OOXML natif** |

Cette ligne du tableau est le README en une image : une capture d'écran "avant/après" (diagramme collé en image plate vs formes individuellement sélectionnées avec poignées de redimensionnement visibles) vaut plus que n'importe quel texte.

**Complément — extensions VS Code spécifiquement (vérifié 2026-09-01)**, plus précis que l'étude
générale ci-dessus puisque c'est le canal de distribution de la Phase 2 :

| Extension Marketplace | Installs | Rendu du diagramme Mermaid dans le `.docx` |
|---|---|---|
| docu.md | 6 672 | Image haute résolution |
| Doculate | 5 585 | Image |
| FusionSol Markdown Mermaid & DOCX | 892 | Non précisé (probablement image) |
| CX Markdown to Word | 561 | PNG (Pandoc, architecture proche de la nôtre) |
| Markdown Export Pro | 499 | Image SVG |

Les 5 le disent dans leur propre documentation ("images", "SVG images", "high-resolution
images") — aucune ne prétend produire des formes Word éditables individuellement. Signal
convaincant : docu.md convertit déjà LaTeX en équations Word *éditables*, donc le marché a déjà
validé que l'éditabilité native vaut la peine d'être vendue — personne ne l'a simplement encore
appliquée aux diagrammes.

**Idées UX à emprunter (pas le code, juste le principe) sans diluer le scope :**
- Conversion par lot (dossier entier) — FusionSol, CX Markdown to Word, Doculate l'ont ; pas nous.
  Candidat naturel pour une itération post-launch, hors scope Phase 2 actuelle.
- `reference.docx` personnalisé — déjà mentionné dans ce document (§12.1 historique) mais pas
  câblé côté CLI ; CX Markdown to Word et Doculate l'ont déjà.
- "100 % local, zéro cloud" comme argument explicite (docu.md le met en avant) — nous l'avons déjà
  gratuitement (Pandoc + traducteur tournent en local), juste jamais dit dans le README avant la
  passe de polish de septembre 2026.

**Signal de timing** : VS Code 1.121 (mai 2026) a ajouté le rendu Mermaid natif au preview
Markdown intégré. Réduit l'urgence de construire notre propre "Aperçu" (Phase 2.5) — un preview
gratuit existe déjà côté éditeur.

### 12.2 Éléments README à ne pas négliger

- GIF de démonstration en 10 secondes : coller du Mermaid dans VS Code → clic CodeLens → ouverture dans Word → clic sur une boîte pour montrer qu'elle est individuellement éditable.
- Tableau de positionnement (§12.1) visible dès le haut du README.
- Nom court, mémorable, googlable (voir §14).
- Licence CC0, cf. §13 pour l'arbitrage et sa justification.

### 12.3 Canaux de lancement suggérés

- r/programming, r/vscode, Hacker News (angle : "the one thing Pandoc still can't do") — mais uniquement une fois Phase 2 livrée avec une démo fonctionnelle, pas avant.
- Communauté Mermaid elle-même (issues/discussions du repo officiel) : audience déjà acquise au problème.

---

## 13. Licence et gouvernance

- **Licence retenue : CC0** (domaine public). Choix motivé avant tout par la cohérence avec la demande d'autorisation d'activité accessoire adressée à l'employeur, qui mentionne explicitement une publication en CC0 — ce qui est promis par écrit prime sur l'optimisation marketing.
- **Arbitrage à connaître :** MIT reste la norme quasi universelle pour les extensions VS Code et les packages npm, et inclut une clause explicite de limitation de responsabilité que CC0 n'a pas. Si ce point devenait bloquant après le lancement (adoption entreprise notamment), un passage à une double licence CC0/MIT reste possible — mais uniquement tant qu'aucune contribution externe n'a été acceptée sous CC0 seul (au-delà, il faut l'accord de chaque contributeur, ou un CLA mis en place dès le premier jour pour se garder cette option).
- Contribution : `CONTRIBUTING.md` dès la Phase 1, avec le mapping §6 comme point d'entrée naturel pour les premières contributions externes (ajout de formes/types de liens).

---

## 14. Nommage

**Nom retenu : `md2nativedocx`.**

Trajectoire de la décision : `diagram2docx` écarté (sous-vendait le produit, cf. §1) → `mermaid2docx` écarté (perdait le signal "diagramme natif", et surtout le nom devait porter le scope complet) → `markdown2nativedocx` jugé trop long à l'usage → raccourci en `md2nativedocx`, qui garde les deux signaux importants (scope Markdown complet + moat "native") dans un nom aussi court que ce que permet la convention `X2Y`.

Validation npm/GitHub effectuée sur ce nom final :
- npm : `md2nativedocx` disponible, aucun package existant.
- GitHub : aucune collision, 0 résultat.

Rationale :
- Suit la convention `X2Y` déjà reconnue des devs (`md2docx`, `pdf2docx`) — zéro effort cognitif pour comprendre ce que ça fait.
- "md" est la façon dont les devs désignent Markdown au quotidien (c'est aussi littéralement l'extension du fichier) — aussi clair que "markdown" en beaucoup plus court.
- "native" dans le nom rend le moat (§5.3) explicite dès la première lecture, sans dépendre de la description pour le comprendre.

---

## 15. Glossaire

- **OOXML / DrawingML** : format XML sous-jacent des fichiers `.docx`, spécifiquement la partie qui décrit les formes vectorielles et leur habillage.
- **EMU** (English Metric Unit) : unité de mesure interne d'OOXML, 914 400 par pouce, soit 9525 par pixel logique à 96 DPI.
- **`RawBlock('openxml', ...)`** : mécanisme des filtres Lua Pandoc permettant d'injecter du XML brut, non interprété, directement dans le flux du writer `.docx`.
- **`insertOoxml`** : méthode de l'API Office.js permettant d'insérer un fragment OOXML directement dans un document Word ouvert, sans passer par un fichier intermédiaire.