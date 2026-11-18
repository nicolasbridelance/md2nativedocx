# Vidéo de démonstration (« wow »)

Tournée dans le **vrai** VS Code, le **vrai** Word et le **vrai** PowerPoint, sans intervention : un
script ouvre une copie neuve du fichier de démo, déplace le vrai curseur, tape au clavier, et ffmpeg
filme l'écran. Le montage est fait en local, image par image (Pillow + numpy → ffmpeg) : coupes,
zooms qui suivent le geste, cartes animées, carrousel.

## Sorties

- `out/wow-fr.mp4` : 1080×1350 (4:5), ≈ 51 s, pour LinkedIn. Accroche, avant (image collée), export
  depuis VS Code, moteur, formes Word, SmartArt, PowerPoint, carrousel de 15 types, plateformes.
- `out/wow-en.mp4` : version anglaise plus courte (≈ 39 s, sans l'accroche, l'avant ni PowerPoint).
- `../wow.gif` : extrait de la version anglaise pour le README (formes, SmartArt, carrousel).

## Refaire une prise

Prérequis : Windows, écran 1920×1080, VS Code avec l'extension installée, Word et PowerPoint, ffmpeg
et Python (Pillow, numpy) dans le `PATH`. **Ne pas toucher la souris ni le clavier pendant une prise**
(≈ 20 s).

```powershell
powershell -ExecutionPolicy Bypass -File shoot.ps1 -shot E -zoom 150   # VS Code : « Exporter en Word », Word s'ouvre
powershell -ExecutionPolicy Bypass -File shoot.ps1 -shot A -zoom 150   # avant : le schéma collé en image
powershell -ExecutionPolicy Bypass -File shoot.ps1 -shot B -zoom 150   # formes natives : texte retapé, boîte déplacée
powershell -ExecutionPolicy Bypass -File shoot.ps1 -shot C             # SmartArt : palette + style 3D
powershell -ExecutionPolicy Bypass -File shoot.ps1 -shot D             # le même schéma dans PowerPoint
python carousel.py                                                     # rend carousel/*.md dans Word (invisible)
python build-wow.py fr; python build-wow.py en
```

La prise E ouvre une fenêtre VS Code à part, sur un **profil jetable** (`raw/vscode-profile`) : seule
l'extension et le pack de langue français y sont recopiés, ainsi que le Pandoc déjà téléchargé. Le
profil de l'utilisateur, son panneau de chat et sa disposition n'apparaissent jamais à l'écran.

Les coordonnées des gestes sont en dur dans `shoot.ps1` (Word maximisé, zoom 150 % pour A et B,
100 % pour C) ; `probe.ps1`, `probe-ribbon.ps1` et `shoot.ps1 -shot probe` / `-shot probeE` servent à
les retrouver si la démo ou le ruban change. Le bouton de la notification VS Code est retrouvé à
l'image (sa couleur), pas par coordonnées. Les cadrages et les coupes du montage sont dans `TAKES`
(`build-wow.py`), en temps de la prise brute. Les prises brutes vont dans `raw/` (non versionné).

## Fichiers de démo

- `formes.md` : l'architecture réseau, exportée en paysage dans `out/` : `formes.docx` (SmartArt
  désactivé), `formes.pptx`, et `douleur.docx` (le même schéma collé en image, pour l'« avant »).
- `smartart.md` → `out/smartart.docx` : le cycle PDCA.
- `carousel/*.md` : un diagramme par type, sur des thèmes variés. `SLIDES` (`build-wow.py`) choisit
  ceux qui passent dans le carrousel et ce que Word en fait (SmartArt, graphique Word, formes).
