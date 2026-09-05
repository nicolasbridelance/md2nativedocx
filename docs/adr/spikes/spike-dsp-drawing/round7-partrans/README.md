# Round 7 — points de contenu `parTrans`/`sibTrans` manquants

Round 6 (élément/attributs manquants sur `dgm:shape`) a aussi échoué. Nouvelle comparaison, cette
fois sur la structure complète du `data1.xml` réel (pas juste le point `doc`) :

Chaque connexion parent→enfant du fichier réel porte des attributs `parTransId`/`sibTransId`
pointant vers des points de contenu dédiés (`type="parTrans"`/`type="sibTrans"`) dans `dgm:ptLst` —
par exemple `<dgm:cxn srcId="{doc}" destId="{B}" ... parTransId="{X}" sibTransId="{Y}"/>` avec `{X}`/
`{Y}` chacun leur propre `<dgm:pt type="parTrans" cxnId="...">`/`<dgm:pt type="sibTrans" cxnId="...">`
ailleurs dans `ptLst`. Notre `data.xml` généré n'a **ni ces points ni ces attributs** — chaque
connexion parent-enfant est un simple tuple `srcId`/`destId`/`srcOrd`/`destOrd`.

Run avec `node build-round7.mjs` → `cycle-round7-graft.docx` : cumule les correctifs des rounds 4
et 6 (toujours appliqués à `layout1.xml`) + ajoute les points `parTrans`/`sibTrans` et les
attributs `parTransId`/`sibTransId` à `data.xml` — **sans** ajouter de nouveaux points de
présentation pour eux, puisque notre `layoutDef` n'a aucun `forEach` sur `ptType="sibTrans"` (pas
de rendu de connecteur, limite déjà documentée séparément). Ça isole : le modèle de contenu
lui-même exige-t-il ces points (même non présentés), ou seulement leur présentation visuelle
compte-t-elle ?

- **S'ouvre** → cause trouvée, cumulée avec les rounds 4+6.
- **Échoue encore** → il reste au moins une différence structurelle de plus à trouver — la piste
  suivante la plus probable serait de tester `dgm:presLayoutVars` (vu sur certains points de
  présentation réels, absent des nôtres) ou de repartir du fichier réel en le simplifiant
  progressivement vers notre propre structure plutôt que de continuer à deviner des ajouts.
