# Conformité aux exemples officiels de Mermaid (étage 2, différentiel)

Généré par `node tools/mermaid-differential/differential.mjs --report` avec `mermaid@12.3.0` : pour chaque
exemple de `examples.json`, ce que Mermaid a compris (sa base après analyse, sans rendu) comparé à ce que notre
analyseur a compris. Un écart est un nœud, un lien, un message ou un bloc qu'un seul des deux côtés voit, même
sans avertissement. Exemples © les auteurs de Mermaid, licence MIT (`LICENSE` dans ce dossier).

**252 exemples comparés : 246 identiques, 6 avec écart, dont 0 sans avertissement** (l'étage 1 les
compte comme propres : nous dessinons autre chose que Mermaid sans le dire, à corriger en premier :
aucun). Hors comparaison : 0 refusé(s) par Mermaid lui-même,
289 d'un type sans comparateur pour l'instant (organigrammes, séquence, classes, états et ER en ont un).

| Page | Exemples | Identiques | Écarts | Refusés par Mermaid |
|---|---:|---:|---:|---:|
| classDiagram | 38 | 36 | 2 | 0 |
| entityRelationshipDiagram | 25 | 25 | 0 | 0 |
| flowchart | 116 | 112 | 4 | 0 |
| sequenceDiagram | 38 | 38 | 0 | 0 |
| stateDiagram | 22 | 22 | 0 | 0 |
| swimlanes | 13 | 13 | 0 | 0 |

## Écarts

### classDiagram#15

- Mermaid seulement : `class foo "foo" 0a 0m`
- Mermaid seulement : `relation interface0 lollipop -- none foo`

### classDiagram#16

- Mermaid seulement : `class Class02 "Class02" 0a 0m`
- Mermaid seulement : `relation Class01 none -- lollipop interface0`
- Mermaid seulement : `relation Class02 none -- lollipop interface1`
- Mermaid seulement : `relation interface2 lollipop -- none Class01`

### flowchart#100

- Mermaid seulement : `node one "one"`
- Mermaid seulement : `node two "two"`
- Mermaid seulement : `node three "three"`
- Mermaid seulement : `link one -> two`
- Mermaid seulement : `link three -> two`
- Mermaid seulement : `link two -> c2`

### flowchart#101

- Mermaid seulement : `node TOP "TOP"`
- Mermaid seulement : `node B1 "B1"`
- Mermaid seulement : `node B2 "B2"`
- Mermaid seulement : `link A -> TOP`
- Mermaid seulement : `link TOP -> B`
- Mermaid seulement : `link B1 -> B2`

### flowchart#102

- Mermaid seulement : `node subgraph1 "subgraph1"`
- Mermaid seulement : `link outside -> subgraph1`

### flowchart#103

- Mermaid seulement : `node one "one"`
- Mermaid seulement : `link Start -> one`
- Mermaid seulement : `link one -> End`
