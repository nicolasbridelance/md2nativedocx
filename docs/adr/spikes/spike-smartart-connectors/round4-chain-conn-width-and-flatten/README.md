# Round 4 — width factor fix, `composite` wrapper removed, new asymmetry found

## Point de départ : une preuve indirecte forte

Entre round 3 et round 4, le mainteneur a ouvert le fichier du round 3 dans Word réel et utilisé
la galerie "Modifier la disposition" pour basculer le SmartArt vers le vrai "Processus"
(`process1`) tout en conservant notre texte et notre `colorsDef`/`styleDef`. Ceci régénère le
fichier `data1.xml` pour ce vrai layout — donc une preuve authentique, produite par Word lui-même,
de la structure de données attendue. Résultat : deux chevrons propres, identiques, dans Word ET
sous LibreOffice. La structure de données qui en ressort correspond presque trait pour trait à la
nôtre (mêmes points `doc`/`node`/`parTrans`/`sibTrans`) — preuve indirecte forte que notre câblage
de **données** n'a jamais été le problème.

Le fichier résultant (`chain-conn_to_processus_simple.docx`, `../round3-chain-conn-nested-foreach/`)
et sa capture de rendu ne sont **pas commités** : il embarque le vrai `layoutDef` `process1` de
Microsoft, même règle que `handmade_samples/` et `real-diagram*/` (voir `.gitignore`) — référence
de recherche locale uniquement, jamais redistribuée.

## Deux correctifs tentés

1. **Facteur de largeur** : le vrai layout donne `fact="0.4"` de la largeur de la boîte au
   connecteur (et n'a pas de contrainte `sp` séparée, puisque le connecteur EST l'espacement) ;
   le nôtre donnait `fact="0.1"` en plus d'un `sp` redondant — quatre fois plus étroit. Corrigé :
   `sp` supprimé, `sibTrans` porté à `fact="0.4"`, valeurs locales `h`/`connDist`/`begPad`/`endPad`
   alignées sur le vrai layout.
2. **Suppression du wrapper `composite`** : ce layout enveloppait chaque boîte dans un
   `layoutNode name="composite"` (algorithme `composite`, paramètre `ar`) avec `Main` imbriqué
   dedans — le vrai layout n'a pas ce niveau, `sibTrans` est directement voisin de `node`. Retiré
   le wrapper, `Main` devient un enfant direct de `nodesForEach`, son propre ratio hauteur/largeur
   fixé directement (`h refType="w" fact="0.6"`, même ratio ~1.67:1 qu'avant) plutôt que via un
   conteneur.

## Résultat : un correctif a marché, l'autre non — et une nouvelle asymétrie

Le facteur de largeur a un effet réel et visible : le **second** connecteur (B→C) s'affiche
maintenant comme un chevron propre, identique à celui du vrai layout. Mais le **premier**
connecteur (A→B) reste une forme déchirée/en zigzag — **exactement le même résultat avant et après
la suppression du wrapper `composite`**, ce qui infirme l'hypothèse du wrapper comme cause : la
suppression n'a rien changé à ce symptôme précis.

Fait notable : cette asymétrie (premier connecteur cassé, les suivants corrects) **n'apparaît pas**
dans le test de référence (rendu local, non commité — voir ci-dessus) : les deux chevrons y sont
identiques. Donc soit un détail structurel nous distingue encore du vrai layout et qui affecte
spécifiquement la première itération d'un `forEach` imbriqué, soit c'est un bug ponctuel de
LibreOffice sur cette itération précise qui ne se manifeste pas avec le vrai layout pour une raison
qui reste à identifier.

## Vérifications faites

- **Schéma (Open XML SDK)** : `chain-conn.docx` (ce dossier) — 0 erreur sous `/word/diagrams/*`.
- **Tests unitaires** : 293/293 (`packages/core/test/unit/smartart-chain.test.ts` mis à jour pour
  le nombre de `presParOf` sans le niveau `composite`).
- **LibreOffice** : deuxième connecteur correct, premier toujours déformé
  (`chain-conn-libreoffice.png`, ce dossier).

## Confirmation en vrai Word (2026-09-05, mainteneur)

**Les deux connecteurs (A→B et B→C) s'affichent comme des chevrons propres et identiques.**
L'asymétrie observée sous LibreOffice (premier connecteur déchiré, second correct) est donc
confirmée comme un défaut de rendu spécifique à LibreOffice sur cette itération précise — pas un
problème de câblage. Le fichier de ce round est correct tel quel.

## Statut

**Round clos, positif.** Le mécanisme de connecteur `chain` (algorithme `conn`, points `auto`,
paire `parTransId`/`sibTransId`, `forEach` imbriqué, pas de wrapper `composite`, `sibTrans` à
`fact="0.4"`) est confirmé fonctionnel dans Word réel. Prochaine étape (non commencée) : appliquer
le même mécanisme à `cycle.ts` (routage courbe/radial, plus complexe) — piste séparée, pour ne pas
empiler un pari non vérifié sur un mécanisme qui vient tout juste d'être validé.
