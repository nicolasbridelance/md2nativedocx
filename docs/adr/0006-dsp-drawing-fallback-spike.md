# ADR 0006 — Spike puis correctif réel : la corruption Word de SmartArt (Milestone 0)

- **Statut :** **Cause réelle trouvée et corrigée (round 9, 2026-09-05).** Rounds 1-7 (résumé plus
  bas) ont chacun deviné puis infirmé une hypothèse structurelle par comparaison manuelle. Round 9
  a utilisé le vrai validateur Microsoft (Open XML SDK, `OpenXmlValidator` — même schéma que Word)
  au lieu de continuer à deviner : `modelId`/`srcId`/`destId` doivent être un entier non signé ou
  un GUID (`ST_ModelId`, ECMA-376 §21.4), jamais une chaîne libre. Nos trois générateurs
  (`chain`/`tree`/`cycle`) utilisaient des ids comme `"p-root"`/`"c1"`/`"pp3b"` pour les points de
  présentation et les connexions — 34 violations de schéma détectées immédiatement par le
  validateur, corrigées dans les trois modules (ids remplacés par des entiers séquentiels).
  **Corrigé dans `packages/core`, tests mis à jour, en attente de confirmation Word réelle finale**
  (fichiers remis au mainteneur).
- **Date :** 2026-09-05
- **Décideur :** Nicolas Bridelance (mainteneur) — 7 rounds de tests réels au total, le dernier en
  attente de confirmation.

## Contexte

TODO.md ("Incident SmartArt 'cycle' cassé en Word réel", 2026-09-03) documente une hypothèse non
tranchée : Word refuserait d'ouvrir un `dgm:dataModel` dont le `layoutDef` est un algorithme
personnalisé (comme les trois générateurs `chain`/`tree`/`cycle` de ce projet en émettent toujours)
faute d'un filet de sécurité `dsp:drawing` pré-rendu — la 5e partie qu'un vrai Word ajoute toujours
(`handmade_samples/cycle-simple.docx`) et que nos générateurs n'émettent jamais. C'est le
prérequis bloquant de tout le plan d'élargissement de la couverture SmartArt (voir le plan de
session, Milestone 1 dépend de ce spike).

## Spike réalisé

`docs/adr/spikes/spike-dsp-drawing/` — voir `spike.md` pour le détail complet. Résumé :

1. Reproduit exactement le cas de l'incident (cycle à 3 nœuds) via la vraie CLI de production
   (aucune modification du pipeline).
2. Patché à la main une 5e partie (`drawing1.xml` + relation + content-type + référence
   `dsp:dataModelExt`) dans `data1.xml`, structurellement identique à ce qu'un vrai Word émet.

## Résultat 1 — la règle de câblage `dsp:sp/@modelId` est confirmée précisément

En inspectant directement `handmade_samples/cycle-simple.docx` (au-delà de ce que TODO.md
documentait déjà) : chaque `dsp:sp/@modelId` référence un point de **présentation**
(`dgm:pt/@type="pres"`) de `data1.xml`, jamais un point de contenu — confirmé par intersection des
deux ensembles d'ids (6/6 des ids de `drawing1.xml` correspondent à des points `pres`, 0 à des
points de contenu). Nos générateurs ont déjà l'équivalent exact (`p-main{N}`, le point portant
`presStyleLbl="node1"`) — réutilisable tel quel, format de chaîne inchangé (confirme à nouveau
ADR 0004 "Round 3" : le format du `modelId` n'a pas d'effet sur le rendu, seule la référence à un
point réellement existant compte).

## Résultat 2 — comportement LibreOffice inattendu, signal positif pour l'hypothèse

