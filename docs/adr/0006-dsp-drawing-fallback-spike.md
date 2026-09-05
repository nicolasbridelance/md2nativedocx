# ADR 0006 — Spike : `dsp:drawing` fallback pour corriger la corruption Word de SmartArt (Milestone 0)

- **Statut :** **Cause localisée au `layout1.xml`/`data1.xml` personnalisés, nouvelle hypothèse
  concrète en test (2026-09-05).** Round 1 (`dsp:drawing`) et round 2 (greffe complète) ont
  échoué. **Round 3 tranche** : `cycle-isolate-a.docx` (nos `data`+`layout` seuls) **échoue**,
  `cycle-isolate-b.docx` (nos `colors`+`quickStyle` seuls) **s'ouvre** — le problème est
  spécifiquement dans `data.xml`/`layout.xml`. Comparaison ligne à ligne avec le fichier réel a
  trouvé une nouvelle piste concrète (éléments `presOf`/`constrLst`/`ruleLst` requis mais absents
  de nos `layoutNode`) — round 4 en test.
- **Date :** 2026-09-05
- **Décideur :** Nicolas Bridelance (mainteneur) — 3 rounds de tests réels effectués à ce jour.

## Contexte

TODO.md ("Incident SmartArt 'cycle' cassé en Word réel", 2026-09-03) documente une hypothèse non
tranchée : Word refuserait d'ouvrir un `dgm:dataModel` dont le `layoutDef` est un algorithme
personnalisé (comme les trois générateurs `chain`/`tree`/`cycle` de ce projet en émettent toujours)
faute d'un filet de sécurité `dsp:drawing` pré-rendu — la 5e partie qu'un vrai Word ajoute toujours
(`handmade_samples/cycle-simple.docx`) et que nos générateurs n'émettent jamais. C'est le
prérequis bloquant de tout le plan d'élargissement de la couverture SmartArt (voir le plan de
session, Milestone 1 dépend de ce spike).

## Spike réalisé

`docs/adr/spikes/spike-dsp-drawing/` — voir `spike.md` pour le détail complet. Résumé :

1. Reproduit exactement le cas de l'incident (cycle à 3 nœuds) via la vraie CLI de production
   (aucune modification du pipeline).
2. Patché à la main une 5e partie (`drawing1.xml` + relation + content-type + référence
   `dsp:dataModelExt`) dans `data1.xml`, structurellement identique à ce qu'un vrai Word émet.

## Résultat 1 — la règle de câblage `dsp:sp/@modelId` est confirmée précisément

En inspectant directement `handmade_samples/cycle-simple.docx` (au-delà de ce que TODO.md
documentait déjà) : chaque `dsp:sp/@modelId` référence un point de **présentation**
(`dgm:pt/@type="pres"`) de `data1.xml`, jamais un point de contenu — confirmé par intersection des
deux ensembles d'ids (6/6 des ids de `drawing1.xml` correspondent à des points `pres`, 0 à des
points de contenu). Nos générateurs ont déjà l'équivalent exact (`p-main{N}`, le point portant
`presStyleLbl="node1"`) — réutilisable tel quel, format de chaîne inchangé (confirme à nouveau
ADR 0004 "Round 3" : le format du `modelId` n'a pas d'effet sur le rendu, seule la référence à un
point réellement existant compte).

## Résultat 2 — comportement LibreOffice inattendu, signal positif pour l'hypothèse

