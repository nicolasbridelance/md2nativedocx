```mermaid
stateDiagram-v2
  [*] --> Commandée
  Commandée --> Payée
  Payée --> Expédiée
  Expédiée --> Livrée
  Livrée --> [*]
```
