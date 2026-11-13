# Graphiques natifs — xychart et radar

## 1. xychart : barres + ligne (axe Y borné)

```mermaid
xychart-beta
    title "Chiffre d'affaires"
    x-axis [jan, fév, mar, avr, mai, juin]
    y-axis "Revenu (k€)" 4 --> 12
    bar [5, 6, 7.5, 8.2, 9.5, 10.5]
    line [5, 6, 7.5, 8.2, 9.5, 10.5]
```

## 2. xychart : plusieurs séries de barres, nommées

```mermaid
xychart-beta
    title "Vélocité d'équipe"
    x-axis "Sprint" ["S1", "S2", "S3", "S4"]
    y-axis "Points" 0 --> 40
    bar "Prévu" [30, 32, 28, 35]
    bar "Réalisé" [25, 31, 27, 36]
```

## 3. xychart horizontal (barres seulement)

```mermaid
xychart-beta horizontal
    title "Tickets par équipe"
    x-axis ["Alpha", "Beta", "Gamma"]
    y-axis "Tickets" 0 --> 50
    bar [42, 31, 17]
```

## 4. xychart horizontal avec ligne (non convertible : reste en formes, avec avertissement)

```mermaid
xychart-beta horizontal
    title "Cas non convertible"
    x-axis ["A", "B", "C"]
    bar [3, 5, 4]
    line [2, 6, 3]
```

## 5. xychart : axe X numérique

```mermaid
xychart-beta
    title "Courbe"
    x-axis "t" 0 --> 10
    line [1, 4, 9, 16, 25, 36]
```

## 6. radar

```mermaid
radar-beta
  title Notes
  axis m["Maths"], s["Sciences"], e["Anglais"]
  axis h["Histoire"], g["Géographie"], a["Art"]
  curve a["Alice"]{85, 90, 80, 70, 75, 90}
  curve b["Bob"]{70, 75, 85, 80, 90, 85}
  max 100
  ticks 5
```
