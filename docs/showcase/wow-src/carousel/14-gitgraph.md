```mermaid
gitGraph
  commit id: "init"
  branch feature
  checkout feature
  commit id: "login"
  commit id: "tests"
  checkout main
  commit id: "fix"
  merge feature
  commit id: "v1.0"
```
