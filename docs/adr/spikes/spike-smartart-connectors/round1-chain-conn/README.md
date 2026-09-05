# Round 1 — connecteurs `chain` (`dgm:alg type="conn"`), en attente de confirmation Word réel

## Contexte

Après l'incident SmartArt (ADR 0006, `modelId` invalide) et le correctif `axis="self"` sur
`presOf`, le mainteneur a signalé deux limites déjà connues et volontaires de `chain`/`cycle`/
`tree` : pas de connecteur/flèche entre les boîtes, et un style plus plat que le SmartArt "vanilla"
de Word. Décision prise avec le mainteneur (2026-09-05) : traiter les connecteurs en premier
(mécanisme public du format, aucun risque de licence), le rapprochement stylistique ensuite.

## Ce qui a été fait

`packages/core/src/smartart/chain.ts` : le `layoutNode name="sibTrans"` (jusqu'ici un simple
espaceur `alg type="sp"`) utilise maintenant l'algorithme public `dgm:alg type="conn"`
(paramètres documentés par Microsoft, "Connector Algorithm",
learn.microsoft.com/en-us/previous-versions/office/developer/office-2007/dd439439 — jamais extraits
d'un fichier Word réel) : ligne 1D, du bord droit d'une boîte au bord gauche de la suivante, flèche
à l'arrivée. Les variantes TD/BT/RL adaptent automatiquement les points d'ancrage.

Le câblage données (point de contenu `type="sibTrans"`, son mirroir `type="pres"`, `presOf`,
`presParOf`, attribut `sibTransId` sur le `parOf` du nœud précédent) suit la **structure** observée
dans un échantillon Word réel déjà présent dans ce dépôt
(`docs/adr/spikes/spike-smartart/real-diagram-flat/data1.xml`, hiérarchie fournie par le
mainteneur) — uniquement la structure (dictée par le schéma ECMA-376 public), jamais son contenu
(`layoutDef`/`colorsDef`/`styleDef` de cet échantillon ne sont jamais lus par le générateur).

Nouveau `styleLbl` `sibTrans` dans `CHAIN_COLORS_XML`/`CHAIN_STYLE_XML` (100% original) : les
`styleLbl` existants (`node0`/`node1`) ont `lnRef idx="0"` (pas de ligne — correct pour un
rectangle rempli), ce qui aurait rendu la flèche invisible.

## Vérifications faites

- **Schéma (Open XML SDK)** : `chain-conn.docx` (ce dossier) — **0 erreur sous `/word/diagrams/*`**
  (17 erreurs préexistantes hors sujet, `styles.xml`/`numbering.xml`/`settings.xml`, déjà trackées
  séparément dans TODO.md).
- **Tests unitaires** : `packages/core/test/unit/smartart-chain.test.ts` — nouveaux cas pour le
  nombre de transitions (N-1 pour N nœuds), leur mirroir de présentation, et le cas dégénéré à 1
  nœud (aucune transition). Tous passent.
- **LibreOffice headless** (`chain-conn-libreoffice.png`, ce dossier) : **aucune flèche visible**
  entre les boîtes A/B/C — seules les 3 boîtes apparaissent, comme avant ce changement.

## Ce que ce résultat ne permet PAS de conclure

L'absence de flèche sous LibreOffice ne confirme ni n'infirme la correction du câblage : LibreOffice
a des bugs connus et documentés sur l'import SmartArt (~25 selon ses propres mainteneurs, cf.
ADR 0004), et le rendu des connecteurs entre formes (algorithme `conn`) est un cas fréquemment cité
comme non supporté — indépendamment de la validité du XML produit. Seul Word réel peut trancher.
C'est exactement le type de défaut que `TESTING.md` chapitre 4 documente comme angle mort structurel
de toute la chaîne de test automatisée (1 à 5) : aucune ne peut distinguer "notre XML est faux" de
"LibreOffice ne sait pas dessiner ça".

## Statut

**En attente d'un test Word réel par le mainteneur** (`chain-conn.docx`, ce dossier) avant de :
- répliquer le même mécanisme sur `cycle.ts` (`conn` avec `connRout="curve"`/points radiaux —
  volontairement pas commencé, pour ne pas empiler un deuxième pari non vérifié sur le même
  mécanisme non confirmé) ;
- démarrer le rapprochement stylistique (deuxième chantier déjà validé par le mainteneur, séquencé
  après les connecteurs).
