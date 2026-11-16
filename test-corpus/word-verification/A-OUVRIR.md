# À ouvrir dans Word (liste tenue à jour)

Dernière mise à jour : 2026-11-16. Cocher ici, puis reporter le résultat dans `CHECKLIST.md`.

## 1. `subgraph-direction.docx` : R2.4, `direction` dans un `subgraph` (nouveau, jamais vu dans Word)

Trois diagrammes dans le même fichier. Dans chacun : chaque forme se sélectionne seule, les flèches
suivent quand on déplace une forme, aucun texte ne déborde, le titre du sous-graphe n'est pas recouvert.

- [ ] **Cas 1** : le sous-graphe « Sous-graphe LR » montre A → B → C **de gauche à droite**, sous un
      diagramme qui descend (X → Y).
- [ ] **Cas 2** : P (haut vers bas) contient a → b et, dedans, Q (gauche à droite) avec c → d ; R (haut vers bas)
      à côté ; g → h à part. Q est entièrement dans P.
- [ ] **Cas 3** : A → B reste **de haut en bas** (direction ignorée, c'est voulu : un lien X → A vient
      de l'extérieur). L'export a émis l'avertissement correspondant (voir `subgraph-direction.log`).

Source : `subgraph-direction.md`. Régénérer :
`node packages/cli/bin/md2nativedocx.mjs test-corpus/word-verification/subgraph-direction.md -o test-corpus/word-verification/subgraph-direction.docx`

## 1bis. R4.4, titre de sous-graphe et imbrication (vérifié par rendu Word le 2026-11-16, ton œil reste la référence)

Mêmes diagrammes, deux fichiers : `titre-sousgraphe-avant.docx` (code actuel de main) et `titre-sousgraphe-apres.docx` (titre 10 pt, marges verticales du titre à 0).

- [ ] Dans `apres`, aucun titre ne touche ni ne dépasse la bordure haute du cadre (3 diagrammes, dont les imbriqués).
- [ ] Le titre reste lisible (10 pt) et centré dans sa barre.
- [ ] `nested-3-levels.docx` (À REGÉNÉRER : il était ouvert dans Word ; fermer puis `node packages/cli/bin/md2nativedocx.mjs test-corpus/word-verification/nested-3-levels.md -o test-corpus/word-verification/nested-3-levels.docx`) : Niveau 3 dans Niveau 2 dans Niveau 1 ; avant, les cadres étaient empilés au lieu d'être imbriqués (bug de layout corrigé au passage).
- [ ] `swimlane.docx` : titres de couloirs toujours lisibles (non regénéré).

Si 10 pt est encore trop serré : repli = barre de titre plus haute (`SUBGRAPH_TITLE_HEIGHT`).

## 2. R1.6 : export pendant que le `.docx` est ouvert (poste Windows + OneDrive)

Pas de fichier à ouvrir : un fichier de ton choix (par ex. `minimal.docx`) copié dans un dossier OneDrive.

- [ ] Ouvrir le `.docx` dans Word, le laisser ouvert.
- [ ] Relancer l'export vers ce même chemin (extension ou CLI).
- [ ] Attendu : un message clair, pas de plantage, le fichier ouvert n'est ni écrasé ni corrompu.
- [ ] Fermer Word, ré-exporter : le fichier se remplace normalement.

Après ça : release 0.8.1 (TODO.md, R1.6) et `docs/history/incident-flux-arcs-2026-11.md`.

## 3. En attente d'un changement de ma part (rien à ouvrir pour l'instant)

- R4.1 `w:latentStyles` / `a:objectDefaults` : galerie de styles, insertion d'une forme.
- R4.2 `compatibilityMode` = 15 : round CHECKLIST complet avant adoption.
- R4.3 formes de sous-graphe : seulement si une différence est visible dans Word.
