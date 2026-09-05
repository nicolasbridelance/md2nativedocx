# Round 3 — nested `forEach`, first visible output (LibreOffice)

## Ce qui a changé face au round 2

Round 2 (`../round2-chain-conn-real-structure/`) matched `type="conn"`, `begPts`/`endPts="auto"`,
and the `parTransId`/`sibTransId` pairing to the real sample — still no visible connector,
confirmed by the maintainer in real Word.

Re-reading the real `layout1.xml` (`handmade_samples/processus_simple.docx`) more carefully: its
`sibTransForEach` is **nested inside** `nodesForEach`, as a sibling of the `node` layoutNode within
each iteration — not a separate top-level `forEach` placed after it, which is how rounds 1-2 (and
the original pre-connector `sp` spacer, long before this feature existed) had it. `begPts`/
`endPts="auto"` most likely needs that per-iteration scope to resolve "the node this transition
follows" against — unlike the plain `sp` spacer this same separate-loop shape held before
connectors existed at all, which needs no such relational context and always rendered correctly
(the pre-connector spacing was never broken, only the connector's own geometry).

Also added, present in the real layout and missing from rounds 1-2: the `sibTrans` layoutNode's own
`connDist`/`begPad`/`endPad` constraints, and an empty `r:blip` attribute on its shape (matching the
real shape element's attributes exactly, never its content).

## Résultat

**Premier rendu visible, sous LibreOffice** (`chain-conn-libreoffice.png`, ce dossier) : une forme
sombre apparaît maintenant entre chaque paire de boîtes — pas encore une flèche nette (plutôt une
fine lentille/feuille), mais c'est la première fois que quelque chose s'affiche du tout à cet
emplacement depuis le round 1. Ceci contredit rétrospectivement l'hypothèse "LibreOffice ne sait
pas dessiner `conn`" avancée en round 1 : LibreOffice sait le faire, il lui fallait le même câblage
complet que Word.

- **Schéma (Open XML SDK)** : 0 erreur sous `/word/diagrams/*`.
- **Tests unitaires** : 293/293.
- **LibreOffice** : forme visible mais pas encore la géométrie attendue (chevron/flèche nette) —
  possible spécificité de rendu LibreOffice, ou paramétrage `conn` encore à affiner (routing,
  `connRout`, style de bout) une fois le rendu confirmé correct dans Word réel.

## Statut

**Round 3 confirmé insuffisant** — voir `../round4-chain-conn-width-and-flatten/` pour la suite,
motivée par une expérience du mainteneur : ouvrir `chain-conn.docx` dans Word réel et lui appliquer
le vrai layout "Processus" (`process1`) via "Modifier la disposition" régénère `data1.xml` pour ce
layout authentique. **Ce fichier résultant (`chain-conn_to_processus_simple.docx`) n'est pas
commité** — il embarque le vrai `layoutDef` `process1` de Microsoft, même règle que
`handmade_samples/` et `real-diagram*/` (voir `.gitignore`) : référence de recherche locale
uniquement.
