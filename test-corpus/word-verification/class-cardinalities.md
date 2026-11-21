# class-cardinalities

Relation cardinalities (`A "1" --> "*" B`) drawn next to the end they are written beside, as Mermaid does. Mermaid 12.3.0 official examples, then a PlantUML relation.

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

## classDiagram#22

```mermaid
classDiagram
    Customer "1" --> "*" Ticket
    Student "1" --> "1..*" Course
    Galaxy --> "many" Star : Contains
```

## classDiagram#27

```mermaid
classDiagram
  direction RL
  class Student {
    -idCard : IdCard
  }
  class IdCard{
    -id : int
    -name : string
  }
  class Bike{
    -id : int
    -name : string
  }
  Student "1" --o "1" IdCard : carries
  Student "1" --o "1" Bike : rides
```

## PlantUML

```plantuml
@startuml
Car "1" *-- "4..*" Wheel : has
Driver "0..1" -- "1" Car : drives
@enduml
```
