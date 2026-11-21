# Conformité aux exemples officiels de Mermaid (étage 2, différentiel)

Généré par `node tools/mermaid-differential/differential.mjs --report` avec `mermaid@12.3.0` : pour chaque
exemple de `examples.json`, ce que Mermaid a compris (sa base après analyse, sans rendu) comparé à ce que notre
analyseur a compris. Un écart est un nœud, un lien, un message ou un bloc qu'un seul des deux côtés voit, même
sans avertissement. Exemples © les auteurs de Mermaid, licence MIT (`LICENSE` dans ce dossier).

**300 exemples comparés : 300 identiques, 0 avec écart, dont 0 sans avertissement** (l'étage 1 les
compte comme propres : nous dessinons autre chose que Mermaid sans le dire, à corriger en premier :
aucun). Hors comparaison : 0 refusé(s) par Mermaid lui-même,
241 d'un type sans comparateur pour l'instant (organigrammes, séquence, classes, états, ER, Gantt, cartes mentales, exigences et arborescences en ont un).

| Page | Exemples | Identiques | Écarts | Refusés par Mermaid |
|---|---:|---:|---:|---:|
| classDiagram | 38 | 38 | 0 | 0 |
| entityRelationshipDiagram | 25 | 25 | 0 | 0 |
| flowchart | 116 | 116 | 0 | 0 |
| gantt | 11 | 11 | 0 | 0 |
| mindmap | 15 | 15 | 0 | 0 |
| requirementDiagram | 9 | 9 | 0 | 0 |
| sequenceDiagram | 38 | 38 | 0 | 0 |
| stateDiagram | 22 | 22 | 0 | 0 |
| swimlanes | 13 | 13 | 0 | 0 |
| treeView | 13 | 13 | 0 | 0 |

## Écarts

