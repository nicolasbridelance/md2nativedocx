# ADR 0002 — Intégration Pandoc : `RawBlock('openxml', ...)` pour les diagrammes

- **Statut :** Accepté (Phase 0 spike)
- **Date :** 2026-08-06
- **Décideur :** Nicolas Bar Bridelance (mainteneur) — validé par spike, voir ci-dessous

## Contexte

L'architecture (§0, §5.4.a) délègue à Pandoc le parsing Markdown, les tableaux, le style
et la manipulation ZIP du `.docx`. Le projet ne construit que le module manquant : layout +
traduction OOXML d'un diagramme. Le pont entre le filtre Lua Pandoc et le module core doit
injecter un fragment DrawingML natif dans le document.

Le mécanisme candidat est `pandoc.RawBlock('openxml', xmlString)` : Pandoc doit passer le
fragment XML tel quel dans `word/document.xml` sans le modifier ni le casser.

## Spike réalisé

`scripts/spike-pandoc/` contient un test bout-en-bout :

- `spike-filter.lua` : filtre Lua qui remplace chaque bloc ` ```mermaid ` par un
  `RawBlock('openxml', ...)` contenant un fragment **`wpg:wgp` complexe** : 2 formes
  (rect + diamond), 1 connecteur (`wpg:cxnSp`), 2 zones de texte (`wps:txbx`), avec
  coordonnées en EMU et namespaces déclarés inline.
- `spike.md` : document Markdown avec un bloc mermaid.
- Commande : `pandoc spike.md -o spike.docx --lua-filter=spike-filter.lua`.

Résultats vérifiés :
- Exit code 0 ; `.docx` produit (10 Ko).
- `word/document.xml` contient bien **1 seul fragment `wpg:wgp`** (balise ouvrante
  `<wpg:wgp xmlns:wpg="...">` + balise fermante `</wpg:wgp>`), avec 2 formes `wpg:wsp`
  (rect + diamond) et 1 connecteur `wpg:cxnSp`. (Note : un `grep -o 'wpg:wgp'` naïf
  remonte 4 occurrences — 2 viennent du texte Markdown du document de test qui mentionne
  le mot `wpg:wgp`, 2 sont les balises ouvrante/fermante du fragment réel.)
- Le `.docx` est un **ZIP valide** (`unzip -t` OK).
- `word/document.xml` est **XML bien formé** (parseur XML OK).
- **0 relation externe** (`TargetMode="External"` absent) — conforme à la règle n°3.
- Les namespaces `wpg`/`wps` sont déclarés **inline** dans le fragment (approche correcte :
  les content types concernent les parties/fichiers, pas les namespaces).

## Décision

1. **`pandoc.RawBlock('openxml', ...)` est le mécanisme d'intégration retenu** pour
   injecter les diagrammes dans le `.docx`. Le spike confirme que Pandoc 3.1.3 passe un
   fragment `wpg:wgp` complexe sans le casser.
2. Le filtre Lua `packages/pandoc-filter/md2nativedocx.lua` appelle le module core via
   **`execFile`/`spawn` avec un tableau d'arguments** (règle n°4) et émet le résultat en
   `RawBlock('openxml', ...)`.
3. Le fragment émis par le traducteur doit être **autonome** : namespaces déclarés inline,
   aucune relation OOXML externe (règle n°3).

## Conséquences

- L'architecture "un core, plusieurs points d'intégration" est validée empiriquement.
- Le traducteur (`packages/core/src/translator/`) produit une chaîne XML unique, autonome,
  injectable telle quelle dans un `RawBlock('openxml', ...)`.
- Le test bout-en-bout du spike devient la base des tests d'intégration du pipeline
  CLI → Pandoc → filtre → `.docx`.

## Alternatives rejetées

- **Image PNG intégrée** : rejetée — c'est exactement ce que le projet veut éviter
  (diagrammes non éditables, voir cahier des charges §0).
- **Manipulation directe du ZIP `.docx`** : rejetée — c'est le job de Pandoc (règle n°7).
