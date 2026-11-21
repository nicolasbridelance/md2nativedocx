# Diagrammes d'exigences : lecture et dessin comme Mermaid

Vérification de la reprise du 2026-11-21 : grammaire de Mermaid (noms et valeurs entre guillemets, noms avec
espaces, `:::`), boîtes dessinées comme `requirementBox` de Mermaid (stéréotype puis nom en gras, puis `ID:`,
`Text:`, `Risk:`, `Verification:` ou `Type:`, `Doc Ref:`, centrés), Markdown dans les boîtes, `contains` en
trait plein avec un cercle barré d'une croix côté contenant, les six autres en pointillés avec une flèche
ouverte, `direction`, `style`, `classDef`, `class`.

## 1. Tous les types et toutes les relations (exemple officiel #4)

Six exigences, trois éléments. `test_req` contient `test_req3`, qui contient `test_req4` : deux traits pleins
avec le cercle barré côté `test_req` et côté `test_req3`. Les autres liens en pointillés, flèche ouverte côté
destination. `test_entity3` est de type « test suite », sans guillemets.

```mermaid
requirementDiagram

requirement test_req {
id: 1
text: the test text.
risk: high
verifymethod: test
}

functionalRequirement test_req2 {
id: 1.1
text: the second test text.
risk: low
verifymethod: inspection
}

performanceRequirement test_req3 {
id: 1.2
text: the third test text.
risk: medium
verifymethod: demonstration
}

interfaceRequirement test_req4 {
id: 1.2.1
text: the fourth test text.
risk: medium
verifymethod: analysis
}

physicalRequirement test_req5 {
id: 1.2.2
text: the fifth test text.
risk: medium
verifymethod: analysis
}

designConstraint test_req6 {
id: 1.2.3
text: the sixth test text.
risk: medium
verifymethod: analysis
}

element test_entity {
type: simulation
}

element test_entity2 {
type: word doc
docRef: reqs/test_entity
}

element test_entity3 {
type: "test suite"
docRef: github.com/all_the_tests
}

test_entity - satisfies -> test_req2
test_req - traces -> test_req2
test_req - contains -> test_req3
test_req3 - contains -> test_req4
test_req4 - derives -> test_req5
test_req5 - refines -> test_req6
test_entity3 - verifies -> test_req5
test_req <- copies - test_entity2
```

## 2. Markdown dans une boîte (exemple officiel #3)

Le nom « test_req » en gras, sans les soulignés ; « italicized text » en italique, « bold text » en gras, après
« Text: ».

```mermaid
requirementDiagram

requirement "__test_req__" {
    id: 1
    text: "*italicized text* **bold text**"
    risk: high
    verifymethod: test
}
```

## 3. De gauche à droite (exemple officiel #5)

L'élément à gauche, l'exigence à droite, sur une même ligne.

```mermaid
requirementDiagram

direction LR

requirement test_req {
    id: 1
    text: the test text.
    risk: high
    verifymethod: test
}

element test_entity {
    type: simulation
}

test_entity - satisfies -> test_req
```

## 4. `style` (exemple officiel #6)

L'exigence en jaune pâle, bordure noire, texte vert ; l'élément en rose, bordure gris foncé, texte bleu.

```mermaid
requirementDiagram

requirement test_req {
    id: 1
    text: styling example
    risk: low
    verifymethod: test
}

element test_entity {
    type: simulation
}

style test_req fill:#ffa,stroke:#000, color: green
style test_entity fill:#f9f,stroke:#333, color: blue
```

## 5. Classes (exemple officiel #8)

Les deux boîtes ont tout leur texte en gras (`font-weight:bold` de la classe `important`) ; l'élément est en
rose, bordure gris foncé.

```mermaid
requirementDiagram

requirement test_req:::important {
    id: 1
    text: "class styling example"
    risk: low
    verifymethod: test
}

element test_entity {
    type: simulation
}

classDef important font-weight:bold

class test_entity important
style test_entity fill:#f9f,stroke:#333
```

## 6. Deux relations entre les mêmes boîtes (cas de vérification d'origine)

`test_req` trace vers `test_req2` et `test_req2` dérive de `test_req`, en sens opposés : deux lignes écartées,
deux libellés lisibles, aucun caché par le fond blanc de l'autre.

```mermaid
requirementDiagram
  requirement test_req {
    id: 1
    text: the test text.
    risk: high
    verifymethod: test
  }
  functionalRequirement test_req2 {
    id: 1.1
    text: the second test text.
    risk: low
    verifymethod: inspection
  }
  element test_entity {
    type: simulation
  }
  test_entity - satisfies -> test_req
  test_req - traces -> test_req2
  test_req <- derives - test_req2
```
