# ADR 0004 — Faisabilité `mmd2smartart` : spike Phase 0 (Spike 1)

- **Statut :** **Accepté — compatibilité Word ET LibreOffice atteinte avec un algorithme 100 %
  personnalisé (Round 5), sans plafond de profondeur et sans redistribuer aucun contenu Microsoft.**
  Le mécanisme d'injection ZIP est validé dans Word réel (v2, v4). Le modèle de données minimal
  envisagé en §4 (doc/plain/parTrans/sibTrans/cxn, sans miroir `pres`) reste invalidé pour le vrai
  `hierarchy1` de Word (rejet catégorique, v3/v5) — mais le mainteneur a demandé de pousser plus
  loin plutôt que d'accepter la limite LibreOffice : **Round 5 montre que la même technique de
  miroir `pres` (recette entièrement caractérisée en Round 4) s'applique à un algorithme
  entièrement personnalisé**, et débloque LibreOffice exactement comme pour le vrai `hierarchy1` —
  la limite n'a jamais été "algorithme personnalisé interdit", mais "quelles parties sont
  présentes" (miroir `pres`, `colors`, `quickStyle`). Un `colorsDef` **entièrement inventé par
  nous** (aucun contenu Microsoft) suffit — confirmé empiriquement. `quickStyle` reste
  nécessaire ; sa version auto-écrite n'a pas encore été testée directement mais suit le même
  motif. **Conséquence** : un générateur basé sur cette recette a une profondeur illimitée (pas de
  plafond 4, qui était spécifique à l'algorithme `hierarchy1` de Word lui-même) et zéro risque de
  licence. Voir "Round 5" pour la recette complète et "Décision" pour la recommandation à jour.
- **Date :** 2026-09-02
- **Contexte :** `docs/specs/FUTURE_mmd2smartart_SPEC.md` §7, Spike 1 ("faisabilité brute").

## Contexte

`docs/specs/FUTURE_mmd2smartart_SPEC.md` propose un traducteur alternatif ciblant le SmartArt natif de Word
pour les topologies de flowchart "sages" (chaîne/arbre/cycle), en complément du pipeline
`wpg:wgp` existant. La spec elle-même appelle explicitement à un spike de faisabilité brute avant
tout investissement dans le classifieur et les générateurs, précisément pour éviter d'investir
dans du code qui échouerait à l'ouverture dans un vrai Word.

## Spike réalisé

`docs/adr/spikes/spike-smartart/` — `.docx` minimal avec un `hierarchy1`-shaped à 2 niveaux
(racine + 2 enfants), parties `data`+`layout` uniquement (conforme à la décision MVP §3 : pas de
`colors`/`quickStyle`), assemblé par zip surgery isolée (`build-spike.mjs`, zéro dépendance,
`execFileSync` en tableau d'arguments — cette manipulation ZIP est une exploration ponctuelle,
distincte de `packages/cli/src/postprocess.mjs` en production).

### Résultats structurels — positifs

- ZIP valide ; toutes les parties XML bien formées (parseur XXE-safe, règle n°5) — a d'ailleurs
  détecté et fait corriger deux `--` illégaux dans des commentaires XML avant même le rendu.
- **Vérification programmatique de la classe de bug `mc:Ignorable`** (celle qui a corrompu
  `demo.docx` en vrai Word le 2026-09-02, cf. TODO.md) : aucun attribut `mc:Ignorable` n'apparaît
  nulle part dans le paquet produit — rien à quoi cette classe de bug précise pourrait s'accrocher
  ici. Vérifié part par part, pas seulement visuellement.
- 0 relation externe (règle n°3) ; tous les préfixes de namespace utilisés (`dgm`, `a`, `r`, `wp`)
  sont effectivement déclarés en portée, vérifié par le script avant écriture.
- Détail correctement géré : le `relId` de `dsp:dataModelExt` (mécanisme non documenté dans la
  spec §3, découvert en cours de spike — voir plus bas) est résolu contre les relations propres à
  `data1.xml` (`word/diagrams/_rels/data1.xml.rels`), pas contre `document.xml.rels` — les ids de
  relation OOXML sont toujours scopés à la partie qui les référence.

### Résultat de rendu — négatif, pas seulement incertain

`soffice --headless --convert-to png/pdf` s'exécute proprement (pas de crash), mais **le
diagramme ne s'affiche pas** : inspection via script UNO (pas seulement lecture visuelle du PNG)
confirme que le frame graphique du diagramme est bien créé (nom et taille corrects, cohérents
avec `wp:extent`), mais son contenu rendu est un graphique **0×0**. Isolé sur un cas minimal
(1 boîte, aucun enfant, aucun connecteur) : même résultat blanc, avec ou sans la partie
`dsp:drawing` de secours (mécanisme "dernier layout réussi", découvert en cours de spike via les
specs ouvertes Microsoft MS-ODRAWXML — absent de `docs/specs/FUTURE_mmd2smartart_SPEC.md` §3, à noter pour
une future révision de la spec).

**Cause la plus probable, non confirmée** : `layout1.xml` de ce spike n'est pas une copie de
l'algorithme réel `hierarchy1` de Word (`hierChild1`/`hierRoot1`) — aucune source primaire
trouvée malgré recherche (Microsoft Learn, Open-XML-SDK GitHub, recherche web générale). Il a été
reconstruit à la main à partir du seul exemple complet et primaire trouvé (article MSDN Magazine
2007, vocabulaire `composite`/`tx`/`sp`), plausible au sens du schéma mais non authentique. Deux
hypothèses concurrentes, non départagées par ce spike :
1. Le contenu de l'algorithme reconstruit est simplement incorrect/incomplet (le plus probable,
   étant donné que le frame lui-même est correctement reconnu).
