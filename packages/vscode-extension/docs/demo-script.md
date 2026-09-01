# Script d'enregistrement — démo GIF/vidéo

Objectif (cahier_des_charges.md §12.2) : un GIF de ~10 secondes qui tient tout seul, sans son ni
légende, montrant le seul argument qui compte — le diagramme reste éditable dans Word. À
enregistrer une fois le "coup de propre" (README, tooltips) terminé.

## Matériel

- **Fenêtre VS Code** : thème clair (Light+) recommandé — un GIF en thème sombre compresse moins
  bien et lit moins bien en vignette Marketplace. Zoom éditeur à 130-150 % (`Ctrl` + `+`) pour que
  le texte reste lisible une fois réduit en GIF.
- **Résolution d'enregistrement** : 1280×720, fenêtre VS Code seule (pas tout l'écran) — recadrer
  large gaspille des pixels sur une vignette qui sera affichée en ~600 px de large.
- **Outil d'enregistrement** :
  - Linux : [Peek](https://github.com/phw/peek) (GIF direct, léger) ou `SimpleScreenRecorder` +
    conversion `ffmpeg` ensuite.
  - macOS : QuickTime Player (enregistrement écran) → conversion GIF via `ffmpeg` ou
    [Gifski](https://gif.ski/).
  - Windows : `ShareX` (export GIF direct) ou Xbox Game Bar (`Win+G`) → conversion.
- **Word** doit déjà être ouvert une fois en arrière-plan avant de commencer, pour que son
  démarrage n'allonge pas l'enregistrement (cache app déjà chaud).

## Fichier de départ

Créer `demo.md` avec exactement ceci (un seul diagramme simple, lisible même petit) :

    # Demande d'accès — workflow

    ```mermaid
    flowchart LR
      A[Demande soumise] --> B{Validée ?}
      B -->|Oui| C[Accès accordé]
      B -->|Non| D[Demande rejetée]
    ```

## Séquence à l'écran (~10 secondes, pas de pause)

1. **(0:00–0:02)** Fichier `demo.md` déjà ouvert, bloc mermaid visible, CodeLens
   "⚙️ Exporter en Word" déjà visible au-dessus du bloc — pas besoin de le montrer apparaître,
   commencer directement dessus.
2. **(0:02–0:03)** Clic sur **⚙️ Exporter en Word**. La barre de progression VS Code doit être
   visible au moins une frame (preuve que quelque chose se passe réellement, pas un montage).
3. **(0:03–0:05)** Notification de succès apparaît → clic sur **Ouvrir dans Word**.
4. **(0:05–0:08)** Word s'ouvre sur le `.docx` généré, diagramme visible.
5. **(0:08–0:10)** **Le plan qui vend le produit** : clic sur la boîte "Accès accordé" dans Word →
   les poignées de sélection individuelles apparaissent (coins + côtés), bien visibles. Rester
   sur cette frame 1-2 secondes avant de couper — c'est la preuve visuelle de l'éditabilité native,
   le seul frame qu'un lecteur qui scroll vite retiendra.

Pas besoin d'aller plus loin (déplacer la boîte, changer le texte) pour le GIF court — ça, c'est
pour une éventuelle vidéo longue (voir plus bas).

## Export GIF

- Durée finale : 8-12 secondes, en boucle (`loop`).
- Poids cible : **< 5 Mo** (s'affiche inline dans le README GitHub et la page Marketplace sans
  clic) — réduire la palette de couleurs (`gifski --fps 12`) plutôt que la résolution si besoin.
- Nom de fichier et emplacement : `packages/vscode-extension/docs/demo.gif` — c'est l'endroit que
  le README de l'extension référencera une fois le fichier présent (actuellement pas de lien
  d'image dans le README pour ne pas pointer vers un fichier inexistant).

## Variante longue (optionnelle, 30-45 s, pour un post Reddit/HN/Twitter)

Reprendre la séquence ci-dessus puis ajouter, dans Word :
6. **Déplacer** la boîte "Accès accordé" — montrer que les flèches suivent (connecteurs
   magnétiques `stCxn`/`endCxn`).
7. **Double-clic** sur le texte d'une boîte, taper un nouveau libellé — montrer que le texte est
   natif, pas un pixel.

Cette variante peut rester en `.mp4` (pas besoin de la contrainte GIF) et être hébergée sur
YouTube/un lien direct, référencée séparément dans un post de lancement — pas dans le README lui-même.

## Une fois le fichier `demo.gif` produit

Prévenir pour que le lien soit ajouté en haut du
[README de l'extension](../README.md) et du [README racine](../../../README.md) — actuellement
volontairement absent pour ne pas pointer vers un asset qui n'existe pas encore.
