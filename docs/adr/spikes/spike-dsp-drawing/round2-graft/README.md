# Round 2 — bisection après l'échec du test Word réel de `dsp:drawing`

Run avec `node build-graft.mjs`. Contexte complet dans `docs/adr/0006-dsp-drawing-fallback-spike.md`
("Suite — bissection en cours").

`cycle-graft.docx` = le vrai fichier Word (`handmade_samples/cycle-simple.docx`), avec **seulement**
ses 5 parties diagramme remplacées par les nôtres (mêmes noms de fichiers, mêmes `rId`s déjà câblés
par le vrai fichier — aucune autre modification). Tout le reste (`document.xml`, `_rels`,
`[Content_Types].xml`, styles, thème, settings) reste strictement ce qu'un vrai Word a écrit.

- **S'il s'ouvre dans un vrai Word** → le problème est dans l'enveloppe produite par notre pipeline
  CLI (`postProcessDocx`/`injectSmartArtParts`/le `reference.docx` généré), pas dans le contenu du
  diagramme lui-même.
- **S'il échoue aussi** → le problème est dans le contenu de nos parties diagramme (probablement le
  `layoutDef` personnalisé) — `dsp:drawing` n'a jamais été la vraie cause.