2. LibreOffice n'interprète génériquement aucun `dgm:layoutDef` personnalisé, quel qu'il soit, et
   n'exécute que les algorithmes intégrés reconnus par nom.

Départager ces deux hypothèses demanderait soit le code source du moteur `oox` de LibreOffice,
soit un véritable échantillon Word à layout personnalisé — aucun des deux disponible ici.

**Point notable** : aucune corruption/« contenu illisible » reproduite — le mode d'échec observé
est « rend un frame vide », pas « le fichier est rejeté ». C'est un échec différent (et sur un
plan, plus sournois : silencieux, sans signal utilisateur) de celui visé par les vérifications de
robustesse de ce spike, mais pas un problème négligeable pour autant.

## Confirmation en vrai Word (2026-09-02, post-spike)

Le mainteneur a ouvert `spike.docx` dans un vrai Word. **Même résultat que LibreOffice, en pire** :
le frame du diagramme s'affiche, vide, avec en plus un petit texte vertical illisible/mojibake
au centre (capture d'écran fournie) — absent du rendu LibreOffice, qui lui n'affichait qu'un
frame strictement vide. Aucune invite de réparation/« contenu illisible » (donc pas de régression
sur la classe de bug `mc:Ignorable` visée par ce spike).

**Ceci tranche l'hypothèse 2 en faveur de l'hypothèse 1** : ce n'est pas que LibreOffice (ou Word)
refuse d'exécuter tout `dgm:layoutDef` personnalisé par principe — les deux moteurs tentent bien
quelque chose (Word produit même un rendu, fût-il incorrect), ce qui confirme que le problème est
localisé au contenu de `layout1.xml`/`drawing1.xml` reconstruits à la main dans ce spike, pas à une
limitation catégorique d'un des deux moteurs de rendu. Le texte mojibake dans Word est probablement
un artefact de la partie `dsp:drawing` (contenu de secours), dont le placement/format a été
deviné par convention (voir "layout1.xml provenance" plus haut) plutôt que confirmé contre un
échantillon réel.

**Conséquence directe** : la voie de sortie identifiée ci-dessous (extraire un `layout1.xml`
authentique d'un vrai `.docx` Word) devient la voie à suivre, pas une option parmi d'autres — la
piste "corriger l'algorithme à la main par itération" est nettement moins prometteuse maintenant
qu'on sait que même Word peine à interpréter la reconstruction actuelle.

## v2/v3/v4 — round 2, avec un vrai SmartArt fourni par le mainteneur

Le mainteneur a créé un SmartArt « Hiérarchie » réel dans Word (6 nœuds, 3 niveaux) et fourni le
`.docx`. Trois builds de suivi (même mécanique de chirurgie ZIP, mêmes vérifications
structurelles — toutes passées à chaque fois) :

- **v2** — greffe les 5 parties réelles (`data1`/`layout1`/`colors1`/`quickStyle1`/`drawing1`)
  telles quelles sur notre propre `base.docx`, avec une correction découverte à cette occasion :
  `dsp:dataModelExt` se résout contre `document.xml.rels`, pas contre un fichier `.rels` scopé à
  la partie `data1.xml` (v1 avait supposé l'inverse). **Rendu LibreOffice : arbre à 3 niveaux
  parfaitement correct et stylé**, identique au document source, greffé sur un hôte qui n'a jamais
  vu Word. **Ceci prouve que le mécanisme de chirurgie ZIP est solide** — la question ouverte de
  v1 qui ne concernait que l'authenticité de l'algorithme est close.
- **v3** — la cible MVP réelle de la §3 : `data1.xml` fait main (topologie différente, 1 racine +
  3 enfants, **zéro point `type="pres"`**) + `layout1.xml` réel, sans `colors`/`quickStyle`/
  `drawing`. **Rendu totalement blanc** — même échec que v1. Isole que les ~40 points `pres`
  présents dans le `data1.xml` réel (arbre de présentation résolu) sont porteurs de sens : le
  moteur ne semble pas les dériver seul depuis la structure logique parent/enfant/transition.
- **v4** — `data1.xml` réel intact (points `pres` conservés) + `layout1.xml` réel, mais sans
  `colors`/`quickStyle`/`drawing`. **Rendu : texte seul, aucune forme/boîte** — chaque libellé
  apparaît à la bonne position hiérarchique (donc l'algorithme calcule bien les positions depuis
  data+layout seuls), mais aucune géométrie de forme n'est dessinée autour.

**Conséquence directe sur la spec** : la simplification MVP §3 ("juste data+layout, 2 parties")
ne tient pas telle quelle, au moins sous LibreOffice — omettre `colors`/`quickStyle`/`drawing`
coûte la géométrie des formes elle-même, pas seulement le style. Plus significatif pour l'estimation
d'effort : un générateur ne peut pas se contenter d'émettre `doc`+`plain`+`parTrans`+`sibTrans`+
`cxn` comme le modèle de données implicite de la §4 le suggérait — il doit aussi produire le
miroir de nœuds `pres`, dont la généralisation à un nombre arbitraire d'enfants n'a **pas encore
été testée** (prochaine expérience naturelle : auteurer un arbre `pres` pour une arité différente
de l'exemple réel 2/2/1, non tentée ici faute de budget restant sur cette manche de spike).

**Reste à confirmer par un humain dans un vrai Word** : est-ce que v2 se rend à l'identique dans
un vrai Word (signal le plus positif à ce stade) ; est-ce que le comportement "texte seul, sans
formes" de v4 est spécifique à LibreOffice ou se reproduit aussi dans Word.

## Confirmation finale en vrai Word (2026-09-02, mainteneur)

- **v2 s'ouvre et se rend correctement dans Word** — identique à LibreOffice. Confirme le
  mécanisme de chirurgie ZIP dans la cible réelle.
- **v4 s'ouvre et se rend correctement dans Word**, avec les formes complètes (contrairement à
  LibreOffice qui n'affichait que du texte). **Isole le comportement dégradé de v4 sous
  LibreOffice comme une limite de son importateur SmartArt**, pas une exigence OOXML/Word réelle
  — instance concrète des « ~25 bugs connus » déjà signalés par les mainteneurs LibreOffice (spec
  §10.4). La simplification MVP §3 (data+layout seuls) est donc validée dans la cible réelle.
- **v3 ne s'ouvre pas du tout dans Word** — rejet pur ("Word a rencontré une erreur"), sans invite
  de récupération. Échec catégoriquement plus grave que le rendu blanc observé sous LibreOffice
  pour ce même fichier.

**Limite méthodologique à noter** : v3 fait varier deux choses à la fois par rapport à v4 (absence
des nœuds `pres` *et* `modelId` en entiers simples au lieu de GUID) — ce test ne permet donc pas
d'isoler laquelle des deux cause le rejet. Tableau de synthèse complet dans
`docs/adr/spikes/spike-smartart/spike.md` ("Conclusion pour cette manche de spike").

## Round 3 — le motif `pres` se généralise, avec une limite de profondeur dure

Le mainteneur a fourni deux échantillons Word réels supplémentaires : une chaîne à 4 niveaux sans
branchement, et une racine à 4 enfants sans profondeur. Comparés au premier échantillon (2/2/1),
le regroupement des points `pres` par `presAssocID`+`presName` révèle un gabarit parfaitement
régulier :

- Le nœud `doc` porte toujours exactement 1 point `pres` fixe : `hierChild1`.
- Chaque nœud de contenu à la profondeur *d* (racine = 1) porte toujours le même bundle de 5
  points, nommé uniquement par la profondeur, jamais par l'identité ou la position dans la
  fratrie : `hierRoot{d}`, `composite{d}`, `background{d}`, `text{d}`, `hierChild{d+1}` —
  confirmé identique sur les 4 enfants de l'échantillon "plat" et sur la progression 1→2→3→4 de
  l'échantillon "chaîne".
- Chaque arête reliant un parent de profondeur *d* à un enfant de profondeur *d*+1 porte 1 point
  de transition nommé par la profondeur de l'arête (`Name10` pour 1→2, `Name17` pour 2→3, `Name23`
  pour 3→4) — identique sur les 4 arêtes de l'échantillon "plat" malgré 4 fratries différentes.

**Limite dure découverte au passage** : `real-diagram1/layout1.xml` (l'algorithme authentique) ne
définit que 24 `layoutNode` nommés au total, s'arrêtant à `hierChild5`/`hierRoot4` — **`hierarchy1`
est plafonné à 4 niveaux de profondeur dans l'implémentation Word elle-même**, indépendamment de
tout ce que ce projet pourrait générer correctement. La largeur (nombre d'enfants par niveau) n'a
aucune limite équivalente observée.

Détail complet, y compris la méthode d'extraction, dans
`docs/adr/spikes/spike-smartart/spike.md` ("Round 3").

## Décision

**Le générateur (`docs/specs/FUTURE_mmd2smartart_SPEC.md` §7, étape 4) doit être construit autour d'un
algorithme `dgm:layoutDef` original (pas le `hierarchy1` de Word), accompagné d'un miroir `pres`
et d'un `colorsDef`/`styleDef` générés par nos soins — la recette complète du Round 5.** C'est un
changement de direction par rapport à la conclusion précédente de cet ADR (qui visait le vrai
`hierarchy1`, plafonné à 4 niveaux) : le mainteneur a explicitement demandé de pousser la
compatibilité LibreOffice plutôt que d'accepter la limite, et Round 5 montre que c'est possible
sans aucun compromis de licence ni de profondeur.

**Ce qui est débloqué et peut avancer** :
- Chirurgie ZIP validée de bout en bout dans Word réel (v2, v4, et tous les builds `custom-*` du
  Round 5) — aucun obstacle technique restant pour l'étape 5 (dispatch).
- **Compatibilité Word + LibreOffice avec un algorithme 100 % personnalisé** (Round 5) : plus
  besoin du vrai `hierarchy1`, donc plus de plafond de profondeur de 4 — la profondeur maximale
  devient un choix de conception du générateur (combien de niveaux explicites écrire dans
  `layoutDef`, cf. limite structurelle du format déjà documentée en Round 5 : pas de récursion
  native, chaque profondeur doit être une définition explicite, mais rien n'empêche d'en écrire
  10 ou 20 au lieu de 4).
- Gabarit `pres` par profondeur entièrement caractérisé (Round 4), et confirmé réutilisable tel
  quel pour un algorithme personnalisé (Round 5) — pas seulement pour le vrai `hierarchy1`.
- `colorsDef` confirmé libre de tout contenu Microsoft (Round 5, `custom-chain1-ownercolors.docx`).

**Confirmation complémentaire (2026-09-03)** : un `styleDef`/`quickStyle` entièrement auto-écrit
(`custom-algo/quickstyle-chain1.xml`, vocabulaire `a:lnRef`/`a:fillRef`/`a:effectRef`/`a:fontRef`
déjà utilisé par ailleurs dans `ooxml-translator.ts`) fonctionne exactement comme celui de Word —
`custom-chain1-ownerstyle.docx` rend correctement sans aucun fichier Microsoft. **La recette est
donc entièrement close et validée : les 4 parties (algorithme, données+miroir `pres`, `colorsDef`,
`styleDef`) peuvent toutes être auto-écrites.**

**Ce qui reste à faire avant de chiffrer précisément l'étape 4** :
1. Écrire un algorithme `layoutDef` générique gérant une profondeur/largeur arbitraires (le
   `layout-chain1.xml`/`layout-tree1.xml` de ce spike sont des preuves de concept à arité fixe ou
   en cours de correction géométrique — `tree1` n'a pas encore un rendu de formes correct, seul le
   texte apparaît, cf. Round 5 note sur `layout-tree1.xml`) ; extraire/formaliser la règle de
   génération du miroir `pres` pour un algorithme personnalisé arbitraire (Round 5 ne l'a fait que
   pour un cas `chain` à 3 éléments).
2. Décider de la profondeur maximale à supporter en pratique (compromis lisibilité/complexité XML,
   pas une limite technique dure comme l'était le plafond 4 de `hierarchy1`).
3. `docs/specs/FUTURE_mmd2smartart_SPEC.md` §3, §4 et §7 méritent une révision explicite pour refléter tout ce
   changement de direction (algorithme personnalisé plutôt que `hierarchy1`, miroir `pres`
   généralisé, `colorsDef`/`styleDef` personnalisés) — cette ADR ne modifie pas la spec elle-même,
   à faire séparément si le chantier est poursuivi.

## Conséquences

- Aucune modification de `packages/` — ce spike reste isolé dans `docs/adr/spikes/`.
- Le chantier SmartArt passe du statut "proposition, risque dominant non identifié" à "proposition,
  risque dominant résolu" : compatibilité multi-moteur ET absence de risque de licence obtenues
  simultanément, ce qui n'était pas acquis après le Round 3 (qui acceptait encore le plafond de
  profondeur 4 de `hierarchy1` comme une contrainte dure). La spec elle-même anticipait ce
  garde-fou (§7 : "spike de faisabilité brute... avant d'investir dans le générateur") — rempli,
  avec un résultat plus favorable que ce que les rounds précédents laissaient présager.

## Alternatives rejetées

- Copier un `layout1.xml` trouvé en ligne sans confirmer sa provenance : rejeté — le risque
  d'introduire une algorithme invalide ou mal attribué dans un futur générateur de production
  dépasse le gain de temps, pour une simple spike de faisabilité.
