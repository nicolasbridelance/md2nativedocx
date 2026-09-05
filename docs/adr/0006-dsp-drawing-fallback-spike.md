# ADR 0006 — Spike : `dsp:drawing` fallback pour corriger la corruption Word de SmartArt (Milestone 0)

- **Statut :** **Hypothèse infirmée par test Word réel (2026-09-05).** `cycle-with-drawing.docx`
  refuse toujours de s'ouvrir dans Word, message identique à l'incident d'origine ("Word a
  rencontré une erreur lors de l'ouverture du fichier"). Le Milestone 1 (geometry engine complet)
  **ne démarre pas** tant que la vraie cause n'est pas trouvée — voir "Suite" en bas de ce
  document pour la piste de bissection en cours.
- **Date :** 2026-09-05
- **Décideur :** Nicolas Bridelance (mainteneur) — test réel effectué, résultat négatif rapporté.

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

**Hypothèse infirmée.** Résultat du test réel : même message d'erreur qu'à l'incident d'origine.
Le `dsp:drawing` seul ne suffit pas — soit il manque autre chose en plus, soit il ne joue aucun
rôle et la vraie cause est ailleurs. Pas de nouvelle implémentation avant d'avoir isolé la cause
réelle par bissection (voir "Suite").

## Suite — bissection en cours (2026-09-05, après le résultat négatif)

Deux hypothèses restent à trancher, qui pointent dans des directions très différentes :
1. **Le contenu de nos 4-5 parties diagramme est structurellement invalide** pour Word (au-delà
   de ce que le schéma XML brut ou LibreOffice peuvent détecter) — par exemple le `layoutDef`
   personnalisé lui-même (`dgm:alg type="cycle"`) pourrait violer une contrainte que Word valide
   strictement et LibreOffice tolère, indépendamment de `dsp:drawing`.
2. **Quelque chose dans le document autour du diagramme** (racine `w:document`, `mc:Ignorable`,
   `rsid`, `w:compat`, etc. — générés par notre pipeline CLI, pas par le traducteur SmartArt
   lui-même) est ce qui fait échouer l'ouverture, sans rapport avec le contenu du diagramme.

**Test de bissection décisif** : greffer nos propres 5 parties diagramme (data/layout/colors/
quickStyle/drawing, celles de ce spike) **dans une copie du vrai fichier Word**
(`handmade_samples/cycle-simple.docx`), à la place des siennes, en conservant tout le reste du
fichier réel (document.xml, rels, styles, settings — tout ce qu'un vrai Word a lui-même écrit).
- **Si cette copie s'ouvre** : le problème est isolé au **contenu du diagramme** (hypothèse 1) —
  it faut alors comparer notre `layoutDef`/`dataModel` ligne à ligne contre un exemple connu plus
  strictement, pas juste vérifier le XML bien formé.
- **Si elle échoue aussi** : le problème est dans **l'enveloppe du document** produite par notre
  pipeline (hypothèse 2) — `postProcessDocx`/`injectSmartArtParts`/le `reference.docx` généré, pas
  le contenu du diagramme lui-même.

Voir `docs/adr/spikes/spike-dsp-drawing/round2-graft/` pour ce test, construit et remis au
mainteneur en parallèle de la mise à jour de cet ADR.

## Conséquences

- Le script `build-spike.mjs` reste réutilisable pour `chain`/`tree` une fois la vraie cause
  trouvée et corrigée sur `cycle`.
- Aucune modification de code de production à ce stade — uniquement des dossiers spike.
