# Conformité aux exemples officiels de Mermaid (étage 2, différentiel)

Généré par `node tools/mermaid-differential/differential.mjs --report` avec `mermaid@12.3.0` : pour chaque
exemple de `examples.json`, ce que Mermaid a compris (sa base après analyse, sans rendu) comparé à ce que notre
analyseur a compris. Un écart est un nœud, un lien, un message ou un bloc qu'un seul des deux côtés voit, même
sans avertissement. Exemples © les auteurs de Mermaid, licence MIT (`LICENSE` dans ce dossier).

**252 exemples comparés : 217 identiques, 35 avec écart, dont 7 sans avertissement** (l'étage 1 les
compte comme propres : nous dessinons autre chose que Mermaid sans le dire, à corriger en premier :
`flowchart#95`, `flowchart#98`, `flowchart#99`, `flowchart#104`, `sequenceDiagram#12`, `sequenceDiagram#14`, `sequenceDiagram#34`). Hors comparaison : 0 refusé(s) par Mermaid lui-même,
289 d'un type sans comparateur pour l'instant (organigrammes, séquence, classes, états et ER en ont un).

| Page | Exemples | Identiques | Écarts | Refusés par Mermaid |
|---|---:|---:|---:|---:|
| classDiagram | 38 | 28 | 10 | 0 |
| entityRelationshipDiagram | 25 | 13 | 12 | 0 |
| flowchart | 116 | 108 | 8 | 0 |
| sequenceDiagram | 38 | 34 | 4 | 0 |
| stateDiagram | 22 | 21 | 1 | 0 |
| swimlanes | 13 | 13 | 0 | 0 |

## Écarts

### classDiagram#6

- Mermaid seulement : `relation Animal Class! -- Car Class`

### classDiagram#11

- Mermaid seulement : `class classM "classM" 0a 0m`
- Mermaid seulement : `class classN "classN" 0a 0m`
- Mermaid seulement : `relation classM -- classN`

### classDiagram#14

- Mermaid seulement : `class Animal "Animal" 0a 0m`
- Mermaid seulement : `class Zebra "Zebra" 0a 0m`
- Mermaid seulement : `relation Animal -- Zebra`

### classDiagram#15

- Mermaid seulement : `class foo "foo" 0a 0m`
- Mermaid seulement : `relation interface0 -- foo`

### classDiagram#16

- Mermaid seulement : `class Class02 "Class02" 0a 0m`
- Mermaid seulement : `relation Class01 -- interface0`
- Mermaid seulement : `relation Class02 -- interface1`
- Mermaid seulement : `relation interface2 -- Class01`

### classDiagram#23

- Mermaid seulement : `class Shape "Shape" 0a 0m`

### classDiagram#33

- Mermaid seulement : `class Animal "Animal" 0a 0m`

### classDiagram#34

- Mermaid seulement : `class Animal "Animal" 1a 1m`

### classDiagram#35

- Mermaid seulement : `class Animal "Animal" 0a 0m`

### classDiagram#36

- Mermaid seulement : `class Animal "Animal" 0a 0m`

### entityRelationshipDiagram#4

- Mermaid seulement : `entity This ❤ Unicode 0 attributes`

### entityRelationshipDiagram#5

- Mermaid seulement : `entity This **is** _Markdown_ 0 attributes`

### entityRelationshipDiagram#7

- Mermaid seulement : `entity CAR 0 attributes`
- Mermaid seulement : `entity NAMED-DRIVER 0 attributes`
- Mermaid seulement : `entity PERSON 0 attributes`
- Mermaid seulement : `relation CAR -- NAMED-DRIVER "allows"`
- Mermaid seulement : `relation PERSON -- NAMED-DRIVER "is"`

### entityRelationshipDiagram#10

- Mermaid seulement : `entity p 2 attributes`
- Mermaid seulement : `entity a 1 attributes`
- nous seulement : `entity p[Person] 2 attributes`
- nous seulement : `entity p 0 attributes`
- nous seulement : `entity a 0 attributes`

### entityRelationshipDiagram#11

- Mermaid seulement : `entity MANUFACTURER 0 attributes`
- Mermaid seulement : `relation MANUFACTURER -- CAR "makes"`

### entityRelationshipDiagram#15

- Mermaid seulement : `entity CUSTOMER 0 attributes`

### entityRelationshipDiagram#16

- Mermaid seulement : `entity CUSTOMER 0 attributes`

### entityRelationshipDiagram#17

