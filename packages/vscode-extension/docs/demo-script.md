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

## ✅ Capture — côté Word (`demo-word.png`, fait, décision assumée)

Décision explicite du mainteneur (2026-09-02) : plutôt que d'attendre un accès à un Word réel,
`demo-word.png` est un rendu de [`docs/demo.docx`](demo.docx) via `soffice --headless
--convert-to png` (même mécanisme que `scripts/test-visual.mjs`), recadré sur la zone de contenu
(`PIL`, bbox + marge de 28px). Assumé et documenté ici plutôt que caché : ce n'est **pas** une
capture Word avec poignées de sélection visibles (ça restait l'idéal — voir plus bas si quelqu'un
veut la produire un jour) — c'est le rendu du fichier `.docx` généré tel quel, qui démontre déjà ce
que le README affirme en toutes lettres : formes vectorielles natives (rectangles, losange,
connecteurs fléchés avec labels), pas une image aplatie. La légende du README le dit explicitement
("rendered here for the screenshot") pour ne rien laisser croire de plus que ce que l'image montre.

## Reste ouvert, non bloquant : une vraie capture Word avec poignées de sélection

Si quelqu'un a accès à un Word réel (Windows/Mac) un jour, la version définitive reste supérieure :
ouvrir [`docs/demo.docx`](demo.docx), cliquer sur la boîte "Accès accordé", capturer la fenêtre
Word (pas tout l'écran) avec les poignées de sélection (coins + côtés) visibles autour de la
forme — la preuve visuelle de l'éditabilité native que LibreOffice ne peut pas montrer (il n'a pas
la même UI de sélection). Remplacerait `demo-word.png` au même chemin, légende du README à ajuster
en conséquence.
