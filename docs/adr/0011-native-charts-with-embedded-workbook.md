# ADR 0011 — Graphiques Word natifs (`c:chart`) avec classeur embarqué

- **Statut :** **Implémenté pour `pie`, `xychart` et `radar`** (2026-10-05), opt-in
  (`MD2NATIVEDOCX_NATIVE_CHARTS=1`, défaut : formes). Validé par le validateur Open XML (graphiques **et**
  classeurs : 0 erreur, dans `test:oxml-validate`) et le rendu LibreOffice. **Confirmé dans un vrai Word
  par le mainteneur pour `pie` (paliers 1 et 2, Edit Data compris)** ; `xychart` et `radar` en attente de
  la même vérification (`test-corpus/word-verification/CHECKLIST.md`, Round 5).
- **Date :** 2026-10-05
- **Décideur :** Nicolas Bridelance (mainteneur) — chantier confié à l'agent le 2026-10-05
  (« dans ta banette »).
- **Contexte public :** question mermaid-js/mermaid#8060 — des `pie`/`xychart` « double-cliquables »
  dans Word avec des données éditables.

## Problème

Aujourd'hui `pie`, `xychart` et `radar` sortent en **formes natives** (`prstGeom="pie"`, rectangles, …) :
on peut recolorer, déplacer, retaper une étiquette, mais **pas modifier les valeurs** dans une feuille
de données. Word sait le faire pour un objet *graphique* (`c:chart`) adossé à un classeur Excel
embarqué (Chart Design → Edit Data). Les deux approches répondent au même besoin de départ (« pas une
image morte ») de manière différente ; elles doivent coexister.

## Décision

Ajouter, **en option**, une sortie `c:chart` pour `pie` (puis `xychart`, `radar`) :

1. Le traducteur du cœur produit, pour un diagramme éligible, (a) un paragraphe `w:p` contenant un
   `wp:inline` → `a:graphicData uri=".../drawingml/2006/chart"` → `c:chart r:id="CHART_PLACEHOLDER:<id>"`,
   (b) le XML `c:chartSpace` (valeurs **en cache** + références de plage `Sheet1!$A$2:$A$n`),
   (c) la table de données (étiquettes + valeurs) pour construire le classeur.
2. Le pont Pandoc dépose (b) et (c) dans un dossier temporaire par diagramme
   (`MD2NATIVEDOCX_CHART_DIR`), exactement comme SmartArt (`MD2NATIVEDOCX_SMARTART_DIR`) : le filtre Lua
   ne peut pas ajouter de parties au paquet.
3. Le post-traitement du CLI (`injectChartParts`) ajoute `word/charts/chartN.xml`, sa relation, son type
   de contenu et — palier 2 — `word/embeddings/Microsoft_Excel_SheetN.xlsx` avec
   `word/charts/_rels/chartN.xml.rels` (relation `package`, **interne**), puis remplace les marqueurs
   par les vrais `rId`.
4. Activation : `MD2NATIVEDOCX_NATIVE_CHARTS=1` (variable d'environnement, comme les autres
   réglages). **Défaut : formes.** Un diagramme non éligible, ou toute erreur de génération, retombe
   sur les formes sans échouer.

### Exception à la règle 7 (AGENTS.md) — assumée

La règle 7 réserve le zip du `.docx` à Pandoc. **SmartArt a déjà créé l'exception** (ADR 0004,
`injectSmartArtParts`, validée par le mainteneur le 2026-09-03) : ajout de nouvelles parties + relations
+ types de contenu, jamais de modification des parties Pandoc existantes hors des deux correctifs déjà
documentés. Les graphiques réutilisent **le même mécanisme et la même discipline** : ajout seulement,
no-op quand le document n'a aucun graphique, aucune relation `TargetMode="External"` (règle 3 : le
classeur est une partie interne), aucune nouvelle dépendance (le `.xlsx` est un petit zip écrit avec
`adm-zip`, déjà utilisé par le CLI).

## Plan par paliers (chaque palier est livrable et vérifié avant le suivant)

| Palier | Contenu | Vérification |
|---|---|---|
| 1 | `pie`, `c:chart` avec valeurs en cache, **sans** classeur | `test:oxml-validate` (le SDK Open XML valide `c:`), rendu LibreOffice, tests unitaires |
| 2 | classeur `.xlsx` embarqué + `c:externalData` | idem + ouverture du `.xlsx` extrait (LibreOffice) + **Word réel : Edit Data** |
| 3 | `xychart` (barres + lignes, un seul graphique), puis `radar` | idem ; **fait** (2026-10-05), Word réel en attente |

## Conséquences

- **Positif :** valeurs éditables dans Word ; mise en forme native du graphique (styles, couleurs,
  polices via Chart Design) ; même source Markdown.
- **Perte assumée :** le rendu d'un graphique Word n'est pas le rendu Mermaid 1:1 (couleurs/polices du
  moteur de graphiques de Word). Les formes restent disponibles (défaut) pour qui veut la fidélité visuelle.
- **Risque :** corruption à l'ouverture dans Word (précédent SmartArt : 7 tours d'essais). Mitigations :
  validateur Open XML **avant** toute comparaison manuelle (AGENTS.md), option désactivée par défaut,
  vérification réelle par le mainteneur avant d'envisager un autre défaut.
- **API de `packages/core` :** ajout d'un export (`translatePieToChart` et son type de résultat) ; aucun
  changement de signature existante. Signalé au mainteneur avant fusion (AGENTS.md « Escalate »).
- **Sécurité :** tout texte utilisateur (titre, étiquettes) est échappé XML avant d'entrer dans
  `c:chartSpace` et dans le classeur (règle 2) ; aucun parseur XML n'est introduit ; aucune commande
  construite par concaténation (règle 4).

## Hors périmètre

`sankey`, `gantt`, `quadrant`, `radar` sans axes comparables, `treemap` (cx:chartex, schéma distinct) et
tout graphique lié à un fichier externe (`TargetMode="External"` — interdit, règle 3).

## Dégradations assumées (palier 3)

- `xychart` : un axe X numérique devient des étiquettes de catégories régulièrement espacées ; les
  étiquettes par point d'une ligne (`[25 "tard"]`) ne sont pas reprises ; un `xychart horizontal` avec une
  série `line` n'est **pas** convertible (les lignes Word sont verticales) — le pont retombe sur les formes
  et le dit sur stderr (`native chart not used, drawn as shapes instead: …`).
- `radar` : la grille Word est toujours polygonale (`graticule circle` est tracé en polygone) ; moins de
  trois axes retombe sur les formes.
