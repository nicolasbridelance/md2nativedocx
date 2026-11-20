# collapsed-subgraphs

`S@{ view: collapsed }`: the subgraph is drawn folded into one box (its title, then `• • •`), its
contents hidden, links into it ending on the box, as Mermaid does. Mermaid 12.3.0 official example
flowchart#103, then cases of this project's own.

## flowchart#103: a folded group in a chain (becomes a SmartArt process when SmartArt is on)

```mermaid
flowchart TD
    Start --> one
    subgraph one [My Group]
        A --> B
        B --> C
    end
    one --> End
    one@{ view: collapsed }
```

## Links into a folded group end on the box; its parent stays open

```mermaid
flowchart LR
    Client --> Auth
    subgraph Platform [Platform]
        subgraph Core [Core services]
            Auth[Auth service] --> Orders[Order service]
            subgraph Data [Storage]
                DB[(Orders DB)]
            end
        end
        Billing[Billing]
    end
    Orders --> Billing
    DB --> Backup[(Backup)]
    Core@{ view: collapsed }
```

## One group folded, its sibling open

```mermaid
flowchart TD
    subgraph Front [Front end]
        UI[Web UI] --> API[API gateway]
    end
    subgraph Back [Back end]
        Svc[Service] --> Queue[Queue]
    end
    API --> Svc
    Queue --> Worker[Worker]
    Back@{ view: collapsed }
```