Sans `dsp:drawing` : LibreOffice exécute l'algorithme `cycle` en direct, rend 3 rectangles
arrondis. **Avec** le `dsp:drawing` ajouté : LibreOffice affiche **le rendu pré-calculé** (3
ellipses positionnées exactement où le script les a placées) **au lieu de** ré-exécuter
l'algorithme — alors que l'algorithme fonctionnait déjà correctement sans lui. Ce n'est pas le
comportement attendu d'une extension "ignorable" au sens `mc:Ignorable` ; ça confirme plutôt que
les moteurs SmartArt traitent `dsp:drawing` comme un cache faisant autorité, pas comme un filet de
secours pour cas d'échec seulement — cohérent avec le comportement visible d'un vrai Word (une
image quasi statique jusqu'à modification de texte ou reformatage explicite). Renforce
l'hypothèse : l'absence de ce cache, pas seulement un algorithme non reconnu, pourrait
suffire à expliquer le refus d'ouverture.

## Ce que ce spike NE prouve PAS

Rien ici ne confirme que Word **ouvre** `cycle-with-drawing.docx` — ce sandbox n'a que
LibreOffice. C'est la seule question que ce spike ne peut pas trancher lui-même.

## Décision

**Hypothèse `dsp:drawing` infirmée (round 1).** Résultat du test réel : même message d'erreur
qu'à l'incident d'origine.

**Round 2 — localisé au contenu du diagramme, pas à l'enveloppe du document.** `cycle-graft.docx`
(`docs/adr/spikes/spike-dsp-drawing/round2-graft/`) greffe nos 5 parties diagramme dans une copie
du vrai fichier Word (`handmade_samples/cycle-simple.docx`), tout le reste (document.xml, rels,
styles, settings — tout ce qu'un vrai Word a lui-même écrit) resté intact. **Échoue avec la même
erreur.** Ça prouve que le problème n'est ni dans `postProcessDocx`/`injectSmartArtParts`/le
`reference.docx` généré, ni dans quoi que ce soit que notre pipeline CLI assemble autour du
diagramme — il est **forcément** dans le contenu même de nos parties diagramme
(`data`/`layout`/`colors`/`quickStyle`/`drawing`).

## Suite — Round 3, isolation en cours (2026-09-05)

`data.xml`/`layout.xml` sont couplés entre eux (les points de présentation de `data.xml`
référencent les noms de `layoutNode` de `layout.xml`) — pas testables séparément l'un de l'autre.
`colors.xml`/`quickStyle.xml` ne sont couplés à `data.xml` que par un nom de style partagé
(`presStyleLbl="node1"`, qui coïncide avec notre propre convention) — eux sont testables
indépendamment. Deux tests construits (`docs/adr/spikes/spike-dsp-drawing/round3-isolate/`,
détail dans son propre `README.md`) :
- **`cycle-isolate-a.docx`** : vrai fichier Word, mais **notre** `data1.xml` + `layout1.xml`
  (`colors`/`quickStyle` réels conservés, pas de partie `drawing`). S'ouvre → `data`/`layout` pas
  en cause. Échoue → `layout1.xml` (le `dgm:layoutDef` personnalisé, suspect n°1 depuis le début)
  ou `data1.xml` est la cause.
- **`cycle-isolate-b.docx`** : vrai fichier Word, mais **nos** `colors1.xml` + `quickStyle1.xml`
  (`data`/`layout`/`drawing` réels conservés). Biais connu et assumé : le vrai `data1.xml`
  référence un `presStyleLbl="sibTrans2D1"` (les flèches de connexion) que nos `colors`/`quickStyle`
  ne définissent pas — un échec ici ne serait pas une preuve définitive contre notre format
  `colors`/`quickStyle`, seulement contre cette référence de style spécifique.

**Résultat (2026-09-05) : `cycle-isolate-a.docx` échoue, `cycle-isolate-b.docx` s'ouvre.** Tranché
sans ambiguïté : le problème est dans `data1.xml`/`layout1.xml`, pas dans `colors`/`quickStyle`
(le biais connu ci-dessus ne joue donc aucun rôle — `colors`/`quickStyle` sont innocentés
complètement, pas seulement "probablement").

## Round 4 — nouvelle hypothèse concrète, en test (2026-09-05)

Comparaison ligne à ligne de notre `CYCLE_LAYOUT_XML` contre le `layout1.xml` réel : **chaque**
`dgm:layoutNode` du fichier réel inclut `presOf`, `constrLst` et `ruleLst`, même vides
(`<dgm:presOf axis="self"/>`, `<dgm:ruleLst/>`) — y compris sur des nœuds structurels comme le
connecteur `sibTrans`, qui ne présente pourtant rien lui-même. Nos trois générateurs (`chain.ts`/
`tree.ts`/`cycle.ts`, même motif d'écriture partout, vérifié) **omettent entièrement** ces
éléments sur tout `layoutNode` sauf la seule feuille qui présente du texte ("Main"). Si le schéma
`CT_LayoutNode` les rend obligatoires (contenu vide toléré, mais l'élément doit exister), c'est
exactement le genre d'écart qu'un validateur XML strict (Word) rejette et qu'un parseur tolérant
(LibreOffice) ignore silencieusement — cohérent avec toutes les observations des rounds 1 à 3.

Deux fichiers construits (`docs/adr/spikes/spike-dsp-drawing/round4-schema-fix/`, détail dans son
`README.md`) : `cycle-round4-graft.docx` (patch minimal greffé dans le vrai fichier, isolation la
plus propre) et `cycle-round4-standalone.docx` (diagramme complet produit par notre propre
pipeline CLI, seul le `layoutDef` patché — **si celui-ci s'ouvre seul, tout le plan `dsp:drawing`/
Milestone 1 devient inutile**, ce trou de schéma étant la vraie cause, bien plus petite que prévu).
Remis au mainteneur.

## Conséquences

- Le script `build-spike.mjs` reste réutilisable pour `chain`/`tree` une fois la vraie cause
  trouvée et corrigée sur `cycle` (round 4 ci-dessus concerne déjà les trois générateurs, même
  motif d'écriture confirmé partagé).
- Aucune modification de code de production à ce stade — uniquement des dossiers spike.
