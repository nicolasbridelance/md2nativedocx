# Round 3 — isoler quelle partie de notre contenu bloque Word

Round 2 a prouvé que le problème est dans le **contenu** de nos parties diagramme (pas dans
l'enveloppe du document produite par notre pipeline). Ce round isole laquelle.

`data.xml`/`layout.xml` sont couplés entre eux (les points de présentation de `data.xml`
référencent les noms de `layoutNode` de `layout.xml` par `presName`) — impossible de les tester
séparément l'un de l'autre. `colors.xml`/`quickStyle.xml` ne sont couplés à `data.xml` que par un
**nom** de style partagé (`presStyleLbl="node1"`), qui coïncide avec notre propre convention — eux
peuvent être testés indépendamment.

- **`cycle-isolate-a.docx`** (`build-round3.mjs`) : fichier Word réel, mais **notre** `data1.xml` +
  `layout1.xml`, `colors1.xml`/`quickStyle1.xml` du vrai fichier conservés tels quels. Pas de
  partie `drawing` (retirée proprement — le `drawing1.xml` réel référence des GUID qui n'existent
  plus une fois `data1.xml` remplacé).
  - **S'ouvre** → notre `data`/`layout` ne sont pas le problème.
  - **Échoue** → notre `layout1.xml` (le `dgm:layoutDef` personnalisé, suspect n°1 depuis
    l'incident d'origine) ou `data1.xml` est la cause.
- **`cycle-isolate-b.docx`** (`build-round3b.mjs`) : fichier Word réel, mais **nos** `colors1.xml`
  + `quickStyle1.xml`, tout le reste (`data`/`layout`/`drawing`) conservé réel.
  - **Biais connu, assumé** : les points de connecteur du vrai `data1.xml` référencent
    `presStyleLbl="sibTrans2D1"`, absent de nos `colors`/`quickStyle` (on ne dessine pas les
    flèches de connexion du cycle — limite déjà documentée). Sous LibreOffice, ça dégrade
    proprement (flèches sans couleur, pas de plantage) — mais si ce test échoue en vrai Word, **ce
    n'est pas une preuve définitive** que notre format `colors`/`quickStyle` est cassé, ça peut
    être seulement une référence de style non résolue.
  - **S'ouvre** → `colors`/`quickStyle` définitivement écartés comme suspects.

Vérifié sous LibreOffice (rendu correct dans les deux cas) avant envoi — comme toujours, ça ne
prouve rien sur Word lui-même, c'est le seul test qui compte ici.
