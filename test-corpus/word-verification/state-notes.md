# state-notes

Notes beside their state, folded corner, joined by a dotted line. Mermaid 12.3.0 official example #15, a note inside a composite, then PlantUML notes on four sides.

## stateDiagram#15

```mermaid
stateDiagram-v2
        State1: The state with a note
        note right of State1
            Important information! You can write
            notes.
        end note
        State1 --> State2
        note left of State2 : This is the note to the left.
```

## A note inside a composite

```mermaid
stateDiagram-v2
  [*] --> Active
  state Active {
    [*] --> Running
    Running --> Paused : pause
    Paused --> Running : resume
    note right of Paused : Timers frozen<br>until resume
  }
  note left of Active
    The whole session
  end note
  Active --> [*]
```

## PlantUML notes on four sides

```plantuml
@startuml
[*] --> Idle
Idle --> Busy : job
Busy --> Idle : done
note left of Idle : waiting
note right of Busy
  working on
  one job
end note
note top of Idle #pink : top note
note bottom of Busy : bottom note
@enduml
```

## Notes in a left-to-right diagram

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Draft
  Draft --> Review : submit
  Review --> Done : approve
  note right of Draft : Saved every minute
  note left of Review : Two readers
  Done --> [*]
```
