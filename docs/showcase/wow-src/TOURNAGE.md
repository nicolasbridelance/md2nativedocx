# Tournage du « wow »

Quatre plans courts, filmés dans le vrai Word et le vrai PowerPoint. Le montage (accroche, cartons,
zooms, écran de fin, export MP4 4:5 et GIF) est fait ensuite en local par `build-wow.py`.

## Avant de commencer

- Word maximisé, zoom 150 %, ruban affiché, volet de navigation fermé, aucune notification.
- Mouvements de souris lents et francs : chaque geste doit se lire sans le son, sur un téléphone.
- Une prise ratée ? On relance la même commande, elle écrase la précédente.
- Lancer chaque commande depuis un terminal Git Bash **à côté** de Word (seule la fenêtre Word est filmée).

## Plan A — la douleur (≈ 6 s)

Ouvrir `out/douleur.docx`, puis : `bash record.sh A-douleur word 8`

1. Cliquer sur la boîte « Analyse » : c'est toute l'image qui se sélectionne.
2. Double-cliquer dessus : l'onglet *Format de l'image* s'ouvre, aucun texte n'est modifiable.

## Plan B — la preuve (≈ 12 s)

Fermer, ouvrir `out/formes.docx`, puis : `bash record.sh B-formes word 15`

1. Cliquer dans la boîte « Analyse », sélectionner le mot, taper « Revue sécurité ».
2. Attraper la boîte « Déploiement » par son bord et la descendre doucement : la flèche suit.

## Plan C — la magie (≈ 10 s)

Fermer, ouvrir `out/smartart.docx`, puis : `bash record.sh C-smartart word 15`

1. Cliquer sur le cycle : l'onglet *Création SmartArt* apparaît.
2. *Modifier les couleurs* → survoler 2-3 palettes, en choisir une.
3. Dans les *Styles SmartArt*, survoler puis choisir un style 3D.

## Plan D — l'ampleur (≈ 6 s)

Ouvrir `out/smartart.pptx` dans PowerPoint, puis : `bash record.sh D-pptx powerpoint 8`

1. Cliquer sur « Vérifier » et taper « Mesurer ».

Ensuite, me dire « tourné » : je fais le montage.
