```mermaid
gantt
  title Lancement de l’application
  dateFormat YYYY-MM-DD
  section Conception
    Ateliers utilisateurs :a1, 2026-01-05, 10d
    Maquettes            :a2, after a1, 12d
  section Développement
    API                  :b1, after a2, 20d
    Application mobile   :b2, after a2, 25d
  section Lancement
    Bêta publique        :c1, after b2, 10d
    Mise en ligne        :milestone, after c1, 0d
```
