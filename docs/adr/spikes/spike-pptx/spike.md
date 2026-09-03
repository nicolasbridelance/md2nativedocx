# Spike pptx — `.pptx` minimal à la main, formes DrawingML + connecteur

Ce document teste la Phase 0 de `docs/specs/cahier_des_charges_google_slides.md` (§8
"Spike de validation") : générer un `.pptx` minimal à la main (2 formes +
1 connecteur, même vocabulaire DrawingML que le traducteur `.docx` existant),
confirmer qu'il s'agit d'un paquet OPC valide et auto-contenu, et vérifier
qu'il se rend comme deux formes reliées — pas une diapositive vide, pas une
image aplatie.

**Ce spike ne teste PAS un import réel dans Google Slides** (aucun accès
réseau/compte disponible dans ce bac à sable) — voir "Reste à faire"
ci-dessous pour ce qui reste à vérifier par un humain.

## Ce qui a été construit

- `build-spike.mjs` : script Node (ESM, zéro dépendance npm ajoutée — règle
  n°6) qui assemble à la main un paquet OPC `.pptx` complet : écrit chaque
  partie XML dans un répertoire temporaire (`node:fs/promises`), puis appelle
  le binaire système `zip` via `execFile(['zip', '-X', '-r', ...])` — tableau
  d'arguments, jamais une chaîne shell interpolée (règle n°4, appliquée ici
  bien que cette règle vise nommément le pont Pandoc).
- `spike.pptx` : l'artefact produit, committé à côté du script (même
  convention que `spike-pandoc/spike.docx`).

### Contenu du paquet

```
[Content_Types].xml
_rels/.rels
docProps/core.xml
docProps/app.xml
ppt/presentation.xml
ppt/_rels/presentation.xml.rels
ppt/slideMasters/slideMaster1.xml (+ _rels)
ppt/slideLayouts/slideLayout1.xml (+ _rels)
ppt/theme/theme1.xml
ppt/slides/slide1.xml (+ _rels)
```

Un slideMaster et un slideLayout minimaux sont inclus (recherche web menée
avant d'écrire le script — voir "Recherche" ci-dessous — suggère que leur
absence déclenche une invite de réparation chez PowerPoint ; non confirmé
avec une source faisant autorité au niveau du même degré de certitude que le
reste de ce spike, donc inclus par prudence plutôt qu'omis).

`ppt/slides/slide1.xml` contient un `p:spTree` avec :
- un `p:sp` rectangle (`a:prstGeom prst="rect"`, libellé "Node A"),
- un `p:sp` losange (`a:prstGeom prst="diamond"`, libellé "Decision"),
- un `p:cxnSp` reliant les deux via `a:stCxn id="2" idx="3"` (droite du
  rectangle) et `a:endCxn id="3" idx="1"` (gauche du losange).

Les indices de site de connexion (`SITE = { top: 0, right: 3, bottom: 2, left: 1 }`)
sont copiés tels quels depuis `packages/core/src/translator/ooxml-translator.ts`
(convention anti-horaire, corrigée le 2026-09-02 après vérification contre
`presetShapeDefinitions.xml` de Microsoft/LibreOffice — voir TODO.md). Le
couple droite(3)/gauche(1) est délibérément celui exercé ici (paire
horizontale, celle qui était fausse dans le traducteur docx jusqu'à sa
correction) plutôt que haut(0)/bas(2), qui n'a jamais été en doute.

**Hypothèse explicite, non prouvée par ce spike** : la sémantique des sites
de connexion DrawingML est définie par la géométrie prédéfinie de la forme
(`a:prstGeom`), un vocabulaire identique entre `wps:` (docx) et `p:`/`a:`
(pptx) — d'où une présomption raisonnable que les indices `stCxn`/`endCxn`
se comportent à l'identique. Le rendu LibreOffice ci-dessous confirme
seulement que le **tracé littéral** du connecteur (calculé explicitement en
EMU dans le script, pas déduit de `idx`) atterrit au bon endroit — exactement
la même limite que celle documentée dans `ooxml-translator.ts` pour le
comportement magnétique (le tracé statique est indépendant de `idx`, seul le
comportement "la forme suit quand on la déplace" en dépend, et **ça, aucun
rendu headless ne peut le vérifier**).

## Commandes exécutées

```bash
node build-spike.mjs
unzip -t spike.pptx
unzip -l spike.pptx
python3 verify_xml.py spike.pptx   # cf. script ad hoc, non committé — voir note
grep -r "TargetMode" $(unzip-dir)/**/*.rels
soffice --headless --convert-to png spike.pptx
soffice --headless --convert-to pdf spike.pptx
```

Note : `verify_xml.py` n'est pas committé dans ce dossier (script de
vérification jetable, exécuté depuis le scratchpad de la session) — sa
logique est décrite ci-dessous pour qu'un humain puisse la reproduire à
l'identique si besoin.

## Résultats vérifiés

- Exit code 0 pour `node build-spike.mjs` ; `spike.pptx` produit (~7,3 Ko,
  24 entrées dont 8 répertoires).
- **ZIP valide** : `unzip -t spike.pptx` → "No errors detected in compressed
  data of spike.pptx."