Sans `dsp:drawing` : LibreOffice exécute l'algorithme `cycle` en direct, rend 3 rectangles
arrondis. **Avec** le `dsp:drawing` ajouté : LibreOffice affiche **le rendu pré-calculé** (3
ellipses positionnées exactement où le script les a placées) **au lieu de** ré-exécuter
l'algorithme — alors que l'algorithme fonctionnait déjà correctement sans lui. Ce n'est pas le
comportement attendu d'une extension "ignorable" au sens `mc:Ignorable` ; ça confirme plutôt que
les moteurs SmartArt traitent `dsp:drawing` comme un cache faisant autorité, pas comme un filet de
secours pour cas d'échec seulement — cohérent avec le comportement visible d'un vrai Word (une
image quasi statique jusqu'à modification de texte ou reformatage explicite). Renforce
l'hypothèse : l'absence de ce cache, pas seulement un algorithme non reconnu, pourrait
suffire à expliquer le refus d'ouverture.

## Ce que ce spike NE prouve PAS

Rien ici ne confirme que Word **ouvre** `cycle-with-drawing.docx` — ce sandbox n'a que
LibreOffice. C'est la seule question que ce spike ne peut pas trancher lui-même.

## Décision

**Hypothèse `dsp:drawing` infirmée (round 1).** Résultat du test réel : même message d'erreur
qu'à l'incident d'origine.

**Round 2 — localisé au contenu du diagramme, pas à l'enveloppe du document.** `cycle-graft.docx`
(`docs/adr/spikes/spike-dsp-drawing/round2-graft/`) greffe nos 5 parties diagramme dans une copie
du vrai fichier Word (`handmade_samples/cycle-simple.docx`), tout le reste (document.xml, rels,
styles, settings — tout ce qu'un vrai Word a lui-même écrit) resté intact. **Échoue avec la même
erreur.** Ça prouve que le problème n'est ni dans `postProcessDocx`/`injectSmartArtParts`/le
`reference.docx` généré, ni dans quoi que ce soit que notre pipeline CLI assemble autour du
diagramme — il est **forcément** dans le contenu même de nos parties diagramme
(`data`/`layout`/`colors`/`quickStyle`/`drawing`).

## Suite — Round 3, isolation en cours (2026-09-05)

`data.xml`/`layout.xml` sont couplés entre eux (les points de présentation de `data.xml`
référencent les noms de `layoutNode` de `layout.xml`) — pas testables séparément l'un de l'autre.
`colors.xml`/`quickStyle.xml` ne sont couplés à `data.xml` que par un nom de style partagé
(`presStyleLbl="node1"`, qui coïncide avec notre propre convention) — eux sont testables
indépendamment. Deux tests construits (`docs/adr/spikes/spike-dsp-drawing/round3-isolate/`,
détail dans son propre `README.md`) :
- **`cycle-isolate-a.docx`** : vrai fichier Word, mais **notre** `data1.xml` + `layout1.xml`
  (`colors`/`quickStyle` réels conservés, pas de partie `drawing`). S'ouvre → `data`/`layout` pas
  en cause. Échoue → `layout1.xml` (le `dgm:layoutDef` personnalisé, suspect n°1 depuis le début)
  ou `data1.xml` est la cause.
- **`cycle-isolate-b.docx`** : vrai fichier Word, mais **nos** `colors1.xml` + `quickStyle1.xml`
  (`data`/`layout`/`drawing` réels conservés). Biais connu et assumé : le vrai `data1.xml`
  référence un `presStyleLbl="sibTrans2D1"` (les flèches de connexion) que nos `colors`/`quickStyle`
  ne définissent pas — un échec ici ne serait pas une preuve définitive contre notre format
  `colors`/`quickStyle`, seulement contre cette référence de style spécifique.

**Résultat (2026-09-05) : `cycle-isolate-a.docx` échoue, `cycle-isolate-b.docx` s'ouvre.** Tranché
sans ambiguïté : le problème est dans `data1.xml`/`layout1.xml`, pas dans `colors`/`quickStyle`
(le biais connu ci-dessus ne joue donc aucun rôle — `colors`/`quickStyle` sont innocentés
complètement, pas seulement "probablement").

## Round 4 — nouvelle hypothèse concrète, en test (2026-09-05)

Comparaison ligne à ligne de notre `CYCLE_LAYOUT_XML` contre le `layout1.xml` réel : **chaque**
`dgm:layoutNode` du fichier réel inclut `presOf`, `constrLst` et `ruleLst`, même vides
(`<dgm:presOf axis="self"/>`, `<dgm:ruleLst/>`) — y compris sur des nœuds structurels comme le
connecteur `sibTrans`, qui ne présente pourtant rien lui-même. Nos trois générateurs (`chain.ts`/
`tree.ts`/`cycle.ts`, même motif d'écriture partout, vérifié) **omettent entièrement** ces
éléments sur tout `layoutNode` sauf la seule feuille qui présente du texte ("Main"). Si le schéma
`CT_LayoutNode` les rend obligatoires (contenu vide toléré, mais l'élément doit exister), c'est
exactement le genre d'écart qu'un validateur XML strict (Word) rejette et qu'un parseur tolérant
(LibreOffice) ignore silencieusement — cohérent avec toutes les observations des rounds 1 à 3.

Deux fichiers construits (`docs/adr/spikes/spike-dsp-drawing/round4-schema-fix/`, détail dans son
`README.md`) : `cycle-round4-graft.docx` (patch minimal greffé dans le vrai fichier, isolation la
plus propre) et `cycle-round4-standalone.docx` (diagramme complet produit par notre propre
pipeline CLI, seul le `layoutDef` patché).

**Résultat (2026-09-05) : les deux échouent, même erreur.** Hypothèse infirmée : les éléments
`presOf`/`constrLst`/`ruleLst` manquants n'étaient pas (ou pas seuls) la cause.

## Round 5 — isoler l'URN elle-même (2026-09-05)

Deux hypothèses structurelles infirmées (rounds 1 et 4) sans qu'aucun round n'ait encore testé la
variable la plus évidente **seule** : à chaque fois, on a mélangé "notre contenu" (data+layout
entiers) avec le fichier réel, jamais changé une seule chose à la fois dans le fichier réel
lui-même. Round 5 : `handmade_samples/cycle-simple.docx`, **inchangé sauf un seul attribut** —
l'URN (`uniqueId`/`loTypeId`) qui distingue notre `layoutDef` de celui de Word
(`urn:microsoft.com/.../cycle2` → `urn:md2nativedocx/smartart-layout/cycle1`, notre convention,
décision de licence ADR 0004). Tout le reste (chaque élément, chaque attribut, `colors`/
`quickStyle`/`drawing`/`document.xml`) reste strictement ce qu'un vrai Word a écrit.

`docs/adr/spikes/spike-dsp-drawing/round5-urn-only/` (`build-round5.mjs` → `cycle-urn-only.docx`),
détail et interprétation des deux issues possibles dans son `README.md`. Remis au mainteneur.

**Résultat (2026-09-05) : `cycle-urn-only.docx` s'ouvre normalement.** L'URN elle-même n'a aucune
importance pour Word — pas de liste fermée de layouts reconnus. La cause reste entièrement dans le
contenu structurel de `layout1.xml`/`data1.xml`.

## Round 6 — éléments/attributs manquants sur `dgm:shape` (2026-09-05)

Nouvelle comparaison structurelle, cette fois sur `dgm:shape` (pas `dgm:layoutNode` comme au
round 4) : les 4 `dgm:shape` du fichier réel ont toutes (1) un enfant `<dgm:adjLst/>` — les nôtres
sont toujours auto-fermantes, sans aucun enfant — et (2) une déclaration `xmlns:r=".../
relationships"` + un attribut `r:blip=""` vide, absents chez nous. Même famille de problème que
round 4 (élément/attribut requis par le schéma, contenu vide toléré mais absence non tolérée par
Word), mais sur un type complexe différent (`CT_Shape`, pas `CT_LayoutNode`).

`docs/adr/spikes/spike-dsp-drawing/round6-shape-adjlst/` (`build-round6.mjs` →
`cycle-round6-graft.docx`, cumule le correctif du round 4 toujours appliqué + ce nouveau
correctif). Remis au mainteneur.

**Résultat (2026-09-05) : échoue, même erreur.** Hypothèse infirmée (seule ou cumulée avec le
round 4) : ni `presOf`/`constrLst`/`ruleLst`, ni `adjLst`/`r:blip`, ne suffisent.

## Round 7 — points de contenu `parTrans`/`sibTrans` manquants (2026-09-05)

Dump complet du `data1.xml` réel (pas juste le point `doc` déjà vu) : chaque connexion
parent-enfant porte des attributs `parTransId`/`sibTransId` référençant des points de contenu
dédiés (`type="parTrans"`/`type="sibTrans"`) dans `dgm:ptLst` — notre modèle de données n'a ni ces
points ni ces attributs, chaque connexion étant un simple tuple `srcId`/`destId`/`srcOrd`/`destOrd`.

`docs/adr/spikes/spike-dsp-drawing/round7-partrans/` (`build-round7.mjs` →
`cycle-round7-graft.docx`, cumule les correctifs des rounds 4+6 sur `layout.xml` + ajoute les
points `parTrans`/`sibTrans` et attributs correspondants à `data.xml`, sans nouveaux points de
présentation pour eux — notre `layoutDef` n'a pas de `forEach` sur `ptType="sibTrans"`). Remis au
mainteneur.

**Résultat (2026-09-05) : échoue encore, même erreur.** Trois hypothèses structurelles devinées par
comparaison manuelle (rounds 1, 4, 6, 7 — en comptant `dsp:drawing`), toutes infirmées. À ce stade,
deviner élément par élément avait un mauvais rendement — voir round 9 pour le changement de
méthode qui a effectivement trouvé la cause.

## Round 9 — le vrai validateur Open XML SDK, pas une comparaison manuelle de plus (2026-09-05)

Le mainteneur a posé la question qui a débloqué le chantier : Microsoft (ou un tiers) ne
distribue-t-il pas un validateur avec le détail précis de l'erreur de schéma ? Oui —
`DocumentFormat.OpenXml.Validation.OpenXmlValidator` (SDK Open XML, .NET), qui valide contre le
**même schéma que Word** et donne le chemin XPath + la description de chaque violation. `.NET`
était déjà installé dans ce sandbox. Outil et détail complet :
`docs/adr/spikes/spike-dsp-drawing/round9-modelid-fix/`.

Vérifié d'abord sur `handmade_samples/cycle-simple.docx` (0 erreur, confirmant que l'outil valide
correctement) avant de l'utiliser sur notre propre sortie — **53 erreurs**, dont un groupe massif
et homogène : `modelId`/`srcId`/`destId` n'est pas une chaîne libre, c'est un type union
(`ST_ModelId`, ECMA-376 §21.4) qui n'accepte qu'un **entier non signé ou un GUID**. Nos points de
contenu (`"0"`, `"1"`, `"2"`...) passaient déjà ; tous nos points de présentation et connexions
(`"p-root"`, `"p-composite1"`, `"c1"`, `"po0"`, `"pp1a"`...) échouaient — 34 des 53 erreurs, le
reste (17) étant du bruit préexistant dans `styles.xml`/`numbering.xml`/`settings.xml`, présent
même dans un export **sans** SmartArt (donc déjà toléré par Word, sans rapport avec cet incident —
confirmé en validant aussi un export non-SmartArt).

**Correctif** : `packages/core/src/smartart/{chain,tree,cycle}.ts` — tous les `modelId` de points
de présentation et de connexions remplacés par des entiers séquentiels (compteur partagé,
continuant après les ids de points de contenu déjà numériques), même motif corrigé identiquement
dans les trois générateurs.

**Vérification** : `dotnet run` sur `cycle`/`chain`/`tree` (tailles 3 et 5-6 nœuds) → 0 erreur liée
au diagramme dans tous les cas. Rendu LibreOffice inchangé. 2 tests `packages/core` mis à jour (ils
vérifiaient littéralement la chaîne `"p-root"`, désormais une vérification structurelle). 449 tests
du monorepo verts, lint/typecheck propres, `test:visual` 35/35 à 0,000 % de diff. Fichiers
`cycle-fixed.docx`/`chain-fixed.docx`/`tree-fixed.docx` remis au mainteneur pour la confirmation
Word réelle finale.

**Note pour plus tard, sans lien direct avec ce bug** : ADR 0004 "Round 3" avait conclu "le format
du `modelId` n'a pas d'effet sur le rendu" — vrai, mais seulement vérifié sous LibreOffice, qui ne
valide contre aucun schéma. Toute conclusion de ce type tirée uniquement d'un test LibreOffice
devrait être qualifiée comme telle dès le départ, pas présentée comme une confirmation générale.

## Conséquences

- **Le validateur Open XML SDK (`docs/adr/spikes/spike-dsp-drawing/round9-modelid-fix/`) est
  l'outil à utiliser en premier pour tout futur problème "Word refuse d'ouvrir le fichier"** —
  avant toute comparaison manuelle ou hypothèse devinée. Aurait résolu cet incident en un seul
  round au lieu de sept.
- Le script `build-spike.mjs` (rounds 0-8) reste dans l'historique de ce spike comme trace de la
  méthode par élimination qui a précédé le round 9, mais n'est plus la voie à suivre pour du
  diagnostic futur.
- Correctif appliqué en code de production (`packages/core`), pas seulement dans des dossiers
  spike — voir TODO.md pour le suivi.
