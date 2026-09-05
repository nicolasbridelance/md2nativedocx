# Round 5 — un seul changement : l'URN du layout

Rounds 1 (`dsp:drawing`) et 4 (`presOf`/`constrLst`/`ruleLst`) infirmés — ajouter l'un ou l'autre à
notre propre contenu n'a pas suffi. Round 3 a déjà isolé le problème à `data.xml`/`layout.xml`.

Ce round teste la variable la plus évidente qu'on n'avait pas encore isolée seule : le fichier réel
`handmade_samples/cycle-simple.docx`, **absolument inchangé sauf un seul attribut** — l'URN qui fait
qu'un `layoutDef` est "le nôtre" plutôt que celui de Word : `uniqueId`/`loTypeId`, changé de
`urn:microsoft.com/office/officeart/2005/8/layout/cycle2` vers
`urn:md2nativedocx/smartart-layout/cycle1` (notre convention, décision de licence ADR 0004 — pas
question de redistribuer l'algorithme propriétaire de Word). Tout le reste — chaque élément, chaque
attribut, `colors1.xml`/`quickStyle1.xml`/`drawing1.xml`, `document.xml` — reste strictement ce
qu'un vrai Word a écrit.

Run avec `node build-round5.mjs` → `cycle-urn-only.docx`.

- **S'ouvre** → l'URN elle-même n'a aucune importance pour Word ; la vraie cause est ailleurs dans
  les différences structurelles bien plus larges entre notre `layoutDef` et celui de Word
  (`dgm:choose`/`dgm:if` conditionnels, `dgm:varLst`, l'attribut `r:blip=""` sur les formes...).
- **Échoue** → Word maintient une liste fermée d'URN de layouts reconnus et refuse tout le reste,
  quelle que soit la validité structurelle du contenu — une limite dure, probablement infranchissable
  pour un `layoutDef` auto-écrit, bien plus grave que "il manque un élément quelque part".
