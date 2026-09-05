# Round 4 — nouvelle hypothèse : éléments requis manquants sur `dgm:layoutNode`

Round 3 a isolé le problème à notre `data.xml`/`layout.xml` (suspect n°1 depuis le début : le
`dgm:layoutDef` personnalisé). En comparant ligne à ligne notre `CYCLE_LAYOUT_XML` contre le
`layout1.xml` réel de `handmade_samples/cycle-simple.docx` :

**Chaque `dgm:layoutNode` du fichier réel inclut `presOf`, `constrLst` et `ruleLst` — même vides
(`<dgm:presOf axis="self"/>`, `<dgm:ruleLst/>`)** — y compris sur des nœuds "de structure" comme le
connecteur `sibTrans` qui ne présente rien lui-même. Nos trois générateurs (`chain.ts`/`tree.ts`/
`cycle.ts`, même motif d'écriture partout) **omettent entièrement** ces éléments sur tous les
`layoutNode` sauf la seule feuille qui présente du texte ("Main"). Si le schéma `CT_LayoutNode`
les rend obligatoires (contenu vide autorisé, mais l'élément doit être présent), c'est exactement
le genre d'écart qu'un validateur XML strict (Word) rejette et qu'un parseur tolérant
(LibreOffice) ignore silencieusement — cohérent avec toutes les observations jusqu'ici.

Run avec `node build-round4.mjs`. Deux fichiers, pour deux informations en un seul aller-retour :

- **`cycle-round4-graft.docx`** : notre `data`/`layout` **patchés** (ajout de `presOf`/`constrLst`/
  `ruleLst` sur les nœuds `root`/`composite`), greffés dans le vrai fichier Word (même méthode que
  round 3). Isolation la plus propre possible.
- **`cycle-round4-standalone.docx`** : un diagramme **complet produit par notre propre pipeline**
  (CLI, `reference.docx`, `colors`/`quickStyle` à nous), seul le `layoutDef` patché en place après
  coup. **Si celui-ci s'ouvre**, tout le plan `dsp:drawing`/Milestone 1 (un nouveau moteur de
  géométrie complet) devient inutile — ce trou de schéma était la vraie cause, plus petite que
  prévu.

Les deux vérifiés bien formés + rendus LibreOffice sans régression avant envoi.
