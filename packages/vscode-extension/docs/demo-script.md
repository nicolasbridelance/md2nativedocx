# Script de démo — GIF + capture

Un GIF (côté VS Code) et une capture d'écran statique (côté Word) plutôt qu'un seul GIF combiné
(cahier_des_charges.md §12.2) : la partie VS Code ne demande pas Word et a pu être enregistrée
automatiquement dans ce Codespace (Xvfb + la vraie build VS Code déjà utilisée pour les tests
d'extension-host, `xdotool` pour le clic, `ffmpeg` pour la capture) ; la partie Word demande une
vraie installation de Word, hors de portée de ce Codespace Linux — et n'a pas besoin d'être animée,
les poignées de sélection sont visibles à l'arrêt.

## ✅ GIF 1 — côté VS Code (`demo-vscode.gif`, fait)

`packages/vscode-extension/docs/demo-vscode.gif` — 800×450, ~240 Ko, 4.7 s. Généré automatiquement
le 2026-09-01 : CodeLens visible → clic sur **⚙️ Export to Word** → notification "Exported:
demo.docx" avec les actions Open in Word / Reveal in Explorer. Le fichier `demo.md` utilisé est
[`docs/demo.md`](demo.md) (même contenu que ci-dessous). Déjà référencé dans le README de
l'extension.

**Détail trouvé au premier enregistrement, pas cosmétique, corrigé avant la version finale** : la
barre "Export in progress" restait affichée tant que la notification de succès n'était pas
cliquée/fermée — `runExportFlow` (`src/extension.ts`) attendait `showInformationMessage(...)`
*à l'intérieur* du callback `withProgress`, donc le spinner ne se fermait qu'une fois l'utilisateur
agi sur le toast de succès, pas dès que l'export était réellement terminé. Visible dans le tout
premier essai (deux notifications empilées) ; corrigé (le `withProgress` ne wrappe plus que
`run()`, la notification de succès/erreur vient après, hors du spinner) et re-vérifié par un
second enregistrement — une seule notification, propre.

## ⏳ Capture d'écran — côté Word (`demo-word.png`, reste à faire)

Nécessite Word réellement installé (Windows/Mac) — impossible à produire dans ce Codespace Linux
(LibreOffice n'a ni le même rendu ni les mêmes poignées de sélection, donc pas fiable comme
substitut pour ce qui doit vendre le produit). Une **capture statique** suffit ici — inutile
d'animer le survol/clic pour montrer des poignées de sélection déjà visibles à l'arrêt.

### Fichier à utiliser
[`docs/demo.docx`](demo.docx) — déjà généré (via le CLI réel à partir de
[`docs/demo.md`](demo.md)), prêt à ouvrir directement dans Word.

### Ce qu'il faut dans la capture
1. Cliquer sur la boîte "Accès accordé" dans le diagramme.
2. **Le plan qui vend le produit** : les poignées de sélection individuelles (coins + côtés)
   visibles autour de la forme — la preuve visuelle de l'éditabilité native.
3. Capturer la fenêtre Word (pas tout l'écran), zoom raisonnable pour que le texte des formes
   reste lisible en vignette.

### Export
- Format : PNG.
- Emplacement : `packages/vscode-extension/docs/demo-word.png` — c'est l'endroit que le README
  référencera une fois le fichier présent.

## Une fois `demo-word.png` produit

Prévenir pour que le lien soit ajouté au README de l'extension à côté de `demo-vscode.gif`, et que
les deux soient présentés côte à côte pour raconter l'histoire complète en un coup d'œil.
