# Vidéo de démonstration (« wow »)

Tournée dans le **vrai** Word et le **vrai** PowerPoint, sans intervention : un script ouvre une copie
neuve du fichier de démo, déplace le vrai curseur, tape au clavier, et ffmpeg filme l'écran. Le montage
est fait en local (Pillow + ffmpeg).

## Sorties

- `out/wow-fr.mp4` : 1080×1350 (4:5), ≈ 40 s, pour LinkedIn.
- `out/wow-en.mp4` et `../wow.gif` : version anglaise courte (formes + SmartArt), pour le README.

## Refaire une prise

Prérequis : Windows, écran 1920×1080, Word et PowerPoint installés, ffmpeg dans le `PATH`.
**Ne pas toucher la souris ni le clavier pendant une prise** (≈ 20 s).

```powershell
powershell -ExecutionPolicy Bypass -File shoot.ps1 -shot A   # avant : le schéma collé en PNG
powershell -ExecutionPolicy Bypass -File shoot.ps1 -shot B   # formes natives : texte retapé, boîte déplacée
powershell -ExecutionPolicy Bypass -File shoot.ps1 -shot C   # SmartArt : palette + style 3D
powershell -ExecutionPolicy Bypass -File shoot.ps1 -shot D   # le même schéma dans PowerPoint
python build-wow.py fr; python build-wow.py en
```

Les coordonnées des gestes sont en dur dans `shoot.ps1` (Word maximisé, zoom 100 %) ; `probe.ps1` et
`probe-ribbon.ps1` servent à les retrouver si la démo ou le ruban change. Les prises brutes vont dans
`raw/` (non versionné).

## Fichiers de démo

`formes.md` et `smartart.md`, exportés dans `out/` : `formes.docx` (SmartArt désactivé),
`smartart.docx`, `formes.pptx`, et `douleur.docx` (le même schéma collé en image, pour le « avant »).
