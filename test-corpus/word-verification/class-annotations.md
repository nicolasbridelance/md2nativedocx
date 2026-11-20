# class-annotations

UML annotations (`<<interface>>`, `<<enumeration>>`…) drawn as `«interface»` above the class name, the first one only, as Mermaid does. Mermaid 12.3.0 official examples, then an inheritance tree (SmartArt when on) and a PlantUML stereotype.

## classDiagram#1

```mermaid
classDiagram
  class Customer {
    +String name
    +String email
  }
  class Order {
    +String id
    +Date placedAt
    +total() Money
  }
  class LineItem {
    +int quantity
  }
  class Payment {
    <<interface>>
    +authorise() bool
  }
  Customer "1" --> "*" Order : places
  Order "1" *-- "*" LineItem : contains
  Order --> Payment : settled by
```

## classDiagram#23

```mermaid
classDiagram
  class Shape <<interface>>
```

## classDiagram#24

```mermaid
classDiagram
class Shape
<<interface>> Shape
Shape : noOfVertices
Shape : draw()
```

## classDiagram#25

```mermaid
classDiagram
class Shape{
    <<interface>>
    noOfVertices
    draw()
}
class Color{
    <<enumeration>>
    RED
    BLUE
    GREEN
    WHITE
    BLACK
}
```

## classDiagram#26

```mermaid
classDiagram
%% This whole line is a comment classDiagram class Shape <<interface>>
class Shape{
    <<interface>>
    noOfVertices
    draw()
}
```

## Inheritance tree with annotations

```mermaid
classDiagram
  class Shape {
    <<abstract>>
    +area() double
  }
  class Circle
  class Square
  Shape <|-- Circle
  Shape <|-- Square
  <<entity>> Circle
```

## PlantUML stereotype

```plantuml
@startuml
class Order <<Entity>> {
  +id : int
}
class OrderService <<Service>>
OrderService --> Order
@enduml
```
