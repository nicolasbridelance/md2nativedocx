# ADR 0006 — Spike : `dsp:drawing` fallback pour corriger la corruption Word de SmartArt (Milestone 0)

- **Statut :** Spike réalisé, résultat positif sous LibreOffice — **test en vrai Word en attente
  du mainteneur** avant de démarrer le Milestone 1 (implémentation réelle du geometry engine).
- **Date :** 2026-09-05
- **Décideur :** à confirmer par le mainteneur une fois le test Word réel fait.

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

**En attente.** Le fichier `docs/adr/spikes/spike-dsp-drawing/cycle-with-drawing.docx` a été remis
au mainteneur pour test dans un vrai Word. Deux issues possibles :
- **Word l'ouvre** : le Milestone 1 (geometry engine réel, `packages/core/src/smartart/drawing.ts`,
  câblage `postprocess.mjs`/`md2nativedocx-core.mjs` pour la 5e partie) peut démarrer avec
  confiance sur l'approche.
- **Word le refuse quand même** : l'hypothèse de TODO.md est fausse ou incomplète — il faudra
  chercher une autre différence structurelle entre notre sortie et un vrai fichier Word (candidats
  déjà écartés ou non testés à lister à ce moment-là), avant de retenter une implémentation.

## Conséquences

- Le script `build-spike.mjs` est réutilisable tel quel pour repartir avec `chain`/`tree` une fois
  `cycle` confirmé (mêmes 3 étapes, juste changer le générateur source).
- Aucune modification de code de production à ce stade — uniquement le dossier spike.
