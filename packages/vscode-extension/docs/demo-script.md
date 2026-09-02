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

## ✅ GIFs 2-4 — les flux ajoutés depuis (2026-09-02), un GIF par fonction

Signalé par le mainteneur : `demo-vscode.gif` ne montrait que le flux CodeLens, alors que le scope
de l'extension a bougé depuis son enregistrement (2026-09-01) — commit `9aa7ad5` a ajouté le clic
droit (Explorateur/éditeur), l'export Markdown complet sans diagramme requis, et le support `.mmd`
brut. Décision explicite du mainteneur : **un GIF par fonction, chacun avec sa propre légende**
plutôt qu'un seul GIF combiné plus long — l'audience visée est plus à l'aise avec Word qu'avec
VS Code, donc chaque légende du README explique le flux en langage courant (pas de jargon
"CodeLens"/"Explorer" non expliqué).

**Process technique** (reconstruit à l'identique de celui de `demo-vscode.gif`, aucun script n'avait
été conservé de la première session) :
- `Xvfb :99 -screen 0 1280x800x24` comme display virtuel.
- La vraie build VS Code déjà téléchargée pour les tests d'extension-host
  (`.vscode-test/vscode-linux-x64-1.135.0/code`), lancée directement (pas via `bin/code`, qui ne
  sert qu'au mode CLI) avec `--extensionDevelopmentPath`/`--user-data-dir`/`--extensions-dir`
  isolés, sur un workspace jetable (`/tmp/vscode-demo-workspace`).
- **Piège trouvé** : la variable d'environnement `ELECTRON_RUN_AS_NODE=1` (héritée de la session,
  probablement d'un run de tests précédent) force le binaire à se comporter comme du Node brut au
  lieu de lancer l'UI — `env -u ELECTRON_RUN_AS_NODE` avant l'appel corrige ça.
- Thème **Light Modern** appliqué manuellement (Ctrl+K Ctrl+T) pour rester visuellement cohérent
  avec `demo-vscode.gif` (enregistré en thème clair) — le thème par défaut d'un profil neuf est
  sombre.
- `xdotool mousemove`/`click` pour rejouer chaque flux (clic droit → item de menu ; clic sur le lien
  CodeLens), `ffmpeg -f x11grab` pour l'enregistrement continu (h264 ultrafast), conversion en GIF
  via `palettegen`/`paletteuse` (`stats_mode=diff`, dither `bayer`), recadré pour exclure la barre de
  titre VS Code (`crop=1280:770:0:30`), réduit à 720px de large, 12 fps.
- **Piège trouvé, deux fois** : le délai réel entre le lancement de `ffmpeg` en arrière-plan et le
  premier frame effectivement capturé est significativement plus long que prévu (~7-9s de décalage
  observé sur les deux premières prises) — une notification de succès attendue "vers t=2-3s" apparaît
  en réalité bien plus tard dans l'enregistrement. Chaque prise a été vérifiée par extraction de
  frames à plusieurs timestamps (`ffmpeg -ss <t> -frames:v 1`) avant de fixer le point de coupe
  final, plutôt que de deviner un timing fixe.
- **Piège trouvé une fois** : une notification de succès laissée ouverte d'un essai précédent
  (jamais fermée) réapparaît en fondu au démarrage de l'essai suivant, superposée à la nouvelle —
  "Notifications: Clear All Notifications" (Palette de commandes) + suppression du `.docx` généré
  par l'essai précédent avant chaque nouvelle prise, pour repartir d'un état propre et reproductible.

**Fichiers produits** :
- [`docs/demo-context-menu.gif`](demo-context-menu.gif) — clic droit sur `demo.md` dans
  l'Explorateur → `md2nativedocx: Export document to Word` → notification de succès. Réutilise
  [`docs/demo.md`](demo.md) (fixture déjà existante).
- [`docs/demo-no-diagram.gif`](demo-no-diagram.gif) — CodeLens en haut de fichier (aucun bloc
  Mermaid) → export → notification. Nouvelle fixture [`docs/demo-no-diagram.md`](demo-no-diagram.md)
  (texte + tableau, volontairement sans diagramme).
- [`docs/demo-raw-mmd.gif`](demo-raw-mmd.gif) — CodeLens sur un fichier `.mmd` brut (pas de
  fencing Markdown) → export → notification. Nouvelle fixture
  [`docs/demo-raw.mmd`](demo-raw.mmd).

**Statut de publication** : ces GIFs et la mise à jour du README associée sont **prêts mais pas
publiés** — décision explicite du mainteneur (2026-09-02) d'attendre de les bundler avec d'autres
fonctionnalités dans une prochaine version plutôt que de faire un `npm run publish` dédié
uniquement à la doc. Voir `TODO.md` pour le suivi.
