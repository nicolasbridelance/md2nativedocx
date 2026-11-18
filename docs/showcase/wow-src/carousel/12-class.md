```mermaid
classDiagram
  Vehicule <|-- Voiture
  Vehicule <|-- Velo
  Vehicule <|-- Camion
  class Vehicule {
    +marque
    +demarrer()
  }
  class Voiture {
    +portes
  }
  class Velo {
    +vitesses
  }
  class Camion {
    +charge
  }
```
