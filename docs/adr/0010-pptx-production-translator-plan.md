# ADR 0010 — Traducteur `.pptx` de production : plan et points à trancher

- **Statut :** Accepté et implémenté Phase 1 (2026-10-02) — décisions du mainteneur : (1) package
  `packages/pptx`, (2) `fast-xml-parser` accepté (MIT, justification : réécrire l'arbre de formes sans
  regex fragiles ; DTD rejetées avant parsing, entités non traitées), (3) surface CLI laissée à la
  discrétion de l'agent : `-o x.pptx` déclenche l'export deck, titre = dernier titre Markdown, texte
  hors diagramme ignoré, (4) vérification via LibreOffice Impress uniquement ; la vérification dans
  PowerPoint/Google Slides réels reste à la charge du mainteneur.
- **Date :** 2026-10-02
- **Suite de :** ADR 0003 (spike Phase 0 pptx), `docs/specs/cahier_des_charges_google_slides.md` §5–§9.

## Constat (vérifié dans le code, 2026-10-02)

Les 29 types Mermaid sont livrés, mais **tous ne sortent qu'en docx** : chaque traducteur
(`ooxml-translator.ts`, `diagrams/*/translator.ts`) écrit à la main des chaînes `wps:wsp` dans une
enveloppe `wp:inline`/`wpc:wpc` (`translator/canvas.ts`). Écrire 29 traducteurs pptx parallèles est
exclu (périmètre, maintenance).

Mais la sortie est très régulière (inspectée sur un flowchart) :
- liste **plate** de `wps:wsp` aux coordonnées EMU **absolues** (plus de groupe racine, voir
  `renderContent`) ;
- forme = `wps:cNvPr` + `wps:cNvSpPr` + `wps:spPr` (`a:xfrm`/`a:prstGeom`/fill/`a:ln`, déjà du
  DrawingML `a:` pur) + `wps:txbx/w:txbxContent` + `wps:bodyPr` ;
- connecteur = `wps:cNvCnPr` avec `a:stCxn`/`a:endCxn`, déjà identiques au vocabulaire pptx.

## Approche proposée : réécriture de sortie, pas nouveaux traducteurs

Un module unique **`docx-fragment → p:spTree`** consomme le XML que `core` produit déjà, pour
n'importe quel type, et le convertit :

| docx | pptx |
|---|---|
| `wps:wsp` avec `cNvSpPr` | `p:sp` (`p:nvSpPr`/`p:cNvPr`/`p:cNvSpPr`/`p:nvPr`, `p:spPr`, `p:txBody`) |
| `wps:wsp` avec `cNvCnPr` | `p:cxnSp` (`a:stCxn`/`a:endCxn` repris tels quels) |
| `wps:spPr` | `p:spPr` (contenu identique) |
| `w:txbxContent/w:p/w:r` (`w:sz` demi-points, `w:color`, `w:b`/`w:i`, `w:jc`) | `a:p/a:r` (`a:rPr sz` centièmes de point = `w:sz` × 50, `a:solidFill`, `b`/`i`, `a:pPr algn`) |
| `wps:bodyPr` | `a:bodyPr` (mêmes attributs) |
| `wps:style` | repris tel quel (`p:style`) |
| `wpc:wpc` / `wp:inline` | supprimés ; décalage et mise à l'échelle pour centrer dans la diapositive |

Un `.pptx` = une diapositive par bloc Mermaid, assemblage OPC par le chemin du spike
(`execFile` + tableau d'arguments, règle n°4). Ni `core` ni son API publique ne changent
(cahier des charges Slides §6) ; le test « cœur commun » (§9) devient trivial : `core` n'est pas
modifié.

**Risque principal :** fidélité de la conversion du texte et des éventuels `wpg:grpSp` imbriqués
(quelques traducteurs en émettent) — à mesurer par rendu LibreOffice Impress sur les 62 fixtures
visuelles existantes, c'est le bon banc d'essai.

## Décisions requises

1. **Emplacement :** nouveau package `packages/pptx` (recommandé, respecte la règle « `core` ne
   connaît aucun format de sortie ») ou module dans `packages/cli` ?
2. **Analyseur XML :** une réécriture robuste demande un parseur XML (DTD/entités externes désactivés,
   règle n°5). Aucun n'existe dans le dépôt. Options : (a) une dépendance (ex. `fast-xml-parser`,
   MIT — **nouvelle dépendance, à justifier**, règle n°6) ; (b) réécriture à base de motifs sur la
   sortie fermée et régulière de `core` (zéro dépendance, mais fragile si un traducteur évolue — à
   protéger par des tests sur les 29 types). Recommandation : (b) d'abord, vu que la sortie est
   produite par nous et entièrement échappée, avec bascule vers (a) si les tests montrent de la
   fragilité.
3. **Surface CLI :** `md2nativedocx rapport.md -o rapport.pptx` (cahier des charges §5) — inférence
   du format par l'extension ? Contenu hors diagramme (titres, listes) : ignoré en Phase 1 (hors
   scope §5), un titre de diapositive = le titre ou le premier titre Markdown précédant le bloc ?
4. **Prérequis de vérification humaine (ADR 0003, points 1–4) :** import réel dans Google
   Slides + ouverture dans PowerPoint (pas d'invite de réparation, formes sélectionnables, connecteur
   magnétique). Impossible depuis le sandbox. Proposition : coder la Phase 1 en parallèle, et ne la
   déclarer « livrée » qu'après cette vérification, avec un `.pptx` de test dans
   `test-corpus/word-verification/` (ou un dossier voisin) + une checklist.

## Plan d'exécution une fois les points tranchés

1. Convertisseur + test unitaire (échappement XML conservé, aucun `TargetMode="External"`).
2. Assemblage OPC + `test:oxml-validate` étendu au pptx (l'Open XML SDK valide aussi le pptx).
3. Rendu LibreOffice Impress des 62 fixtures, comparaison avec les baselines docx.
4. Commande CLI, test CLI de bout en bout.
5. Checklist de vérification manuelle Google Slides/PowerPoint.