- Mermaid seulement : `entity CUSTOMER 0 attributes`

### entityRelationshipDiagram#20

- Mermaid seulement : `entity id1 0 attributes`
- Mermaid seulement : `entity id2 0 attributes`
- Mermaid seulement : `relation id1 -- id2 "label"`

### entityRelationshipDiagram#21

- Mermaid seulement : `entity CAR 3 attributes`
- Mermaid seulement : `entity PERSON 3 attributes`
- Mermaid seulement : `entity HOUSE 0 attributes`
- nous seulement : `entity CAR:::someclass 3 attributes`
- nous seulement : `entity PERSON:::someclass 3 attributes`

### entityRelationshipDiagram#22

- Mermaid seulement : `entity HOUSE 0 attributes`
- Mermaid seulement : `relation PERSON -- CAR "owns"`
- Mermaid seulement : `relation PERSON -- HOUSE "has"`
- nous seulement : `entity PERSON:::foo 0 attributes`
- nous seulement : `relation PERSON:::foo -- CAR "owns"`

### entityRelationshipDiagram#23

- Mermaid seulement : `entity HOUSE 0 attributes`
- Mermaid seulement : `relation PERSON -- CAR "owns"`
- Mermaid seulement : `relation PERSON -- HOUSE "has"`
- nous seulement : `entity PERSON:::foo 0 attributes`
- nous seulement : `relation PERSON:::foo -- CAR "owns"`

### flowchart#95 — sans avertissement

- Mermaid seulement : `node E "End"`
- Mermaid seulement : `link B -> E "No"`
- nous seulement : `node - "E[End"`
- nous seulement : `link B -> - "No"`

### flowchart#98 — sans avertissement

- Mermaid seulement : `subgraph one "one" [a1 a2]`
- Mermaid seulement : `subgraph three "three" [c1 c2]`
- nous seulement : `subgraph one "one" [a1]`
- nous seulement : `subgraph three "three" [c2]`

### flowchart#99 — sans avertissement

- Mermaid seulement : `subgraph ide1 "one" [a1 a2]`
- nous seulement : `subgraph ide1 "one" [a1]`

### flowchart#100

- Mermaid seulement : `node one "one"`
- Mermaid seulement : `node two "two"`
- Mermaid seulement : `node three "three"`
- Mermaid seulement : `link one -> two`
- Mermaid seulement : `link three -> two`
- Mermaid seulement : `link two -> c2`
- Mermaid seulement : `subgraph one "one" [a1 a2]`
- Mermaid seulement : `subgraph three "three" [c1 c2]`
- nous seulement : `subgraph one "one" [a1]`
- nous seulement : `subgraph three "three" [c2]`

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

### flowchart#104 — sans avertissement

- Mermaid seulement : `subgraph **Two** "Two" [c d]`
- nous seulement : `subgraph `**Two**` "Two" [c d]`

### sequenceDiagram#12 — sans avertissement

- Mermaid seulement : `participant API "Public API"`
- Mermaid seulement : `participant DB "User Database"`
- Mermaid seulement : `participant Svc "Auth Service"`
- nous seulement : `participant API@{ "type": "boundary" } "Public API"`
- nous seulement : `participant DB@{ "type": "database" } "User Database"`
- nous seulement : `participant Svc@{ "type": "control" } "Auth Service"`
- nous seulement : `participant API "API"`
- nous seulement : `participant Svc "Svc"`
- nous seulement : `participant DB "DB"`

### sequenceDiagram#13

- Mermaid seulement : `participant API "Public API"`
- Mermaid seulement : `participant Auth "Auth Service"`
- Mermaid seulement : `participant DB "User Database"`
- nous seulement : `participant API "API"`
- nous seulement : `participant Auth "Auth"`
- nous seulement : `participant DB "DB"`

### sequenceDiagram#14 — sans avertissement

- Mermaid seulement : `participant API "External Name"`
- Mermaid seulement : `participant DB "External DB"`
- nous seulement : `participant API@{ "type": "boundary", "alias": "Internal Name" } "External Name"`
- nous seulement : `participant DB@{ "type": "database", "alias": "Internal DB" } "External DB"`
- nous seulement : `participant API "API"`
- nous seulement : `participant DB "DB"`

### sequenceDiagram#34 — sans avertissement

- Mermaid seulement : `message B -> A "I ♥ you ∞ times more!"`
- nous seulement : `message B -> A "I ♥ you #infin; times more!"`

### stateDiagram#4

- Mermaid seulement : `state stateId`