- **13 parties XML/`.rels` toutes bien formées**, vérifié avec un parseur
  `xml.parsers.expat` dont `StartDoctypeDeclHandler` est réécrit pour lever
  une exception sur toute déclaration `DOCTYPE` (bloque à la fois XXE externe
  et l'expansion d'entités internes "billion laughs" en un seul geste,
  puisqu'aucune des deux ne peut apparaître sans `DOCTYPE` préalable) et dont
  `ExternalEntityRefHandler` est délibérément laissé non défini (comportement
  par défaut d'expat : ne résout aucune entité externe tant qu'aucun handler
  n'est installé — c'est en soi une partie de la mitigation, pas une
  négligence) — conforme à la règle n°5 (aucune exception, y compris pour un
  script de vérification jetable). Résultat : 13/13 `OK`, 0 `DOCTYPE` trouvé.
- **0 relation externe** : `grep -r "TargetMode"` sur les 5 fichiers `.rels`
  du paquet ne remonte aucune occurrence — conforme à la règle n°3.
- **Rendu LibreOffice Impress headless (24.2.7.2)** :
  - `--convert-to png` → exit 0, `spike.png` produit (960×720, non vide).
  - `--convert-to pdf` → exit 0, `spike.pdf` produit (1 page, PDF 1.7).
  - Inspection visuelle du PNG : **deux formes distinctes et reliées**, pas
    une diapositive vide, pas une image aplatie — un rectangle bleu clair
    "Node A" à gauche, un losange orange clair "Decision" à droite, une
    flèche horizontale du bord droit du rectangle vers le bord gauche du
    losange. (Défaut cosmétique sans rapport avec l'objet du spike : le
    libellé "Decision" retourne à la ligne en "Deci/sion", la largeur de la
    forme n'a pas été dimensionnée au texte — non pertinent ici, le
    traducteur réel réutiliserait `estimateTextWidth` comme `ooxml-translator.ts`.)

## Recherche (limitée, à confirmer)

Deux questions posées par les instructions de ce spike, recherchées par
recherche web avant d'écrire le script :

1. **PowerPoint/Google Slides tolèrent-ils un `.pptx` sans slideMaster ni
   slideLayout ?** Recherche inconclusive avec une source faisant autorité
   au même niveau de certitude que le reste de ce document — les résultats
   trouvés parlent surtout de fichiers corrompus/à réparer en général, pas
   spécifiquement de l'absence de master/layout. Le schéma ECMA-376 exige
   `p:presentation/p:sldMasterIdLst` avec au moins un élément et
   `p:sldMaster/p:sldLayoutIdLst` avec au moins un élément (cardinalité du
   schéma, pas une simple convention) — un fichier qui les omettrait
   échouerait probablement dès la validation de schéma, pas seulement à
   l'ouverture. **Décision prise par prudence** : les inclure (voir
   ci-dessus), sans avoir confirmé empiriquement ce qui se passe si on les
   omet.
2. **Google Slides aplatit-il les connecteurs/groupes DrawingML à l'import
   pptx ?** Recherche web menée, résultats généraux uniquement ("les
   diagrammes complexes peuvent se déformer", polices remplacées par Arial,
   etc.) — rien de spécifique aux éléments `p:cxnSp`/`stCxn`/`endCxn`
   trouvé. **Cette question reste ouverte** — c'est précisément le risque
   §10 du cahier des charges que ce spike ne peut pas trancher depuis ce
   bac à sable.

## Reste à faire (vérification humaine requise avant de valider l'Option A)

- **Importer réellement `spike.pptx` dans Google Slides** (upload ou Drive)
  et vérifier :
  - les 2 formes et le connecteur sont importés comme objets **distincts et
    sélectionnables individuellement** — pas rasterisés en une seule image ;
  - le connecteur reste un objet ligne/connecteur éditable (pas convertit en
    simple forme "line" statique) ;
  - le texte de chaque forme reste éditable ;
  - aucune invite de réparation/avertissement de compatibilité à l'ouverture.
- **Vérifier dans PowerPoint réel** (pas seulement LibreOffice) que le
  fichier s'ouvre sans invite de réparation — LibreOffice est plus tolérant
  que PowerPoint sur certains OPC incomplets, donc un rendu LibreOffice
  propre ne garantit pas une ouverture propre dans PowerPoint/Google Slides.
- **Tester le comportement magnétique réel** de `stCxn`/`endCxn` : déplacer
  le rectangle ou le losange dans Google Slides/PowerPoint et vérifier que
  le connecteur suit — seul un éditeur interactif peut le confirmer, un
  rendu headless statique ne le peut pas (voir l'hypothèse explicite
  ci-dessus).
- **Tester un cas plus complexe** (plusieurs formes, un connecteur coudé
  multi-points comme `bentConnectorGeometry`/`a:custGeom` dans le traducteur
  docx) pour évaluer le risque §10 "fidélité sur des groupes de formes
  complexes" — ce spike ne couvre que le cas le plus simple (2 formes,
  1 connecteur droit).

## Décision

Aucune — ce document alimente une future ADR, à rédiger par le mainteneur
une fois la vérification manuelle Google Slides ci-dessus faite. Ce spike
ne fait que fournir la preuve technique côté génération/paquet OPC/rendu
headless ; il ne clôt pas la question posée par le cahier des charges §8.
